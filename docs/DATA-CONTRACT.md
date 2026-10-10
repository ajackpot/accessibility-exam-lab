# 데이터 계약 v3 (앱 0.2.9)

포장 외피 추가 계약: 2026-10-08 명시 승인 이후 새 전체본에는 문서 끝 `packaging-policy-002`의 complete v2/7z를 적용하며 delta는 ZIP을 유지한다. 이전 complete v1/ZIP·원 proof는 호환 검증하고 수정하지 않는다. 아래 은행·세션·앱 스키마 변경은 없다.

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

links가 소속 관계의 단일 원본입니다. 역방향 memberQuestionIds는 생성 결과이며 앱은 links에서 도출합니다. 누적 은행에서 새 문항이 이미 존재하는 공유 선택지를 재사용해도 이전 선택지 객체의 편의용 memberQuestionIds를 고쳐 쓰지 않습니다. 실제 소속·검증·출제는 현재 links에서 계산하며 오래된 역방향 캐시를 정본으로 삼지 않습니다. 새 선택지의 캐시는 처음 생성할 때 계산합니다. 전용 선택지는 하나의 문항에만 연결할 수 있습니다. question.explanation은 문항 전체의 풀이·정답 근거로 계속 필수입니다. option.explanation도 계속 필수이며, 전용이면 이 문항의 선택지 이유를 한 번 쓰고 공유이면 재사용할 정의·판단 이유의 정본을 씁니다. 새 스키마나 옵션 해설 삭제를 도입하지 않습니다.

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
- text의 리터럴·인코딩·대소문자 등 허용 형식은 필요한 경우 풀이 전 notes/prompt에 명시합니다. 다른 미채점 part의 예문/선택지에 이 part의 유일한 완성 답을 직접 공개하지 않습니다. 전체 과제의 필수 조건·공통 용어·여러 후보의 단순 반복과 구별하는 독립 문안 검사가 필요하며 구조 검사가 의미를 대신하지 않습니다
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
- `baseline`: 시작 시 확인한 실제 원격 커밋, 은행 버전·SHA-256, 기존 정규 문항 수. 정상 원격 회차는 활성 원격 은행을 사용합니다. 다운로드 전달 계약의 오프라인 후속 회차는 sourceCommit에 실제 원격 anchor를 유지하고 bankVersion·bankSha256·기존 수에는 검증된 정확한 전달 선행 은행을 사용하며, 선택적 `offlinePredecessor:{artifactSha256,manifestSha256,ledgerSha256,roundId}`를 함께 기록합니다. 이 연결은 로컬 전용 검증 문맥이며 원격 공개 증거가 아닙니다. `targets`는 후보 목표이며 통과량 아님. round-003부터도 매 회차 필기 과목별 최대 10개(총 최대 50개)·실기 최대 8개 안에서 직전 공백·근거·검토 여력에 맞춰 정하며 주기 단축으로 상한을 높이지 않음
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

1. 회차·후보 ID는 고유하고 학습 목표의 같은 의미를 다른 이름으로 등록하지 않습니다. 응용 시나리오의 배경·기관명·표현 변경만으로 learningGoalId·templateId를 늘리지 않으며 기존 목표·계보와 독립적인 판단 목표인지 근거·조건을 대조합니다. 국내 맥락은 출제 범위와 관련 1차 출처를 확인한 경우에만 사용합니다. `attemptCount === cycles.length`, cycle 번호는 1부터 빈틈 없이 증가, 최종 후보 revision은 마지막 cycle revision과 같습니다. 시작한 검사·실패 이력을 지우지 않습니다
2. 마지막 cycle의 outcome은 최종 판정과 일치합니다. accepted 뒤 추가 검토를 붙이거나 rejected 뒤 같은 후보를 되살리지 않습니다. 수정은 앞선 cycle의 revise와 구체적 변경에 연결하며, 3번째 cycle은 끝나면 revise가 될 수 없습니다. 실행 중인 마지막 cycle은 running·finishedAt=null로만 남길 수 있고 후보는 pending이어야 합니다. accepted/rejected 후보나 closed 회차에는 running cycle이 없어야 합니다. accepted는 모든 다섯 gate가 pass이며 모든 근거 참조가 실제 evidence에 존재해야 합니다
3. blindSolve의 reviewerId는 authorId 및 앞선 키 공개 검토자와 달라야 합니다. 해당 검토자가 실제 키를 보지 않은 자료를 받았는지 확인합니다. 역할 이름만 바꿔 같은 풀이를 독립 검토로 기록하지 않습니다
4. 재개방 0회이면 이전 후보·새 근거 배열은 비어 있고 lineageAttemptCount는 attemptCount와 같습니다. 재개방 1회이면 같은 학습 목표의 이전 rejected 후보 1개와 전체 기존 검토 이력, 탈락 원인을 해결한 새 1차 근거를 참조합니다. 이전 실제 attemptCount와 이번 횟수의 합이 lineageAttemptCount이며 최대 6회입니다. campaign 전체 이전 대장을 조회해 2번째 재개방·위장 새 ID를 거부합니다
5. 판정 마감은 시작 이후 최대 4시간이고 효력 시각별 일정에서 구한 다음 예정 회차·더 이른 실제 후속 회차 시작·최종 동결보다 늦지 않습니다. 통합·공개 확인 여유를 두려면 시작 전에 더 이른 판정 마감을 정하며 한도를 연장하지 않습니다. 2026-10-16 Asia/Seoul의 정규 회차는 추가로 decisionDeadline <= 2026-10-16T14:00:00Z(23:00 KST)를 만족해야 하며 그 뒤 후보 작업을 시작하지 않습니다. 더 이른 기존 한도를 유지합니다. 23:20 공개·반영 확인은 목표 시각이며, 23:30 최종 작업은 이미 accepted·공개 확인된 정상본의 재확인과 동결만 수행합니다. 최종 작업은 후보를 다루는 정규 회차가 아니며 미완료 후보를 가져오지 않습니다. 후보 검사·최종 판정은 판정 마감 이내에 종결합니다. 종료 대장의 `closedAt`은 판정 종료 시각입니다. publication.verifiedAt은 별도이며 판정 종료 뒤일 수 있으나 최종 동결 전이어야 합니다
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
8. 정상 원격 후속 확대의 baseline은 마지막 확대 대장의 은행이 아니라 최신 manifest와 해시가 일치하는 실제 활성 은행입니다. 유한 재대조 뒤 허용된 오프라인 확대에서는 아래 계약의 정확한 최신 전달 선행 은행과 실제 원격 anchor를 별도로 연결합니다. 최신 공개 확인된 편집 대장·보고서와 기존 확대의 다음 조사 계획을 함께 대조하여 수정 문구·revision·공유 선택지 연결을 보존합니다. 새 정규 수는 해당 검증 기준본에 없는 검증된 고유 목표만 세며 이전 정정 문항을 신규 목표로 다시 등록하지 않습니다. 오프라인 새 채택 수를 실제 공개 수에 합치지 않습니다

### 효력 시각별 회차 일정 계약

일정 버전은 발생 시각을 기준으로 선택합니다. **2026-10-03 00:00 Asia/Seoul(2026-10-02T15:00:00Z)** 전에는 이전 08:00·20:00 KST의 12시간 주기를 역사적 발생분에 적용하고, 이 시각부터는 매일 **00:00·04:00·08:00·12:00·16:00·20:00 KST**의 4시간 주기를 적용합니다. 새 버전의 첫 회차는 round-003이며 마지막 예정 발생분은 2026-10-16 20:00 KST(2026-10-16T11:00:00Z)입니다. 새 주기의 예정 발생분 84개는 실행·채택·공개 수가 아닙니다. 마지막 발생분 뒤에는 새 정규 발생분을 만들지 않으며, 마지막 날 23:00 KST의 판정 상한·23:30 최종 재확인·10월 17일 00:00 동결은 별도로 유지합니다.

`nextScheduledRoundAt`은 현재 회차에 선택된 이전 버전만 계속 사용하지 않고 효력 시각 경계 너머의 다음 발생분을 찾습니다. 명목 발생 시각의 지연 실행은 다음 명목 시각을 늦추지 않습니다. 효력 시각 이후 같은 4시간 발생분에 서로 다른 확대 roundId를 두 개 등록하는 것을 거부하고 재호출은 기존 회차를 확인·재개합니다. 짧은 마감·조기 종결도 한 발생분을 다시 소비할 권한이 아닙니다. 이 발생분 단일성 검사를 과거 10월 2일 대장이나 별도 편집 정정 대장의 발생분 규칙으로 소급하지 않습니다. 과거 확대·정정 대장과 은행의 내용·해시·판정 마감은 보존하고 최대 3회·최대 4시간·더 이른 실제 후속 시작·동결·중첩 검사는 유지합니다.

### 2회차의 일회성 일정 교체 기록

확대 대장의 선택적 `scheduleSubstitution`은 round-002에 한하여 `supersededStart: 2026-10-02T11:00:00Z`, `effectiveStart: 2026-10-02T10:30:00Z`, 비어 있지 않은 `reason`을 기록합니다. 실제 startedAt은 effectiveStart와 같아야 합니다. 승인된 고정 조합 외의 교체와 발생분 중복 소비는 거부합니다. 다음 명목 시각은 원래 발생분 뒤에 이어지는 일정 버전을 함께 조회해 새 주기의 2026-10-02T15:00:00Z(10월 3일 00:00 KST)로 계산하며, 이전 주기의 2026-10-02T23:00:00Z(10월 3일 08:00 KST)를 그대로 반환하지 않습니다. 고정 교체 필드와 이미 종결된 round-002의 내용·해시·판정 마감은 변경하지 않습니다. 사용자가 제공한 임의 다음 시각으로 상한을 늘리지 않습니다. 최대 4시간·더 이른 실제 다음 회차·종결·동결·회차 중첩 조건은 그대로 적용합니다. 과거 대장은 이 필드 없이 유효합니다.

공개 은행의 releasedAt은 해당 확대·편집 회차의 closedAt 이후이고 최종 동결 전이어야 합니다. 실제 시각이 제공되는 발행 검사에서는 미래 releasedAt을 거부하며, 호스팅 확인은 releasedAt 이후여야 합니다. 명시적 현재 시각이 없는 순수 과거 검증과 CLI의 실제 시각 검사를 구분합니다.

## 0.2.9 설정 화면의 시간 기본값과 편집 의도

새 필기 설정의 시간은 전체/모의시험150분, 단일 과목30분이며 기존 실기 짧은 연습30분은 유지합니다. 자동 기본값은 사용자가 시간을 직접 편집하기 전까지만 범위를 따라갑니다. 명시적으로 입력한30·90·150분과 유효하지 않은 입력도 임의의 기본값으로 바꾸지 않습니다.

`minutesEdited`와 원래 입력 문자열인 `minutesValue`는 설정 화면 및 브라우저 경로 복원에만 사용합니다. 세션 config·은행·백업 스키마에 추가하지 않습니다. 실제 시작할 때 config.minutes는 기존처럼 숫자로 검증합니다. 전달된 기존 config.minutes는 과거 편집 의도를 알 수 없으므로 보호하며, 이미 시작/저장된 세션의 시간·마감·답안·스냅샷·점수를 마이그레이션하지 않습니다.

## 다운로드 전용 전달 계약 (운영 부가 형식 v1/v2)

