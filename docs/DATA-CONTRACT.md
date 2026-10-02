# 데이터 계약 v3 (앱 0.2.8)

기존 은행·스냅샷 읽기의 정식 검증기는 `src/domain.js`의 `validateBank` 및 `src/backup.js`의 `validateSession`입니다. 새 등록·공개 후보는 더 엄격한 `validateBankForPublication` 구조 검사와 `validateExplanationAuthoring` 해설 저작 검사를 추가 통과해야 합니다. 후보 JSON 경로를 명시한 validate/build뿐 아니라 인자 없는 현재 은행 build/check와 릴리스 대장 검증도 새/변경 문항의 해설 검사를 실행합니다. 후보는 현재 manifest를 교체하기 전에 검사하며, 직접 manifest를 새 은행으로 바꿔도 저작 검사를 우회할 수 없습니다. 이전 seed.1/seed.2/seed.3 백업을 새 저작 규칙으로 소급 거부하지 않습니다. 출제와 채점에 사용하지 않는 추가 메타데이터는 보존할 수 있습니다. 스키마 변경은 앱 호환성 검토 후 별도로 합니다.

## 은행 JSON

- 신규 은행은 `schemaVersion: 3`; 호환성 읽기는 `1`, `2`도 허용합니다. 세션·백업·manifest 외피 버전은 계속 `1`입니다
- `bankVersion`: ASCII 안정 버전 ID, `releasedAt`: ISO 시각
- 편집 정정 릴리스의 `editorialRoundId`는 해당 공개 운영 대장을 가리키는 메타데이터입니다. 앱 정답·채점 상태나 점수 정정 배열이 아니며 신규 정규 문항 수를 늘리지 않습니다
- `syllabusVersion`, `changeSummary`
- `subjects`: `{id,name}`. 필기 `s1` 표준, `s2` 인터넷, `s3` HTML, `s4` CSS/스크립트, `s5` 정보접근성
- `sources`: `{id,title,url,version,checkedAt,location,evidence,rights}`. 원문 기관·주소·판/시행일·확인일·절/쪽·근거와 재사용 설명
- `options`: `{optionId,revision,content,explanation,equivalenceGroupId?}`. 전역 정답 여부를 두지 않음
- `questions`: 아래 문항 객체
- `corrections`: 명시적 정정 목록. 기본 `[]`

## 모든 문항

`questionId`, `revision`, `templateId`, `learningGoalRevision`, `type: written|practical`, `subjectId`, `topicIds`, `stem`, `notes`, `explanation`, `sourceRefs`, `verificationStatus: candidate|reviewed|published|retired|invalid`, `testOnly`, `standardVersion`, `difficulty`, `reviewNote`를 둡니다.

published만 출제합니다. published에는 근거 검토·독립 풀이 기록이 필요합니다. 기존 시드 문항은 계속 `testOnly: true`입니다. 2026-10-02부터 시작한 정규 확대 회차에서 독립 검증을 통과한 새 문항은 `testOnly: false`로 작성하며, 기존 시드를 조용히 재분류하지 않습니다. candidate와 reviewed를 개수 채우기 위해 공개하지 마세요. `materials`는 `{filename,content,purpose,instruction?,focusLine?}` 배열이며 실행 파일이 아닌 텍스트입니다.

### 핵심 지문과 참고 사항

`stem`에는 풀이 대상과 해야 할 일을 통합한 1~2문장만 씁니다. 가정·제약·입력 형식·배점 등 부가 조건은 `notes: string[]`에 분리합니다. 새 스키마는 조건이 없더라도 `notes: []`를 명시합니다. 기존 스키마는 notes 부재를 허용하되, 있으면 같은 구조 검사를 적용합니다. 최대 20항목, 각 항목은 비어 있지 않은 최대 2,000자 문자열입니다.

새 공개 검사는 stem의 앞뒤 공백·줄바꿈·350자 초과·3문장 이상, notes의 앞뒤 공백·줄바꿈·중복·stem과 동일한 항목, 별도 ‘보기 연결 안내’를 거부합니다. 문장 수 검사는 구두점 기반 보조 검사이며 소수점·파일명과 의미 구분을 포함한 독립 문안 검토를 대신하지 않습니다. 화면에서는 notes가 있을 때만 이름 있는 ‘참고 사항’ 영역과 목록을 만듭니다. 이 조건을 접힌 안내 속에 숨기지 않습니다.

### 코드 자료 역할과 공개 시점

- `purpose: "question"`: 지문이 사용하도록 지시하는 코드 읽기·빈칸 완성·위반 점검 자료입니다. `instruction`에는 해당 지시가 들어 있는 지문의 정확한 비어 있지 않은 구절을 저장합니다. 호환성 읽기 검증기는 이 구절이 stem에 있는지 확인합니다. 새 공개 검사는 아래의 문항 등록·보기 연결 계약까지 검사합니다. 지시가 실제로 해당 자료를 요구하는지, 정답·완성 예시를 문제 자료로 잘못 분류하지 않았는지는 의미 검토에서 확인합니다. 코드 문법·키워드나 문항 유형으로 역할을 추측하지 않습니다
- `purpose: "explanation"`: 정답 예시·풀이 설명 코드입니다. 채점 완료와 세션의 해설 공개 정책을 모두 충족한 뒤 해설을 열 때만 표시합니다. 채점 전, 시간제 진행 중, 종료 후 해설 설정의 진행 중 화면에는 textarea·파일 선택·줄 이동·복사·별도 줄 번호 보기 자체를 만들지 않습니다. 숨김 CSS만으로 처리하지 않습니다
- 혼합 자료는 역할별로 분리하고 코드 컨트롤의 DOM ID도 구분합니다. 문제 자료는 계속 풀 수 있도록 유지하며 해설 자료가 같은 파일 선택 목록에 섞이지 않습니다
- 독립 AI 자료에는 문제용 자료만 포함합니다. 기준 비교용의 참고 정답·루브릭·정답 키·해설 코드는 해설을 볼 수 있는 시점부터 허용하며 직접 함수 호출에서도 검증합니다. 시간제 진행 중에는 두 내보내기 모두 금지합니다

### 문항 등록·보기 연결 계약

