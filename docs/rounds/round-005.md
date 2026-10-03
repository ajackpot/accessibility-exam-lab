# 정규 문제 은행 5회차

현재 상태: **신규 52개 채택·공개 확인 완료 · 대표 라이브 검증 통과**. 후보 52개 중 채택 52개·탈락 0개·미결정 0개다. 실제 공개 수와 확인 상태는 [구조화 대장](round-005.json)에서 구분한다.

## 범위와 보존

- 신규 필기 45개(s1 6개, s2 10개, s3 10개, s4 10개, s5 9개), 실기 7개
- 기준본은 공개 확인된 **2026.10.03-regular.4**, 시작 커밋은 `eda4e43aba90bbe85de078ffafc1cbb570ef9b80`다. 기존 일반 231개와 테스트 14개, 이전 편집 정정과 모든 선택지·출처·불변 은행·종결 대장을 보존한다
- 이전 회차의 구체적인 공백과 전체 학습 목표를 비교하고 시험 범위·지정 판의 1차 자료로 독자적인 적용·진단·개선 과제를 검토했다. 같은 개념의 문구·배경 교체와 선택지 순열은 신규 문항 수에 넣지 않는다
- round-002의 탈락한 건너뛰기 링크 목표를 재등록하지 않았다. 이번 회차도 과목별 10개·실기 8개의 상한보다 실제 근거와 품질을 우선한다

## 유한 독립 검토

정답 키·해설·참고 답안·루브릭·답을 암시하는 식별자를 가린 자료에서 독립 답을 먼저 고정했다. 그 뒤 같은 개정판의 1차 출처·범위·권리·정답 유일성/반례·모든 선택지 문안/접근성·엄격한 구조/해설 검사를 수행했다. 모든 채점 전 실기 항목을 함께 읽어 교차 답안 노출과 입력 형식도 검토했다.

총 시작 검토는 61회다. 최초 검토에서 43개, 수정 후 새 독립 검토에서 9개를 채택했다. 후보별 최대 3회와 같은 목표의 계보를 유지하며 실패·미실시 결과를 지우거나 통과로 바꾸지 않는다. 후보별 판단 근거와 개정 이력은 대장에 남긴다.

## 일정과 누적본

예정 발생분은 **2026-10-04 00:00 Asia/Seoul(10월 3일 15:00 UTC)**다. 실제 시작 `2026-10-03T15:01:13Z`, 고정 판정 마감 `2026-10-03T18:30:00Z`, 실제 종결 `2026-10-03T16:20:12.723247+00:00`다. 당시 다음 예정 발생분은 **10월 4일 04:00 KST(10월 3일 19:00 UTC)**였다. 같은 발생분을 다시 사용하거나 마감을 연장하지 않았다.

- 은행 **2026.10.04-regular.5**, SHA-256 `77a312eb775786ccd069a5f1ec77d4ec96df8141eca657f0f594f02ac30820e1`
- 통합본 일반 283개: 필기 245개, 실기 38개(구현 20개·점검 18개). 테스트 14개 포함 전체 297개
- 앱 0.2.9, 출제기 2, schemaVersion 3은 그대로다. 모의시험은 과목별 20개씩 추출하며 기존 저장 기록·답안·점수·순서·스냅샷·시간 마감을 바꾸지 않는다

## 검증과 제한

콘텐츠 판정과 호스팅 공개는 별도다. 최종 통합 검사와 실제 공개 확인 결과를 아래에서 구분한다. Windows/NVDA와 실제 모바일 보조기술 실측은 미실시다. 개발자 점검용 미리보기이며 공식 기출·공식 채점·전체 범위 충족·합격 예측이 아니다.

## 다음 조사

