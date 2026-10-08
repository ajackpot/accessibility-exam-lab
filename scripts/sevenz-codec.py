#!/usr/bin/env python3
"""Strict, deterministic solid 7z codec using only Python's standard library.

The stdin/stdout bridge is uint32le(JSON byte length), a UTF-8 JSON array of
{name, bytes, sha256}, then each file's contents in array order. ``encode``
consumes that bridge and emits 7z; ``decode`` does the reverse. No extraction,
subprocesses, native archive library, optional package or network is used.

This is an original implementation of the deliberately narrow profile below,
not a general-purpose 7z reader. The container grammar is documented at:
https://github.com/ip7z/7zip/blob/main/DOC/7zFormat.txt
https://github.com/ip7z/7zip/blob/main/DOC/Methods.txt

Profile: version 0.4, one solid raw-LZMA2 stream/folder, dictionary property 28
(64 MiB), unencoded header, pack and substream CRCs, UTF-16LE names, regular
Windows archive attributes, optional empty-file bitmaps, no timestamps. All
integers, bitmaps, property order and metadata must have the canonical encoding.
At least one nonempty file is required; empty-only archives are not this profile.
CRCs detect damage, not authenticity; the caller must verify trusted SHA-256s.
"""

import hashlib
import json
import lzma
import re
import struct
import sys
import zlib

MAX_ARCHIVE = 128 * 1024 * 1024
MAX_FILE = 32 * 1024 * 1024
MAX_TOTAL = 512 * 1024 * 1024
MAX_FILES = 4096
MAX_HEADER = 2 * 1024 * 1024
MAX_NAME = 1024
# LZMA2 property 28: (2 | (28 & 1)) << (28 // 2 + 11) = 64 MiB.
DICT_SIZE = 64 * 1024 * 1024
CHUNK = 1024 * 1024
SIGNATURE = b"7z\xbc\xaf\x27\x1c\x00\x04"
FILTERS = [{"id": lzma.FILTER_LZMA2, "dict_size": DICT_SIZE}]
REGULAR_ATTRIBUTE = 0x20


class InvalidArchive(ValueError):
    """Input is outside the bounded, canonical release-archive profile."""


def require(condition, message):
    if not condition:
        raise InvalidArchive(message)


def crc(data):
    return zlib.crc32(data) & 0xffffffff


def u32(value):
    return struct.pack("<I", value)


def uint(value):
    """Encode a 7z UINT64, always using its shortest representation."""
    require(type(value) is int and 0 <= value < 1 << 64, "Invalid 7z integer")
    for extra in range(8):
        if value < 1 << (7 * (extra + 1)):
            prefix = (0xff << (8 - extra)) & 0xff
            return bytes([prefix | (value >> (8 * extra))]) + value.to_bytes(8, "little")[:extra]
    return b"\xff" + value.to_bytes(8, "little")


class Reader:
    def __init__(self, data):
        self.data = data
        self.pos = 0

    def take(self, size):
        require(0 <= size <= len(self.data) - self.pos, "Truncated 7z metadata")
        start = self.pos
        self.pos += size
        return self.data[start:self.pos]

    def expect(self, expected, field):
        require(self.take(len(expected)) == expected,
                "Unsupported or noncanonical 7z " + field)

    def number(self):
        start = self.pos
        first = self.take(1)[0]
        value = 0
        mask = 0x80
        for extra in range(8):
            if not first & mask:
                value |= (first & (mask - 1)) << (extra * 8)
                break
            value |= self.take(1)[0] << (extra * 8)
            mask >>= 1
        require(self.data[start:self.pos] == uint(value), "Nonminimal 7z integer")
        return value

    def checksum(self):
        return struct.unpack("<I", self.take(4))[0]

    def property(self, tag, field):
        self.expect(bytes([tag]), field)
        size = self.number()
        require(size <= MAX_HEADER, "7z property exceeds header limit")
        return self.take(size)

    def done(self):
        require(self.pos == len(self.data), "Trailing 7z metadata")