이 형식은 앱 bank schemaVersion 3, manifest/학습 기록 백업 v1 또는 후보 대장 스키마가 아닙니다. 앱의 가져오기로 읽지 않습니다. `scripts/download-fallback.mjs`는 Git/Library/사용자 기록에 쓰지 않는 로컬 운영 도우미입니다. 전달 선행자의 명시적 로컬 전용 검증 문맥을 사용하더라도 기존 `validate-round.mjs`·`release-guard.mjs`의 최종 시각·누적 이력·최대 3회 등 데이터 검사는 완화하지 않으며 오프라인 증거를 원격 공개 증거로 대체하지 않습니다.

- 권한 상태는 Git 실제 알림 시각 기준 600,000ms입니다. `permission_wait`에서 기한 전 확인된 승인만 `git_ready`, 명시적 거부는 `permission_denied`, 기한 도달/초과는 `download_only`입니다. timeout은 종결 상태이며 뒤늦은 승인으로 바뀌지 않습니다. 라이브 작업의 상태/시각은 실행자가 실제 증거로 기록해야 하며 도우미의 문자열만으로 알림 도착을 증명하지 않습니다
- 재대조 대기는 권한 시계와 별도입니다. artifactSha256를 안정 키로 `firstUnresolvedAt`에 해당 묶음의 최초 지속 기록된 읽기 전용 미확정 관찰 시각을 넣고 `deadlineAt === firstUnresolvedAt + 600000ms`를 검증합니다. 기존 관찰/상태보다 늦은 시각으로 덮어쓰거나 새 executionId·roundId·head 관찰·재호출로 초기화하지 않습니다. `startReconciliationWait`/`advanceReconciliationWait`의 반환 상태는 다음 행동 전에 지속 기록하며 실제 시간을 사용합니다. 기한 도달 뒤에는 해당 Git 단계를 건너뛰지만 미확정 근거와 accepted 예약은 남깁니다. 건너뜀은 resolvedArtifacts 추가·권한 승인·ref 미변경의 증거가 아닙니다
- Git `refStatus`는 `unchanged|applied|changed_other|unknown`, 객체 결과는 `none|created|unknown`으로 구별합니다. ref가 진행/불명인 경우 같은 head 관찰이나 요청 취소로 `unchanged`라 하지 않습니다. 제출되지 않은 ref와 결과 불명인 unattached blob을 구별하며 후자는 해당 blob 쓰기의 중복 재시도만 막습니다. ref 불명은 충돌할 동기화/공개를 막지만 검증 가능한 오프라인 조사·저작을 막지 않습니다. 미확정 쓰기를 맹목적으로 재전송하지 않으며 실제 원격 관찰·cutoff/영구 freeze·허용된 권한을 재확인하지 않고 쓰기 작업을 재개하지 않습니다
- ZIP manifest의 `schemaVersion:1`, `kind:developer_patch_not_learner_import`, `deliveryMode:download_only`, `deliveryScope:content|reporting_only|supporting_files`, `reportingEvidence`(해당 없음은 null), `roundId`, 별도 `executionId`, 실제 `baseCommit`(40자 SHA), `baseVerifiedAt`, `parentDeliverySha256`(첫 전달 null), 실제 권한/중단 시각, `gitOutcome`, `newlyPublishedRegular:0`, `files`, `deletions`를 사용합니다. 파일 항목은 `{path,beforeSha256,sha256,bytes}`이며 새 파일의 before는 null, 삭제 항목은 sha256=null·bytes=0입니다. SHA는 64자 소문자 SHA-256입니다. 변경·추가 바이트만 `files/<path>`에 저장하고 해시 확인된 삭제는 지시만 제공합니다. ZIP 엔트리는 경로 안전 검사와 case-collision 검사를 통과해야 합니다
- 권한 timeout에서 만든 기존 ZIP manifest는 v1을 그대로 보존합니다. 후속 오프라인 delta는 `schemaVersion:2`, `baseKind:offline_delivery`, 정확한 누적 선행자 `offlineBase:{artifactSha256,roundId,bankVersion,bankSha256}`, 원래 artifact의 `reconciliation:{artifactSha256,firstUnresolvedAt,deadlineAt,state:skip_git_step,skippedAt}`를 사용하고 권한 알림/마감/중단 필드는 넣지 않습니다. 새 권한 요청이 있었다고 꾸미지 않으며 root v1의 최초 미확정 시각과 정확히 대조합니다. 두 버전 모두 동일한 실제 원격 anchor와 전달 선행자 해시를 보존합니다. v2 한국어 적용 안내는 선행 회차·은행·은행 해시·콘텐츠 ZIP/직전 ZIP 해시를 명시하고, 원격 커밋만으로는 부족하며 변경분만 사용하는 경우 검증된 선행 ZIP 사슬을 먼저 적용해야 함을 알립니다. 함께 제공하는 전체본에는 이 설치 전제조건을 적용하지 않습니다
- 기준 inventory는 v1에서 확인된 원격 커밋의 전체 공개 허용 목록과 정확히 같아야 하며 v2에서는 그 inventory에 순서대로 검증한 전달 delta를 적용한 정확한 누적 파일 트리와 같아야 합니다. 후보 delta는 정확한 검토 해시 목록과 같아야 하며 허용 목록에서 항목을 빼서 삭제/유출을 숨기지 못합니다. 바이트를 읽은 뒤 별도로 고정해 ZIP을 만들고, 고정 후 변경과 기존 ZIP 덮어쓰기를 거부합니다. 이전 불변 release/seed 파일 수정·삭제를 금지합니다. 공개 보고서의 개인정보/비밀 제거는 별도 의미 검토가 필요합니다
- 별도 영수증의 `receiptSchemaVersion:1`, `artifactSha256`, `parentDeliverySha256`, `roundId`, `executionId`, `baseCommit`, `status:prepared|delivered|delivery_failed`, `recordedAt`, `manifestSha256`, `newlyPublishedRegular:0`, 선택적 `content:{roundId,ledgerPath,ledgerSha256,bankVersion,bankSha256,acceptedGoalIds}`를 보존합니다. status 사건은 append-only로 기록하고 검사에는 artifact당 최신 사건 하나를 사용합니다. 외부 업로드·사용자 첨부 성공 증거 없이 delivered를 쓰지 않습니다. 영수증에는 Library 접근 ID·개인 URL·실행자 원시 로그를 넣지 않습니다
- 새 은행과 확대·편집 대장이 들어 있는 content delta는 content를 생략할 수 없습니다. 영수증 생성기는 정확한 ZIP 파일 바이트에서 ledgerPath·은행·accepted 목표를 도출하며 전달 사슬 검사도 필수 provenance 누락을 거부합니다. 문서/보조 파일 전용과 이미 원격에 있는 은행의 reporting_only 마감 delta는 content=null입니다. 보고 전용은 새 은행을 포함하지 않으며 기존 후보의 판정·내용·검토를 바꿀 수 없습니다. reportingEvidence는 ledgerPath·baselineLedgerSha256·bankVersion·bankSha256·publicationCommit·verifiedAt·decisionSha256를 고정하고 원래 실제 공개 수는 유지합니다. ZIP 직렬화 경계는 manifest·Git 관찰·파일/삭제 항목의 알려진 필드만 허용하며 알 수 없는 비공개 메타데이터를 거부합니다
- content의 해시는 timeout 시점의 종결 후보 대장·accepted 은행 원문을 가리킵니다. 이 원문을 공개 확인 상태로 덮어쓰지 말고 별도 불변 사본을 보존합니다. 원래 공개 운영 대장을 실제 공개 확인으로 갱신하는 기존 절차와 별개입니다. accepted 목표·시작한 검토 횟수·bankVersion은 미전달인 경우에도 예약된 것으로 취급하고 중복 생성·다시 검토·횟수 초기화하지 않습니다. 이전 전달이 실제 해결된 뒤 새 편집 회차가 그 정확한 선행 roundId·은행/해시·questionId/revision을 참조하는 경우만 같은 목표의 더 높은 revision을 허용하며, 원래 전체 편집 guard를 다시 통과해야 합니다. 새 독립 목표의 누적 확대와 미해결 기존 목표의 수정/재검토를 구별하고, 후자의 오래된 선행자·분기/리셋은 거부합니다
- 전달 사슬의 앞 항목을 생략/변경하거나 분기하지 않습니다. 미해결 은행을 버리지 않고 원래 원격 검증 기준을 보존합니다. 재대조 상한 이후 새 콘텐츠 진행 여부는 미해결 항목 수만으로 결정하지 않으며 `validateOfflineContinuation`과 전체 캠페인 검증에 필요한 아래 조건을 확인합니다. `validateDeliveryChain`의 canStartNewContent는 기한과 정확한 전달/누적 증거를 반영해야 하며 단순히 unknown을 resolved로 바꿔 허용하지 않습니다. 원격 검증 이력과 다운로드 사슬은 별개이며 후자의 accepted 수를 신규 공개 수나 모의시험 공개 coverage로 더하지 않습니다
- 동일 ZIP은 동일 bytes/hash로 재사용하고 실제 변경이 없으면 중복 첨부를 생략합니다. helper는 준비만 하고 Library 권한·업로드·첨부를 해결하지 않습니다. 전송 실패는 미전달이며 비공개 서명 URL로 우회하지 않습니다. 최종 cutoff/영구 freeze 뒤 새 fallback 묶음을 만들거나 늦은 누적본을 공개하는 예외를 제공하지 않습니다

### 재대조 상한 뒤 오프라인 누적 검사

1. 최초 선행자는 정확히 전달 검증한 round-006이며 이후에는 최신 검증 전달 선행자를 사용합니다. `docs/deliveries/offline-chain.json`은 공개용 receipts·manifests·불변 원본 ledgerPaths를 연결하고, 각 artifact의 실제 ZIP/manifest/종결 대장/은행 바이트와 해시를 확인할 수 있어야 합니다. prepared 또는 delivery_failed를 delivered로 바꾸어 선행자를 만들지 않습니다. 오래된 기준·앞 항목 누락·분기·변경 원문·같은 bankVersion의 다른 바이트는 거부합니다
2. baseline.sourceCommit은 실제 검증된 원격 커밋을 가리킵니다. baseline.offlinePredecessor의 `{artifactSha256,manifestSha256,ledgerSha256,roundId}`는 정확한 영수증/manifest/종결 대장을 연결하며 baseline.bankVersion·bankSha256·누적 수는 그 대장의 accepted 은행과 일치해야 합니다. 선행자의 `recordedAt`과 `eligibleAt=max(recordedAt, 최초 재대조 deadlineAt)`는 후속 회차 시작보다 늦을 수 없습니다. 오프라인 은행의 가짜 원격 commit·공개 manifest·verified 상태를 만들지 않습니다
3. 전달 선행자 검증으로 얻은 `offlineBases` Map을 명시적 로컬 전용 문맥으로 전체 캠페인 검증기에 제공합니다. 검증 입력에는 원래 closed 확대/편집 대장 전체와 은행 원문을 넣으며 publication.status·공개 수·판정·cycle·검토 시각을 바꾼 합성 대장을 쓰지 않습니다. 기존 계보·재개방·목표/template/ID 중복·최대 3회/계보 6회·검토 독립성·다섯 gate·일정 단일성·판정 마감·종결·동결 조건을 확인합니다. 인자가 명시되지 않은 정상 원격 검증에 오프라인 예외를 적용하지 않습니다
4. 모든 누적 은행은 검증된 바로 전 선행 은행의 시드·기존 문항/선택지·출처·정정된 개정판을 정확히 보존해야 합니다. 추가된 정규 문항은 해당 회차에서 accepted인 실제 집합과 일치하고, accepted 목표·은행 버전의 예약이나 탈락 이력은 사라지지 않아야 합니다. 엄격한 은행/해설 발행 검사와 허용 목록·개인정보 검토도 별도로 수행합니다. 사슬 해시 일치만으로 내용·문안·정답 의미 또는 전체 캠페인 검증을 통과했다고 주장하지 않습니다
5. 각 원본 종결 대장·불변 bank·영수증/manifest·선행 해시를 체크포인트로 보존합니다. 오프라인 신규 공개 수는 0이며 verifiedAt과 accepted 후보의 publishedBankVersion은 null입니다. 기존 원격 공개 coverage와 실제 전달한 오프라인 채택량을 별도로 기록합니다. 4시간 일정·후보 상한·판정 마감·마지막 날 23:00 종결·23:30 재확인·최종 동결은 변경하지 않습니다

