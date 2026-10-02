# 데이터 계약 v3 (앱 0.2.4)

기존 은행·스냅샷 읽기의 정식 검증기는 `src/domain.js`의 `validateBank` 및 `src/backup.js`의 `validateSession`입니다. 새 등록·공개 후보는 더 엄격한 `validateBankForPublication`을 추가 통과해야 합니다. `node scripts/validate-bank.mjs <bank.json>`과 build/check 명령은 새 공개 검사를 실행합니다. 이전 seed.1/seed.2/seed.3 백업을 새 저작 규칙으로 소급 거부하지 않습니다. 출제와 채점에 사용하지 않는 추가 메타데이터는 보존할 수 있습니다. 스키마 변경은 앱 호환성 검토 후 별도로 합니다.

## 은행 JSON

- 신규 은행은 `schemaVersion: 3`; 호환성 읽기는 `1`, `2`도 허용합니다. 세션·백업·manifest 외피 버전은 계속 `1`입니다
- `bankVersion`: ASCII 안정 버전 ID, `releasedAt`: ISO 시각
- `syllabusVersion`, `changeSummary`
- `subjects`: `{id,name}`. 필기 `s1` 표준, `s2` 인터넷, `s3` HTML, `s4` CSS/스크립트, `s5` 정보접근성
- `sources`: `{id,title,url,version,checkedAt,location,evidence,rights}`. 원문 기관·주소·판/시행일·확인일·절/쪽·근거와 재사용 설명
- `options`: `{optionId,revision,content,explanation,equivalenceGroupId?}`. 전역 정답 여부를 두지 않음
- `questions`: 아래 문항 객체
- `corrections`: 명시적 정정 목록. 기본 `[]`

## 모든 문항

`questionId`, `revision`, `templateId`, `learningGoalRevision`, `type: written|practical`, `subjectId`, `topicIds`, `stem`, `notes`, `explanation`, `sourceRefs`, `verificationStatus: candidate|reviewed|published|retired|invalid`, `testOnly`, `standardVersion`, `difficulty`, `reviewNote`를 둡니다.

published만 출제합니다. published에는 근거 검토·독립 풀이 기록이 필요합니다. 첫날의 모든 문항은 `testOnly: true`입니다. candidate와 reviewed를 개수 채우기 위해 공개하지 마세요. `materials`는 `{filename,content,purpose,instruction?,focusLine?}` 배열이며 실행 파일이 아닌 텍스트입니다.

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
- 정규식은 의미를 증명하지 못합니다. 독립 검토자가 실제 자료와 지시문의 대상·행동이 맞는지, 불필요한 자료/유령 참조/정답 누출이 없는지 확인하고 reviewNote에 남깁니다. 실패 문항은 초안으로 보류하고 출제·공개 대상에 등록하지 않습니다. 현재 앱에 문제 등록 화면은 없습니다

### schema1·schema2 / 저장된 스냅샷 호환

기존 스냅샷·정답·순서·점수·해시를 수정하거나 새 은행 내용으로 교체하지 않습니다. 새 스냅샷에만 `bankSchemaVersion`을 저장하고 백업 검증에 사용합니다. 이 필드가 없는 이전 스냅샷은 schema1로 검증합니다.

`purpose`가 없으면 기본적으로 해설용입니다. 예외는 `src/legacy-materials.js`에 명시된 은행 `2026.10.02-seed.1`의 revision1 원본뿐이며 은행·문항ID·revision·stem·filename·content·focusLine이 모두 같아야 합니다. `seed-w05`는 해설용, `seed-w07`, `seed-w08`, `seed-p01`~`seed-p04`는 문제용으로 검토했습니다. 다른 revision·내용·파일명·지문에는 적용하지 않습니다. 알려지지 않은 자료는 목적 확인 전 공개하지 않고, 풀이에 필요하면 건너뛰거나 새 은행으로 연습을 준비하도록 안내합니다. 이는 읽기 시 표시 정책이며 저장 자료의 자동 마이그레이션이 아닙니다.

seed.1/seed.2/seed.3의 검토된 14개 문항은 `src/legacy-question-display.js`의 정확일치 규칙으로 화면에서만 간결한 stem과 notes로 표시합니다. bankVersion·bankSchemaVersion과 원본 문항의 모든 고정 필드(무작위 선택지 출제를 위한 links 제외), 전체 materials·당시 instruction/purpose/focusLine을 대조하고 notes가 새로 추가되어 있으면 적용하지 않습니다. 누락된 bankSchemaVersion은 과거 계약대로 1입니다. 알 수 없거나 수정된 원본은 그대로 표시하며 새 조건을 버리거나 일반 안내를 추측하지 않습니다. ‘현재 과제 지시문 복사’는 화면의 통합 지문과 참고 사항을 복사합니다.