‘보기’는 풀이에 필수인 지문·이미지·그래프·수식·코드 등 분석 대상이고, ‘선택지’는 답으로 고르는 항목입니다. 코드가 포함된 선택지나 완성 해설을 보기로 승격하지 않습니다. 현재 schema3의 `materials` 렌더러는 코드 텍스트만 지원합니다. 다른 자료 유형을 도입할 때도 같은 지문 연결·읽기 순서를 구현하고 검증해야 하며, 현재 지원한다고 간주하지 않습니다.

- 보기 자료가 있는 문항을 등록할 때는 **문항 내용도 실제 보기의 유형·대상·풀이 과제에 맞춰 함께 작성**합니다. 지문에 ‘다음 보기의 코드를 읽고, … 값을 고르시오.’처럼 참조와 해야 할 일을 명시하고, 해당 문장을 `instruction`에 정확히 기록합니다. 숨겨진 메타데이터에만 넣거나 조건문을 복사해 연결을 대신하지 않습니다
- DOM과 시각적 순서는 **핵심 지문 1~2문장 → 필요한 참고 사항 → 박스형 보기 → 선택지/실기 답안**입니다. 보기 제목은 ‘보기’, 그 안에 ‘코드: 파일명 · 줄 수’를 표시합니다. 필기 legend는 ‘선택지’로 짧게 두고 지문 전체를 각 선택 때 반복하지 않습니다. 실기는 ‘실기 답안’ 다음 각 채점 항목과 ‘자유 서술 답안’을 구분합니다
- 발행 검사는 비어 있지 않은 코드, 지문에 그대로 포함된 완전한 지시문, ‘다음 보기의’ 참조, ‘코드’ 자료 유형, 읽기/실행/검토/확인과 선택/답변/완성/설명/작성 동작을 요구합니다. 표준 문구에 맞추어 작성합니다. 지문이 코드를 참조하는데 문제 자료가 없거나 해설 자료뿐이면 거부합니다
- 여러 필수 코드 파일은 서로 다른 파일명이어야 하고 각 지시문에 해당 파일명을 명시합니다. 문제 파일 선택기는 필수 보기 파일만 나열하고 전체 개수를 알립니다. 해설 파일 선택기는 따로 만들며 공개 시점을 따릅니다
- 정규식은 의미를 증명하지 못합니다. 독립 검토자가 실제 자료와 지시문의 대상·행동이 맞는지, 불필요한 자료/유령 참조/정답 누출이 없는지 확인하고 reviewNote에 남깁니다. 실패 문항은 같은 회차의 최대 3회 검토 안에서만 수정하며, 3회 미통과 또는 판정 마감이면 탈락으로 종결합니다. 미통과 후보는 출제·공개 대상에 등록하지 않습니다. 현재 앱에 문제 등록 화면은 없습니다

### schema1·schema2 / 저장된 스냅샷 호환

기존 스냅샷·정답·순서·점수·해시를 수정하거나 새 은행 내용으로 교체하지 않습니다. 새 스냅샷에만 `bankSchemaVersion`을 저장하고 백업 검증에 사용합니다. 이 필드가 없는 이전 스냅샷은 schema1로 검증합니다.

`purpose`가 없으면 기본적으로 해설용입니다. 예외는 `src/legacy-materials.js`에 명시된 은행 `2026.10.02-seed.1`의 revision1 원본뿐이며 은행·문항ID·revision·stem·filename·content·focusLine이 모두 같아야 합니다. `seed-w05`는 해설용, `seed-w07`, `seed-w08`, `seed-p01`~`seed-p04`는 문제용으로 검토했습니다. 다른 revision·내용·파일명·지문에는 적용하지 않습니다. 알려지지 않은 자료는 목적 확인 전 공개하지 않고, 풀이에 필요하면 건너뛰거나 새 은행으로 연습을 준비하도록 안내합니다. 이는 읽기 시 표시 정책이며 저장 자료의 자동 마이그레이션이 아닙니다.

seed.1/seed.2/seed.3의 검토된 14개 문항은 `src/legacy-question-display.js`의 정확일치 규칙으로 화면에서만 간결한 stem과 notes로 표시합니다. bankVersion·bankSchemaVersion과 원본 문항의 모든 고정 필드(무작위 선택지 출제를 위한 links 제외), 전체 materials·당시 instruction/purpose/focusLine을 대조하고 notes가 새로 추가되어 있으면 적용하지 않습니다. 실기 single/multi의 choices는 생성 단계에서 순서가 바뀔 수 있으므로 선택지 전체의 ID·내용·추가 필드가 정확히 같은 순열만 허용합니다. 중복·누락·변경, parts 순서, correct 배열과 나머지 필드는 계속 정확히 대조합니다. 이 비교는 저장 스냅샷을 재정렬하지 않습니다. 누락된 bankSchemaVersion은 과거 계약대로 1입니다. 알 수 없거나 수정된 원본은 그대로 표시하며 새 조건을 버리거나 일반 안내를 추측하지 않습니다. ‘현재 과제 지시문 복사’는 화면의 통합 지문과 참고 사항을 복사합니다.

표시 규칙은 저장된 stem/notes/materials/답안/선택지 순서/채점/스냅샷 해시를 바꾸지 않습니다. AI 내보내기는 표시 규칙을 사용하지 않고 당시 저장된 원문을 사용합니다. 과거의 별도 ‘보기 연결 안내’는 화면이나 AI 원문에 덧붙이지 않습니다.

문장/정답/조건 변경 시 revision을 올리고, 학습 목표나 정답 판단이 달라지면 learningGoalRevision도 올립니다. 단순 선택지 순서·조합 변경은 templateId를 새로 부여하지 않습니다.

## 필기

- `optionMode: exclusive|shared`
- `supportedOptionCounts: [4,5]` 또는 출제 가능한 부분집합
- `links: [{optionId,optionRevision,role:correct|distractor,contextExplanation?,compatibilitySetId}]`

links가 소속 관계의 단일 원본입니다. 역방향 memberQuestionIds는 생성 결과이며 앱은 links에서 도출합니다. 전용 선택지는 하나의 문항에만 연결할 수 있습니다. question.explanation은 문항 전체의 풀이·정답 근거로 계속 필수입니다. option.explanation도 계속 필수이며, 전용이면 이 문항의 선택지 이유를 한 번 쓰고 공유이면 재사용할 정의·판단 이유의 정본을 씁니다. 새 스키마나 옵션 해설 삭제를 도입하지 않습니다.

### 선택지 해설 저작과 표시

