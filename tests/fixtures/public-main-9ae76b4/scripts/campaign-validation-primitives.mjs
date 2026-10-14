/** Unchanged pure campaign primitives, shared below synchronization admission.
 * Explicit inputs are data only; this module cannot authenticate history. */
import {isDeepStrictEqual} from 'node:util';
import {FREEZE_AT,isPublishedQuestion,presentQuestion} from '../src/domain.js';
export const FINAL_DECISION_AT = Date.parse('2026-10-16T23:00:00+09:00');
const SUBJECTS = ['s1', 's2', 's3', 's4', 's5'];
const emptySubjects = () => Object.fromEntries(SUBJECTS.map(id => [id, 0]));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
export {validDateTime};

// Deliberately scoped to the checked-in schema, not a general JSON Schema implementation.
// An unimplemented keyword, format, external reference or schema change fails closed.
const KEYWORDS = new Set(['$schema', '$defs', '$ref', 'title', 'description', 'type', 'const', 'enum',
  'properties', 'required', 'additionalProperties', 'items', 'contains', 'minItems', 'maxItems',
  'uniqueItems', 'minimum', 'maximum', 'minLength', 'pattern', 'format', 'allOf', 'anyOf', 'if', 'then', 'else']);
function inspectSchema(schema, root, at = '#', stack = new Set()) {
  if (typeof schema === 'boolean') return;
  if (!object(schema)) throw new Error(`${at}: invalid schema node`);
  for (const key of Object.keys(schema)) if (!KEYWORDS.has(key)) throw new Error(`${at}: unsupported schema keyword ${key}`);
  if (schema.$schema && schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new Error(`${at}: unsupported schema dialect`);
  if (schema.format && !['date-time', 'uri'].includes(schema.format)) throw new Error(`${at}: unsupported format ${schema.format}`);
  if (schema.type && ![schema.type].flat().every(t => ['object', 'array', 'string', 'integer', 'number', 'null', 'boolean'].includes(t))) throw new Error(`${at}: unsupported type`);
  if (schema.pattern) new RegExp(schema.pattern, 'u');
  if (schema.$ref) {
    if (!/^#\/\$defs\/[^/]+$/.test(schema.$ref) || !own(root.$defs || {}, schema.$ref.slice(8))) throw new Error(`${at}: unsupported or unresolved reference ${schema.$ref}`);
    if (stack.has(schema.$ref)) throw new Error(`${at}: recursive schema references are unsupported`);
    inspectSchema(root.$defs[schema.$ref.slice(8)], root, schema.$ref, new Set([...stack, schema.$ref]));
  }
  for (const key of ['properties', '$defs']) for (const [name, child] of Object.entries(schema[key] || {})) inspectSchema(child, root, `${at}/${key}/${name}`, stack);
  for (const key of ['items', 'contains', 'if', 'then', 'else', 'additionalProperties']) if (own(schema, key)) inspectSchema(schema[key], root, `${at}/${key}`, stack);
  for (const key of ['allOf', 'anyOf']) for (const [i, child] of (schema[key] || []).entries()) inspectSchema(child, root, `${at}/${key}/${i}`, stack);
}
function validDateTime(value) {
  // Operational timestamps are ordinary RFC3339 civil instants. Leap-second spellings
  // are rejected rather than silently normalized by Date.parse.
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!m) return false;
  const [, y, month, day, hour, minute, second, , offsetHour = '0', offsetMinute = '0'] = m;
  const year = Number(y), mon = Number(month), d = Number(day);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mon >= 1 && mon <= 12 && d >= 1 && d <= days[mon - 1] && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60 && Number(offsetHour) < 24 && Number(offsetMinute) < 60 && Number.isFinite(Date.parse(value));
}
function matchesType(value, type) {
  return type === 'null' ? value === null : type === 'object' ? object(value) : type === 'array' ? Array.isArray(value) : type === 'integer' ? Number.isInteger(value) : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type;
}
function evaluate(value, schema, root, at, errors) {
  const fail = message => errors.push(`${at}: ${message}`);
  if (schema === true) return;
  if (schema === false) return fail('value is forbidden');
  if (schema.$ref) evaluate(value, root.$defs[schema.$ref.slice(8)], root, at, errors);
  if (schema.type && ![schema.type].flat().some(type => matchesType(value, type))) fail(`expected type ${[schema.type].flat().join('|')}`);
  if (own(schema, 'const') && !isDeepStrictEqual(value, schema.const)) fail(`expected constant ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(item => isDeepStrictEqual(value, item))) fail(`expected one of ${schema.enum.join(', ')}`);
  if (typeof value === 'number') {
    if (own(schema, 'minimum') && value < schema.minimum) fail(`minimum ${schema.minimum}`);
    if (own(schema, 'maximum') && value > schema.maximum) fail(`maximum ${schema.maximum}`);
  }
  if (typeof value === 'string') {
    if (own(schema, 'minLength') && [...value].length < schema.minLength) fail(`minimum length ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) fail(`does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && !validDateTime(value)) fail('invalid RFC3339 date-time');
    if (schema.format === 'uri') {
      try { if (/\s|%(?![A-Fa-f0-9]{2})/.test(value) || !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) throw new Error(); new URL(value); }
      catch { fail('invalid absolute URI'); }
    }
  }
  if (object(value)) {
    for (const key of schema.required || []) if (!own(value, key)) fail(`missing required property ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (own(schema.properties || {}, key)) evaluate(item, schema.properties[key], root, `${at}/${key}`, errors);
      else if (own(schema, 'additionalProperties')) evaluate(item, schema.additionalProperties, root, `${at}/${key}`, errors);
    }
  }
  if (Array.isArray(value)) {
    if (own(schema, 'minItems') && value.length < schema.minItems) fail(`minimum items ${schema.minItems}`);
    if (own(schema, 'maxItems') && value.length > schema.maxItems) fail(`maximum items ${schema.maxItems}`);
    if (schema.uniqueItems && value.some((item, i) => value.slice(0, i).some(other => isDeepStrictEqual(item, other)))) fail('items must be unique');
    if (own(schema, 'items')) value.forEach((item, i) => evaluate(item, schema.items, root, `${at}/${i}`, errors));
    if (schema.contains && !value.some(item => { const e = []; evaluate(item, schema.contains, root, at, e); return e.length === 0; })) fail('no item satisfies contains');
  }
  for (const child of schema.allOf || []) evaluate(value, child, root, at, errors);
  if (schema.anyOf && !schema.anyOf.some(child => { const e = []; evaluate(value, child, root, at, e); return e.length === 0; })) fail('no anyOf branch matches');
  if (schema.if) {
    const condition = []; evaluate(value, schema.if, root, at, condition);
    const branch = condition.length ? schema.else : schema.then;
    if (branch !== undefined) evaluate(value, branch, root, at, errors);
  }
}
export function validateCampaignJsonSchema(value, schema) {
  const errors = [];
  try { inspectSchema(schema, schema); evaluate(value, schema, schema, '$', errors); }
  catch (error) { errors.push(`schema: ${error.message}`); }
  return errors;
}

