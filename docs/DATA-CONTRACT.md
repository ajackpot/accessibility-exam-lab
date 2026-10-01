# 데이터 계약 v1

기계적으로 실행되는 정식 검증기는 `src/domain.js`의 `validateBank` 및 `src/backup.js`의 `validateSession`입니다. `node scripts/validate-bank.mjs <bank.json>`으로 전체 묶음을 검사합니다. 출제와 채점에 사용하지 않는 추가 메타데이터는 보존할 수 있습니다. 스키마 변경은 앱 호환성 검토 후 별도로 합니다.

## 은행 JSON

- `schemaVersion: 1`, `bankVersion`: ASCII 안정 버전 ID, `releasedAt`: ISO 시각
- `syllabusVersion`, `changeSummary`
- `subjects`: `{id,name}`. 필기 `s1` 표준, `s2` 인터넷, `s3` HTML, `s4` CSS/스크립트, `s5` 정보접근성
- `sources`: `{id,title,url,version,checkedAt,location,evidence,rights}`. 원문 기관·주소·판/시행일·확인일·절/쪽·근거와 재사용 설명
- `options`: `{optionId,revision,content,explanation,equivalenceGroupId?}`. 전역 정답 여부를 두지 않음
- `questions`: 아래 문항 객체
- `corrections`: 명시적 정정 목록. 기본 `[]`

## 모든 문항

`questionId`, `revision`, `templateId`, `learningGoalRevision`, `type: written|practical`, `subjectId`, `topicIds`, `stem`, `explanation`, `sourceRefs`, `verificationStatus: candidate|reviewed|published|retired|invalid`, `testOnly`, `standardVersion`, `difficulty`, `reviewNote`를 둡니다.

published만 출제합니다. published에는 근거 검토·독립 풀이 기록이 필요합니다. 첫날의 모든 문항은 `testOnly: true`입니다. candidate와 reviewed를 개수 채우기 위해 공개하지 마세요. `materials`는 `{filename,content,focusLine?}` 배열이며 실행 파일이 아닌 텍스트입니다.

문장/정답/조건 변경 시 revision을 올리고, 학습 목표나 정답 판단이 달라지면 learningGoalRevision도 올립니다. 단순 보기 순서·조합 변경은 templateId를 새로 부여하지 않습니다.

## 필기

- `optionMode: exclusive|shared`
- `supportedOptionCounts: [4,5]` 또는 출제 가능한 부분집합
- `links: [{optionId,optionRevision,role:correct|distractor,contextExplanation,compatibilitySetId}]`

links가 소속 관계의 단일 원본입니다. 역방향 memberQuestionIds는 생성 결과이며 앱은 links에서 도출합니다. 전용 보기는 하나의 문항에만 연결할 수 있습니다. 공유 보기의 공통 해설과 각 문맥에서 왜 정답/오답인지 모두 제공합니다.

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