contextExplanation은 기본 해설만으로 알 수 없는 문항별 적용·조건·예외 등 추가 정보가 있을 때만 씁니다. 없으면 필드를 생략하거나 빈 문자열을 씁니다. 존재하면 문자열이어야 하며 null·숫자·객체는 거부합니다. 기본 해설 복사·의미만 같은 재서술·정답/오답 문구만 붙이기·문항 전체 해설에 같은 이유를 다시 복사하기로 빈칸을 채우지 않습니다. 다른 문항의 정오 역할을 기본 정의에 섞거나 참·거짓의 판단 근거를 누락하지 않습니다.

`optionExplanationParagraphs`는 저장 원문을 변경하지 않는 표시 함수입니다. 작은/큰따옴표·곡선 따옴표·백틱 구간 밖의 앞뒤·연속 공백만 비교용으로 정규화합니다. 인용/코드 구간 안의 공백·탭·줄바꿈은 그대로 비교·표시하며 이스케이프된 구분 기호로 구간을 닫지 않습니다. 닫히지 않은 구간의 나머지와 끝 공백도 보존합니다. 줄바꿈·탭·슬래시가 하나라도 있는 설명은 코드·정규식·경로일 수 있으므로 내부 공백 전체를 비교할 때 보존합니다. 의미가 달라질 여지가 있으면 중복 제거보다 두 설명 보존을 우선하며 범용 코드 파서라고 주장하지 않습니다. 연결 역할에 맞는 맨 앞 한 문장 ‘정답이다.’·‘정답입니다.’ 또는 ‘오답이다.’·‘오답입니다.’는 선택지 제목에서 이미 알리는 판정이므로 설명 표시에서 생략할 수 있습니다. 역할이 없거나 다르면 그 문장을 그대로 둡니다. 두 유효 설명이 같으면 한 문단, 하나만 있으면 그 하나, 둘 다 없으면 빈 제목 없이 표시합니다.

공통 설명 전체가 문장부호로 끝나는 완전 문장이고 맥락 설명의 맨 앞 또는 맨 뒤에서 공백·문장 경계까지 정확히 일치하면, 기본 설명과 새 문맥이 모두 들어 있는 맥락 원문 한 문단을 제공합니다. 완전 문장 경계가 없는 부분 문자열은 제거하지 않습니다. 나머지 서로 다른 설명은 ‘공통 해설’과 ‘이 문제에서’로 구별해 유지합니다. 대소문자·Unicode 호환 문자·문장부호·코드·true/false·부정·조건을 바꾸거나 의미 유사도로 판단하지 않습니다.

`validateExplanationAuthoring`은 기본 해설에 정오 문구를 뺀 실질 이유가 있는지 확인하고, 정확 중복·역할 일치 정오 문장만 붙인 중복·정오 문장만 있는 문맥·완전한 공통 문장을 다시 포함한 문맥을 거부합니다. 추가 정보가 필요하면 공통 부분을 빼고 그 정보만 씁니다. 의미만 같고 문자열이 다른 반복이나 불필요한 분리는 독립 문안 검토가 판정합니다. 자동 검사는 그 검토나 정답 근거 검증을 대신하지 않습니다.

누적 발행의 과거 예외 기준은 `scripts/explanation-authoring.mjs`에 경로·bankVersion·SHA-256을 고정한 regular.1(없으면 seed.4) 불변 원문입니다. 기준 파일이 있으면 그 해시·버전·구조를 확인하며 불일치는 실패입니다. 두 과거 파일이 모두 없으면 예외 없이 검사합니다. 기준본의 문항 전체와 연결된 모든 선택지 객체가 그대로 일치할 때만 기존 해설을 보존하여 통과시킵니다. 새 ID·개정 문항·선택지 변경·역할 변경·임의 testOnly·후보가 제공한 예외 플래그로 우회할 수 없습니다.

경로를 명시한 후보 입력은 manifest의 경로·해시·버전·releasedAt·요약·구조와 해설 검사를 모두 통과한 현재 은행을 누적 기준으로 사용할 수 있습니다. 인자 없는 build/check와 릴리스 대장 검사도 고정된 과거 기준본으로 새/변경 해설을 검사하므로, 새 manifest를 먼저 설치하여 후보 자신에게 예외를 부여할 수 없습니다. 과거 예외 파일이나 해시 상수를 후보에 맞춰 바꾸지 않습니다.

기존 은행·세션·백업을 읽을 때는 새 저작 금지를 소급 적용하지 않습니다. 정규 regular.1의 이미 확인된 의미 중복 15개와 비정보성 기본 해설 4개는 출처의 schemaVersion 3과 원래 문항 전체·선택지 전체·역할·두 해설이 정확히 일치할 때만 검토된 기존 설명 하나를 표시합니다. 15개는 기본 해설, IPv6 길이 오답 4개는 맥락 해설을 그대로 사용합니다. `src/reviewed-option-explanations.js`의 출처 bankVersion은 검토 근거입니다. 동일 원본이 후속 schemaVersion 3 누적 은행에 그대로 실리면 같은 표시를 적용하되, 어느 원본 필드라도 변경되거나 스키마·개정판이 다르면 일반 보수적 표시로 돌아갑니다. ID나 해설의 일부 문구만 같다는 이유로 적용하지 않습니다. 저장 해설·답안·선택지 순서·점수·스냅샷 해시와 종결 대장은 수정하지 않습니다.

같은 compatibilitySetId는 함께 섞어도 단일 정답임을 검토자가 확인한 그룹입니다. 정답 후보 한 개만 선택하고 나머지 정답 후보는 제외합니다. 같은 문구(NFKC·공백 정규화)와 같은 equivalenceGroupId를 동시에 표시하지 않습니다. 동등 구현/의미 중복은 콘텐츠 검토에서 반드시 그룹을 지정합니다. 부족하면 출제를 거부하며 임의 오답을 보충하지 않습니다. 순서 의존 선택지(위의 모두, ①과③ 등)는 사용하지 않습니다.

한 문항 연결은 최대 1000개, 정답 후보는 최대 64개입니다. 대형 풀은 문항/호환 그룹으로 나누세요. 하나의 거대한 조합표를 펼치지 않습니다. 단일정답 구조 검사는 의미적 정답성의 증명이 아닙니다.

### 선택지의 그럴듯함·평행성·표현 단서 계약 (PRD 1.9)