### 최신 사슬의 후속 동기화 검사

`assessGitSyncPlan`은 Git 쓰기를 수행하지 않는 계획 검사입니다. 최신 검증 누적본을 새로 확인한 원격 head에 적용하되 사슬의 모든 원래 종결 대장·불변 은행 버전·전달 기록을 보존해야 합니다. 오래된 중간본을 먼저 공개할 필요는 없으며 사슬 전체의 검증은 생략할 수 없습니다.

- 실제 원격 anchor와 fresh head의 ancestry를 확인하고 public allowlist 전체의 현재 해시를 읽습니다. 각 추가/변경/삭제의 before/after 해시와 대조해 아직 적용되지 않은 변경, 이미 정확히 적용된 바이트, 외부 변경/경로 충돌을 구분합니다. 같은 immutable 버전의 다른 바이트나 허용되지 않은 삭제는 거부하며 원격 변경을 강제로 덮어쓰지 않습니다
- unsettled 객체 쓰기를 중복하지 않습니다. 미확정 ref가 계획한 publication과 충돌할 수 있으면 해당 Git 단계를 보류/건너뛰고 오프라인 사슬은 보존합니다. 계획이 안전하다는 결과는 권한이나 미확정 쓰기 완료 증거가 아닙니다. 실제 쓰기 직전에 fresh head·freeze·전체 release 검사를 다시 하고 head가 바뀌면 계획을 재검증합니다
- `resolvedArtifacts`는 실제 원격 ancestry·각 보존 산출물의 정확한 바이트·최신 누적본의 Pages 반영과 전체 캠페인 검사를 확인한 후에만 기록합니다. 최초 원문과 영수증은 계속 보존하고 실제 공개 확인 기록은 별도 절차로 갱신합니다. 기한 도달·건너뜀·로컬 검사만으로 해결 또는 공개했다고 기록하지 않습니다. 최종 cutoff 또는 영구 freeze 뒤 동기화로 새 누적본을 공개할 수 없습니다

검증기의 `ok`는 기존 전달 증거의 유효성이고 `canStartNewContent`는 현재 진행 허용 여부입니다. 최종 동결 뒤에도 기존 정상 증거의 역사적 검사는 가능하지만 새 오프라인 확대·ZIP 생성·Git 동기화는 허용하지 않습니다.

### 독립 전체 프로젝트 묶음 (complete v1, packaging-policy-001)

- 매 다운로드 전달은 delta와 전체본 두 artifact를 준비하며 정확히 같은 프로젝트/은행을 가리켜야 합니다. CLI는 DELTA.zip과 COMPLETE.zip 두 출력 경로와 reviewedFullInventory를 요구합니다. 전체본은 공개 허용 목록 전체를 `project/<path>`에 담습니다. 다른 디렉터리의 파일, symlink, 비공개 자료·학습 기록·비밀·서비스 접근 ID는 포함하지 않습니다
- 전체 manifest는 `schemaVersion:1`, `kind:complete_project_not_learner_import`, `deliveryMode:download_only`, `newlyPublishedRegular:0`, `projectDirectory:project`, `prerequisiteArtifacts:[]`, `sourceRelease`, `frozenSourceInventory`, `packagingRevision`, `files`만 허용합니다. 파일 inventory는 `{path,sha256,bytes}`이며 경로 안전·대소문자 중복과 모든 원문 해시를 검증합니다
- `sourceRelease:{roundId,deltaArtifactSha256,deltaManifestSha256,baseCommit,bankVersion,bankSha256,ledgerPath,ledgerSha256}`는 실제 출처를 보존합니다. 이 선행 delta는 설치에 필요하지 않습니다. 활성 data/manifest와 은행·closed 대장이 정확히 일치해야 하며 알려지지 않은 필드는 거부합니다
- `frozenSourceInventory`는 원래 검토된 전체 공개 목록입니다. 포장 변경 없는 다음 회차 전체본은 files와 같고 packagingRevision은 null입니다. 별도 포장 개정은 `{revisionId,files:[{path,beforeSha256,sha256,bytes}]}`로 원본과 다른 지원 파일만 정확히 기록합니다. 기존 runtime/data/원 대장/전달 이력의 변경·삭제를 이 예외로 허용하지 않습니다
- full 영수증은 `receiptSchemaVersion:1`, `kind:complete_project_delivery`, artifact/manifest/sourceDeltaArtifact SHA-256, roundId·bankVersion·bankSha256·status·recordedAt·newlyPublishedRegular:0을 갖습니다. 기존 delta chain에 full을 끼워 넣거나 원 delta 영수증/종결 대장을 수정하지 않습니다. prepared/delivered/delivery_failed 사건을 따로 보존하며 실제 첨부 확인 전 delivered를 쓰지 않습니다
- 빈 폴더 재구성 후 build/check/test·발행 검사·CRC/전체 해시·privacy 검증을 통과해야 합니다. full과 delta를 둘 다 적용할 필요는 없습니다. 전체본은 learner import 파일이 아니고 브라우저 기록 삭제를 요구하지 않습니다. 포장 작업은 새 문항 생성·공개/동결 우회 권한을 주지 않습니다

### 새 명시 요청에 따른 단일 blob 재제출의 좁은 예외

미확정 쓰기의 자동 재시도 금지는 기본값이다. 다만 이전 실행이 영구 `download_only`로 끝났고 tree/commit/ref를 전혀 제출하지 않은 분리된 `create_blob`만, **종료 뒤 사용자가 새로 명시한 요청**에 대해 새 executionId로 독립 검토한다. 기존 로컬 실행의 종료와 대기 중인 후속 Git 쓰기가 없음도 독립 확인한다. 원래 저장소·도구·인코딩·해독 바이트·바이트 수·SHA-256·Git blob SHA가 모두 같아야 한다. 60초 이내의 실제 원격 head와 로컬/원격 영구 동결 상태, 별도 신규 권한 대기의 10분 상한·현재 실제 시각·최종 cutoff·전체 발행 검사를 확인한다.


권한 알림 없이 결과가 미확정인 분리된 blob도, 원래 재대조 10분 경과·영구 쓰기 중단·실제 로컬 실행 종료 및 후속 Git 쓰기 대기 없음이 독립 확인되고 종료 후 새로운 명시적 사용자 요청이 있는 경우에만 같은 단일 재제출 guard를 사용한다. 이 경로는 원 `permissionWait:null`과 실제 `no_request_observed` terminal/제출 원문·해시·microsecond UTC 시각을 그대로 결박한다. `download_only`·권한 알림·서버 취소를 만들어 내지 않으며 원 unknown·최초 시계·중단은 유지한다. 동일 저장소·도구·인코딩·해독 바이트·SHA, 새 execution/operation, 실제 fresh head·양쪽 동결·cutoff와 제출 전 하나의 고정된 durable request/object claim 조건은 같다. 원문 해시나 caller Boolean만으로 외부 사실·권한이 인증되는 것은 아니며 운영자가 원 증거와 새 요청을 독립 확인한다. 후속 tree/commit/ref가 제출됐거나 불명인 경로는 허용하지 않는다.

`scripts/blob-retry.mjs`의 `initializeBlobRetryJournal`/`reserveBlobRetry`로 원래 작업당 하나의 고정된 비공개 지속 기록에 요청/객체당 한 번을 **제출 전에** 배타 생성·동기화한다. 실패·불명·중단도 한 번을 소비하며 기록의 이동·삭제·재초기화로 횟수를 되찾지 않는다. 기존 unknown·최초 10분 시계·종결 상태는 그대로 둔다. 증거/지속 기록 누락이나 손상은 차단한다. 자동/예약/늦은 승인·인코딩 변경·tree-inline 우회·tree/commit/ref 재시도는 허용하지 않으며 이 검사는 공개 승인이나 배포 완료를 뜻하지 않는다.

운영자 증거·사용자 요청 식별자·journal 경로/원시 기록은 공개 ZIP에 넣지 않습니다. guard가 반환한 정확한 operation만 별도 새 실행에서 한 번 제출할 수 있으며, 원래 미확정 결과를 성공·실패·미변경으로 재분류하지 않습니다. 후속 tree/commit/ref는 별도 공개 권한·원격 상태·전체 검사에 따라 평가합니다.

### 별도 검증 누적 공개 이벤트

`docs/publications/cumulative-006-008.json`은 원래 immutable ledger와 별도의 `verified_cumulative_publication` 이벤트다. 공개 검증 시각, 실제 payload commit/parent/tree, 동일 commit의 Pages 성공, 정확한 remote/live 파일 inventory, 공개 manifest, 원래 각 회차 ledger/bank 및 전달 artifact/manifest/receipt SHA-256을 연결한다. 120개 신규 공개와 총403개 정규 문항을 구별한다. 후속 지원 커밋의 자기 참조나 원래 미확정 객체 요청의 성공을 주장하지 않는다.

`scripts/publication-sync.mjs`의 독립 검토된 고정 해시 목록 밖 증거는 허용하지 않는다. 정상 loader는 필요한 증거 파일이 없거나 변조되면 실패한다. 소비자는 원래 대장 바이트와 로드한 대장 전체의 동일성, 은행 해시, 종결/전달 뒤 검증 시각과 최종 동결을 확인한다. 검증 이전의 과거 감사에는 이벤트가 효력을 갖지 않으며,006–008의 역사적 기준은 자신의 사후 이벤트와 비교하지 않는다. 이후 새 회차의 기준은 최신 검증 누적본이어야 하고 더 새 공개 정정/확대를 롤백하지 않는다. 현재 active manifest 역시 이미 동기화한6/7 같은 중간본으로 되돌릴 수 없다.

`synchronizations`는 원본 증거 배열이며 임의로 검증 완료 처리한 Map이 아니다. `resolveSynchronizedArtifacts`는 고정 증거·전체 원본 문맥·정확한 receipt 해시로 현재 해결 집합을 만든다. `validateSynchronizedDeliveryChain`은 전체 확대/편집 검증 후 그 집합을 전달 사슬 검증에 제공한다. 과거 영수증/대장/오프라인 canPublish는 그대로이며, 최종 cutoff/영구 freeze 뒤에는 새 콘텐츠를 시작할 수 없다. 같은 증거로 후속 편집의 accepted 선행자를 확인해도 stable ID·해시·원래 revision·최대 검토와 분기 금지 검사는 유지한다.

이 파일은 사전에 독립 확인된 외부 사실의 검토 기록이지 GitHub 서명 검증기나 실시간 원격 관찰이 아니다. 코드와 고정 해시를 함께 바꾸는 것은 별도 검토가 필요한 새 신뢰 결정이다. sourceCommit은 최신 검증 payload의 실제 원격 후손이어야 하며 실행자의 fresh head/ancestry 확인으로 입증한다. 로컬 검사만으로 임의 commit을 검증된 후손이라고 선언하지 않는다.