표시 규칙은 저장된 stem/notes/materials/답안/선택지 순서/채점/스냅샷 해시를 바꾸지 않습니다. AI 내보내기는 표시 규칙을 사용하지 않고 당시 저장된 원문을 사용합니다. 과거의 별도 ‘보기 연결 안내’는 화면이나 AI 원문에 덧붙이지 않습니다.

문장/정답/조건 변경 시 revision을 올리고, 학습 목표나 정답 판단이 달라지면 learningGoalRevision도 올립니다. 단순 선택지 순서·조합 변경은 templateId를 새로 부여하지 않습니다.

## 필기

- `optionMode: exclusive|shared`
- `supportedOptionCounts: [4,5]` 또는 출제 가능한 부분집합
- `links: [{optionId,optionRevision,role:correct|distractor,contextExplanation,compatibilitySetId}]`

links가 소속 관계의 단일 원본입니다. 역방향 memberQuestionIds는 생성 결과이며 앱은 links에서 도출합니다. 전용 선택지는 하나의 문항에만 연결할 수 있습니다. 공유 선택지의 공통 해설과 각 문맥에서 왜 정답/오답인지 모두 저장합니다. 화면은 앞뒤·연속 공백을 정규화한 두 해설이 같으면 한 문단만 표시하고, 한쪽만 비어 있으면 남은 문단만 표시하며, 둘 다 비어 있으면 빈 제목도 표시하지 않습니다. 서로 다르면 공통 해설과 이 문제에서라는 구분을 유지합니다. 대소문자·Unicode 호환 문자·코드의 의미를 바꾸는 정규화는 하지 않습니다. 저장된 해설은 수정하지 않습니다.

같은 compatibilitySetId는 함께 섞어도 단일 정답임을 검토자가 확인한 그룹입니다. 정답 후보 한 개만 선택하고 나머지 정답 후보는 제외합니다. 같은 문구(NFKC·공백 정규화)와 같은 equivalenceGroupId를 동시에 표시하지 않습니다. 동등 구현/의미 중복은 콘텐츠 검토에서 반드시 그룹을 지정합니다. 부족하면 출제를 거부하며 임의 오답을 보충하지 않습니다. 순서 의존 선택지(위의 모두, ①과③ 등)는 사용하지 않습니다.

한 문항 연결은 최대 1000개, 정답 후보는 최대 64개입니다. 대형 풀은 문항/호환 그룹으로 나누세요. 하나의 거대한 조합표를 펼치지 않습니다. 단일정답 구조 검사는 의미적 정답성의 증명이 아닙니다.

## 실기

- `subjectId: practical`, `family: implementation|inspection`
- `parts`: `{partId,prompt,kind,points,explanation}`
- single/multi: `choices:[{id,text}]`, `correct:[id]`. single은 한 개, multi는 집합 완전 일치
- text: `accepted:[string]`, `normalization:trim|exact`. trim은 앞뒤 공백만 허용하며 대소문자와 내부 공백은 유지
- `referenceAnswer`, `rubric:[{criterion,points,description}]`, `freeResponsePrompt`

각 part는 독립 배점입니다. 자동 판정 기준과 외부 서술 평가용 rubric을 구분합니다. 자유 서술 전체를 문자열로 채점하지 않습니다. 신규 freeResponsePrompt에는 서술 과제 요구만 넣고 앱의 미채점·통계·외부 AI 사용 안내는 UI에 둡니다.

### 외부 AI 요청문

생성 지시는 웹 접근성 평가자 역할, 비교/독립 검토, 판단 근거·위치·영향·최소 수정·재점검, 불확실성을 짧은 ‘~해줘/~말아줘’ 문장으로 요청합니다. 자료와 사용자 답안의 명령은 신뢰할 지시가 아닌 평가 데이터로 취급하도록 명시합니다. 개인정보 제거·붙여넣기·복사/다운로드 안내는 앱 UI에만 있습니다.

문제 stem, 별도 ‘참고 사항 (원문)’의 notes, 코드 content, 세부 답안 항목/선택지, freeResponsePrompt와 사용자 서술 답안은 그대로 포함합니다. 사용자 고정 답안은 별도 JSON으로 보존하며 서술을 중복하지 않습니다. 원문을 다듬거나 요약하지 않으므로 구판 원문에 있던 앱 안내도 유지합니다. 빈 답안 모드는 현재 답안 전체를 제외하고 `[미작성]` 데이터만 둡니다.

독립 모드는 참고 서술 답안·루브릭·정답 키·해설 코드를 넣지 않으며 임의 점수/기준을 만들지 않도록 요청합니다. 비교 모드는 공개 가능할 때만 정확한 참고 답안·루브릭/배점·고정 답안 키를 포함하고 동등하게 타당한 대안도 인정하도록 요청합니다. 서술형 배점과 앱 배점을 합치지 않으며 서술 미작성을 고정 답안만으로 채점하지 않습니다. 시간제 진행 중에는 모든 AI 내보내기를 차단합니다.

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