필기 전용·공유 `options`와 실기 single/multi `choices`를 정답까지 포함해 전체 검토합니다. 각 오답은 같은 학습 목표의 그럴듯한 개념 혼동·조건 적용 오류여야 하며, 지문·notes·보기 조건에서 틀리는 근거가 있어야 합니다. 문법·관점·구체성·정보량을 평행하게 맞추고 정답만 길거나 온건한 긍정문, 오답에만 제한·절대 표현을 집중하는 패턴, 무관하거나 터무니없는 오답을 문안 gate에서 거부합니다. 내용상 필요한 길이·범위 차이는 허용합니다.

‘만·항상·절대·반드시’ 등은 금지어가 아닙니다. 필요한 예외·수량·집합·표준 요구·부정과 코드 연산자를 유지하며, 단어 검색은 의미 검토 후보를 표시할 뿐 결함이나 통과를 증명하지 않습니다. 같은 단어를 정답에 인위적으로 더하거나 일괄 삭제하지 않습니다. 표현 변경 뒤 모든 선택지의 판정·반례를 다시 확인하여 복수 정답·답 없음·조건 손실을 막습니다.

이 계약은 새 앱 정오 상태나 자연어 판정 필드를 추가하는 스키마 변경이 아닙니다. 공개 운영 대장의 `authoringAccessibility`에 오개념 타당성·평행성·단서·조건 보존의 짧은 결론을 기록하고 독립 맹검·출처·유일성·구조 gate와 함께 검증합니다. 기계적 구조·어휘 검사 통과를 독립 의미 검토로 기록하지 않습니다. 기존 저장 은행·세션은 그대로 읽으며 신규·변경 문항의 저작 검사를 과거 데이터에 소급 적용하지 않습니다.

## 실기

- `subjectId: practical`, `family: implementation|inspection`
- `parts`: `{partId,prompt,kind,points,explanation}`
- single/multi: `choices:[{id,text}]`, `correct:[id]`. single은 한 개, multi는 집합 완전 일치
- text: `accepted:[string]`, `normalization:trim|exact`. trim은 앞뒤 공백만 허용하며 대소문자와 내부 공백은 유지
- `referenceAnswer`, `rubric:[{criterion,points,description}]`, `freeResponsePrompt`

각 part는 독립 배점입니다. 자동 판정 기준과 외부 서술 평가용 rubric을 구분합니다. 자유 서술 전체를 문자열로 채점하지 않습니다. 신규 freeResponsePrompt에는 서술 과제 요구만 넣고 앱의 미채점·통계·외부 AI 사용 안내는 UI에 둡니다.

### 모든 객관식 선택지의 생성·표시 순서

앱 0.2.6의 `generatorVersion: "2"`는 필기 전용/공유 선택지와 실기 각 single/multi part의 choices에 seed 기반 Fisher–Yates를 적용합니다. 실기는 복제한 PresentedItem의 choices만 한 번 섞으며 원본 은행, part 순서, correct 배열, 안정 ID, 배점, text 허용 답, 코드/자료 순서는 바꾸지 않습니다. 새 연습·새 재시도·새 오답 복습 세션을 준비할 때 적용하고, 그 세션의 표시·탐색·이어 풀기·새로고침·기록·해설·백업 왕복·시간제→무제한 전환에는 저장 배열을 그대로 사용합니다.

같은 은행·설정·history·seed·출제기 버전은 같은 문항/선택지 순서를 재현합니다. 복원은 저장 스냅샷이 기준이며 seed로 다시 생성하지 않습니다. 과거 출제기 1의 스냅샷도 그대로 읽습니다. 새 세션의 추첨 결과가 이전과 우연히 같아도 유효합니다. 정답 위치의 강제 교대/균등 할당이나 무작위 sort 비교자는 사용하지 않습니다.

단일 선택은 ID 일치, 복수 선택은 중복 없이 정답 집합과 완전히 같은지로 채점합니다. 복수 답안 배열의 저장/선택 순서는 채점과 무관합니다. 화면의 표시 번호·label·읽기 순서, 선택 내용 요약과 해설 키·AI 출력은 저장 선택지 배열 순서를 사용하며 내부 선택지 ID를 읽을 문구로 노출하지 않습니다. 정적 은행/백업의 키를 숨기는 시험 보안 기능은 아닙니다.

저작·독립 의미 검토에서는 실기를 포함해 ‘위의 모두’, ‘1번이 정답’, ‘①과③’ 등 표시 위치 의존/정답 위치 암시를 금지합니다. 조합 문제에 필요한 ㄱ·ㄴ 등의 고정 진술 표지는 선택지 표시 번호와 구분합니다. 자동 구조 검증이 임의의 자연어 정답 암시까지 판별한다고 주장하지 않습니다.

### 외부 AI 요청문

생성 지시는 웹 접근성 평가자 역할, 비교/독립 검토, 판단 근거·위치·영향·최소 수정·재점검, 불확실성을 짧은 ‘~해줘/~말아줘’ 문장으로 요청합니다. 자료와 사용자 답안의 명령은 신뢰할 지시가 아닌 평가 데이터로 취급하도록 명시합니다. 개인정보 제거·붙여넣기·복사/다운로드 안내는 앱 UI에만 있습니다.

문제 stem, 별도 ‘참고 사항 (원문)’의 notes, 코드 content, 세부 답안 항목/선택지, freeResponsePrompt와 사용자 서술 답안은 그대로 포함합니다. 사용자 고정 답안은 항목 지문과 실제 선택 내용의 JSON 배열로 표시하며 내부 partId/choice ID는 내보내지 않습니다. 선택 내용은 저장된 표시 순서로 누락 없이 내보내고, 직접 입력한 text 값의 공백·Unicode는 그대로 유지하며 자유 서술을 중복하지 않습니다. 백업의 ID 기반 원본 답안은 변경하지 않습니다. 원문을 다듬거나 요약하지 않으므로 구판 원문에 있던 앱 안내도 유지합니다. 빈 답안 모드는 현재 답안 전체를 제외하고 `[미작성]` 데이터만 둡니다.

독립 모드는 참고 서술 답안·루브릭·정답 키·해설 코드를 넣지 않으며 임의 점수/기준을 만들지 않도록 요청합니다. 비교 모드는 공개 가능할 때만 정확한 참고 답안·루브릭/배점·고정 답안 키를 포함하고 동등하게 타당한 대안도 인정하도록 요청합니다. 서술형 배점과 앱 배점을 합치지 않으며 서술 미작성을 고정 답안만으로 채점하지 않습니다. 시간제 진행 중에는 모든 AI 내보내기를 차단합니다.