- This batch tests counter() on a reset-and-sibling scope, not composed multi-level counters() output. 다음 행동: Assess a genuinely different ancestor-stack rendering goal against all existing goals; do not clone w02 with new names.
- The ten CSS/script written candidates use exclusive choices, so the CSS/script subset adds no validated shared-pool reuse; the two MIME questions in the Internet/HTML subset do reuse shared options. 다음 행동: Review existing reusable options before authoring new definitions, preserving historical objects and rejecting semantic role flips.
- Normative state transitions are covered but Windows/NVDA and other actual supported combinations were not run. 다음 행동: Use an authorized supported environment to test completed-state and repeated-choice delivery; do not turn expectations into claimed observations.
- This bounded code-reading case assumes the focus/appearance helper; it does not supply empirical Windows/NVDA support evidence for a complete widget. 다음 행동: If empirical widget compatibility is investigated, test a complete authorized fixture separately; do not infer actual announcement behavior from the content gate.
- The baseline covers content type, cache storage directives, validators and request preference, but not how Vary names request fields involved in response selection. 다음 행동: Read those primary sections and compare against every prior goal before drafting a bounded cache-key scenario. Do not reopen any rejected goal through this suggestion.
- Existing form tasks cover controls, values, owners and encoding, but output association/submission semantics remain untested. 다음 행동: Verify native output semantics and design an original interpretation scenario only after checking campaign-wide lineage.
- Current tasks distinguish hidden focus, dialog focus restoration and semantic attributes, but do not check active-descendant ownership while DOM focus stays on the container. 다음 행동: Research a minimal eligible widget with explicit owner and supported active descendant, separately documenting implementation-support limits.
- The accepted questions specify verification procedures, but no Windows/NVDA observations establish actual exposed role/level/name or focused aria-hidden behavior in target environments. 다음 행동: Run supplementary implementation QA on separate minimal examples and the complete application when a supported Windows/NVDA environment is available; do not silently change the accepted frozen question content.
- 이번 검토는 동등 수어, 자막 제어, ASCII 그림의 세 경계에 한정된다. 같은 예외의 말바꾸기를 새 목표로 늘리지 않도록 다음 신규 목표를 별도로 선별해야 한다. 다음 행동: 이번 수정 후보는 이 회차의 유한 검토 안에서 모두 해결하여 채택했다. 다음 회차 신규 후보는 기존 채택·탈락 목표와 다른 요구·예외임을 먼저 입증한다.
- 2026년 WCAG-EM 2.0이 존재하지만 이번 세 문항은 명시적으로 2014-07-10 1.0을 평가한다. 후속 문항이 판의 내용을 섞지 않는지 확인이 필요하다. 다음 행동: 새 방법론 목표를 제안할 때 시험 범위와 판을 명시하고 국제 성공기준 상세 문제로 확장하지 않는다.
- 문항의 정적 정답은 검증했으나 실제 Windows/NVDA와 브라우저 저장 선택 동작은 아직 실측하지 않았다. 다음 행동: 승인된 실행 환경을 확보하면 정적 기대와 실제 결과를 분리해 검증한다. 이 실측 공백을 이미 통과한 정적 문제의 키 미확정으로 오해하지 않는다.

필요한 1차 근거·반례·완료 조건은 대장에 연결했다. 공백 기록은 탈락 후보의 자동 재개방이나 횟수 초기화 권한이 아니다.

## 최종 로컬 통합 검사

- 전체 `npm run verify` **327/327**, 명시 후보 경로의 엄격한 발행·해설 검사, 현재 은행의 인자 없는 build/check와 실제 시각 발행/동결 가드를 통과했다
- 43개는 최초 검토에서, 9개는 수정 후 새 독립 풀이와 전 검사를 거쳐 채택했다. 수정은 약한 선택지 4개 문항, 잘못된 출처 위치 2개, 공유 선택지의 추가 조건 해설 1개, ARIA 작성 요구와 사용자 에이전트 대체값의 구별 2개다
- 최초 52회와 수정 9회, 총 **61회**를 보존했다. 채택 이후 문항을 고치거나 이전 실패를 초기화하지 않았다
- 출처 레코드 **70개**, 선택지 **221개**를 새로 추가한다. 두 MIME 적용 문항이 공유 풀을 사용하며 재사용과 표시 순열을 추가 지식 수로 세지 않는다
- 기존 일반 231개·시드 14개와 출처·선택지·과거 은행/대장·런타임은 그대로다. 새 실기는 구현 4개·점검 3개이며 누적 구현 20개·점검 18개다
- 통합 단계에서 다음 조사 우선순위의 비표준 값 normal을 스키마의 medium으로 정규화한 뒤 전체 검사를 다시 실행했다. 후보 내용·판정·검토 횟수·은행 바이트는 바뀌지 않았다

위 항목은 로컬 검사다. 독립 최종 통합 검사와 실제 원격·Pages·라이브 검증 결과는 아래에서 구분한다.

## 독립 최종 검사

- 최종 은행의 필기 **65,280회**, 실기 **5,376회** 무작위 표시와 **6,400개** 모의시험 문항을 검사했다. 구판 245개·신판 297개의 전체 스냅샷·채점·백업에서 원문과 키·점수·순서를 보존했다
- 52개 채택 문항과 6개 불변 검토 입력·정답을 가린 자료·실제 고정 답·완결 보고서를 대조했다. 최초 52회와 수정 9회, 총 61회 및 마지막 개정판별 모든 gate를 확인했다
- 독립 격리 환경에서 **327/327** 테스트, 명시 입력·인자 없는 build, 실제 시각 발행/동결·다음 예정 19:00 UTC 가드를 통과했다. 발행 변형 **40/40**, 시간 기본값·사용자 지정·경로 복원 **21/21**을 통과했다
- 신규 실기 7개는 고정 답안 15항목(직접 입력 8개)과 선택지 35개를 포함한다. 모든 미채점 항목을 함께 읽어 확정된 교차 완성 답 노출을 찾지 않았고, 개정 사이에 학습 목표·정답 역할/집합·항목 ID·배점이 유지됐다
- 공개 허용 목록은 **97개 파일**이다. 원시 후보·맹검·고정 답·검토 로그·다운로드한 표준 원문과 로컬 전용 QA 자료는 공개 목록에 넣지 않는다. 이전에 공개된 불변 편집 검토 증거는 보존한다