/** Actual published regular unique templates, with constructible five-choice mock eligibility. */
export function regularCoverage(bank, at = Date.parse(bank.releasedAt)) {
  const written = emptySubjects(), fiveChoice = emptySubjects();
  const seen = new Set(), fiveSeen = new Set(); let practical = 0;
  for (const q of bank.questions) {
    if (q.testOnly !== false || !isPublishedQuestion(bank, q, at)) continue;
    if (!seen.has(q.templateId)) { seen.add(q.templateId); if (q.type === 'written') written[q.subjectId]++; else practical++; }
    if (q.type === 'written' && !fiveSeen.has(q.templateId) && q.supportedOptionCounts?.includes(5)) {
      try { presentQuestion(bank, q, 5, () => 0); fiveSeen.add(q.templateId); fiveChoice[q.subjectId]++; } catch { /* Not constructible, so not mock eligible. */ }
    }
  }
  return {regularWrittenBySubject: written, regularPractical: practical, mockEligible: SUBJECTS.every(id => fiveChoice[id] >= 20)};
}

/** Occurrence versions are effective-dated; do not reinterpret immutable Oct 2 history. */
export const FOUR_HOUR_CADENCE_AT = Date.parse('2026-10-03T00:00:00+09:00');
export const CAMPAIGN_SCHEDULE_VERSIONS = Object.freeze([
  Object.freeze({version: 'legacy-12h', effectiveFrom: Date.parse('2026-10-02T20:00:00+09:00'), effectiveUntil: FOUR_HOUR_CADENCE_AT, hours: Object.freeze([8, 20])}),
  Object.freeze({version: 'four-hour-v2', effectiveFrom: FOUR_HOUR_CADENCE_AT, effectiveUntil: FREEZE_AT, hours: Object.freeze([0, 4, 8, 12, 16, 20])})
]);
const scheduledRoundStarts = CAMPAIGN_SCHEDULE_VERSIONS.flatMap(version => {
  const starts = [];
  for (let day = 2; day <= 16; day++) for (const hour of version.hours) {
    const at = Date.parse(`2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+09:00`);
    if (at >= version.effectiveFrom && at < version.effectiveUntil) starts.push(at);
  }
  return starts;
}).sort((a, b) => a - b);
// The finalizer is a bound only, never another content-expansion occurrence.
const campaignBounds = [...scheduledRoundStarts, Date.parse('2026-10-16T23:30:00+09:00')];
export function nextScheduledRoundAt(startedAt) {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return NaN;
  return campaignBounds.find(at => at > start) ?? FREEZE_AT;
}