## 정규 문항 전환과 연습 범위

앱 0.2.7의 `practiceSelection`은 기존 `eligibleQuestions`로 유형·과목·과제군·선택지 수·pool·새 학습 목표 이력·published·유효 정정을 먼저 적용합니다. 그 결과에 testOnly=false 문항이 있으면 정규 문항만 사용하며 고유 templateId로 수량을 셉니다. 정규 문항이 0개일 때만 남은 출제 가능 시드로 테스트 전용 연습을 제공하고 이유를 표시합니다. 정규 문항이 있지만 수가 부족할 때 시드를 보충하지 않습니다. 직접 요청한 수가 선택된 고유 목표 수를 넘으면 INSUFFICIENT이며, UI는 입력을 보존하고 명시적인 수량 축소 행동을 제공합니다. 빠른 시작·같은 범위 새 연습의 기본값은 실제 가능한 수를 표시합니다.

이 필터는 일반 새 연습의 workflow 계약입니다. 범용 eligibleQuestions·prepareSession의 의미와 은행 스키마를 바꾸지 않습니다. 명시적 오답 복습의 group bank는 정해진 원래 학습 목표를 유지하여 테스트 또는 혼합 문항도 복습할 수 있습니다. 기존 세션의 재개·가져오기·시간 모드 전환은 저장된 스냅샷을 그대로 사용합니다. 새 연습 필터로 과거 내용을 제거하거나 testOnly·점수·답안·순서·해시를 바꾸지 않습니다.

`sessionContentSummary`는 저장된 문항의 testOnly별 실제 개수로 전체 테스트·전체 정규·혼합 세션을 구별합니다. 혼합 결과의 전체 점수는 세트의 모든 문항 기준이며 통계는 기존처럼 문항별 정규/테스트로 나눕니다. 홈·기록·시작 대기·결과의 구성 표시와 개별 문항 표시는 이 구분을 따르고, 단순히 테스트 문항이 하나 있다는 이유로 전체를 테스트로 설명하지 않습니다. 저장 구조와 출제기 버전 2는 유지합니다.

## 세션·통계

준비 시 실제 본문·자료·선택지 내용/순서·정답·해설·출처·버전을 PresentedItem으로 복제합니다. 난수 seed만 저장하는 복원은 금지합니다. 상태는 prepared, active, submitted, expired, abandoned, converted입니다. revision을 사용한 트랜잭션 비교 후에만 저장 성공을 알립니다.

답은 안정 ID로 저장합니다. 무제한의 확정 attempt는 문항별 한 번이며 재시도는 새 세션입니다. 시간제의 submitted/expired만 모든 문항 attempt를 만듭니다. 중단·전환 시간제는 점수를 만들지 않습니다. 확정 전 도움 자료, 앞 세션의 해설 노출, 테스트 시드, 미채점 서술은 일반 최초 시도와 분리합니다.

정답률은 정답/응답, 세트 점수는 획득점수/전체 채점배점입니다. 분모 0은 계산할 기록 없음입니다. 무제한 종료의 미확정 문항은 세트에서 미응답이나 시도 통계에는 추가하지 않습니다. 시간 통계는 시간제에서만 존재합니다.

## 업데이트와 정정

manifest: `{schemaVersion,bankVersion,releasedAt,file:'releases/<version>/bank.json',sha256,changeSummary,finalRelease}`. 모든 파일 해시/구조/호환성을 확인한 뒤 IndexedDB의 한 bank 값에 원자 저장합니다. 실패 시 이전 값이 유지됩니다. 기존 세션 스냅샷은 변하지 않습니다.

정정: `{questionId,revision,kind:'invalid'|'key',reason,effectiveAt}`. key는 `snapshotHash`와 `correctOptionId`도 필수입니다. `snapshotHash(item)`는 당시 지문·자료·notes가 있는 경우 그 원문·표시된 선택지 ID/개정판/내용/순서를 SHA-256으로 묶습니다. notes가 없던 구판의 해시 입력은 그대로 유지합니다. 정확히 일치하는 동일 스냅샷의 명백한 키 오류에만 조정 결과를 냅니다. invalid는 조정 분모와 현재 통계에서 제외합니다. 원래 저장된 결과는 덮어쓰지 않습니다.

## 백업

`{format:'accessibility-exam-lab-backup',schemaVersion:1,exportedAt,sessions:[...]}`. JSON만 허용하며 10MB·1000세션 한도입니다. 스냅샷과 원래 점수의 재계산 일치, 답 ID, 필수 날짜/상태, 안전한 출처 URL을 검사합니다. `__proto__`, `constructor`, `prototype` 키는 거부합니다. 문자열을 HTML로 실행하지 않습니다. 중복 ID 내용이 다르면 합치기에서는 기존 세션을 유지하고 충돌 수를 알립니다. 교체는 확인 후 한 트랜잭션으로 합니다.

내보내기는 세션 단위로 크기/개수 한도 내 파일을 나눕니다. 각 파일은 일반 가져오기에 독립적으로 사용할 수 있으며 안정 ID로 중복을 막습니다. 단일 세션이 한도를 초과하면 절대 잘라내지 않고 원문 보존 전용·현재 앱 복원 불가를 파일 이름과 화면에서 명시합니다. 원본 브라우저 기록을 삭제하지 말아야 합니다.


## 회차 대장 계약 v1

회차 대장은 앱 은행·manifest·세션·백업과 별도의 공개 운영 산출물입니다. 경로는 `docs/rounds/<roundId>.json`과 같은 이름의 `.md`입니다. `round-ledger.schema.json`은 JSON Schema Draft 2020-12이며 `round-ledger.template.json`·`round-report.template.md`는 실제 결과가 아닌 시작 틀입니다. 새 확대 회차 템플릿은 `prdVersion: 1.9`를 사용하고 검증기는 1.7·1.8·1.9를 허용합니다. 종결된 기존 회차의 prdVersion과 내용·해시는 그대로 보존합니다. 템플릿의 예시 날짜·0 해시·자리표시자를 실제 확인 값으로 바꿉니다. `accepted`·`rejected`는 이 대장의 판정이며 앱의 `verificationStatus` 열거값에 추가하지 않습니다. 탈락한 문항 본문이나 내부 원시 작업 로그는 공개 은행에 넣지 않습니다.

### 필드와 판정

