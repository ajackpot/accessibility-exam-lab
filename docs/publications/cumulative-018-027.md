# 018–027 별도 누적 공개 확인

- 확인 완료: 2026-10-07T06:50:39.548Z
- 공개 payload: [da645d3d7a37b67551344bf7853c92e54eecddfd](https://github.com/ajackpot/accessibility-exam-lab/commit/da645d3d7a37b67551344bf7853c92e54eecddfd)
- 단일 parent: `04dcdf53384590a12159601d76029b1b8a13bb4f`
- 전체 tree: `e197ab17b9205a7be6a358e27ffe5fb80770807d` (242파일)
- [Pages run 37583421170](https://github.com/ajackpot/accessibility-exam-lab/actions/runs/37583421170): 같은 head의 완료·성공 확인
- [실제 공개 앱](https://ajackpot.github.io/accessibility-exam-lab/): 52개 경로의 HTTP200·바이트 길이·SHA-256 일치
- 활성 은행: `2026.10.07-regular.27`, SHA-256 `2f6d630f8e3f039563e657cf232193d7a67fddb64f14e068179a855327680abf`
- 일반882개: 필기806개(s1:117, s2:190, s3:168, s4:187, s5:144), 실기76개; 기존 시드14개; 총896개
- 이전 공개017의 일반684개 대비 실제 새 공개198개. 이 공개 동기화에서 새 후보·문항·검토를 만들지 않았다

## 원문 보존과 수량 구분

[기계 판독 증거](cumulative-018-027.json)는 이전009–017 이벤트 SHA-256 `fe147c597a5a5f155d6a65e7e9fd641e6a38f9c8d0db1147f513d1b2943959e2`를 잇는다. 새 이벤트의 정규 JSON SHA-256은 `1c4130dcdc2b873d061f193977d5a1b6ffb17f2ec8952df2df55614edc5ed6ab`다.

공개 source는018·019·020·021·022·024·025·026·027의9개다. 원래 채택217개 중022의19개는 계속 격리되어 새 공개량은198개다.022의 역사적 accepted31, quarantine19, eligible12 및 원 영수증의 acceptedGoalIds31을 각각 보존한다.023의17개 채택·2개 탈락과 시작한20회 개정판은 예약만 유지하며 source·은행·전달 proof를 만들지 않았다. 원 대장·차단 이벤트·사고 기록은 그대로이고 소실된 원 Markdown 보고서를 다시 만들지 않았다.

모든 원래 종결 대장·은행·전달 checkpoint·기존 trust prefix·ZIP, 공개0·미시도·null 확인 시각·검토 횟수는 그대로다. 독립018 사슬의 원 anchor와 최초 불확실성·고정 대기·skip 시각도 유지한다. 원래 분리된018 호출과 이전2026-10-07 재시도의 결과는 계속 unknown이다. 별도로 승인된 나중의 동일 blob 전송 성공과 현재 콘텐츠 공개 사실은 이전 호출의 결과를 소급 확정하지 않는다.

## 확인 범위와 한계

실제242파일 tree와52개 live 경로의 해시·길이를 확인했다. 변경하지 않은241파일 전달 source에는754개 전체 테스트의 두 차례 통과 기록이 있다. 자기027 checkpoint를 추가한242파일 successor는7개 check 그룹·25개 probe·64개 focused 테스트를 별도로 통과했다.242파일에754개 전체 suite를 다시 실행했다고 주장하지 않는다.

이 보고서·새 pin·검증기를 담는 후속 지원 snapshot의 전체 검증 및 배포는 별도다. 이 payload의 Pages/live 결과를 지원 commit의 확인으로 쓰지 않는다. 렌더링 브라우저 UI·Windows/NVDA·모바일 보조기술 실측은 미실시다.

### 2026-10-07의 추가 역사 archive 감사

이전 보고서에 기록된009의 당시 `not_run`은 고치지 않는다. 이후 확보한 원래009 전체 ZIP SHA-256 `d26394d80b6bc122674b972b955b6523159cf5c156d798806b9bc9303469ec27`(3,750,006바이트)을2026-10-07T05:49:04.676Z까지 실제로 검사했다.132개 원본 파일의 CRC·안전 경로·전체 inventory와 준비 시각2026-10-04T09:46:13.733Z 기준 전체 campaign 감사가 통과했다. 같은 날013 전체본157파일,017 전체본177파일의 정확한 역사 campaign 감사 및017 delta66파일의 CRC·경로·manifest 검증도 통과했다.017 delta의 전체 선행 사슬 재구성까지 수행했다는 뜻은 아니다.

이 읽기 전용 결과는 `currentReleaseClearance:false`, `canStartNewContent:false`이며, 원 ZIP을 다시 쓰지 않았다. 독립018–027 원 archive의 새 지원 검증기 경계 검사는 별도 최종 실행 결과를 따른다. 기존 normal-backup archive에는 원 `deltaManifest.preparedAt`을 사용하고, 그 필드가 없는 independent kind에는 원문 proof의 실제 `savedAt`을 사용한다. 실제 저장 시각을 준비 시각으로 바꾸어 말하지 않는다.