## 9회차의 명시적 수동 시작과 정규 릴리스 백업

사용자가 검증된 누적 8회차 공개 뒤 즉시 다음 회차를 새로 요청한 2026-10-04T08:54:06Z 시작은 `round-009.manualStartException`에 한 번만 기록한다. 8회차의 실제 종결·원문 SHA-256, public008 기준·검증 시각, 9회차 ID·실제 시작·10:30 UTC 판정 마감을 정확히 검사한다. 07:00 발생분을 재소비하거나 11:00 예정 시작으로 꾸미지 않으며, 이미 종결된 8회차의 역사적 계획 마감을 고쳐 쓰지 않는다. 일반 회차의 4시간/다음 예정 경계·3회 한도·동결은 그대로이며 11:00 호출은 활성 회차 유무를 확인하고 중복 작업하지 않는다. 다른 날짜·ID·시각의 수동 확대를 자동 허용하지 않는다.

정상 릴리스에서도 변경분과 이전 ZIP이 필요 없는 전체 적용본을 함께 준비한다. 실제 권한 시간 초과나 오프라인 선행 조건이 없으면 `scripts/release-bundle.mjs`의 `writeReleaseDeliveryPair`를 사용하며 `release_backup`으로 표시한다. 권한 알림·마감·download_only 기록을 만들어 내지 않는다. 변경분에는 실제 확인한 기준 커밋·변경 전후 해시·전체 삭제 목록과 준비 당시 원 대장의 공개 상태를 기록하고, 전체본은 `project/` 아래 검토된 전체 허용 목록·해시와 `prerequisiteArtifacts: []`를 담는다. 두 ZIP 생성 자체의 공개 증가는 0이며 이후 Git/Pages 확인은 별도 증거다. 실제 만료가 발생한 다운로드 전용 경로의 기존 API·영수증·10분 시계는 유지한다.


## 검토된 후속 release_backup 전달 체크포인트

- 고정된 `normal-backup-009.json`과 코드의 원래 SHA-256 부트스트랩은 바꾸지 않는다. 후속 proof는 `kind:delivered_release_backup_checkpoint`, exact predecessor(roundId/artifactSha256/proofSha256), 원래 rootProofSha256와 terminal origin, 이전 trust registry 원문 SHA-256, 두 artifact/비공개 저장·첨부 영수증의 SHA-256, 실제 attachmentAcceptedAt/검증 완료 verifiedAt, 원래 delta/full manifest 및 runtime manifest 원문을 가진다. 공개 proof에 서비스 접근 식별자나 새로운 권한 시계를 넣지 않는다
- `docs/deliveries/release-backup-trust.json`은 검증기 모듈과 함께 독립 검토하는 append-only 신뢰 데이터다. schemaVersion 1, rootProofSha256, 순서 있는 checkpoints만 허용한다. 각 항목은 roundId/path/sha256/predecessorProofSha256/verifiedAt이다. 검토자는 제안된 proof만 보지 않고 실제 두 파일 저장 및 각각의 native 첨부 수락 원본을 확인해야 한다. 로컬 self-declared delivered 상태, 임의 checksum/Boolean/Map은 외부 이벤트 인증을 대신하지 못한다. 새 importer가 있는 작업본/전체본은 빈 registry라도 실제 파일과 공개 허용 목록 항목을 반드시 포함하고, 등록된 모든 proof와 부트스트랩도 같은 방식으로 포함해야 한다. 권한 있는 검증기 디렉터리의 파일로 후보 snapshot의 누락 의존성을 대신하지 않는다. 검증 입력 workRoot가 가져온 registry는 신뢰 모듈의 정확한 prefix여야 하고, 실제 후속 회차가 참조하는 tail은 생략할 수 없다
- source delta/full은 `release_backup`이며 공개 증분 0, 삭제 없음, 전체본 prerequisiteArtifacts 빈 배열, 별도 packaging overlay 없음, source 대장은 closed/not_attempted·commit/verifiedAt null이다. 그 대장·bankVersion·bankSha256·실제 원격 anchor·exact offlinePredecessor가 이전 전달 proof와 일치해야 한다. 현재 회차 시작 이후·ZIP 준비 이전의 실제 원격 확인 시각을 기록하되 실제 관찰 진위와 Git 직전 freshness는 운영자의 별도 읽기 전용 확인 책임이다. 다른 anchor/head는 이 경로가 자동 승인하지 않는다
- 누적 delta의 전체 파일 집합과 before/after 해시는 고정009 proof의 delta/full inventory로 복원한 실제 원격 anchor와 현재 전체 inventory의 정확한 차이여야 한다. 그 anchor의 경로 삭제나 중간 미공개 추가분 누락을 허용하지 않는다
- 검증기는 원래 모든 불변 은행·대장·편집 review package 및 선행 proof 원문을 확인하고 각 중간 successor의 실제 runtime manifest로 전체 발행 검사를 수행한다. 목표·후보·template·시드·기존 내용·버전·cycle/reopening·검토 독립성·일정/마감/누적 coverage 규칙을 그대로 적용한다. latest exact 전달 기준을 건너뛰거나 accepted 목표/시작한 검토 횟수를 다시 만들지 않는다
- 새 시작 하한은 실제 pair 수락 뒤 전체 검증이 끝난 verifiedAt이다. 원래009 uncertainty origin은 바이트 의미가 동일해야 하며, 최초 firstUnresolvedAt/deadlineAt/skip을 새 roundId에 맞춰 바꾸지 않는다. 현재 manifest.finalRelease와 publicationState.finalized가 모두 명시 false여야 하며 missing/true/최종 cutoff는 fail closed다. 후속 proof는 이미 전달된 ZIP 내부를 수정하지 않고 다음 작업본에 별도로 보존한다

미래 전달 체크포인트가 이미 파일로 존재하는 과거 시점 감사도 그 proof·원래 원문·선행 inventory 해시는 엄격히 대조한다. 다만 실제 verifiedAt 전에는 그 offlineBase를 활성화하지 않는다. 그 선행자를 너무 일찍 참조하는 후속 회차는 계속 실패하며, 이미 등록된 회차를 과거 감사나 자기 proof 생략으로 바꾸어 쓰지 못한다. 보존 inventory에는 비활성 data/releases 은행과 data/seed-bank*.json, 종결 대장/보고서, 원래 전달 및 공개 proof를 포함한다. append-only trust registry만 정확한 prefix 확장을 허용한다.


## 11회차의 한정된 명시적 수동 시작

2026-10-04T12:41:51Z의 명시 요청과 실제 수동 시작 2026-10-04T13:08:49Z를 구분하여 `round-011.manualStartException`의 `requestedAt`·`manualStartedAt`에 기록한다. 미확정 Git 단계의 유한 대기 종료는 성공·실패·공개 확인이나 쓰기 재시도 허가를 뜻하지 않는다. 11회차는 정확히 전달 검증한 regular.10(일반477개·시드14개)을 선행자로 하며 실제 원격 regular.8(일반403개)과 구분한다.

예외는 010의 원래 종결 시각 `2026-10-04T11:44:42+00:00`·원문 SHA-256 `d15cbd2e5d56f79893920cecc922d8a12709b928e572fa720da8b3bb5545a63b`, 은행 SHA-256 `50b6131f1ffb174bf4a459b0a91a2498465c0dccea0e4aee30259f195086b214`, 전달 checkpoint 원문 SHA-256 `a00f2b35b2a63a171097bf0535d7968584f6dc40a9411b401f432e1d884dd917` 및 검증 완료 `2026-10-04T12:27:05.849Z`에 한정한다. `previousLedgerSha256`·`previousDeliveryCheckpointSha256`·`previousDeliveryVerifiedAt`을 원문 및 검증된 오프라인 선행 연결과 대조하며, 선언이나 임의 Map만으로 증거를 대신하지 않는다.

011의 판정 마감은 `2026-10-04T14:30:00Z`, 다음 예정 시작은 `2026-10-04T15:00:00Z`다. 실제 시작을 15:00으로 꾸미거나 이미 소비한 11:00 발생분을 다시 쓰지 않는다. 이미 닫힌010의 원래14:30 계획 마감·모든 은행·종결 대장·전달 proof 바이트는 보존한다. 009의 기존 예외는 그대로이며 다른 ID·날짜·시각으로 확대하지 않는다. 후보당3회·계보6회·더 이른 실제 후속 회차·영구/최종 동결·공개 수0·실제 Git/Pages 확인 경계는 유지한다.


## 후속 누적 공개 이벤트와 역사적 읽기 전용 감사

후속 `verified_cumulative_publication`은 `previousSynchronizationSha256`로 직전 등록 증거를 연결하며 고정 신뢰 배열의 정확한 prefix 순서로만 소비한다. 각 새 rounds 항목은 `deliveryProof:{path,sha256}`와 `deliveryVerifiedAt`을 추가하여 원래 normal backup 또는 successor checkpoint의 canonical 원문을 연결한다. 기존 `roundId/originalLedgerSha256/bankVersion/bankSha256/artifactSha256/manifestSha256/deliveredAt`과 proof의 sourceRelease·artifact·manifest·수락/완료 시각이 정확히 같아야 한다. 해당 proof·대장·은행은 실제 공개 remoteInventory에도 같은 해시로 있어야 한다. pin 추가는 외부 사실의 별도 독립 검토가 필요하며 자체 해시 계산만으로 공개 사실이 되지 않는다.

역사적 재구성의 입력은 caller가 선언한 old/future 상태가 아니라 고정 이벤트가 연결한 원래 전체 archive inventory다. 전체 허용 목록 및 파일 크기/바이트 해시가 정확히 일치해야 하며, 누락·추가·변조·symlink나 검토되지 않은 경로로 범위를 넓히지 않는다. 감사 시각은 그 원본 proof의 preparedAt에서만 얻고 새 공개 검증/최종 cutoff보다 앞서야 한다. 읽기 전용 결과는 현재 발행 또는 새 저작 문맥을 반환하지 않는다. 일반 loader는 새 proof가 빠진 현재 작업본을 계속 차단한다.

원래006–008 공개 증거와009 terminal origin·firstUnresolvedAt/deadlineAt/skip 및 고정 bootstrap 해시는 변경하지 않는다. 후속 공개 등록은 전달 기록의 canPublish=false·공개 수0·unknown을 바꾸지 않는다. 현재 manifest.finalRelease와 publicationState.finalized 및 최종 cutoff는 별도 현재 전체 검사에서 계속 적용한다.


## 독립 원격 기준의 후속 오프라인 전달 사슬

기존 `offline-chain.json`과 고정009 정상 백업 사슬은 역사적 원문 그대로 보존한다. 이후 별도로 검증한 최신 공개 기준에서 실제 권한 만료가 생기면 새 사슬의 첫 전달로 등록하며, 이전009의 원격 기준·timeout·unknown origin에 이어 붙이지 않는다. 새 사슬은 `scripts/offline-chain-continuation.mjs`와 별도의 append-only `docs/deliveries/offline-chain-trust.json`을 사용한다. 등록은 round 번호 특례가 아니라 독립 검토한 원격 commit·manifest·은행·전체 inventory와 두 ZIP·원래 종결 대장·native 첨부 증거의 정확한 해시를 기준으로 한다.