- `campaignId: 2026-exam-final`, 고유 `roundId`, `prdVersion: 1.7|1.8|1.9`, `timezone: Asia/Seoul`, `status: running|closed`, 시작·판정 마감·판정 종료 ISO 시각
- `policy`: maxCycles 3, maxReopeningsPerGoal 1, maxLineageCycles 6, maxRoundHours 4로 고정
- `baseline`: 시작 시 확인한 원격 커밋, 은행 버전·SHA-256, 기존 정규 문항 수. `targets`는 후보 목표이며 통과량 아님
- `candidates`: 고유 후보·학습 목표·계보·문항·template 식별자, 개정판·출제자 역할 ID, 근거 배열, 검토 횟수, 계보 누적 횟수, 재개방 횟수·이전 판정 링크·새 근거, 각 검토 결과, 최종 판정·사유, 실제 공개 은행 버전
- 근거 항목: sourceId·제목·공식/1차 자료 URL·판/시행일·정확한 위치·실제 확인일·짧은 요약·권리 설명. 긴 원문 복사와 확인하지 않은 열람 주장 금지
- `cycles`: 시작한 검토를 1부터 순서대로 기록. 개정판과 시작·종료, blindSolve·sourceCheck·ambiguityCheck·authoringAccessibility·structuralCheck의 `pass|fail|not_run`, 검토 역할 ID·짧은 결론·근거 참조. 실행 중 결과는 running과 finishedAt=null로 기록하고 끝난 검토 결과는 accepted·revise·rejected. 중간 종료 시 미실시를 not_run으로 기록
- 최종 `decision`: pending·accepted·rejected. pending은 실행 중 회차의 최대 3회 한도 안에서만 허용. accepted는 같은 개정판의 모든 필수 검사 통과, rejected는 최종 사유 필수
- 탈락 사유 코드는 source_conflict, insufficient_primary_evidence, answer_ambiguity, out_of_scope, rights_risk, authoring_invalid, accessibility_failure, structural_invalid, review_limit, round_deadline, infrastructure_incomplete, duplicate_learning_goal 중 실제 사유를 선택. 채택 사유는 accepted_all_gates
- `counts`: 등록·채택·탈락·미결정, 이 회차에서 실제 새로 공개 확인한 정규 필기 과목별 수·실기 수. `coverageAfter`는 확인된 누적 정규 수와 실제 모의시험 가능 여부
- `publication`: not_attempted·skipped·blocked·committed_unverified·verified, 공개 커밋·은행·해시·확인 시각·직접 URL·차단 원인. 채택과 공개는 별개. 실제 호스팅 확인 전에는 verified나 공개 수를 올리지 않음
- `validation`: 실제 검사·pass/fail/not_run·결론·공개 가능한 보고서 경로. 실제 NVDA 실측은 구조 검사와 별도로 기재
- `nextRoundGaps`: 분야·과목·학습 목표·후보 ID, 부족한 범위/근거/논리, 필요한 근거나 반례, 다음 행동·완료 조건·우선순위·재개방 가능 여부. 공백이 없으면 `noGapExplanation`에 확인 범위와 근거를 명시

### JSON Schema 외 필수 교차 검증

JSON Schema만으로 횟수 합계·다른 파일 이력·정답 의미를 검증했다고 주장하지 않습니다. 운영 검증자는 다음 관계도 검사하고 결과를 남깁니다.

1. 회차·후보 ID는 고유하고 학습 목표의 같은 의미를 다른 이름으로 등록하지 않습니다. `attemptCount === cycles.length`, cycle 번호는 1부터 빈틈 없이 증가, 최종 후보 revision은 마지막 cycle revision과 같습니다. 시작한 검사·실패 이력을 지우지 않습니다
2. 마지막 cycle의 outcome은 최종 판정과 일치합니다. accepted 뒤 추가 검토를 붙이거나 rejected 뒤 같은 후보를 되살리지 않습니다. 수정은 앞선 cycle의 revise와 구체적 변경에 연결하며, 3번째 cycle은 끝나면 revise가 될 수 없습니다. 실행 중인 마지막 cycle은 running·finishedAt=null로만 남길 수 있고 후보는 pending이어야 합니다. accepted/rejected 후보나 closed 회차에는 running cycle이 없어야 합니다. accepted는 모든 다섯 gate가 pass이며 모든 근거 참조가 실제 evidence에 존재해야 합니다
3. blindSolve의 reviewerId는 authorId 및 앞선 키 공개 검토자와 달라야 합니다. 해당 검토자가 실제 키를 보지 않은 자료를 받았는지 확인합니다. 역할 이름만 바꿔 같은 풀이를 독립 검토로 기록하지 않습니다
4. 재개방 0회이면 이전 후보·새 근거 배열은 비어 있고 lineageAttemptCount는 attemptCount와 같습니다. 재개방 1회이면 같은 학습 목표의 이전 rejected 후보 1개와 전체 기존 검토 이력, 탈락 원인을 해결한 새 1차 근거를 참조합니다. 이전 실제 attemptCount와 이번 횟수의 합이 lineageAttemptCount이며 최대 6회입니다. campaign 전체 이전 대장을 조회해 2번째 재개방·위장 새 ID를 거부합니다
5. 판정 마감은 시작 이후 최대 4시간이고 다음 예정 회차·최종 동결보다 늦지 않습니다. 2026-10-16 Asia/Seoul의 정규 회차는 추가로 decisionDeadline <= 2026-10-16T14:00:00Z(23:00 KST)를 만족해야 하며 그 뒤 후보 작업을 시작하지 않습니다. 더 이른 기존 한도를 유지합니다. 23:20 공개·반영 확인은 목표 시각이며, 23:30 최종 작업은 이미 accepted·공개 확인된 정상본의 재확인과 동결만 수행합니다. 최종 작업은 후보를 다루는 정규 회차가 아니며 미완료 후보를 가져오지 않습니다. 후보 검사·최종 판정은 판정 마감 이내에 종결합니다. 종료 대장의 `closedAt`은 판정 종료 시각입니다. publication.verifiedAt은 별도이며 판정 종료 뒤일 수 있으나 최종 동결 전이어야 합니다
6. counts.registered는 후보 배열 길이, accepted/rejected/pending은 실제 판정별 개수와 같습니다. closed 회차의 pending은 0이고 registered = accepted + rejected입니다. 검토도 시작 못 한 후보는 attemptCount 0과 rejected·실제 중단 이유로 남길 수 있으나 채택할 수 없습니다
7. 실제 공개량은 호스팅 확인된 새 은행의 새 accepted·published·testOnly=false 문항과 대조합니다. 기존 시드·중복 template·선택지 순열·보기 조합은 새 정규 수에서 제외합니다. 공개 전·차단 시 해당 공개 수는 0이며 accepted 후보의 publishedBankVersion도 null입니다. accepted 판정을 publication 실패 때문에 pending으로 되돌리지 않습니다
8. coverageAfter와 100문항 모의시험 가능 여부는 실제 확인된 은행으로 다시 계산합니다. 5과목별 고유 정규 templateId 20개 이상과 5지선다 조건을 모두 충족해야 합니다. 없는 은행이나 목표 수로 계산하지 않습니다
9. 종료 회차의 다음 조사 공백은 구체적인 근거·예외·반례·범위와 다음 행동·완료 조건이 있어야 합니다. 공백 기록은 탈락 후보의 자동 재개방이 아닙니다. noGapExplanation을 넣어야 하는 경우에도 빈칸·형식적 완료 문구를 허용하지 않습니다
10. 공개 전 비공개 지시·내부 사고 과정·개인 원문·인증정보·원시 로그가 없는지 검사합니다. 원래 은행과 세션 해시는 변경하지 않고 공개 허용 목록에 승인된 산출물만 추가합니다


