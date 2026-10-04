# 006–008 누적본 공개 확인

2026년 10월 4일 08:51:19.196 UTC에 아래 누적본의 GitHub Pages 반영을 확인했다. 실제 공개 확인은 종결 대장과 별개인 `cumulative-006-008.json`으로 보존한다.

- payload commit: [50fd2807](https://github.com/ajackpot/accessibility-exam-lab/commit/50fd2807a0ff8fc2c10cbf2628f65d0ca53065c2)
- parent: `d8ee1c0dc1c04145d5a6752242b74b003f0e59c5`
- tree: `b7f5cda627ea50d5133eefab49de50c21923dca8`
- [Pages 빌드 37189952415](https://github.com/ajackpot/accessibility-exam-lab/actions/runs/37189952415): 해당 commit에서 success
- [학습 앱](https://ajackpot.github.io/accessibility-exam-lab/): `2026.10.04-regular.8`, SHA-256 `ee533f5e4a546d14b7f2624700fb8d0dd0a47601290f9de9147f769ebf93feab`
- 원격 120개 공개 파일이 검토한 트리와 동일하고, 실제 서비스 URL 29개가 HTTP 200 및 정확한 해시로 확인되었다
- 공개 정규 문항 403개: 필기 356개, 실기 47개. 테스트 전용 14개는 별도다. 기존 공개 기준보다 새로 공개된 정규 문항은 120개이며 006의 41개, 007의 39개, 008의 40개를 한 번만 센다

## 역사와 현재 상태

원래 006–008 대장·판정·검토 횟수·시각·공개 수 0·`verifiedAt:null`, 전달 영수증, 기존 `offline-chain.json`, 모든 불변 은행은 그대로다. 원래006의 외부 단일 blob 요청 결과는 여전히 unknown이다. 이후 별도 승인된 정확한 객체 요청과 새 누적 공개를 검증한 것이며, 원래 요청이 성공/실패했다고 바꾸지 않는다. 이 문서의 후속 지원 파일 커밋은 이미 검증된 payload commit을 참조하며 자기 자신의 미확정 해시를 주장하지 않는다.

`scripts/publication-sync.mjs`는 독립 검토한 공개 증거의 고정 SHA-256과 원래 은행/대장 바이트를 함께 검사한다. 증거 누락·변경 또는 가짜 Map/플래그를 거부한다. 동기화 시각 이전의 회차는 기존 오프라인 기준으로 검증한다. 이후 회차는 regular.8을 실제 공개 누적 기준으로 사용한다. 이후 더 새로운 검증 공개가 있으면 그 기준이 우선하며 regular.6/7로 되돌릴 수 없다. 검토 횟수·판정 마감·예정 발생분·동결·전체 캠페인 검사는 그대로 적용한다.

`loadRoundContext`는 증거를 읽어 `synchronizations`를 전체 검증 문맥에 전달한다. `validateSynchronizedDeliveryChain`은 이 문맥과 원래 전달 사슬을 검증하여 실제 공개가 확인된 artifact만 현재의 `resolvedArtifacts`로 도출한다. 포함한 영수증 범위만 해결하며 과거 `validateOfflineContinuation.canPublish:false`를 변경하지 않는다. 정규 회차는 새로 확인한 실제 원격 head를 `baseline.sourceCommit`에 기록한다. 이 값은 payload의 검증된 후손일 수 있으며, 실제 원격 ancestry·새 head·외부 변경·freeze·권한 검사는 공개 실행자가 별도로 다시 확인해야 한다. 이 로컬 증거 검사는 현재 GitHub를 조회하거나 새 Git 쓰기 권한을 부여하지 않는다.

## 한계와 기록 보존

기존 클라우드 QA 브라우저 11개 세션에서 10개 객체는 그대로였고, 1개는 원래 마감이 지나 정상 만료됐다. 저장된 문제 스냅샷·답안·선택지 순서·원래 시간 설정은 보존됐다. 다른 기기 전체의 저장 상태를 검증했다는 뜻은 아니다. 실제 Windows/NVDA 및 모바일 보조기술 검사는 미실시이며 개발자 미리보기 상태를 유지한다. 이번 지원 기록 추가는 앱 코드/은행/manifest 변경이나 새 문제 채택이 아니므로 같은 전체 ZIP을 중복 전달하지 않는다.
