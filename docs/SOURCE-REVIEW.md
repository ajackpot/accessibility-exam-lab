# 정규 문제 은행 출처 검토

`2026.10.02-regular.1`의 새 일반 문항 58개에는 71개 출처 레코드가 연결되어 있습니다. 1차 자료의 판·절·확인 시각과 후보별 독립 풀이·정답/오답 검토·채택 사유는 [1회차 구조화 대장](rounds/round-001.json), 범위·한계와 다음 조사는 [1회차 보고서](rounds/round-001.md)에 있습니다. 원문 공식 첨부·샘플 문제는 재배포하지 않습니다.

이하 기존 14개 기능 검증용 시드의 과거 검토 기록은 보존합니다. 이 시드들은 일반 문항으로 재분류하지 않습니다.

# First-day seed answer and evidence review

Checked 2026-10-01. 14 independently written, nonofficial test-only questions. No official source files or sample questions are included in the bank. All 4/5-option subsets are structurally single-answer. Narrative answers are ungraded in the app; their rubric is for optional external evaluation only.

| ID | Answer | Primary evidence |
|---|---|---|
| seed-w01 | 운용의 용이성 | [6장 운용의 용이성, 6.1.1 키보드 사용 보장](https://www.rra.go.kr/ko/reference/kcsList_view.do?nb_seq=5247&nb_type=6) |
| seed-w02 | 원 옆에 각각 “완료”, “미완료”라는 텍스트 상태를 함께 표시한다. | [5.4.1 색에 무관한 콘텐츠 인식](https://www.rra.go.kr/ko/reference/kcsList_view.do?nb_seq=5247&nb_type=6) |
| seed-w03 | DNS | [5.2.1 Typical functions: Host name to host address translation](https://www.rfc-editor.org/rfc/rfc1034.html#section-5.2.1); [1.1 Purpose; 3.4 Messages](https://www.rfc-editor.org/rfc/rfc9110.html#section-3.4); [Abstract; 문서 상태와 시험 기준 버전](https://www.w3.org/TR/2017/REC-html52-20171214/); [Abstract](https://www.w3.org/TR/CSS22/); [Assignment operators; Arithmetic operators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_operators) |
| seed-w04 | HTTP | [5.2.1 Typical functions: Host name to host address translation](https://www.rfc-editor.org/rfc/rfc1034.html#section-5.2.1); [1.1 Purpose; 3.4 Messages](https://www.rfc-editor.org/rfc/rfc9110.html#section-3.4); [Abstract; 문서 상태와 시험 기준 버전](https://www.w3.org/TR/2017/REC-html52-20171214/); [Abstract](https://www.w3.org/TR/CSS22/); [Assignment operators; Arithmetic operators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_operators) |
| seed-w05 | id | [Forms: The label element; The button element](https://www.w3.org/TR/2017/REC-html52-20171214/sec-forms.html#the-label-element); [Associating labels explicitly](https://www.w3.org/WAI/tutorials/forms/labels/#associating-labels-explicitly); [Abstract; 문서 상태와 시험 기준 버전](https://www.w3.org/TR/2017/REC-html52-20171214/) |
| seed-w06 | aria-pressed | [6.7 aria-pressed (state); button role](https://www.w3.org/TR/wai-aria-1.2/#aria-pressed) |
| seed-w07 | navy | [6.4.1 Cascading order; 6.4.3 Calculating a selector’s specificity](https://www.w3.org/TR/CSS22/cascade.html#specificity) |
| seed-w08 | 8 | [Assignment operators; Arithmetic operators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_operators) |
| seed-w09 | 화면 낭독기 | [Tools and preferences](https://www.w3.org/WAI/people-use-web/tools-techniques/) |
| seed-w10 | 자동으로 확인 가능한 항목의 결과를 검토하고, 사람의 판단이 필요한 항목과 실제 조작도 추가로 점검한다. | [What Evaluation Tools Can Do and Can Not Do](https://www.w3.org/WAI/test-evaluate/tools/selecting/) |
| seed-p01 | attribute: for; target: reply-email; reason: 레이블과 입력의 관계를 보조기술이 알 수 있도록 하기 위해서 | [7.3.2 레이블 제공](https://www.rra.go.kr/ko/reference/kcsList_view.do?nb_seq=5247&nb_type=6); [Forms: The label element; The button element](https://www.w3.org/TR/2017/REC-html52-20171214/sec-forms.html#the-label-element); [Associating labels explicitly](https://www.w3.org/WAI/tutorials/forms/labels/#associating-labels-explicitly); [Abstract; 문서 상태와 시험 기준 버전](https://www.w3.org/TR/2017/REC-html52-20171214/) |
| seed-p02 | attribute: aria-pressed; state: true; update: 즐겨찾기를 실제로 해제하고 aria-pressed를 "false"로 갱신한다. | [8.2.1 웹 애플리케이션 접근성 준수](https://www.rra.go.kr/ko/reference/kcsList_view.do?nb_seq=5247&nb_type=6); [6.7 aria-pressed (state); button role](https://www.w3.org/TR/wai-aria-1.2/#aria-pressed); [Forms: The label element; The button element](https://www.w3.org/TR/2017/REC-html52-20171214/sec-forms.html#the-label-element); [Accessibility; type](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button) |
| seed-p03 | violation: 링크의 기능을 전달할 대체 텍스트가 비어 있다.; reason: 화면 낭독기로 링크를 탐색할 때 교육 일정으로 이동한다는 목적을 알기 어렵다.; fix: <a href="/education/schedule"><img src="calendar-mark.svg" alt="교육 일정"></a> | [5.1.1 적절한 대체 텍스트 제공](https://www.rra.go.kr/ko/reference/kcsList_view.do?nb_seq=5247&nb_type=6) |
| seed-p04 | violation: 제시된 구현에는 키보드로 요약 열기를 실행하는 경로가 없다.; reason: 키보드만 사용하는 사용자는 요약을 열지 못할 수 있다.; fix: <button type="button" onclick="openSummary()">요약 열기</button>; verify: Tab 키로 조작 요소에 도달하고 초점 위치를 확인한다. + Enter와 Space로 각각 요약 열기 기능을 실행할 수 있는지 확인한다. | [6장 운용의 용이성, 6.1.1 키보드 사용 보장](https://www.rra.go.kr/ko/reference/kcsList_view.do?nb_seq=5247&nb_type=6); [Forms: The label element; The button element](https://www.w3.org/TR/2017/REC-html52-20171214/sec-forms.html#the-label-element); [Accessibility; type](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button) |

## Source and version audit

- KWCAG: official RRA page browsed; 2022-12-28 version metadata and linked KWCAG 2.2 DOCX confirmed. Relevant clauses inspected in the existing official-source DOCX and its extracted text. DOCX paragraph extraction independently confirmed 5.4.1, 6.1.1, 7.3.2 and 8.2.1. No layout-dependent page numbers asserted.
- HTML: fixed 2017-12-14 HTML 5.2 root document was browsed. The sec-forms endpoint initially exceeded the web parser’s size limit, then a direct read-only HTTPS retrieval succeeded (HTTP 200, 4,701,847 bytes). Exact for/ID association and native button/type behavior were verified in the primary dated specification. W3C WAI Labeling Controls supplies corroborating guidance. HTML 5.2 was not replaced with Living Standard.
- WAI-ARIA: 1.2 Recommendation 2023-06-06, aria-pressed definition and state values directly browsed. Practical p02 is KWCAG 8.2.1 with ARIA used as the implementation definition, not an expansion to all WCAG success criteria.
- CSS: CSS 2.2 is explicitly a Working Draft. Cascade and specificity sections directly browsed. The stem excludes inline styles, important declarations, other origins and animation/transition conflicts.
- DNS and HTTP: original RFC Editor sources directly browsed. DNS question asks specifically for A-record/IPv4 lookup; it does not reduce all DNS functions to that example. HTTP question names GET and response status to prevent generic network-protocol ambiguity.
- JavaScript: official MDN guide directly browsed; original three-line program independently executed and returned Number 8. No host-specific API or string coercion.
- Assistive technology and evaluation: W3C WAI primary pages directly browsed. No one-to-one disability/tool stereotypes or automated-certification guarantees.
- No legal-current-affairs quiz or copied answer from the unkeyed KWCAG 2.1 sample is present.

## Grading and reuse audit

- shared-dns is correct for seed-w03 and a distractor for seed-w04. shared-http has the reverse role. Their common definitions never change; scoped explanations expressly state why the role changes.
- All other written option sets are exclusive. Source-of-truth relations are question links; memberQuestionIds is a generated reverse index.
- Written count=5 uses one correct + four distractors; count=4 uses one correct + any three distractors. All 50 candidate subsets passed structural checks.
- p01/p02 contain deterministic text blanks with trim-only normalization and explicit lowercase entry. p03/p04 contain code choices. p04 also has an exact two-choice set; no partial credit within that set.
- Fixed subpart points are separate from the free-response reference rubric. External AI output must not alter app correctness statistics.
- Sources are referenced with versions, clauses, evidence summaries, check date and rights statements. They are not relicensed by this bank.

## Independent review

Independent app QA solved questions-only.json before reading the canonical answer bank. All 10 written keys and all 13 practical subpart keys matched exactly. No multiple-correct or no-correct ambiguity was detected. Primary-source spot-checks also supported the answers. The independent reviewer caught one source-location typo, corrected from ARIA section 6.6 to 6.7; no answer keys changed. App integration review is separate.

## 0.2.2 material-purpose correction (2026-10-02)

No question, answer key, source evidence or learning goal was added or changed. New bank `2026.10.02-seed.2` preserves all 14 test-only seeds and increments the revision of seven questions whose material metadata changed. Its bank schema2 classifies seed-w05's completed label/input example as explanation-only. The stem already states the relevant for value and asks for the input attribute, so the complete example is unnecessary before grading and reveals the answer. CSS specificity (w07), JavaScript calculation (w08), and all four practical tasks require their supplied code; these remain question materials with exact stem-instruction excerpts. Human review of those roles is distinct from validating the new fields.

The original `seed.1` bytes and old session snapshots remain unchanged. A read-only exact-content legacy catalogue applies these reviewed roles to known original snapshots; unknown material defaults to explanation. Existing first-day source/answer review above remains historical evidence, not a claim of new primary-source research or manual NVDA testing.

## 0.2.3 stimulus-format correction (2026-10-02)

All 14 seeds received a wording/material-role audit. Six code-dependent questions (w07, w08, p01–p04) now explicitly refer to the supplied 보기 and state the task; practical free-response prompts use the same reference. The self-contained w05 no longer says “바로 뒤” when its completed example is hidden, and that example remains explanation-only. The other seven questions remain unchanged.

Bank `2026.10.02-seed.3` increments those seven question revisions; all IDs, testOnly classifications, learning-goal revisions, source evidence, code contents, options, links, fixed parts, reference answers and rubrics remain unchanged. This is an instruction/format audit, not new source research or new questions. Exact-match seed.1/seed.2 display instructions repair reading order without rewriting historical snapshots. Automated publishing checks cover explicit stimulus references and tasks; independent semantic review must still confirm the actual material, referent and intended action match.

## 0.2.4 concise wording and conditions audit (2026-10-02)

All 14 existing seeds were reviewed again for one integrated one-to-two-sentence task, with assumptions and entry conditions separated into notes where needed (seven items; seven with no notes). All six required code stimuli remain, and the completed w05 example remains explanation-only. Practical free-response prompts now retain only the task requirements; app-use notices stay in UI. The p04 warning against invented observations remains a task requirement.

Bank `2026.10.02-seed.4` uses schema3 and increments all question revisions. Stable IDs, testOnly, learning goals, source content, code, choices, fixed answers, reference answers and scoring remain unchanged. This is editorial review using the previously reviewed evidence, not fresh source research or new questions. Exact-known seed.1–seed.3 display projections do not change stored originals, hashes, or AI exports. Historical exports deliberately retain any original app-use wording.


## 3회차 정규 추가 근거

2026.10.03-regular.3의 신규58개는 지정 판의1차 원문과 공식 출제기준에 대조한 독자 문항이다. 후보당 최대3회, 키 비공개 풀이와 모든 선택지·빈칸·조건·단일정답·범위·권리·문안을 같은 개정판에서 검토했다. 앞선 일반115개·테스트14개·출처 객체는 변경하지 않는다. 공유 검색 표현, WAI 지침의 적용 대상, CSS2.2초안/ECMAScript2015/DOM·HTML5.2/ARIA1.2, 고정AccName1.1, 현행 법령과 평가 절차를 다뤘다.

불확실한 표준 절 위치와 조건 누락·오답 품질은 실패를 기록한 뒤 새 개정판·새 독립 풀이로 재검토했다. 새 근거로 재개방하지 않은 이전 탈락 목표를 문구 변경으로 재등록하지 않았다. 세부 근거·한계·다음 조사 계획은 [3회차 대장](rounds/round-003.json)과 [보고서](rounds/round-003.md)를 따른다. 실제 공개 확인은 별도 검증이다.


## 4회차 정규 추가 근거

2026.10.03-regular.4의 신규 58개는 시험 범위와 해당 지정 판의 1차 근거에 대조한 독자 문항이다. 중단된 첫 검토를 포함해 후보당 최대 3회 안에서 새 독립 풀이와 모든 선택지·빈칸의 조건·단일 정답성·범위·권리·문안을 같은 개정판으로 검토했다. 기존 일반 173개·테스트 14개·출처 객체는 보존했다.

KWCAG 2.2에 없는 국제 성공기준을 국내 의무로 추가하지 않고 표준 의미와 실제 보조기술 측정을 구별했다. 세부 판·절·근거·실패와 수정·다음 조사는 [4회차 대장](rounds/round-004.json)과 [보고서](rounds/round-004.md)를 따른다. 실제 공개 확인은 별도 검사다.


## 5회차 정규 추가 근거

2026.10.04-regular.5의 신규 52개는 시험 범위와 해당 지정 판의 1차 근거에 대조한 독자 문항이다. 후보당 최대 3회 안에서 키 공개 전 독립 풀이와 모든 선택지·빈칸의 조건·단일 정답성·범위·권리·문안을 같은 개정판으로 검토했다. 기존 일반 231개·테스트 14개·출처 및 선택지 객체를 보존했다.

KWCAG 2.2의 국내 요구와 국제표준의 범위를 구분하고 특정 보조기술에서의 동작을 정적 표준 판단만으로 보장하지 않는다. 세부 판·절·근거·실패와 수정·다음 조사는 [5회차 대장](rounds/round-005.json)과 [보고서](rounds/round-005.md)를 따른다. 실제 공개 확인은 별도 검사다.


## 6회차 정규 추가 근거

2026.10.04-regular.6의 신규 41개는 시험 범위와 해당 지정 판의 1차 근거에 대조한 독자 문항이다. 후보당 최대 3회 안에서 키 공개 전 독립 풀이와 모든 선택지·빈칸의 조건·단일 정답성·범위·권리·문안을 같은 개정판으로 검토했다. 기존 일반 283개·테스트 14개·출처 및 선택지 객체를 보존했다.

KWCAG 2.2의 국내 요구와 국제표준의 범위를 구분하고 특정 보조기술에서의 동작을 정적 표준 판단만으로 보장하지 않는다. 세부 판·절·근거·실패와 수정·다음 조사는 [6회차 대장](rounds/round-006.json)과 [보고서](rounds/round-006.md)를 따른다. 실제 공개 확인은 별도 검사다.


## 7회차 오프라인 추가 근거

신규39개는2026-05-07 공식 출제기준과 지정 판1차 자료에 대조한 독자 문항이다. 원문을 복제하지 않고 정확한 판·절·확인 시각·권리·각 후보의 근거를 [7회차 대장](rounds/round-007.json)에 연결했다. 최신6회차 누적본의338문항·선택지·출처·편집 정정·시드를 그대로 보존한다. 신규 목표는 모든 기존 채택·탈락 목표와 비교하며 문구·배경 변경을 독립 목표로 세지 않는다.

정확한 개정판마다 먼저 가린 자료에서 독립 답을 고정하고 모든 선택지·빈칸의 조건·예외·오개념 타당성·단일 정답·문안을 검토했다. 실제 호스팅 공개와 보조기술 실측은 별도이며, 전달된 오프라인 은행이 공개 Git에 이미 반영되었다고 주장하지 않는다.


## 8회차 오프라인 추가 근거

신규 40개는 2026-05-07 공식 출제기준과 지정 판 1차 자료에 대조한 독자 문항이다. 원문을 복제하지 않고 판·절·확인 시각·권리·후보별 근거를 [8회차 대장](rounds/round-008.json)에 연결했다. 최신 7회차 누적본의 377문항·선택지·출처·편집 정정·시드를 그대로 보존한다. 신규 목표는 기존 채택·탈락 목표와 대조하며 문구·배경·문항 형식 변경만을 독립 목표로 세지 않는다.

정확한 개정판마다 가린 자료에서 독립 답을 먼저 고정하고 모든 선택지·빈칸의 조건·예외·오개념 타당성·단일 정답·문안을 검토했다. 실제 호스팅 공개와 보조기술 실측은 별도이며, 전달된 오프라인 은행이 공개 Git에 반영되었다고 주장하지 않는다.


## 9회차 추가 근거

신규34개는 공식 2026-05-07 범위와 고정판·현행법령의 직접 확인에 연결했다. 과거 417문항의 전체 목표·탈락 계보와 대조하여 단순 변형을 제외했다. 정확한 같은 개정판의 독립 풀이·모든 선택지/빈칸·판/절·조건/예외·해설·권리는 [9회차 대장](rounds/round-009.json)에 기록한다. 실제 브라우저/보조기술 관찰은 규범적 검토와 구별한다.


## 10회차 추가 근거

신규40개는 공식2026-05-07 출제범위와 고정판·현행법령의 직접 확인에 연결했다. 기존451문항과 탈락 계보를 대조하여 단순 변형을 제외했다. 정확한 같은 개정판의 독립 풀이·모든 선택지/빈칸·판/절·조건/예외·해설·권리 검토는 [10회차 대장](rounds/round-010.json)에 기록한다. 규범적 검토와 실제 브라우저·보조기술 관찰은 구별한다.


## 11회차 추가 근거

신규23개는 공식2026-05-07 출제범위와 고정판1차 자료에 연결했다. 기존491문항과 전체 탈락 계보를 대조하여 단순 변형을 제외했다. 정확한 같은 개정판의 독립 풀이·모든 선택지/빈칸·판/절·조건/예외·해설·권리 검토는 [11회차 대장](rounds/round-011.json)에 기록한다. 규범 검토와 실제 브라우저·보조기술 관찰은 구별한다.


## 12회차 추가 근거

신규33개는 공식2026-05-07 출제범위와 고정판1차 자료에 연결했다. 기존514문항과 전체 탈락 계보를 대조하여 단순 변형을 제외했다. 정확한 같은 개정판의 독립 풀이·모든 선택지/허용답·판/절·조건/예외·해설·권리 검토는 [12회차 대장](rounds/round-012.json)에 기록한다. 법령의 현재 시행판과 미래 개정판을 구별하며 규범 검토와 실제 브라우저·보조기술 관찰도 구별한다.


## 13회차 추가 근거

신규28개는 공식2026-05-07 출제범위와 확인한1차 자료에 연결했다. 기존547문항과 전체 탈락 계보를 대조하여 단순 변형을 제외했다. 정확한 같은 개정판의 독립 풀이·모든 선택지/허용답·판/절·조건/예외·해설·권리 검토는 [13회차 대장](rounds/round-013.json)에 기록한다. 현재 법령과 미래 시행판을 구별하며 규범 검토와 실제 브라우저·보조기술 관찰도 구별한다.


## 14회차 추가 근거

신규29개는 공식2026-05-07 출제범위와 확인한1차 자료에 연결했다. 기존575문항과 전체 탈락 계보를 대조하여 단순 변형을 제외했다. 같은 개정판의 독립 풀이·모든 선택지/허용답·판/절·조건/예외·해설·권리 검토는 [14회차 대장](rounds/round-014.json)에 기록한다. 작업 공간 회귀 후 원본 문항·맹검·잠금 답과 기존 채택 보고서 해시를 확인했으며, 출처 원시 캐시와 일부 시험 로그는 미복구임을 구분한다. 규범·도구 검사와 실제 브라우저/보조기술 관찰은 별개다.


## 15회차 추가 근거

신규 36개는 공식 2026-05-07 출제범위와 실제 확인한 1차 자료에 연결했다. 기존 604문항·전체 593개 종결 후보·22개 편집 정정을 대조하여 단순 변형을 제외했다. 같은 개정판의 독립 풀이·모든 선택지/허용답·판/절·조건/예외·해설·권리 검토는 [15회차 대장](rounds/round-015.json)에 기록한다. 14회차 원시 캐시·일부 시험 로그의 미복구 이력은 그대로 보존한다. 이번 새 조사/자동 검증과 실제 브라우저·보조기술 관찰은 별개다.


## 16회차 추가 근거

신규 28개는 공식 2026-05-07 출제범위와 확인한 1차 자료에 연결했다. 기존 640문항·전체 631개 종결 후보·22개 편집 정정을 대조하여 단순 변형을 제외했다. 같은 개정판의 독립 풀이·모든 선택지/허용답·판/절·조건/예외·해설·권리 검토는 [16회차 대장](rounds/round-016.json)에 기록한다. 실패한 출처 요청은 성공한 새 다운로드와 구분하고, 기존 14회차의 미복구 자료와 15회차의 종결 이력을 유지한다. 규범상 판정과 자동 검사를 실제 브라우저·보조기술 관찰로 확대하지 않는다.


## 17회차 추가 근거

신규 30개는 공식 2026-05-07 출제범위와 확인한 1차 자료에 연결했다. 기존 668문항·전체 660개 종결 후보·22개 편집 정정을 대조하여 단순 변형을 제외했다. 같은 개정판의 독립 풀이·모든 선택지/허용답·판/절·조건/예외·해설·권리 검토는 [17회차 대장](rounds/round-017.json)에 기록한다. 실패한 출처 요청은 성공한 새 다운로드와 구분하고, 기존 14회차의 미복구 자료와 15·16회차의 종결 이력을 유지한다. 규범상 판정과 자동 검사를 실제 브라우저·보조기술 관찰로 확대하지 않는다.


## 18회차 추가 근거

신규 26개는 공식 2026-05-07 출제범위와 확인한 1차 자료에 연결했다. 기존 698문항·전체 종결 후보와 22개 편집 정정을 대조하여 단순 변형을 제외했다. 같은 개정판의 독립 풀이·모든 선택지/허용답·판/절·조건/예외·해설·권리 검토는 [18회차 대장](rounds/round-018.json)에 기록한다. 실패한 요청과 성공한 원문 수신·동일 캐시 재사용을 구별하며 규범·자동 검사를 실제 브라우저·보조기술 관찰로 확대하지 않는다.


## 19회차 추가 근거

신규 28개는 고정2026-05-07 출제범위와 실제 확인한1차 자료에 연결했다. 기존724문항의 실제 정답·오답·해설 및 전체 종결 후보·22개 선택지 편집 정정을 대조하여 단순 변형을 제외했다. 정확한 판·절·조건·권리·모든 선택지/허용답·동일 개정판의 독립 검토는 [19회차 대장](rounds/round-019.json)에 연결한다. 공식 범위HWP는 이번 회차 재수신하고 동일한 고정판 해시를 확인했다. 실패한 요청과 성공한 수신·공동 캐시 재검토를 구별하며, 문서 확인을 실제 제품·보조기술 관측으로 표시하지 않는다.


## 20회차 추가 근거

신규 43개는 고정2026-05-07 출제범위와 실제 확인한1차 자료에 연결했다. 전체752문항의 기계 색인과 근접 문항의 실제 정답·오답·해설, 전체 종결 후보·관련22개 선택지 편집 정정을 대조하여 단순 변형을 제외했다. 정확한 판·절·조건·권리·모든 선택지/허용답·동일 개정판의 독립 검토는 [20회차 대장](rounds/round-020.json)에 연결한다. 공식 범위HWP는 이번 회차 재수신하고 동일한 고정판 해시를 확인했다. 실패한 요청과 성공한 수신·공동 캐시 재검토를 구별하며, 문서 확인을 실제 제품·보조기술 관측으로 표시하지 않는다.


## 21회차 추가 근거

신규 30개는 고정2026-05-07 출제범위와 실제 확인한1차 자료에 연결했다. 전체795문항의 기계 색인과 근접 문항의 실제 정답·오답·해설, 전체 종결 후보·관련22개 선택지 편집 정정을 대조하여 단순 변형을 제외했다. 정확한 판·절·조건·권리·모든 선택지/허용답·동일 개정판의 독립 검토는 [21회차 대장](rounds/round-021.json)에 연결한다. 공식 범위HWP는 이번 회차 재수신하고 동일한 고정판 해시를 확인했다. 실패한 요청과 성공한 수신·공동 캐시 재검토를 구별하며, 문서 확인을 실제 제품·보조기술 관측으로 표시하지 않는다.


## 22회차 추가 근거

발행 적격 신규 12개는 고정2026-05-07 출제범위와 확인한1차 자료에 연결했다. 전체825문항·연결 선택지·해설·실기 항목과 종결·편집 이력을 검색하고 근접 원문을 직접 대조해 단순 변형을 제외했다. 제작 검토의 채택 이력31개 중19개는 문항 전체 풀이 역할 부족으로 별도 최초 공개 제외 기록에 연결하고 앱에 넣지 않았다. 나머지12개의 같은 개정판에 대한 출처·판·절·조건·모든 대안 및 독립 검토는 [22회차 대장](rounds/round-022.json)에 연결한다. 공식 필기·실기HWP와 KWCAG2.2 원문은 이번 회차 재취득하여 고정판 해시가 같음을 확인했다. 원문 재취득과 공동 캐시 재검토를 구별하고 문서 확인을 실제 제품·보조기술 관측으로 표시하지 않는다.

## 24회차 추가 근거

신규 13개는 공식2026-05-07 출제범위와 직접 확인한 고정판1차 자료에 연결했습니다. 원문 HWP의80,896바이트와 SHA-256 e947c9915b4063738d66f394b8dcedd48555b5b2a896a1d9020f23be9902a314를 다시 확인했으며 실패한 HTTP999/429 요청은 성공한 직접 취득·웹 열람·정확한 보존 원문 검사와 구분했습니다. 1,228개 전체 내용 변형과871개 종결 후보의 실제 선택지·해설·목표를 대조했고, 원문 부재 탈락5개와22/23회차 예약을 유지했습니다. 모든 새 문항 전체 해설에서 실제 해결 규칙과 적용을 별도 확인했습니다. 같은 개정판의 독립 판정·원문 위치·한계는 [24회차 대장](rounds/round-024.json)과 [보고서](rounds/round-024.md)를 따릅니다. 원문 조사·순수 JavaScript 실행과 실제 HTML/CSS 브라우저·Windows/NVDA·점자 출력 실측은 구분합니다.

## 25회차 출처·독립 풀이

검증된24회차의850개 기존 문항·출처·선택지를 보존하고 신규 필기 15개·실기 1개를 추가했습니다. 모든 채택 문항은 정확한 개정판의 독립 풀이와1차 근거·범위·권리·모호성·문안·구조 검사를 통과했으며 문항 전체 해설의 실제 규칙과 적용도 별도로 확인했습니다. 지정판과 정확한 조항·확인 시각은 [25회차 대장](rounds/round-025.json)의 후보별 근거를, 수량·실패·한계와 다음 조사는 [보고서](rounds/round-025.md)를 따릅니다. 원문 공식 샘플을 복제하거나 원래 소실된 검토를 복구했다고 하지 않습니다.

## 26회차 출처·독립 풀이

검증된25회차의866개 기존 문항·출처·선택지를 보존하고 신규 필기 16개·실기 0개를 추가했습니다. 모든 채택 문항은 정확한 개정판의 독립 풀이와1차 근거·범위·권리·모호성·문안·구조 검사를 통과했으며 문항 전체 해설의 실제 규칙과 적용도 별도로 확인했습니다. 지정판과 정확한 조항·확인 시각은 [26회차 대장](rounds/round-026.json)의 후보별 근거를, 수량·실패·한계와 다음 조사는 [보고서](rounds/round-026.md)를 따릅니다. 원문 공식 샘플을 복제하거나 원래 소실된 검토를 복구했다고 하지 않습니다.

## 27회차 출처·독립 풀이

검증된26회차의882개 기존 문항·출처·선택지를 보존하고 신규 필기 13개·실기 1개를 추가했습니다. 모든 채택 문항은 정확한 개정판의 독립 풀이와1차 근거·범위·권리·모호성·문안·구조 검사를 통과했으며 문항 전체 해설의 실제 규칙과 적용도 별도로 확인했습니다. 지정판과 정확한 조항·확인 시각은 [27회차 대장](rounds/round-027.json)의 후보별 근거를, 수량·실패·한계와 다음 조사는 [보고서](rounds/round-027.md)를 따릅니다. 원문 공식 샘플을 복제하거나 원래 소실된 검토를 복구했다고 하지 않습니다.

## 28회차 출처·독립 풀이

고정 표준판과 확인된 현행 법령의 역할·변경 규칙을 독립 검토했습니다. 원문을 문제로 복제하지 않았고 각 문항의 전체 해설과 선택지별 이유를 구별했습니다. 구체적인 판정·검사·한계는 [28회차 보고서](rounds/round-028.md)와 대장을 따릅니다.

## 29회차 출처·독립 풀이

고정판의 인터넷 역사·브라우저 엔진·ARIA 조건 및 관계를 독립 검토했습니다. 원문을 문제로 복제하지 않았고 각 문항의 전체 해설과 선택지별 이유를 구별했습니다. 구체적인 판정·검사·한계는 [29회차 보고서](rounds/round-029.md)와 대장을 따릅니다.

## 30회차 출처·독립 풀이

채택된 정확한 개정판의 지정 1차 자료·조건·예외와 선택지 판정을 독립 검토했습니다. 원문을 문제로 복제하지 않았고 각 문항의 전체 해설과 선택지별 이유를 구별했습니다. 구체적인 판정·검사·한계는 [30회차 보고서](rounds/round-030.md)와 대장을 따릅니다.

## 31회차 출처와 독립 검토

새 후보의 정확한 고정판 근거·범위·선택지 판정 및 실제 풀이 해설을 별도로 검토했습니다. 원문 취득 실패와 보존판 재사용, 미실측 환경을 구분했습니다. [31회차 보고서](rounds/round-031.md)를 함께 확인합니다.

## 32회차 출처와 독립 검토

새 후보의 근거·범위·선택지 및 문항 전체 풀이 해설에 대한 실제 판정은 동명 대장을 따릅니다. 원문 취득·보존본 재사용과 미실측 환경을 구분합니다. [32회차 보고서](rounds/round-032.md)를 함께 확인합니다.

## 33회차 출처와 독립 검토

새 후보의 근거·범위·선택지 및 문항 전체 풀이 해설에 대한 실제 판정은 동명 대장을 따릅니다. 원문 취득·보존본 재사용과 미실측 환경을 구분합니다. [33회차 보고서](rounds/round-033.md)를 함께 확인합니다.

## 34회차 출처와 독립 검토

새 후보의 근거·범위·선택지 및 문항 전체 풀이 해설에 대한 실제 판정은 동명 대장을 따릅니다. 원문 취득·보존본 재사용과 미실측 환경을 구분합니다. [34회차 보고서](rounds/round-034.md)를 함께 확인합니다.

## 35회차 출처와 독립 검토

새 후보의 근거·범위·선택지 및 문항 전체 풀이 해설에 대한 실제 판정은 동명 대장을 따릅니다. 원문 취득·보존본 재사용과 미실측 환경을 구분합니다. [35회차 보고서](rounds/round-035.md)를 함께 확인합니다.

## 36회차 출처와 독립 검토

새 후보의 근거·범위·선택지 및 문항 전체 풀이 해설에 대한 실제 판정은 동명 대장을 따릅니다. 원문 취득·보존본 재사용과 미실측 환경을 구분합니다. [36회차 보고서](rounds/round-036.md)를 함께 확인합니다.

## 37회차 출처와 독립 검토

새 후보의 근거·범위·선택지 및 문항 전체 풀이 해설에 대한 실제 판정은 동명 대장을 따릅니다. 원문 취득·보존본 재사용과 미실측 환경을 구분합니다. [37회차 보고서](rounds/round-037.md)를 함께 확인합니다.

## 38회차 출처와 독립 검토

새 후보의 근거·범위·선택지 및 문항 전체 풀이 해설에 대한 실제 판정은 동명 대장을 따릅니다. 원문 취득·보존본 재사용과 미실측 환경을 구분합니다. [38회차 보고서](rounds/round-038.md)를 함께 확인합니다.

## 39회차 출처와 독립 검토

새 후보의 근거·범위·선택지 및 문항 전체 풀이 해설에 대한 실제 판정은 동명 대장을 따릅니다. 원문 취득·보존본 재사용과 미실측 환경을 구분합니다. [39회차 보고서](rounds/round-039.md)를 함께 확인합니다.