`prepareIndependentOfflineContinuation`은 실제 두 ZIP과 원래 Library 저장/두 native 첨부 수락 영수증을 검사하고 공개 가능한 제안 proof만 반환한다. 제안·prepared·실패·한 파일 수락은 전달 증거가 아니다. 외부 서비스의 원래 결과를 독립 검토한 후 새 작업본에만 proof와 registry pin을 추가한다. 이미 전달한 source ZIP은 수정하지 않으며, proof의 실제 검증 완료 이전에는 다음 회차를 시작하지 않는다. 비공개 서비스·메시지 식별자는 해시로만 연결한다.

새 root의 실제 권한 만료 시각과 최초 operation 불확실성·고정 10분 기한·실제 지속 기록한 skip을 그대로 보존한다. operation 은행 hash와 전달 delta hash의 연결은 검토된 proof에 명시한다. 나중의 Git 관찰로 최초 불확실성 시계를 초기화하지 않는다. 후속 schema2 전달은 같은 원래 reconciliation 기록을 사용하며 새로운 timeout을 만들지 않는다. 각각의 current/전달본 manifest·publication-state 동결 표시가 명시적으로 false인지와 최종 cutoff를 함께 검사한다.

loader는 등록된 각 사슬을 자기 원격 anchor에서 별도로 검증한 뒤 원래006/009와 모든 새 사슬의 증거를 전체 캠페인 검사에 합친다. 누락·자기 선언 pin·혼합 ZIP·분기·다른 같은 commit inventory·은행/대장/검토 횟수 변경·오래된 선행자·중복 목표·후기 proof의 소급 적용을 거부한다. 최신 실제 공개 기준과 최신 전달 누적 선행자의 순서를 기존 전체 검증기로 대조하며 공개 수는0, 원래 unknown은unknown으로 남긴다. 이 로컬 검사는 Git 쓰기·권한 요청·배포 권한을 부여하지 않는다.


## 첫 발행 전 격리 계약

`scripts/prepublication-quarantine.mjs`와 `docs/quarantines/trust.json`은 새로 작성되어 한 번도 전달/공개되지 않은 accepted 개정판의 발행 제외만 담당한다. 기존 round/editorial schema·terminal decision·review cycle은 바뀌지 않는다. `kind:pre_first_release_quarantine` 감사 파일은 정규 JSON 바이트 SHA-256으로 pin하고 이전 감사 SHA와 prior trust prefix SHA를 연결한다. 후보 작업본의 registry는 검증기에 포함된 독립 검토 registry의 정확한 prefix여야 한다. 이미 적용된 source/후속 회차에서 pin·증거·원본 후보·역사 파일이 빠지거나 변하면 fail closed한다.

- 후보 결박: candidateId/questionId/revision/learningGoalId/templateId/lineageId, 원 terminal candidate 전체의 canonical SHA-256, question+정확한 연결 options의 canonical SHA-256, identity-free fingerprint, 전용 option ID, 결함 targetPaths와 짧은 사유, 원 저작·채택 검토·결함 확인·독립 공개 QA의 private evidence SHA-256을 남긴다. canonical은 객체 키를 재귀 정렬하고 배열 순서는 유지한 compact JSON이다. 내용 해시는 발행 metadata 승격 전의 저작 원본을 대상으로 한다
- 신뢰 등록: 원문을 읽은 별도 공개 QA가 모든 원본 해시·개정판·결함·검토 역할, 새 전용 선택지의 비공유성, 전체 기존 은행/전달/공개 이력에서 대상 부재를 확인한 뒤 독립 감사 파일과 trust pin을 검토한다. 선언한 hash/Boolean/Map만으로 omission을 허용하지 않는다. 공개 파일에는 raw author/blind/review packet·서비스 식별자·비공개 경로를 넣지 않는다
- 최초 경계: 아직 첫 불변 은행을 만들기 전이며 source publication은 not_attempted/blocked, commit/bankVersion/bankSha256/verifiedAt은 모두 null이어야 한다. round 시작 이후의 실제 관측 시각, 현재 작업본과 직전 전달본의 두 동결 marker 원문, 전체 이전 public inventory와 독립 첫 발행 QA 증거 해시를 보존한다. 현재·전달본 어느 쪽도 frozen이어서는 안 된다. 이후 발행은 감사 시각보다 빠를 수 없으며 현재 최종 cutoff/영구 동결도 다시 검사한다. 과거 exact archive의 읽기 전용 검증에는 미래 감사를 소급 요구하지 않으며 새 발행 권한을 만들지 않는다
- alias 차단: stable candidate/question/goal/template/lineage 충돌과 완전한 동일 내용 fingerprint 충돌을 거부한다. fingerprint는 ID/source label/revision/review metadata/material filename·선택지 순서 변경을 제외하고 내용·정오 역할을 비교한다. 임의의 의미 재서술을 완전 탐지하지 않으므로 새로운 목표의 의미 독립성은 여전히 별도 QA다. 격리한 전용 option을 orphan 또는 다른 문항의 공유 option으로 발행하지 않는다
- 검증 결과: `loadRoundContext.quarantineDispositions`와 `validateQuarantineCampaign`의 검증된 Map은 round별 acceptedCandidateIds/quarantinedCandidateIds/eligibleCandidateIds/auditSha256s/counts를 제공한다. 실패한 결과로 제외를 적용하지 않는다. counts.accepted는 원 대장과 같고 eligible=accepted−quarantined다. sourceDecisionSha256은 원 회차의 closure·baseline·policy·모든 terminal candidate/cycle·비공개가 아닌 계획 필드를 결박한다. publication/coverageAfter/validation/summary, 실제 공개 수 두 필드와 후보 publishedBankVersion만 이 projection에서 제외하며 그 변경은 기존 공개 검증기를 별도로 통과해야 한다. published 수와 regular coverage는 실제 은행/공개 증거로 별도 계산한다
- 경로 일치: 일반 release, 명시적/기본 bank build, offline delivery/continuation, standalone packaging에서 같은 제약을 적용한다. 영수증 acceptedGoalIds와 다음 회차 예약은 격리분을 포함한 원 accepted 집합이다. 실제 새 은행 추가분만 eligible 집합이다. 격리 대상은 기존 published 선행자가 아니므로 accepted_content_editorial의 검증된 공개 선행자 guard로 교정할 수 없다

감사·pin 추가 외에 이미 공개한 감사·은행·원 대장·전달 proof·ZIP은 수정하지 않는다. 이 경로에는 unhold·내용 수정·새 cycle·재개방·카운터 초기화 API가 없다. 구조 검증은 실제 independent review, 의미 정확성, 원격 관찰이나 학습자 세션 보존 실측을 대신하지 않는다.


## Denial-only evidence-loss release block

전체 검토 증거·원 보고서·전달 산출물을 잃은 미전달 종결 회차는 실제 저작 결함에 대한 quarantine으로 바꾸지 않는다. `docs/release-blocks/trust.json`의 독립 검토한 append-only pin과 별도 이벤트로 full 원 대장 바이트·모든 후보 이력·시작한 모든 개정판의 내용 지문·전용 선택지·은행 버전을 예약한다. 새 내용 판정·cycle·재검토·공개·전달 proof를 만들거나 원 대장을 다시 쓰지 않는다.

사고 보고서는 날짜가 명확한 `docs/incidents/`의 별도 파일이다. 정확한 원 대장·이벤트·사고 문서가 검증된 경우에만 해당 원 Markdown 보고서 부재를 `reservation_only_missing_original_report`로 만족한다. 이는 소실 보고서의 복구나 원 pass 요약에 대한 현재 실행 증거가 아니다. 다른 누락 보고서에는 적용하지 않는다.

`evidence-loss-block.mjs`는 기본/명시 은행, 전체 이력·baseline, outgoing 파일/ZIP와 전달·공개·후속 기준 proof에서 차단을 검사한다. 경로 변경·문항/선택지 이름 변경·호출자 Boolean/제외 목록·registry/event/대장 누락으로 해제되지 않는다. 원래 복구 은행은 비공개 증거이며 공개 불변 은행이나 ZIP에 넣지 않는다. active 은행은 마지막 실제 전달 검증본을 유지한다.

후속 정규 회차는 기존14.3에 따라 최신 실제 전달 검증 은행에서 독립 목표를 선정할 수 있다. 채택 목표를 재검토해 증거 소실을 치유하거나 이름만 바꿔 재사용하지 않는다. 탈락 목표의 기존 새 1차 근거·campaign당1회 재개방 조건은 그대로이며 이 이벤트 자체는 근거·권한이 아니다. 모든 실제 새 후보에는 전체 재개방·일정·마감·동결·현재 시각·발행 검사를 적용한다. 원 탈락 원문·별칭과 예약된 전용 선택지를 재생하지 않는다. 사고 전 정확한 역사 archive의 읽기 전용 검증은 미래 이벤트를 요구하지 않으며 현재 발행 권한을 제공하지 않는다.


## 독립 오프라인 사슬의 공개 동기화 계약

별도 공개 이벤트가 독립 전달 checkpoint를 참조할 때 `delivered_independent_offline_checkpoint`의 원문 SHA, reviewed trust의 path/round/chain/anchor/predecessor와 정확한 embedded receipt SHA를 함께 검사한다. 전체 사슬의 실제 원래 영수증·manifest 검증 뒤에만 소속을 확인한다. 서로 다른 원격 anchor의 사슬을 연결하거나 caller Boolean/Map을 외부 사실 대신 사용하지 않는다. 실제 payload의 원격 전체 inventory에는 자기 전달 checkpoint·trust prefix와 모든 불변 대장·은행·원래 공개 증거·격리·발행 차단·사고 기록을 보존한다.

새 independent source는 기존 provenance 필드와 함께 `receiptSha256`, `accepted`, `quarantined`, `eligible`, `newlyPublicRegular`를 명시한다. accepted는 역사적 채택 전체이며 eligible은 검증된 격리 disposition에서만 도출한다. round-022는 accepted31·quarantined19·eligible12이고 receipt의 acceptedGoalIds31을 보존한다. 실제 bank와 정확한 baseline의 새 questionId 집합은 eligible 후보 집합과 같아야 한다. 전체 정규·필기·실기·testOnly·과목별 수와 anchor 대비 새 공개 수는 실제 최종 bank에서 다시 계산한다. 원래 두 공개 이벤트에는 새 필드를 소급 추가하지 않는다.

`loadRoundContext`는 전체 campaign 검사 뒤 각 독립 사슬을 자기 원래 receipts/manifests로 별도 해소하고 성공한 exact artifact 집합만 합친다. 해소 결과를 과거 proof 검사에 전달하지 않는다. 현재 공개 해소는 원래 `canPublish:false`, unknown·최초 불확실성 시계·공개0·검토 이력·전달 ZIP을 바꾸지 않으며 격리 목표 예약을 해제하지 않는다. 증거 소실로 차단된 round-023은 publication source·receipt·checkpoint·baseline으로 쓸 수 없고, 원 ledger/event/incident는 그대로 남기며 소실된 원 Markdown을 새로 만들지 않는다.

새 event/pin 등록은 실제 payload main·정확한 commit의 Pages·live bytes 확인과 독립 검토 이후에만 한다. 이 계약 자체는 새 공개 확인 또는 Git 쓰기 허가가 아니다. 뒤따르는 지원 commit은 자신의 별도 Pages/live 확인이 필요하다. 미래 event는 이전 회차 기준을 소급 변경하지 않으며 cutoff·현재/전달본의 두 동결 marker·기존 일정과 review 한도를 유지한다.

