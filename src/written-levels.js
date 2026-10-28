import {WRITTEN_LEVEL_MAP} from './written-level-map.js?v=t02-awareness-001';

/** Scope depth, not cognitive ability or the historical numeric difficulty. */
export const WRITTEN_LEVEL_VERSION='t02.1';
export const WRITTEN_LEVEL_OPTIONS=Object.freeze([
  Object.freeze(['all','무작위 (전체 난이도 혼합)']),Object.freeze(['basic','Basic']),
  Object.freeze(['pro','Pro']),Object.freeze(['master','Master'])
]);
export const isWrittenLevel=value=>['all','basic','pro','master'].includes(value);
export const writtenLevelLabel=value=>WRITTEN_LEVEL_OPTIONS.find(([key])=>key===value)?.[1]||'';
export const WRITTEN_LEVEL_DESCRIPTIONS=Object.freeze({
  s1:Object.freeze({"basic":"접근성 원칙·핵심 요구와 표준의 기본 의미","pro":"2급 범위의 KWCAG 준수 방법·국내 제도·국제 표준 정책","master":"2급 범위를 넘는 국제지침의 세부 요구·적합성과 웹 외 접근성 기준"}),
  s2:Object.freeze({"basic":"인터넷·주소·웹 서비스와 브라우저의 기초 원리","pro":"2급 범위의 주소체계·브라우저 활용·서비스 개념과 검색","master":"통신·캐시·인증·복구의 세부 동작과 접근성 과업 상태"}),
  s3:Object.freeze({"basic":"문서·텍스트·링크·이미지와 기본 폼의 의미","pro":"2급 범위의 HTML 요소·폼과 ARIA 역할·속성·상태 구현","master":"지정 범위를 넘는 이름 계산·문서 처리와 접근성 구현 각론"}),
  s4:Object.freeze({"basic":"기본 스타일·배치와 값·변수·함수·제어 흐름","pro":"2급 지정 CSS의 상세 규칙과 자바스크립트 기초문법 활용","master":"후속 CSS와 이벤트·비동기·상태·초점 관리의 각론"}),
  s5:Object.freeze({"basic":"장애·보조기술·정보 제공과 평가의 공통 원리","pro":"2급 범위의 보조기술 이용·국내 법제·점검 방법과 한계","master":"보조기술 작동·복합 평가 전략·운영과 증거 관리의 각론"})
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
