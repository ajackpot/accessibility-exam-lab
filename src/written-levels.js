import {WRITTEN_LEVEL_MAP} from './written-level-map.js?v=d03-001';

/** Scope depth, not cognitive ability or the historical numeric difficulty. */
export const WRITTEN_LEVEL_VERSION='d03.1';
export const WRITTEN_LEVEL_OPTIONS=Object.freeze([
  Object.freeze(['all','무작위 (전체 난이도 혼합)']),Object.freeze(['basic','Basic']),
  Object.freeze(['pro','Pro']),Object.freeze(['master','Master'])
]);
export const isWrittenLevel=value=>['all','basic','pro','master'].includes(value);
export const writtenLevelLabel=value=>WRITTEN_LEVEL_OPTIONS.find(([key])=>key===value)?.[1]||'';
export const WRITTEN_LEVEL_DESCRIPTIONS=Object.freeze({
  s1:Object.freeze({"basic":"접근성 원칙·핵심 요구와 표준을 읽는 기본 원리","pro":"콘텐츠·조작별 요구, 검사 방법과 구체적인 적용 조건","master":"적합성·지원 모형과 기준·계약·책임 사이의 심화 관계"}),
  s2:Object.freeze({"basic":"웹·네트워크의 기본 구조와 요청·응답 흐름","pro":"브라우저·통신·저장·인증의 주요 동작 조건","master":"계층별 상태·책임·신뢰 경계와 실패 복구의 심화 관계"}),
  s3:Object.freeze({"basic":"문서·텍스트·링크·이미지와 기본 폼의 의미 구조","pro":"표·폼·미디어와 요소·속성의 구체적인 처리 규칙","master":"이름 계산·폼 상태·문서 처리 사이의 심화 관계"}),
  s4:Object.freeze({"basic":"기본 스타일·배치와 값·함수·제어 흐름","pro":"레이아웃·객체·DOM·이벤트와 주요 접근성 패턴","master":"계층·참조·실행 시점·상태와 초점 수명의 심화 관계"}),
  s5:Object.freeze({"basic":"장애·보조기술·정보 제공과 평가의 공통 원리","pro":"보조기술·매체·과업별 검사와 운영 방법","master":"입력·설정의 전문 모형과 원인·증거·운영 책임의 심화 평가"})
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