정확한 역사 archive 감사의 시각은 기존 normal-backup proof에서는 원래 `deltaManifest.preparedAt`을 유지한다. 그 필드가 없는 independent schema1/2 전달은 원문 pin으로 인증된 실제 `proof.savedAt`을 쓴다. 이는 전체 원본 저장이 확인된 시각이며 저작 준비 시각을 새로 만들어 내지 않는다. 각 입력 파일/허용 목록/크기/CRC/SHA를 정확히 대조하고, 결과는 계속 `currentReleaseClearance:false`, `canStartNewContent:false`다.


## 2026-10-07의018–027 공개 확인

별도 `docs/publications/cumulative-018-027.json`과 보고서가 payload `da645d3d7a37b67551344bf7853c92e54eecddfd`, Pages37583421170 성공,242파일 원격 tree·52개 live 경로의 실제 일치를 기록한다. 일반882개(필기806·실기76)와 시드14개이며017 대비 새 공개는198개다.018–022·024–027의 원 채택217개 중022의19개는 계속 격리한다.023은 예약 전용으로 남기고 공개 source에 넣지 않는다. 원래 대장·은행·proof·trust prefix·ZIP·공개0·unknown·최초 불확실성 시계를 바꾸지 않는다. 이 기록을 넣는 후속 지원 commit은 자신의 별도 Pages/live 검증이 필요하다.

비발행 읽기에서 검증 시각보다 이른 시각을 명시했고 해당 공개 source 전체도 사후 시작 회차도 없는 역사적 부분집합은 뒤의 전달 의존성을 요구하지 않는다. 이 경우에도 모든 이벤트 원문 SHA와 pin 순서를 먼저 인증하며 이벤트를 활성화하거나 artifact를 해소하지 않는다. 현재 시각·발행 문맥·source 전체·사후 시작 회차 및 인자 없는 직접 호출은 정확한 전달 증거와 검증된 사슬 소속을 계속 요구한다. 실제 원 archive 감사는 별도의 정확한 inventory 경계만 사용한다.

## 정상 원격 회차의 불변 대장 공개 이벤트

실제 권한 만료나 오프라인 선행자가 없는 정상 원격 회차는 `kind: verified_normal_publication`의 별도 검토된 append-only 공개 이벤트를 사용한다. `normal_frozen_ledger` source 하나는 원래 closed 대장의 원문 SHA-256, 정확한 baseline(sourceCommit·bankVersion·bankSha256), 새 은행과 accepted·quarantined·eligible·newlyPublicRegular를 결박한다. 원 대장의 not_attempted·공개0·후보 판정·검토 횟수는 고치지 않는다. payload parent는 해당 sourceCommit과 같아야 하며 직전 공개 이벤트 해시와 최신 실제 공개은행을 잇는다.

이벤트는 실제 payload commit·parent·전체 Git tree를 담는다. remoteInventory 각 항목의 path·bytes·SHA-256·gitBlob으로 중첩 tree를 재계산하고 exact-head Pages 성공과 live HTTP200 바이트를 대조한다. 모든 runtime HTML/CSS/JS, 불변 은행, 원 대장, manifest와 publication-state는 live 증거가 필수다. `runtimeManifestRaw`와 `publicationStateRaw`는 payload의 정확한 원문이며 두 동결 표시는 명시 false여야 한다. 이전 불변 이력과 격리·발행 차단·전달 trust prefix를 보존하고 실제 새 questionId·과목별 수·누적 수는 원 대장과 은행에서 다시 계산한다.

이 경로에는 deliveryProof·artifact·receipt·offlinePredecessor가 없다. 다운로드 백업 ZIP은 별도 `release_backup`으로 준비할 수 있지만 정상 공개 이벤트가 전달 사슬이나 offlineBases, resolvedArtifacts를 만들지 않는다. 기존 전달 이벤트는 원래 검사를 계속 사용하며 `auditHistoricalRelease`는 전달 proof 없는 정상 이벤트를 건너뛴다. 별도 독립 검토 후에만 실제 이벤트와 고정 해시를 등록한다. 구조 검사나 합성 테스트의 해시 계산은 원격 관측의 진실성·Git 쓰기 허가·공개 증거가 아니다. payload 확인과 뒤따르는 지원 커밋의 Pages/live 확인은 별개다. 후속 은행이 활성화된 뒤에도 각 정상 이벤트의 baseline→current 전이를 다시 검사한다. 기존 문항·시드·선택지·출처는 정확히 보존하며 새 문항은 적격한 원래 terminal accepted 후보의 revision·유형·과목·template·모든 gate·1차 근거와 일치해야 한다. 은행 시각은 종결 이후, 이벤트 확인 이전이어야 한다. 기존 freeze·최종 cutoff·격리·증거 소실 예약·검토 한도는 유지한다.

정상 release_backup delta의 기존 gitPublicationStatus·publicationCommit은 준비 시점에 읽은 동결 원 대장의 역사적 필드다. 나중의 별도 공개 이벤트로 확인된 현재 공개 상태를 덮어쓰거나 미시도로 되돌리지 않는다. APPLY-KO는 이 구분과 docs/publications의 실제 payload·Pages/live 증거를 함께 확인하는 방법을 명시한다.

## 정상 릴리스 전달의 새 원격 루트

`normal-backup-root.mjs`는 이미 공개된 누적 은행을 기준으로 작성한 정상 `release_backup` 전달을 별도 `delivered_normal_release_root_checkpoint`로 검증한다. 고정009 origin이나 실제 timeout 전용 독립 사슬에 연결하지 않는다. 원본은 closed/not_attempted, offlinePredecessor 없음, 원 공개 기준과 정확한 은행·대장·두 ZIP 해시를 유지해야 한다. 공개 증가는0이며 canPublish=false다.

원 upload/native receipt의 object-shaped 두 artifact와 원 upload tool result를 그대로 해시로 보존한다. 한 native message에 정확히 두 저장된 Library ID가 포함된 실제 수락을 확인한다. upload receipt의 recordedAt은 영수증 작성 시각이며 savedAt을 만들어 내지 않는다. 공개 proof에는 private receipt 원문·서비스 ID·workspace 경로를 넣지 않는다.

원 delta의 sourceAnchor와 후속 baseline용 continuationAnchor를 구별한다. 후자는 같은 공개 manifest·bank·freeze 상태의 검토된 직접 후손이어야 하며 추가 analysis 문서와 allowlist 변경만 허용한다. 두 전체 inventory와 실제 before/after를 결박하며 원 delta 기준 커밋을 바꾸지 않는다. 현재 검증된 offlineBase.baseCommit만 continuationAnchor를 쓴다.

archiveVerifiedAt과 attachmentAcceptedAt은 과거 사실이다. verificationCompletedAt은 새 전체 검증이 실제 끝난 현재 시각이다. 독립 검토 후 생성한 append-only registry의 registeredAt/eligibleAt은 그보다 이르지 않은 현재 시각이며 후속 formal startedAt은 eligibleAt 뒤여야 한다. 과거 조사 시작이나 회차 번호를 새 proof로 소급 허가하지 않는다. 원 시각·후보 검토 횟수·최종 마감은 그대로 유지한다.

`docs/deliveries/normal-backup-root-trust.json`은 validator가 import한 검토 권한이며 작업본은 정확한 prefix만 허용한다. 원 source의 전체 immutable 역사와 모든 trust prefix·격리·증거 소실 block·incident를 보존한다. 미검토 proposal, caller Map, Boolean은 권한이 아니다. 정확한 pre-adapter source는 자기 미래 proof를 포함할 필요가 없지만 현재 successor의 proof·module·registry·allowlist 누락은 차단한다. 일반/명시 build와 packaging에도 dependency 검사를 적용한다.

이 초기 계약은 정상 원격 기준 root admission만 지원한다. offlinePredecessor가 있는 전달을 새 root로 재등록하거나009 origin으로 돌려 연결하지 않는다. 그런 후속 전달의 checkpoint 등록은 별도 검토된 확장이 필요하다. 이미 검증한 root를 기준으로 후속 은행을 검토하고 normal release pair로 포장하는 경로는 기존 전체 캠페인 검사 아래 유지된다. 원 stopped unknown blob의 최초 시계·종결·불확실성은 별도 사실로 보존하며 재시도·Git 쓰기·공개 권한을 만들지 않는다.

원 정상 release writer가 보존한 baseVerifiedAt은 source authoring 시작 직전일 수 있다. 이 adapter는 원 delta의 그 시각과 exact 공개 inventory를 보존하며 timeout 사슬의 시작 이후 관측 조건을 소급 적용하지 않는다. 현재 후속 기준은 별도로 검토한 continuation anchor와 전체 최신-public 캠페인 검사로 확인한다.


## 정상 전달 후속 사슬의 내용 전용 계약

정상 release_backup 루트의 후속 전달은 별도 `normal-backup-chain.mjs`와 append-only `docs/deliveries/normal-backup-chain-trust.json`으로 검증한다. 루트 proof와 원 registry를 바꾸거나 후속 전달을 새 루트·009 origin·timeout으로 바꾸지 않는다. generic successor proof는 exact root/previous proof, 원 ledger·bank·두 archive와 manifest, 실제 native 수락, 검증 완료 및 등록 시각을 연결한다. 원 영수증의 recordedAt과 실제 attachmentAcceptedAt은 별개이고 없는 server savedAt을 만들지 않는다. 공개 proof에는 원 receipt의 해시만 보존하며 private 경로·서비스 ID를 싣지 않는다.

각 delta는 자기 실제 공개 baseCommit·관측 시각·전체 inventory의 before/after로 재구성한다. 같은 공개은행의 검토된 additive analysis 후손 외의 anchor 변경, 경로 삭제·충돌, 원 delivered history 변경, trust prefix 생략·분기·순서 변경은 금지한다. delivered source는 앞선 proof들을 포함하되 자기 미래 등록을 포함할 필요는 없다.

준비 proposal과 합성 테스트는 권한이 아니다. 실제 원본 증거와 정확한 변경을 새 독립 검토한 뒤 현재 시각의 등록 pin을 준비한다. loader의 후속 offlineBase는 전체 campaign 검사와 원 채택/격리/증거소실 예약, 재개방·검토 한도, 현재 및 source 동결·cutoff 아래에서만 쓴다. 실제 새 formal 시작은 등록 eligibility 뒤에 별도로 정하고 기존 예정 발생분·마감을 소급 변경하지 않는다. 일반·명시 build와 독립 packaging도 같은 dependency/snapshot 검사를 한다.

이 확장은 다음 내용 회차 기준과 자체 완결 포장에 한정한다. publication-sync·정상 공개 이벤트·resolvedArtifacts 규약을 확대하지 않고 canPublish=false·공개증가0을 유지한다. Git 쓰기·새 publication proof·원 stopped publisher 재개 권한이 아니다.

정상 후속 전달의 독립 범위 제한 seal은 `sourceTree/sourceInventorySha256/sourceFiles/baseCommit`, `archives.{delta,complete}`, `freshlyRehashedRoots`, `smokes`, `scope`, `evidence`, `verifiedAt`으로 실제 archive와 검증 범위를 연결한다. 양쪽 smoke는 전체 corpus 미실행을 그대로 기록하고 원 영수증 SHA를 참조한다. recorder의 읽기 전용 필드 대응은 원 seal/업로드/native/checkpoint 바이트를 변경하지 않으며 공개 proof에는 그 정확한 해시만 남긴다. 실제 검증 시각·native 수락 시각·helper 완료 관측·현재 등록 시각을 구별하며 없는 서버 저장 시각을 생성하지 않는다. 독립 인증과 기존 전체 사슬·현재 eligibility 검사를 대체하지 않는다.