## 기존 채택 문항 편집 정정 대장 v1 (PRD 1.9)

앱 은행의 `corrections` 점수 조정 배열 및 기존 `docs/rounds/` 확대 대장과 별개입니다. 경로는 `docs/corrections/<correctionRoundId>.json`·동명 `.md`, JSON Schema는 `docs/corrections/editorial-ledger.schema.json`입니다. 확대의 `round-ledger.schema.json`은 편집 정정과 별도 계약으로 유지하며 prdVersion 1.7·1.8·1.9를 허용합니다. 종결된 과거 확대 대장의 버전·내용·해시는 새 계약에 맞춰 고쳐 쓰지 않습니다. 한 새 은행에는 확대 대장 또는 편집 정정 대장 한 종류만 공개 근거로 선택합니다.

### 필드

- `ledgerSchemaVersion: 1`, `kind: accepted_content_editorial`, `campaignId: 2026-exam-final`, 고유 `correctionRoundId`, `prdVersion: 1.9`, `timezone: Asia/Seoul`, `status: running|closed`, `startedAt`·`decisionDeadline`·`closedAt`
- `policy`: `maxCycles: 3`, `maxRoundHours: 4`, `newKnowledgeItems: 0`. `baseline`에는 실제 시작 커밋·bankVersion·bankSha256와 과목별 기존 정규 수·정규 실기 수를 기록합니다
- `changedQuestionIds`, `changedOptionIds`, `changedPracticalChoiceIds`: 실제 변경 객체의 정확한 허용 목록. 없는 변경을 기재하거나 실제 변경을 누락하지 않습니다
- `corrections[]`: correctionId·stable issueId·questionId·templateId·learningGoalId·learningGoalRevision·type·subjectId, priorAcceptedRef, 구체적인 defect와 targetPaths, revision·authorId·evidence, optionChanges·practicalChoiceChanges, attemptCount·cycles, decision·reasonCodes·decisionSummary·publishedBankVersion
- `priorAcceptedRef`: 직전 공개 확인된 accepted의 roundId·candidateId·ledgerPath·bankVersion·bankSha256·questionRevision·contentSha256. 최초 확대 선행자는 `docs/rounds/<roundId>.json`의 candidateId를, 편집 선행자는 `docs/corrections/<correctionRoundId>.json`의 correctionRoundId/correctionId를 같은 roundId/candidateId 필드에 기록합니다. 실제 기존 대장·공개된 불변 은행·직전 선행 개정판을 대조합니다
- `targetPaths`: `/questions/<questionId>/...` 또는 `/options/<optionId>/...`의 실제 변경 저작 필드 경로와 정확히 일치하는 목록입니다. revision·optionRevision·reviewNote만 바뀐 경로는 제외하며, 이 관리 필드만 바꿔 새 편집 정정을 만들지 않습니다
- `optionChanges`·`practicalChoiceChanges`: 각 변경 객체의 id·beforeRevision·afterRevision·beforeSha256·afterSha256. 실기 choice의 이전 revision 부재는 기존 형식의 암묵적 1로 취급하고 변경한 choice에는 증가한 revision을 명시합니다. 변경하지 않은 choice에 revision을 덧써 원문을 바꾸지 않습니다
- `cycles[]`: cycle·revision·startedAt·finishedAt, blindSolve·sourceCheck·ambiguityCheck·authoringAccessibility·structuralCheck의 결과/검토자/짧은 근거/근거 참조, outcome·summary, 정확한 검토 내용의 contentSha256와 정답을 가린 패키지의 blindPackageSha256, reviewPackagePath·reviewPackageSha256·componentStates. 다섯 gate는 확대 대장과 같은 pass/fail/not_run 의미를 사용합니다
- `reviewPackagePath`: `docs/corrections/evidence/<correctionRoundId>-cycle-<cycle>.json`의 해당 검토 불변 입력 파일. `reviewPackageSha256`는 이 파일의 실제 바이트 SHA-256입니다. 파일은 `{evidenceSchemaVersion: 1, purpose: immutable_editorial_review_input, correctionRoundId, cycle, items}`이며 각 items 항목은 `{correctionId, question, options}`입니다. question 전체와 links에 연결된 options 전체를 정확히 보관하며 실기는 question 안에 parts/choices를 포함합니다. 이 원문에서 contentSha256·blindPackageSha256·componentStates를 다시 계산하여 대장의 검토와 실제 입력을 연결합니다. 맹검 풀이자에게는 정답·해설을 뺀 별도 풀이 패키지만 제공합니다
- `componentStates`: 각 검토에 포함된 모든 필기 option/실기 choice의 `{kind: written_option|practical_choice, id, revision, contentSha256}` 배열이며 kind/id 순으로 정렬합니다. contentSha256는 해당 객체에서 revision 필드만 제외한 내용의 해시입니다. 변경하지 않은 선택지도 포함하고 검토 사이에 ID를 추가/삭제하지 않습니다
- `counts`: registered·accepted·rejected·pending, `newRegular: 0`, revisedRegular·publishedRevisedRegular. `coverageAfter`는 실제 누적 정규 수와 mockEligible, `publication`은 공개 상태·커밋·은행·해시·확인 시각·URL·차단 원인입니다. `validation`·`nextAction`·`summary`에는 실제 검사 결과·제한·다음 행동을 기록합니다