이는 독립 로컬 검사다. 최종 발행 파일 목록·트리와 실제 원격·Pages·라이브 바이트·저장 기록의 재진입 연속성은 아래 공개 확인에 기록한다. Windows/NVDA와 모바일 보조기술 실측은 미실시다.

## 실제 공개와 라이브 확인

후보 판정은 **2026-10-03 16:20:12.723247 UTC**에 종결했고, 지연된 공개를 재시도한 뒤 **23:24:28.222 UTC(10월 4일 08:24:28.222 KST)**에 대표 라이브 검증을 마쳤다. 원래 시작·마감·종결 시각과 61회 검토·실패·수정·채택 판정은 변경하지 않았다. 지연 중 지나간 예정 시각을 새 실행 회차나 신규 문항 수로 세지 않는다.

- 콘텐츠 [커밋 bcc05c9](https://github.com/ajackpot/accessibility-exam-lab/commit/bcc05c9593de982b571791a116fc86a52ad10f95)의 [Pages 실행 37160813433](https://github.com/ajackpot/accessibility-exam-lab/actions/runs/37160813433)이 성공했다. 승인된 트리 `eff48a8ce5cc9e5ba4c92bbcfcf49bd9be80117e`의 97개 파일과 크기·blob 해시가 일치한다
- **23:10:32.943498 UTC**에 [공개 앱](https://ajackpot.github.io/accessibility-exam-lab/)의 앱·manifest·모든 불변 은행 등 **26개 주소**의 SHA-256이 승인본과 일치했다. 저장소 문서 검증과 실제 호스팅 자원 검증의 범위를 구분한다
- 신규 필기 **45개(s1 6·s2 10·s3 10·s4 10·s5 9)**와 실기 **7개**가 공개됐다. 누적 일반 **283개(필기 245·실기 38)**·테스트 **14개**, 전체 297개다. 앱 **0.2.9**와 은행 SHA-256 `77a312eb775786ccd069a5f1ec77d4ec96df8141eca657f0f594f02ac30820e1`을 확인했다
- 재시도 전 동일한 97개 파일로 **327/327** 테스트, build와 실제 현재 시각의 발행/동결 검사를 다시 통과했다. 이전에 저장된 8개 blob은 재사용했고 누락된 은행만 올렸으며 후보 내용과 검토 시각을 다시 쓰지 않았다

### 대표 브라우저 검사

- 이전 탭이 닫힌 뒤 같은 브라우저 프로필에서 백업 가져오기 없이 앱을 다시 열어 기존 **7개 기록**을 비교했다. 5개는 전체가 같았고, 원래 만료 시각이 지난 300분 기록 2개는 종료 시각이 원래 마감과 같으며 각각 결과가 한 번만 생성됐다. 기존 **200개 문항 스냅샷**과 저장 답·선택지 순서·키가 그대로였다. 여러 번 다시 열고 새로고침한 뒤에도 중복 종료가 없었다
- 두 시간제 기록의 원래 마감은 **2026-10-03 16:44:45.747 UTC**와 **20:05:31.854 UTC**다. 재진입 후 만료 처리를 확인한 것이며 앱이 닫힌 동안 실행됐거나 실제 300분을 기다리며 관찰했다는 뜻은 아니다
- 새 MIME 공유 목표의 서로 다른 정답 역할과 해설을 확인했다. 해당 두 문항의 선택지 해설 문단은 각각 **5개·8개**이며, 기본 이유와 필요한 추가 문맥을 중복 없이 제공했다
- 개정된 새 실기 **2개 과제**의 고정 답안은 각각 **10/10**으로 채점됐다. 입력한 원문은 새로고침 후 보존됐고 자유 서술은 고정 답안 점수와 구분했다
- 새 전체 필기·모의시험 **150분**, 과목·실기 **30분** 기본값과 직접 입력한 **90분**의 범위 전환·뒤로/앞으로 복원을 확인했다. 실제 **100문항·150분 설정** 모의시험은 과목별 20개이며, 새로고침 뒤 답·순서를 유지하고 조기 채점하지 않았다. **64.691초** 후 **1개 정답·99개 미응답**으로 제출했다
- 대표 라이브 검사 **19개**와 **23:23:32.847 UTC**의 실제 공개 격리 저장소 harness **9/9**를 통과했다. 마지막 브라우저 백업을 실제 다운로드하고 **10개 세션**을 파싱했다

### 증거의 한계

기존 탭을 계속 열어 둔 채 업데이트한 검사가 아니라 저장 기록을 앱 재진입 후 확인한 검사다. 신규 공유 문항·실기는 대표 사례만 직접 풀었으며 신규 52개·전체 297개·모의시험 100개 모두를 수동으로 풀었다는 뜻은 아니다. 파일 선택기 백업 가져오기, 실제 Windows/NVDA 음성·OS 접근성 이벤트, 모바일·확대·지원 브라우저 전체 조합, 외부 AI 전송은 미실시다. 만료 후 재진입 처리와 자동 만료 경계 검사는 실제 150분·300분 연속 관찰을 대신하지 않는다.