## 정상 전달 사슬의 별도 누적 공개 이벤트

`verified_normal_chain_publication`은 실제 전달·등록된 정상 root와 연속 successor를 별도 공개 사건으로 연결한다. `normal_delivered_checkpoint` source는 원 대장·은행·delta/manifest·proof 원문 SHA, 실제 attachmentAcceptedAt·verificationCompletedAt과 `attachmentReceiptSha256`를 보존한다. 이 해시는 private native receipt 원문의 해시이며 legacy receipt를 새로 만든다는 뜻이 아니다. 실제 사슬은 기존 normal root/chain loader가 인증한 sealed 결과로만 소속·연속 순서를 확인한다. 호출자 Map, 준비 proposal, 합성 fixture는 권한이 아니다.

직전 공개은행에서 시작해 정확한 적격 후보와 누적 수를 다시 계산하며 모든 전달 이력·보호 기록·원 trust prefix와 자신의 등록 proof를 payload에 보존한다. 마지막 등록 source의 검토된 public anchor가 payload parent이며 그 anchor의 전체 경로·정확한 공개 analysis를 보존하고 tip의 정확한 manifest·publication-state 바이트를 유지한다. 원 정상 공개 이벤트의 전체 Git tree·exact-head Pages·live 검사와 각 은행의 baseline→current 불변 전이 검사를 재사용한다. 모든 source 대장과 proof도 live에서 확인한다. 원래 not_attempted·공개0·canPublish=false·unknown·최초 불확실성/영구 중단과 두 ZIP은 바꾸지 않는다. 이 사건은 legacy resolvedArtifacts에 정상 전달 artifact를 넣거나 receipt를 조작하지 않는다.

아직 전달되지 않은 새 종결 은행은 이 경로에 섞지 않는다. 실제 두 첨부 수락·원본 증거 검증·독립 검토·현재 시각 등록을 먼저 마친 뒤 같은 source schema로 추가한다. 새 이벤트와 append-only pin은 실제 payload main·그 commit의 Pages 성공·live bytes 및 독립 검토 이후에만 등록한다. 그 지원 commit도 별도 Pages/live 확인이 필요하다. 이번 계약 자체는 현재 공개 증거나 Git 권한이 아니며 동결·cutoff·원 캠페인 한도를 유지한다.

## 정상 전달의 동일 Library 항목 교체 근거

전달 전 파일 크기 문제를 손실 없는 재압축으로 해결할 때 Library 항목을 새로 만들었다고 바꾸지 않는다. 기존 bounded seal과 동일한 source inventory/tree·manifest를 검증한 후속 seal은 실제 새 전체 ZIP과 그대로인 delta를 가리키고 원 seal 해시·검사 범위를 보존한다. 실제 변경된 전체 ZIP의 구조/바이트와 필요한 smoke만 새로 확인하며 재사용한 내용 검사를 새 실행으로 세지 않는다.

정상 successor reader는 원 두 create 결과와 실제 한 complete replacement의 요청/결과를 별도 원문으로 받는다. 원 create receipt의 rawResultSha256·helper 시각은 그대로이며, 추가 replacementUpload는 role·requestSha256·rawResultSha256·previousArchiveSealSha256·실제 helperExitCode/helperCompletionObservedAt을 결박한다. 같은 Library ID, 요청의 실제 이전 version, 실제 다음 version, 정확한 현재 ZIP/버전/xattrs와 원 delta를 함께 검사한다. 현재 두 item 행은 각각의 실제 결과에서 선택한 뷰이며 합성 raw tool response가 아니다. replace 목적을 create로 이름 바꾸지 않는다.

원 archive seal과 source가 같고 실제 새 seal·교체 완료·native 수락의 순서를 확인해야 한다. 최초 native 실패는 실패로 남기고 실제 수락만 별도 영수증으로 기록한다. 정상 upload receipt는 작성 시점의 사실에 따라 awaiting_parent_actual_response 또는 native_attachment_accepted를 허용한다. 이 상태만으로 수락을 추론하지 않으며 실제 별도 native 영수증·message/IDs·시각 검사 조건은 그대로이고 과거 receipt 원문은 바꾸지 않는다. 없는 server savedAt이나 사용자 다운로드를 만들지 않는다. 공개 successor proof 스키마는 같으며, 추가 private 근거는 기존 receipt/seal SHA를 통해 연결한다. 원 전달 ZIP/source·기존 proof·trust prefix는 소급 수정하지 않는다.

## 전체 7z 외피 계약 (complete v2, packaging-policy-002, 2026-10-08)

2026-10-08 명시 승인 이후 새 기본 전달 pair는 complete v2/7z와 기존 delta/ZIP이다. 이전 `complete v1, packaging-policy-001` 절은 당시 ZIP 계약과 정확한 역사적 증거에 계속 적용한다. 문서·지원 코드의 포장 개정은 새 은행/문항/학습 기록 스키마 개정이 아니며 원 runtime·은행·closed 대장·ZIP·manifest·proof·영수증 바이트를 바꾸지 않는다.

### 형식 선언과 실제 컨테이너

- 새 전체 manifest는 기존 complete 필드에 `archiveFormat`만 추가한 정확한 집합을 갖는다: `schemaVersion`, `archiveFormat`, `kind`, `deliveryMode`, `newlyPublishedRegular`, `projectDirectory`, `prerequisiteArtifacts`, `sourceRelease`, `frozenSourceInventory`, `packagingRevision`, `files`
- 새 값은 `schemaVersion:2`, `archiveFormat:'7z'`다. `kind:'complete_project_not_learner_import'`, `projectDirectory:'project'`, `prerequisiteArtifacts:[]`, `newlyPublishedRegular:0`과 기존 `download_only`/`release_backup` 경계를 유지한다. 알 수 없는 필드·형식 조합은 거부한다
- 역사적 complete `schemaVersion:1`은 암묵적으로 ZIP이며 `archiveFormat`을 덧붙이지 않는다. ZIP 선언으로 7z를, 7z 선언으로 ZIP을 수용하지 않는다. 기존 v1의 정확한 파일·manifest·receipt 해시는 그대로 검증한다
- delta는 ZIP 전용이며 기존 manifest 스키마를 바꾸지 않는다. 정상 `release_backup` delta의 v1과 기존 offline continuation delta의 v2를 complete 외피 v2와 혼동하지 않는다
- `scripts/archive-format.mjs`는 확장자나 호출자 Boolean 대신 실제 archive 바이트로 형식을 판별한 뒤 내부 manifest 선언을 대조한다. 지원하지 않는 magic, 손상 또는 선언 불일치는 실패로 종료한다. 한 형식의 실패를 다른 형식으로 추측 재시도하여 수용하지 않는다

### 전체 파일과 출처 보존

`sourceRelease`, `frozenSourceInventory`, `packagingRevision`, `files`의 의미·원 hash 연결은 기존 complete 계약과 같다. `files`는 `{path,sha256,bytes}`의 정확한 전체 공개 inventory이며 실제 해제된 `project/<path>`의 경로·크기·SHA-256과 같아야 한다. `manifest.json`·`APPLY-KO.txt` 외에 검사되지 않은 payload를 허용하지 않는다. 포함 파일 추가/누락·빈 경로·unsafe path·대소문자 충돌·중복·symlink·특수 파일·금지된 개인/비공개 자료를 거부한다.

전체 archive는 일반 해제 도구로 빈 폴더에 한 번 해제하는 단일·비암호화 7z다. 이전 archive·순차 delta·맞춤 재구성 프로그램 없이 전체 프로젝트 파일을 제공해야 한다. 선행 delta/사슬 해시는 provenance이며 설치 조건이 아니다. 앱·설정·검사/스크립트·문서·모든 필요한 불변 은행·closed 대장과 공개 가능한 전달/공개 이력은 생략하지 않는다. 용량 절감을 이유로 원 콘텐츠를 편집하거나 기록을 삭제하지 않는다.

`packagingRevision`은 검토된 지원 경로와 정확한 before/after hash만 허용한다. 이 개정의 별도 요약은 `docs/packaging/packaging-policy-002.md`이며 넓은 디렉터리 권한이나 모든 문서의 변경 허가가 아니다. 기존 데이터·runtime·원 ledger/proof/receipt의 변경, 불변 파일 삭제·이름 교체, trust prefix 재작성은 포장 overlay로 허용하지 않는다.

### 검증과 증거 경계

ZIP/7z 모두 실제 CRC·압축/해제 크기·전체 파일 SHA-256과 정확한 허용 목록을 검사한다. 7z reader는 제한된 지원 profile만 읽고 header·metadata·파일 수·개별/총 해제 크기·dictionary의 자원 한도를 적용한다. 암호화·분할·비지원 coder/구조·과도한 자원 선언·손상은 거부한다. 검증 한도는 포장 지원 코드의 안전 경계이며 플랫폼 첨부 한도와 다르다.

`ARCHIVE_LIMITS`의 상한은 archive 128 MiB, 개별 파일 32 MiB, 총 해제 바이트 512 MiB, entry 4,096개, header/metadata 2 MiB, LZMA2 dictionary 64 MiB다. byte 한도는 각각 1 MiB=1,048,576바이트로 계산한다. 이 값 이하라도 경로·정확한 manifest·CRC/SHA·허용 profile 검사가 실패하면 거부한다. 한도 변경은 검토된 코드·음성 검사·계약 개정을 함께 필요로 한다.

`freezeCompleteProject`는 새 기본 7z snapshot을 만들고 `writeCompleteArchive`가 실제 전체 archive를 생성한다. 명시적 `writeCompleteZip`은 v1/ZIP 호환 경로다. 사슬 검증 API의 역사적 `completeZip` 인자명은 Buffer의 실제 형식과 별개이며 실제 magic과 내부 manifest를 검증한다. 기존 source·current 동결, cutoff·eligibility·전체 캠페인·격리/발행 차단·원 사슬 검사를 유지한다. 형식 호환성은 전달 성공이나 새 사슬 등록 권한이 아니다.

일반 도구로 해제한 전체본과 자기 정확한 base에서 재구성한 delta를 각각 검토 source 전체 inventory와 대조하고 필요한 smoke를 실제 실행한다. 종결 소스 검사 재사용은 `validation-efficiency-001`의 독립 인증·정확한 전체 입력과 환경·종결 증거를 만족해야 하며 미실행 corpus를 archive 내 실행으로 세지 않는다. 선언·파일 hash·caller pass만으로 외부 서비스 수락·독립 검토·실제 일반 도구 해제를 증명하지 않는다.

전달 증거에는 실제 artifact의 형식·정확한 바이트 수·SHA-256·manifest SHA와 Library 저장 및 각 native 첨부 수락을 연결한다. 기존 receipt/proof의 스키마를 소급 바꾸지 않고 해당 경로가 허용하는 append-only 사건으로 기록한다. 20 MiB(20,971,520바이트)는 현재 관측 기반 운영 점검선이며 공식 보편적 한도나 전달 보장 필드가 아니다. 저장 성공만으로 `delivered`를 선언하지 않는다. 원 실패·unknown·미실시·공개 수0을 그대로 유지하며 사용자 열람/다운로드·Git/Pages 반영은 별도 증거가 필요하다.