### 필수 교차 검증과 의미 검토

1. 원 대상은 이전 accepted 근거가 확인된 published·testOnly=false 문항입니다. 이전 은행 파일·기존 출처 레코드·testOnly 시드·원 확대 대장은 그대로 보존합니다. 새 출처는 실제 독립 검증한 근거만 추가하고 해당 문항의 sourceRefs를 늘릴 수 있습니다. 안정 ID·templateId·learningGoalRevision·type·subjectId·정답 역할/집합·배점을 유지하며 문항·선택지의 추가/삭제와 학습 목표·정답 판단 변경을 이 경로로 허용하지 않습니다
2. 문항 revision은 기준 revision에 시작한 검토 횟수를 더한 값이며 매 cycle 1씩 증가합니다. 필기 option과 실기 choice는 첫 cycle에서 기준본, 이후에는 바로 앞 cycle의 보관 원문·componentStates와 비교합니다. revision을 제외한 내용이 달라진 객체는 해당 cycle마다 revision을 정확히 1 올리고, 같으면 그대로 유지합니다. 최종 revision을 무조건 기준본+1로 제한하거나 매번 기준본에서 다시 계산하지 않습니다. 예를 들어 공개 문항 revision 1에서 cycle 1의 revision 2가 revise이고 cycle 2의 revision 3이 accepted일 수 있으며 검토 횟수는 2회로 이어집니다. 이때 두 cycle에서 모두 바뀐 선택지는 1→2→3, 첫 cycle에서만 바뀐 선택지는 1→2→2입니다. optionChanges·practicalChoiceChanges의 전후 개정판과 전체 객체 해시는 기준본과 최종본에 각각 일치해야 하고, 중간 변경은 각 cycle의 보관 원문·componentStates로 검증합니다. 공유 선택지 변경으로 영향을 받는 모든 문항은 변경 목록·정정·검토에 포함합니다. 필기 선택지의 content/explanation·문항별 필요한 해설·실기 choice 문안과 함께 stem·notes·part prompt·보기 instruction을 정리할 수 있습니다. 조건·범위·지식의 의미가 동등해야 하며 실제 자료 내용·코드·참고 답안·루브릭·정답을 바꾸지 않습니다. 실제 허용 필드·경로는 발행 검증기와 맞아야 하며 단순히 이 대장에 이름을 적었다고 임의 필드 변경이 허용되지 않습니다
3. 같은 직전 공개 확인된 accepted 문항의 questionId·revision·contentSha256를 선행자로 삼는 모든 정정 대장/ID의 시작 검토를 합쳐 최대 3회입니다. 같은 선행자에 대한 하나의 정정 기록 안에서 검토를 이어가며 다른 대장/ID에 별도 검토 단위를 만들지 않습니다. attemptCount는 실제 시작한 cycles 수와 같습니다. 검토 후 변경은 다음 개정판·다음 cycle로 이어지며 reviewPackagePath의 불변 파일 바이트와 reviewPackageSha256, 그 안의 실제 문항/선택지에서 계산한 contentSha256·blindPackageSha256·componentStates를 함께 재확인합니다. 해시 필드만 새 값으로 고치거나 같은 해시 선언 아래 다른 원문을 쓰면 통과할 수 없습니다. 마지막 판정과 최종 decision은 일치하고 accepted에는 같은 개정판의 다섯 gate 통과가 필요합니다. 원 출제자와 원 채택/앞선 정정의 키 노출 검토자는 새 맹검에서 제외합니다. 역할 ID만 바꾼 같은 풀이를 독립 검토로 기록하지 않습니다
4. 기존 판정 마감의 최대 4시간·다음 예정 회차·최종 동결·2026-10-16 23:00 KST 한도를 적용합니다. closed 대장에 running cycle·pending·revise를 남기지 않습니다. 3회 미통과·기한 미완료·해소 불가 사유는 rejected로 종결하며 같은 rejected 선행자를 새 ID·대장·버전·결함명으로 재개방하지 않습니다. 다른 issueId로 쓴 같은 결함도 의미상 동일 계보로 검토합니다. 한 선행자는 최대 하나의 accepted·공개 확인된 후속 개정판만 가지며 분기·오래된 선행자 재사용을 금지합니다. 실제 성공 공개 뒤 새 결함은 그 새 개정판·해시를 직전 선행자로 연결한 새 유한 검토를 허용합니다. 이 계약은 rejected 신규 후보의 한 번뿐인 근거 기반 재개방을 확대하거나 대체하지 않습니다
5. 신규 정규 문항은 0이고 revisedRegular는 채택된 수정 문항, publishedRevisedRegular는 실제 새 은행에서 공개 확인된 수정 문항과 대조합니다. 공개 차단·미확인 상태는 publishedRevisedRegular 0, publishedBankVersion null입니다. 원래 누적 고유 문항 수·시드 수·모의시험 자격은 편집으로 증가하지 않습니다. counts 합계·실제 변경 집합·누적 수를 실제 은행과 대조합니다
6. 새/변경 문항에는 기존의 엄격한 해설 저작 검사가 적용됩니다. 0.2.8의 고정된 과거 정확 원문 예외를 변경된 객체로 확장하지 않습니다. 모든 선택지의 그럴듯함·평행성·표현 단서·조건 보존과 정답 유일성을 독립 의미 검토로 확인하며, 해시·JSON Schema·어휘 검사만으로 의미 품질을 증명했다고 주장하지 않습니다
7. 새 bankVersion의 불변 파일만 만들고 저장 세션·선택지 순서·답안·점수·스냅샷 해시는 변하지 않아야 합니다. 앱 `corrections`의 invalid/key와 혼동하여 과거 점수를 소급 조정하지 않습니다. 실제 배포 확인과 동결 가드를 통과하기 전에는 공개 완료로 기록하지 않습니다
8. 후속 확대의 baseline은 마지막 확대 대장의 은행이 아니라 최신 manifest와 해시가 일치하는 실제 활성 은행입니다. 최신 공개 확인된 편집 대장·보고서와 기존 확대의 다음 조사 계획을 함께 대조하여 수정 문구·revision·공유 선택지 연결을 보존합니다. 새 정규 수는 이 활성 기준본에 없는 검증된 고유 목표만 세며 이전 정정 문항을 신규 목표로 다시 등록하지 않습니다
