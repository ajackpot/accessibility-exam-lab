import {WRITTEN_LEVEL_MAP} from './written-level-map.js?v=d02-001';

/** Scope depth, not cognitive ability or the historical numeric difficulty. */
export const WRITTEN_LEVEL_VERSION='d02.1';
export const WRITTEN_LEVEL_OPTIONS=Object.freeze([
  Object.freeze(['all','무작위 (전체 난이도 혼합)']),Object.freeze(['basic','Basic']),
  Object.freeze(['pro','Pro']),Object.freeze(['master','Master'])
]);
export const isWrittenLevel=value=>['all','basic','pro','master'].includes(value);
export const writtenLevelLabel=value=>WRITTEN_LEVEL_OPTIONS.find(([key])=>key===value)?.[1]||'';
export const WRITTEN_LEVEL_DESCRIPTIONS=Object.freeze({
  s1:Object.freeze({basic:'접근성 원칙·핵심 검사항목과 일반적인 준수 판단',pro:'주요 콘텐츠·조작 패턴의 적용 조건과 검사 방법',master:'판본·적용 범위·예외 및 복합 조건에 따른 적합성 판단'}),
  s2:Object.freeze({basic:'웹·네트워크의 기본 구조와 요청·응답 흐름',pro:'브라우저·HTTP·저장소·보안의 주요 동작 조건',master:'비동기·캐시·인증·실패 복구에서 계층 간 상태와 책임의 관계'}),
  s3:Object.freeze({basic:'문서·텍스트·링크·이미지·기본 폼의 의미 구조',pro:'표·폼·미디어·내장 요소의 구체적인 의미와 사용 조건',master:'접근 가능한 이름·양식 상태·복합 구조와 처리 규칙의 경계'}),
  s4:Object.freeze({basic:'기본 스타일·배치와 자바스크립트의 값·제어 흐름',pro:'레이아웃·이벤트·DOM·객체의 주요 동작과 접근성 패턴',master:'캐스케이드·실행 시점·참조·상태/초점 수명이 맞물리는 세부 동작'}),
  s5:Object.freeze({basic:'장애·보조기술·평가·정보 제공의 공통 원리',pro:'주요 보조기술 사용·매체·평가와 운영의 구체적 방법',master:'복합 과업·보조기술 조건·검증 전략·조직 책임의 교차 판단'})
});
export function writtenLevelDescription(subjectId,level){return WRITTEN_LEVEL_DESCRIPTIONS[subjectId]?.[level]||'';}
/** Exact reviewed revision only. Unknown/changed questions have no inferred level. */
export function writtenLevelFor(question){
  if(question?.type!=='written')return null;
  const row=WRITTEN_LEVEL_MAP[question.questionId];
  return row&&row.revision===question.revision&&row.templateId===question.templateId&&row.learningGoalRevision===question.learningGoalRevision?row.level:null;
}
export function matchesWrittenLevel(question,level='all'){
  return level==='all'||question?.type==='written'&&writtenLevelFor(question)===level;
}