### 실제 구조화 bounded seal의 읽기 전용 호환

정상 후속 reader는 역사적 `freshlyRehashedRoots` 객체 배열·`smokes` 배열 view와, 원래 문자열 root 배열·`smokes.{complete,delta}`·`sourceEvidence`·`unresolvedBlockingFindings`로 작성된 구조화 view를 별도로 판별한다. 구조화 표지 중 하나라도 있으면 정확한 구조화 필드 집합을 요구한다. 누락·혼합 alias·알 수 없는 schema/필드·범위 승격은 실패하며 과거 view로 재시도하지 않는다. 원 seal에 새 필드나 ZIP 검증 주장을 삽입하지 않는다.

구조화 view의 `supportingEvidence`는 원 경로를 키로 하고 원 Buffer를 값으로 하는 명시적 Map이다. reader는 seal의 경로를 자동으로 열거나 기록된 명령을 실행하지 않는다. 모든 참조의 실제 크기·SHA-256, 7z profile의 entry/manifest/codec/자원 한도, source·base inventory와 Git tree, 정확한 before/after delta 재구성, 종결 source 명령·로그·runner·runtime 및 두 smoke의 원 receipt/로그/전체 snapshot을 대조한다. source build는 자신의 embedded-runtime bounded terminal 계약을 유지하고 다른 source runner의 중복 필드를 만들어 넣지 않는다. base root의 파일 수를 새 전체 source 수로 바꾸지 않는다.

DELTA와 역사적 COMPLETE ZIP에는 CRC·local/central 일치·span/후행 바이트·경로 검사를 요구한다. 실제 v2/7z COMPLETE에는 원 CRC/header/resource profile과 일반 도구의 빈 폴더 단일 해제·regular-file/경로 증거를 요구하고 ZIP 전용 alias는 거부한다. 실제 raw decoder와 내부 manifest가 형식·내용의 정본이며 선언된 pass로 대체하지 않는다. 7z를 약한 schema1 영수증 분기로 보내지 않는다.

`inspectNormalBackupBoundedArchiveEvidence`는 위 원본 검증만 수행하며 `deliveryVerified:false`, `canPublish:false`와 원 scope/limitations를 반환한다. 기존 전달 inspector/preparer에 추가한 `supportingEvidence`는 이 구조화 view에서만 필수다. native 수락·업로드·checkpoint·현재 등록/eligibility와 독립 검토는 별도 기존 조건이며 이 함수는 receipt, proof, pin을 생성하거나 바꾸지 않는다. archive/역사 전체 corpus 미실행, UI·Windows/NVDA 등 잔여 제한을 pass로 바꾸지 않는다.

증거 참조는 구조의 모양을 탐색해 추정하지 않고 명시된 reference slot에서 읽는다. 각 descriptor는 정확히 `path/bytes/sha256`만 허용하며 추가 metadata가 있거나 원 Buffer가 없으면 거부한다. structured source/smoke record, 원 terminal/started record, 명령, inventory/snapshot, runtime/environment, archive/profile의 지원된 필드 집합도 엄격히 검사한다. 새로운 schema·`callerVerified`·별칭으로 참조 인증을 생략할 수 없다. 이 검사는 이전 미지원 형식을 조용히 수용하는 확장이 아니며 원본 바이트를 새 계약에 맞추어 고치지 않는다.

## 검증된 선행 공개를 거친 정상 후속 전달 anchor

기존 정상 successor의 같은 공개은행·additive analysis 전이 계약은 그대로다. 별도 `anchorTransition.kind: verified_normal_chain_ancestor_publication`만 원래 전달 anchor에서 실제로 공개 확인된 동일 정상 사슬의 선행 은행을 거쳐 새 공개 head로 이동할 수 있다. 이전 proof·delta·대장의 sourceCommit, 실제 시작/마감/종결·검토 이력·최초 unknown과 등록 시각을 바꾸지 않는다. 새 source 대장의 내용 기준은 원래 정확한 offlinePredecessor이고, 새 archive의 delta 기준은 실제 관측한 새 공개 commit이다.

새 전이는 정확한 원 anchor 원문 해시와 `verified_normal_chain_publication_ancestry` 증거를 결박한다. 증거는 원 anchor와 최종 head, 실제 head 관측 시각/응답 해시, 빠짐없는 단일-parent commit 경로, 각 commit의 전체 bytes/SHA-256/Git blob inventory와 tree, 실제 commit 관측 시각/요청·응답 해시, 기존 publication pin 목록을 포함한다. 중간 payload는 이미 가져온 정확한 publication 이벤트의 commit/parent/tree/전체 inventory와 같아야 한다. 그 source들은 검증된 원 정상 전달 사슬의 중복 없는 선행 구성원이어야 한다.

지원 commit은 해당 payload 바로 뒤의 정확한 publication JSON·publication-sync pin·allowlist 3경로 등록에 한정한다. 다른 외부 변경이나 삭제는 이 경로에서 거부한다. 지원 commit 자신의 exact-head Pages 성공, payload 검증 뒤의 Pages 완료, 필수 3경로·manifest·publication-state·active bank의 실제 HTTP200 길이/해시와 완료 시각을 별도로 결박한다. 마지막 head 관측과 앞선 commit 읽기·Pages/live 관측은 실제 서로 다른 시각을 유지한다. 알고 있는 event와 anchor marker 원문은 Git blob SHA까지 대조한다.

정상 successor의 실제 두 archive 저장/첨부·독립 검토·전체 archive/내용 검사·정확한 predecessor 등록 eligibility는 모두 기존 경로로 검증한다. 닫힌 대장만으로 전달 자격을 추론하지 않으며 새 전이는 전달 proof나 pin을 자체 등록하지 않는다. 원 후보 시작/종결은 원 마감 안이고 선행 등록 eligibility 뒤여야 한다. 새 모듈은 standalone snapshot의 필수 의존성이다. raw 관측 해시는 외부 사실을 독립 검토할 근거이며 caller Boolean, 임의 Map, 합성 테스트나 로컬 성공이 그 검토를 대체하지 않는다.

이 확장은 정상 후속 전달의 archive 기준 이동에 한정한다. 기존 normal-publication과 normal-chain-publication의 시작/parent guard, publication-sync 이벤트 종류·pin 및 legacy resolvedArtifacts는 확대하지 않는다. 이 archive 전이 확장 자체는 Git 공개 이벤트를 구현하지 않는다. 별도 공개 event의 명시 ancestry 계약은 아래 「등록된 선행 공개 전이를 결박하는 정상 사슬 공개 이벤트」 절을 따르며, 원 전달 proof의 canPublish=false·포장 공개증가0·최종 동결과 원 publisher 영구 중단은 유지한다.

## 등록된 선행 공개 전이를 결박하는 정상 사슬 공개 이벤트

새 `verified_reconciled_normal_chain_publication`은 기존 정상 사슬 source 형식과 전체 공개 검사를 유지하고, 정확한 `reconciliation` 필드만 추가하는 별도 종류다. 기존 `verified_normal_publication`과 `verified_normal_chain_publication`의 원 source 시작 시각·payload parent 조건은 바뀌지 않는다. 이전 대장, 공개 event, 전달 proof, pin 또는 archive에 새 필드를 소급 추가하지 않는다.

reconciliation은 schemaVersion1, kind `registered_normal_chain_ancestor_publication`, `transitionProof`, `sourceWindows`, `parentObservation`, `refUpdate`의 정확한 필드만 가진다. transitionProof의 path/SHA는 현재 가져온 정상 successor trust의 원문 proof와 같아야 하고, 그 proof에 이미 독립 등록된 `verified_normal_chain_ancestor_publication` 전이가 있어야 한다. 그 전이의 마지막 기존 publication pin이 바로 이번 event의 previousSynchronizationSha256다. 새 event의 source는 같은 원래 정상 사슬의 연속 등록 suffix이며 전이 source를 포함한다. 첫 source의 정확한 전달 선행은행이 직전 공개은행이고 마지막 source의 검토된 anchor가 실제 payload parent다.

sourceWindows의 각 roundId·startedAt·decisionDeadline·closedAt·predecessorEligibleAt은 원문 대장과 실제 직전 proof의 등록 시각에 정확히 대응한다. source는 원 선행 등록 이후 시작하고 원 최대4시간/판정 마감 안에 종결되어 실제 전달·등록을 마쳐야 한다. 선행 공개 확인보다 빠른 시작은 등록된 전이 이전의 정확한 역사 anchor prefix에 허용한다. 별도 좁은 경우로, 공개 suffix의 첫 source 자신이 등록된 전이 source이고 정확한 전달 선행은행이 직전 공개은행인 경우만 허용한다. 이 경우에도 원 sourceCommit은 전이 전 역사 anchor이고, 원 offlinePredecessor·시작 전 선행 등록 eligibility·판정 마감·검토 이력은 그대로다. 자기 proof의 새 anchor는 전이가 결박한 실제 후속 공개 anchor와 정확히 같아야 하며, 전이 뒤의 다른 조기 source에는 이 경우를 적용하지 않는다. 선행 공개 확인 당시 후보 검토 중이었더라도 원 시작·자기 판정 마감·종결·선행 eligibility와 실제 후속 archive/등록 chronology를 모두 지킨 source는 허용하며, 종결을 선행 공개 확인 이전으로 앞당기거나 요구하지 않는다. 시각·sourceCommit·offlinePredecessor·최대 검토/재개방 횟수는 바꾸지 않으며 닫힌 대장만으로 전달 자격을 추론하지 않는다. 관련 없는 미래 등록을 과거 event의 필수 의존성으로 만들지 않는다.

parentObservation은 정확한 repository·refs/heads/main·commit·tree·전체 bytes/SHA-256/Git blob inventory, 실제 head/commit/tree/manifest/publication-state 각각의 관측 시각과 원 응답 해시를 결박한다. 전부 actual ref 제출 전60초 이내여야 한다. 현재 parent와 전체 inventory는 등록된 전이의 마지막 실제 공개 anchor와 같아야 하며 다른 head나 외부 변경은 별도 검토 없이 허용하지 않는다. refUpdate는 같은 repository/ref, 실제 expectedSha·결과 commit SHA, force:false, 실제 제출/완료 시각 및 요청/응답 해시를 담는다. 모든 source 등록과 원래 선행 관계가 이 boundary 전에 성립하고 ref 완료 뒤에만 event를 확인한다.

전체 campaign과 기존 sealed normal-chain loader를 거친 source membership 단계에서 변경하지 않은 `validateNormalChainAncestorTransition`을 다시 적용한다. caller Boolean/Map 또는 새 event 선언으로 사슬을 인증하지 않는다. 기존 normal-chain parent==tip anchor guard, 전체 Git tree, 원 은행 전이·적격/격리/신규 공개 수, 모든 immutable/외부 지원 경로, trust prefix, runtime·은행·source 대장·proof·두 동결 marker의 live 검사도 그대로다. 최종 cutoff와 영구 freeze는 우회하지 않는다.

이 필드들은 실제 외부 관측에 대한 독립 검토를 위한 결박이며 서비스 서명 검증이나 로컬 쓰기 권한이 아니다. 실제 성공한 payload main, exact-head Pages/live를 확인한 후에만 별도 event/pin을 검토·등록한다. 그 지원 commit은 자기 Pages/live 확인이 필요하다. 원 stopped publisher·결과 불명 blob·최초 시계·공개0·canPublish:false는 보존하며 legacy resolvedArtifacts에 정상 artifact를 넣지 않는다.
