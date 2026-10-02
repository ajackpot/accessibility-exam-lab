# 데이터 계약 v2 (앱 0.2.2)

기계적으로 실행되는 정식 검증기는 `src/domain.js`의 `validateBank` 및 `src/backup.js`의 `validateSession`입니다. `node scripts/validate-bank.mjs <bank.json>`으로 전체 묶음을 검사합니다. 출제와 채점에 사용하지 않는 추가 메타데이터는 보존할 수 있습니다. 스키마 변경은 앱 호환성 검토 후 별도로 합니다.

## 은행 JSON

- 신규 은행은 `schemaVersion: 2`; 호환성 읽기는 `1`도 허용합니다. 세션·백업·manifest 외피 버전은 계속 `1`입니다
- `bankVersion`: ASCII 안정 버전 ID, `releasedAt`: ISO 시각
- `syllabusVersion`, `changeSummary`
- `subjects`: `{id,name}`. 필기 `s1` 표준, `s2` 인터넷, `s3` HTML, `s4` CSS/스크립트, `s5` 정보접근성
- `sources`: `{id,title,url,version,checkedAt,location,evidence,rights}`. 원문 기관·주소·판/시행일·확인일·절/쪽·근거와 재사용 설명
- `options`: `{optionId,revision,content,explanation,equivalenceGroupId?}`. 전역 정답 여부를 두지 않음
- `questions`: 아래 문항 객체
- `corrections`: 명시적 정정 목록. 기본 `[]`

## 모든 문항

`questionId`, `revision`, `templateId`, `learningGoalRevision`, `type: written|practical`, `subjectId`, `topicIds`, `stem`, `explanation`, `sourceRefs`, `verificationStatus: candidate|reviewed|published|retired|invalid`, `testOnly`, `standardVersion`, `difficulty`, `reviewNote`를 둡니다.

published만 출제합니다. published에는 근거 검토·독립 풀이 기록이 필요합니다. 첫날의 모든 문항은 `testOnly: true`입니다. candidate와 reviewed를 개수 채우기 위해 공개하지 마세요. `materials`는 `{filename,content,purpose,instruction?,focusLine?}` 배열이며 실행 파일이 아닌 텍스트입니다.

### 코드 자료 역할과 공개 시점

- `purpose: "question"`: 지문이 사용하도록 지시하는 코드 읽기·빈칸 완성·위반 점검 자료입니다. `instruction`에는 해당 지시가 들어 있는 지문의 정확한 비어 있지 않은 구절을 저장합니다. schema2 검증기는 이 구절이 stem에 있는지 확인합니다. 지시가 실제로 해당 자료를 요구하는지, 정답·완성 예시를 문제 자료로 잘못 분류하지 않았는지는 의미 검토에서 확인합니다. 코드 문법·키워드나 문항 유형으로 역할을 추측하지 않습니다
- `purpose: "explanation"`: 정답 예시·풀이 설명 코드입니다. 채점 완료와 세션의 해설 공개 정책을 모두 충족한 뒤 해설을 열 때만 표시합니다. 채점 전, 시간제 진행 중, 종료 후 해설 설정의 진행 중 화면에는 textarea·파일 선택·줄 이동·복사·별도 줄 번호 보기 자체를 만들지 않습니다. 숨김 CSS만으로 처리하지 않습니다
- 혼합 자료는 역할별로 분리하고 코드 컨트롤의 DOM ID도 구분합니다. 문제 자료는 계속 풀 수 있도록 유지하며 해설 자료가 같은 파일 선택 목록에 섞이지 않습니다
- 독립 AI 자료에는 문제용 자료만 포함합니다. 기준 비교용의 참고 정답·루브릭·정답 키·해설 코드는 해설을 볼 수 있는 시점부터 허용하며 직접 함수 호출에서도 검증합니다. 시간제 진행 중에는 두 내보내기 모두 금지합니다

### schema1 / 저장된 스냅샷 호환

기존 스냅샷·정답·순서·점수·해시를 수정하거나 새 은행 내용으로 교체하지 않습니다. 새 스냅샷에만 `bankSchemaVersion`을 저장하고 백업 검증에 사용합니다. 이 필드가 없는 이전 스냅샷은 schema1로 검증합니다.

`purpose`가 없으면 기본적으로 해설용입니다. 예외는 `src/legacy-materials.js`에 명시된 은행 `2026.10.02-seed.1`의 revision1 원본뿐이며 은행·문항ID·revision·stem·filename·content·focusLine이 모두 같아야 합니다. `seed-w05`는 해설용, `seed-w07`, `seed-w08`, `seed-p01`~`seed-p04`는 문제용으로 검토했습니다. 다른 revision·내용·파일명·지문에는 적용하지 않습니다. 알려지지 않은 자료는 목적 확인 전 공개하지 않고, 풀이에 필요하면 건너뛰거나 새 은행으로 연습을 준비하도록 안내합니다. 이는 읽기 시 표시 정책이며 저장 자료의 자동 마이그레이션이 아닙니다.

문장/정답/조건 변경 시 revision을 올리고, 학습 목표나 정답 판단이 달라지면 learningGoalRevision도 올립니다. 단순 보기 순서·조합 변경은 templateId를 새로 부여하지 않습니다.

## 필기

- `optionMode: exclusive|shared`
- `supportedOptionCounts: [4,5]` 또는 출제 가능한 부분집합
- `links: [{optionId,optionRevision,role:correct|distractor,contextExplanation,compatibilitySetId}]`

