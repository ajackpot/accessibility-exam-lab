# 009–017 별도 누적 공개 확인

- 확인 완료: 2026-10-05T14:33:51.930Z
- 공개 payload: [33be0045287029edb8a33477503c654d3001beac](https://github.com/ajackpot/accessibility-exam-lab/commit/33be0045287029edb8a33477503c654d3001beac)
- 단일 parent: `500811b7ee226f33cfb598df42c6cb347b935d28`
- 전체 tree: `cb46eebf28c239a69dae310da01eeeb79027aa7a` (178파일)
- [Pages run 37325284427](https://github.com/ajackpot/accessibility-exam-lab/actions/runs/37325284427): 같은 head의 build·report-build-status·deploy 성공
- [실제 공개 앱](https://ajackpot.github.io/accessibility-exam-lab/): 36개 경로의 HTTP200·바이트 길이·SHA-256 일치, 불변 은행22개 포함
- 활성 은행: `2026.10.05-regular.17`, SHA-256 `3197db32a0268b01dddbd2f2cb75b02dfa101204ce3f132db034f5abba46fca3`
- 일반684개: 필기615개(s1:98, s2:148, s3:128, s4:138, s5:103), 실기69개; 기존 시드14개; 총698개
- 008의 일반403개 대비 실제 새 공개281개. 새 채택·새 검토·추가 문항 생성은 없음

## 원문 보존과 증거의 경계

[기계 판독 증거](cumulative-009-017.json)는 기존006–008 증거 SHA-256,009–017의 정확한 원래 대장·은행·전달 proof, 전체 원격 inventory와 live 확인을 연결한다. 고정 증거 SHA-256은 `fe147c597a5a5f155d6a65e7e9fd641e6a38f9c8d0db1147f513d1b2943959e2`다. 원래 대장·후보 판정·검토 횟수·공개0·미시도·unknown, 고정009 anchor, 이전 전달 영수증·은행·ZIP 원문은 그대로 보존한다.

이 증거는 위 payload가 먼저 실제 배포된 사실을 기록한다. 이 보고서·검증 코드·새 pin을 담는 나중의 지원 커밋이 이미 배포되었다는 뜻은 아니다. 해당 지원 커밋도 exact head의 Pages/live 확인이 필요하다. 이전006/009의 분리된 blob 및 종료된 누적010/017 tree 호출의 결과는 계속 unknown이며, 요청 취소만으로 실행 취소를 증명했다고 말하지 않는다. 기존 불명 blob/tree 호출의 결과를 소급 성공이나 실패로 바꾸지 않으며 미래 Git 권한·재시도 권한을 부여하지 않는다.

## 검증 범위와 한계

원격178파일 tree와 실제 live36경로의 정확한 해시/길이를 독립 확인했다. live에서 받은 동일 bank/JS를 Node에서 실행한 순수 합성 workflow13개가 통과했다. 개인 학습 기록을 읽거나 쓰거나 내보내지 않았다.

원래009 전체 archive replay는 원본14파일을 확보하지 못해 `not_run`이다. 고정009 anchor/proof/hash/terminal 검증은 보존하며, 확보한013/017 전체 원본과017 delta의 실제 복원 검사와 구별한다. 기존 원본 ZIP은 수정하지 않는다. 실제 렌더링 브라우저 UI, Windows/NVDA 및 모바일 보조기술 실측은 미실시이며 앱은 개발자 점검용 미리보기다.