def bitmap(values):
    result = bytearray((len(values) + 7) // 8)
    for index, value in enumerate(values):
        if value:
            result[index // 8] |= 0x80 >> (index % 8)
    return bytes(result)


def read_bitmap(data, count):
    require(len(data) == (count + 7) // 8, "Invalid 7z bitmap size")
    result = [bool(data[index // 8] & (0x80 >> (index % 8))) for index in range(count)]
    require(bitmap(result) == data, "Noncanonical 7z bitmap padding")
    return result


def validate_names(names):
    require(1 <= len(names) <= MAX_FILES, "7z file count limit exceeded (1..4096)")
    seen = set()
    components = {}
    forbidden = re.compile(r'[\\<>:"|?*\x00-\x20\x7f]')
    devices = re.compile(r"^(?:CON|PRN|AUX|NUL|CLOCK\$|CONIN\$|CONOUT\$|COM[1-9]|LPT[1-9])$", re.I)
    for name in names:
        require(isinstance(name, str) and 1 <= len(name) <= MAX_NAME,
                "Invalid 7z path/name length")
        # Spaces inside components are safe; edges and non-ASCII names are not.
        require(name.isascii() and not forbidden.search(name.replace(" ", "")),
                "Unsafe 7z path characters")
        parts = name.split("/")
        require(all(part and part not in (".", "..") and
                    not part.startswith(" ") and not part.endswith((" ", ".")) and
                    not devices.fullmatch(part.split(".")[0].rstrip(" ")) for part in parts), "Unsafe 7z path")
        lower = name.casefold()
        require(lower not in seen, "Duplicate or case-colliding 7z path")
        seen.add(lower)
        for index in range(1, len(parts) + 1):
            prefix = "/".join(parts[:index])
            folded = prefix.casefold()
            require(folded not in components or components[folded] == prefix,
                    "Case-colliding 7z path components")
            components[folded] = prefix
    for name in seen:
        parts = name.split("/")
        require(all("/".join(parts[:index]) not in seen for index in range(1, len(parts))),
                "File/directory prefix collision in 7z paths")


def validate_sizes(sizes):
    require(all(type(size) is int and 0 <= size <= MAX_FILE for size in sizes),
            "7z per-file size limit exceeded")
    require(sum(sizes) <= MAX_TOTAL, "7z total uncompressed size limit exceeded")


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "Duplicate frame manifest key")
        result[key] = value
    return result


def parse_frame(frame):
    require(len(frame) >= 4, "Truncated frame prefix")
    size = struct.unpack("<I", frame[:4])[0]
    require(0 < size <= MAX_HEADER and size <= len(frame) - 4, "Frame header size limit or truncation")
    try:
        entries = json.loads(frame[4:4 + size].decode("utf-8"), object_pairs_hook=no_duplicate_keys)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
        raise InvalidArchive("Invalid frame JSON") from error
    require(isinstance(entries, list), "Frame manifest must be an array")
    require(1 <= len(entries) <= MAX_FILES, "7z file count limit exceeded (1..4096)")
    for entry in entries:
        require(isinstance(entry, dict) and set(entry) == {"name", "bytes", "sha256"},
                "Invalid frame manifest fields")
        require(isinstance(entry["sha256"], str) and re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]),
                "Invalid frame SHA-256")
    validate_names([entry["name"] for entry in entries])
    validate_sizes([entry["bytes"] for entry in entries])
    require(len(frame) == 4 + size + sum(entry["bytes"] for entry in entries),
            "Frame content length mismatch or trailing bytes")
    offset = 4 + size
    contents = []
    view = memoryview(frame)
    for entry in entries:
        data = view[offset:offset + entry["bytes"]]
        require(hashlib.sha256(data).hexdigest() == entry["sha256"], "Frame SHA-256 mismatch")
        contents.append(data)
        offset += entry["bytes"]
    return entries, contents


def property_bytes(tag, data):
    return bytes([tag]) + uint(len(data)) + data


def make_header(names, sizes, checksums, packed_size, packed_crc):
    nonempty = [index for index, size in enumerate(sizes) if size]
    header = bytearray(b"\x01\x04\x06" + uint(0) + uint(1) + b"\x09" + uint(packed_size))
    header += b"\x0a\x01" + u32(packed_crc) + b"\x00"
    # One folder, inline, one simple LZMA2 coder with one property (dictionary).
    header += b"\x07\x0b\x01\x00\x01\x21\x21\x01\x1c\x0c" + uint(sum(sizes)) + b"\x00"
    # Omit folder CRC so every nonempty substream carries its own mandatory CRC.
    header += b"\x08\x0d" + uint(len(nonempty)) + b"\x09"
    for index in nonempty[:-1]:
        header += uint(sizes[index])
    header += b"\x0a\x01"
    for index in nonempty:
        header += u32(checksums[index])
    header += b"\x00\x00\x05" + uint(len(names))
    empty = [size == 0 for size in sizes]
    if any(empty):
        header += property_bytes(0x0e, bitmap(empty))
        header += property_bytes(0x0f, bitmap([True] * sum(empty)))
    encoded_names = b"\x00" + b"".join(name.encode("utf-16le") + b"\x00\x00" for name in names)
    header += property_bytes(0x11, encoded_names)
    header += property_bytes(0x15, b"\x01\x00" + u32(REGULAR_ATTRIBUTE) * len(names))
    header += b"\x00\x00"
    require(len(header) <= MAX_HEADER, "7z header size limit exceeded")
    return bytes(header)


def encode(frame):
    entries, contents = parse_frame(frame)
    names = [entry["name"] for entry in entries]
    sizes = [entry["bytes"] for entry in entries]
    require(any(sizes), "At least one nonempty file is required by the solid 7z profile")
    checksums = [crc(data) for data in contents]
    # Check metadata bounds before allocating the compression dictionary.
    make_header(names, sizes, checksums, MAX_ARCHIVE, 0)
    compressor = lzma.LZMACompressor(format=lzma.FORMAT_RAW,
                                   filters=[{**FILTERS[0], "preset": 9}])
    chunks = []
    packed_size = 0
    for data in contents:
        for offset in range(0, len(data), CHUNK):
            part = compressor.compress(data[offset:offset + CHUNK])
            packed_size += len(part)
            require(packed_size <= MAX_ARCHIVE, "7z archive size limit exceeded")
            chunks.append(part)
    part = compressor.flush()
    packed_size += len(part)
    require(packed_size <= MAX_ARCHIVE, "7z archive size limit exceeded")
    chunks.append(part)
    packed = b"".join(chunks)
    header = make_header(names, sizes, checksums, len(packed), crc(packed))
    require(32 + len(packed) + len(header) <= MAX_ARCHIVE, "7z archive size limit exceeded")
    start = struct.pack("<QQI", len(packed), len(header), crc(header))
    return SIGNATURE + u32(crc(start)) + start + packed + header


def parse_header(header, packed_size):
    reader = Reader(header)
    reader.expect(b"\x01\x04\x06", "plain header/one main stream")
    require(reader.number() == 0 and reader.number() == 1, "Unsupported 7z packed stream layout")
    reader.expect(b"\x09", "pack size")
    require(reader.number() == packed_size, "7z packed stream size mismatch")
    reader.expect(b"\x0a\x01", "mandatory pack CRC")
    packed_crc = reader.checksum()
    reader.expect(b"\x00\x07\x0b\x01\x00\x01\x21\x21\x01\x1c\x0c",
                  "single LZMA2 folder, method, dictionary or encryption")
    total = reader.number()
    require(total <= MAX_TOTAL, "7z total uncompressed size limit exceeded")
    reader.expect(b"\x00\x08\x0d", "substream metadata")
    stream_count = reader.number()
    require(1 <= stream_count <= MAX_FILES, "7z substream count limit exceeded (1..4096)")
    reader.expect(b"\x09", "substream sizes")
    stream_sizes = [reader.number() for _ in range(max(0, stream_count - 1))]
    if stream_count:
        stream_sizes.append(total - sum(stream_sizes))
    else:
        require(total == 0, "Invalid empty solid stream size")
    require(all(0 < size <= MAX_FILE for size in stream_sizes), "7z per-file size limit exceeded")
    reader.expect(b"\x0a\x01", "mandatory substream CRCs")
    checksums = [reader.checksum() for _ in range(stream_count)]
    reader.expect(b"\x00\x00\x05", "stream terminators/files metadata")
    count = reader.number()
    require(1 <= count <= MAX_FILES and stream_count <= count, "7z file count limit exceeded")
    if stream_count < count:
        empty = read_bitmap(reader.property(0x0e, "empty streams"), count)
        require(sum(empty) == count - stream_count, "7z empty-stream count mismatch")
        empty_files = read_bitmap(reader.property(0x0f, "empty regular files"), sum(empty))
        require(all(empty_files), "7z directory entries are forbidden")
    else:
        empty = [False] * count
    names_data = reader.property(0x11, "names")
    require(len(names_data) >= 3 and names_data[0] == 0 and (len(names_data) - 1) % 2 == 0,
            "Invalid 7z inline names")
    try:
        names_string = names_data[1:].decode("utf-16le")
    except UnicodeError as error:
        raise InvalidArchive("Invalid 7z UTF-16 names") from error
    require(names_string.endswith("\x00"), "Unterminated 7z names")
    names = names_string[:-1].split("\x00")
    require(len(names) == count, "7z name count mismatch")
    validate_names(names)
    attributes = reader.property(0x15, "regular Windows attributes")
    require(attributes == b"\x01\x00" + u32(REGULAR_ATTRIBUTE) * count,
            "Nonregular 7z attributes, links or external attributes forbidden")
    reader.expect(b"\x00\x00", "header terminators")
    reader.done()
    sizes = []
    file_crcs = []
    stream = 0
    for is_empty in empty:
        sizes.append(0 if is_empty else stream_sizes[stream])
        file_crcs.append(0 if is_empty else checksums[stream])
        stream += not is_empty
    validate_sizes(sizes)
    # This also excludes every unrecognized optional property and alternative
    # encoding before any decompression or payload processing can occur.
    require(header == make_header(names, sizes, file_crcs, packed_size, packed_crc),
            "Noncanonical 7z metadata")
    return names, sizes, file_crcs, packed_crc


def unpack(packed, total):
    decoder = lzma.LZMADecompressor(format=lzma.FORMAT_RAW, filters=FILTERS)
    output = bytearray()
    offset = 0
    while not decoder.eof:
        if decoder.needs_input:
            require(offset < len(packed), "Truncated LZMA2 stream")
            data = packed[offset:offset + CHUNK]
            offset += len(data)
        else:
            data = b""
        # One sentinel byte beyond the declared length detects forged lengths
        # without allowing an attacker-controlled unbounded output allocation.
        part = decoder.decompress(data, max_length=min(CHUNK, total - len(output) + 1))
        require(len(output) + len(part) <= total, "LZMA2 output exceeds declared size")
        output.extend(part)
        require(part or decoder.needs_input or decoder.eof, "LZMA2 decompression made no progress")
    require(offset == len(packed) and not decoder.unused_data,
            "Trailing or concatenated LZMA2 stream")
    require(len(output) == total, "LZMA2 uncompressed size mismatch")
    return output


def decode(archive):
    require(32 <= len(archive) <= MAX_ARCHIVE, "7z archive size limit or truncation")
    require(archive[:8] == SIGNATURE, "Unsupported 7z signature/version")
    require(crc(archive[12:32]) == struct.unpack("<I", archive[8:12])[0], "7z start-header CRC mismatch")
    offset, size, checksum = struct.unpack("<QQI", archive[12:32])
    require(0 < size <= MAX_HEADER, "7z header size limit exceeded")
    require(offset > 0 and 32 + offset + size == len(archive),
            "7z header extent mismatch, truncation or trailing data")
    header = archive[32 + offset:]
    require(crc(header) == checksum, "7z header CRC mismatch")
    names, sizes, checksums, packed_crc = parse_header(header, offset)
    packed = memoryview(archive)[32:32 + offset]
    require(crc(packed) == packed_crc, "7z packed-stream CRC mismatch")
    raw = unpack(packed, sum(sizes))
    entries = []
    position = 0
    view = memoryview(raw)
    for name, size, expected_crc in zip(names, sizes, checksums):
        data = view[position:position + size]
        require(len(data) == size and crc(data) == expected_crc, "7z file CRC/length mismatch")
        entries.append({"name": name, "bytes": size, "sha256": hashlib.sha256(data).hexdigest()})
        position += size
    manifest = json.dumps(entries, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    require(len(manifest) <= MAX_HEADER, "Frame header size limit exceeded")
    return u32(len(manifest)) + manifest + raw


def main():
    try:
        require(len(sys.argv) == 2 and sys.argv[1] in ("encode", "decode"),
                "Usage: python3 scripts/sevenz-codec.py encode|decode")
        operation = sys.argv[1]
        limit = MAX_ARCHIVE if operation == "decode" else MAX_TOTAL + MAX_HEADER + 4
        data = sys.stdin.buffer.read(limit + 1)
        require(len(data) <= limit, "Input size limit exceeded")
        result = encode(data) if operation == "encode" else decode(data)
    except (InvalidArchive, lzma.LZMAError, MemoryError, OverflowError) as error:
        sys.stderr.write("7z codec: " + (str(error) or type(error).__name__) + "\n")
        return 1
    # No partial stdout is observable for validation or decompression failures.
    sys.stdout.buffer.write(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