links가 소속 관계의 단일 원본입니다. 역방향 memberQuestionIds는 생성 결과이며 앱은 links에서 도출합니다. 전용 보기는 하나의 문항에만 연결할 수 있습니다. 공유 보기의 공통 해설과 각 문맥에서 왜 정답/오답인지 모두 저장합니다. 화면은 앞뒤·연속 공백을 정규화한 두 해설이 같으면 한 문단만 표시하고, 한쪽만 비어 있으면 남은 문단만 표시하며, 둘 다 비어 있으면 빈 제목도 표시하지 않습니다. 서로 다르면 공통 해설과 이 문제에서라는 구분을 유지합니다. 대소문자·Unicode 호환 문자·코드의 의미를 바꾸는 정규화는 하지 않습니다. 저장된 해설은 수정하지 않습니다.

같은 compatibilitySetId는 함께 섞어도 단일 정답임을 검토자가 확인한 그룹입니다. 정답 후보 한 개만 선택하고 나머지 정답 후보는 제외합니다. 같은 문구(NFKC·공백 정규화)와 같은 equivalenceGroupId를 동시에 표시하지 않습니다. 동등 구현/의미 중복은 콘텐츠 검토에서 반드시 그룹을 지정합니다. 부족하면 출제를 거부하며 임의 오답을 보충하지 않습니다. 순서 의존 보기(위의 모두, ①과③ 등)는 사용하지 않습니다.

한 문항 연결은 최대 1000개, 정답 후보는 최대 64개입니다. 대형 풀은 문항/호환 그룹으로 나누세요. 하나의 거대한 조합표를 펼치지 않습니다. 단일정답 구조 검사는 의미적 정답성의 증명이 아닙니다.

## 실기

- `subjectId: practical`, `family: implementation|inspection`
- `parts`: `{partId,prompt,kind,points,explanation}`
- single/multi: `choices:[{id,text}]`, `correct:[id]`. single은 한 개, multi는 집합 완전 일치
- text: `accepted:[string]`, `normalization:trim|exact`. trim은 앞뒤 공백만 허용하며 대소문자와 내부 공백은 유지
- `referenceAnswer`, `rubric:[{criterion,points,description}]`, `freeResponsePrompt`

각 part는 독립 배점입니다. 자동 판정 기준과 외부 서술 평가용 rubric을 구분합니다. 자유 서술 전체를 문자열로 채점하지 않습니다.

## 세션·통계

준비 시 실제 본문·자료·보기 내용/순서·정답·해설·출처·버전을 PresentedItem으로 복제합니다. 난수 seed만 저장하는 복원은 금지합니다. 상태는 prepared, active, submitted, expired, abandoned, converted입니다. revision을 사용한 트랜잭션 비교 후에만 저장 성공을 알립니다.

답은 안정 ID로 저장합니다. 무제한의 확정 attempt는 문항별 한 번이며 재시도는 새 세션입니다. 시간제의 submitted/expired만 모든 문항 attempt를 만듭니다. 중단·전환 시간제는 점수를 만들지 않습니다. 확정 전 도움 자료, 앞 세션의 해설 노출, 테스트 시드, 미채점 서술은 일반 최초 시도와 분리합니다.

정답률은 정답/응답, 세트 점수는 획득점수/전체 채점배점입니다. 분모 0은 계산할 기록 없음입니다. 무제한 종료의 미확정 문항은 세트에서 미응답이나 시도 통계에는 추가하지 않습니다. 시간 통계는 시간제에서만 존재합니다.

## 업데이트와 정정

manifest: `{schemaVersion,bankVersion,releasedAt,file:'releases/<version>/bank.json',sha256,changeSummary,finalRelease}`. 모든 파일 해시/구조/호환성을 확인한 뒤 IndexedDB의 한 bank 값에 원자 저장합니다. 실패 시 이전 값이 유지됩니다. 기존 세션 스냅샷은 변하지 않습니다.

정정: `{questionId,revision,kind:'invalid'|'key',reason,effectiveAt}`. key는 `snapshotHash`와 `correctOptionId`도 필수입니다. `snapshotHash(item)`는 당시 지문·자료·표시된 보기 ID/개정판/내용/순서를 SHA-256으로 묶습니다. 정확히 일치하는 동일 스냅샷의 명백한 키 오류에만 조정 결과를 냅니다. invalid는 조정 분모와 현재 통계에서 제외합니다. 원래 저장된 결과는 덮어쓰지 않습니다.

## 백업

`{format:'accessibility-exam-lab-backup',schemaVersion:1,exportedAt,sessions:[...]}`. JSON만 허용하며 10MB·1000세션 한도입니다. 스냅샷과 원래 점수의 재계산 일치, 답 ID, 필수 날짜/상태, 안전한 출처 URL을 검사합니다. `__proto__`, `constructor`, `prototype` 키는 거부합니다. 문자열을 HTML로 실행하지 않습니다. 중복 ID 내용이 다르면 합치기에서는 기존 세션을 유지하고 충돌 수를 알립니다. 교체는 확인 후 한 트랜잭션으로 합니다.

내보내기는 세션 단위로 크기/개수 한도 내 파일을 나눕니다. 각 파일은 일반 가져오기에 독립적으로 사용할 수 있으며 안정 ID로 중복을 막습니다. 단일 세션이 한도를 초과하면 절대 잘라내지 않고 원문 보존 전용·현재 앱 복원 불가를 파일 이름과 화면에서 명시합니다. 원본 브라우저 기록을 삭제하지 말아야 합니다.
