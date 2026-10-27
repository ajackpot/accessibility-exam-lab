/** Text-only material contract. Missing type preserves historical code data. */
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;
const nonblank=(value,max)=>text(value,max)&&value.trim().length>0;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
export const sequenceEvidenceLabel=type=>({fictional:'독자 가상 기록',documented:'문서에 따른 예상 기록',measured:'실제 측정 기록'})[type];
export const materialType=material=>material.type===undefined?'code':material.type;
export const materialName=material=>materialType(material)==='sequence'?material.title:material.filename;
export function validateMaterials(question,schemaVersion,assert) {
  if(question.materials===undefined)return;
  assert(Array.isArray(question.materials)&&question.materials.length<=30,'자료 목록 오류');
  for(const material of question.materials) {
    assert(plain(material)&&['code','sequence'].includes(materialType(material)),'알 수 없는 자료 유형입니다.');
    const sequence=materialType(material)==='sequence';
    assert(material.purpose===undefined?schemaVersion===1:['question','explanation'].includes(material.purpose),'자료의 목적을 확인하세요.');
    assert(schemaVersion===1||material.purpose!=='question'||(nonblank(material.instruction,100000)&&question.stem.includes(material.instruction)),'자료의 지시문 연결을 확인하세요.');
    if(!sequence) {
      assert(!['title','evidenceType','environment','initialState','steps'].some(key=>Object.hasOwn(material,key)),'순차 동작 기록에는 명시적인 sequence 유형이 필요합니다.');
      assert(text(material.filename,200)&&typeof material.content==='string'&&material.content.length<=1000000&&(!material.focusLine||(Number.isInteger(material.focusLine)&&material.focusLine>=1&&material.focusLine<=material.content.split('\n').length)),'코드 자료의 파일명·원문·줄을 확인하세요.');
      continue;
    }
    assert(schemaVersion===3&&question.type==='written','순차 동작 기록은 schema3 필기에만 허용합니다.');
    const allowed=['type','title','purpose','instruction','evidenceType','environment','initialState','steps'];
    assert(Object.keys(material).every(key=>allowed.includes(key)),'순차 동작 기록의 필드를 확인하세요.');
    assert(nonblank(material.title,200)&&['fictional','documented','measured'].includes(material.evidenceType)&&nonblank(material.environment,4000)&&nonblank(material.initialState,4000),'순차 동작 기록의 제목·근거 구분·환경·초기 상태가 필요합니다.');
    assert(material.instruction===undefined||nonblank(material.instruction,100000),'순차 동작 기록의 지시문이 올바르지 않습니다.');
    assert(Array.isArray(material.steps)&&material.steps.length>=1&&material.steps.length<=200,'순차 동작 기록은 1~200단계가 필요합니다.');
    let size=material.title.length+material.environment.length+material.initialState.length;
    for(const [index,step] of material.steps.entries()) {
      assert(plain(step)&&Object.keys(step).length===4&&['step','target','action','observation'].every(key=>Object.hasOwn(step,key)),'단계에는 step, target, action, observation만 사용하세요.');
      assert(step.step===index+1&&nonblank(step.target,4000)&&nonblank(step.action,4000)&&nonblank(step.observation,4000),'단계는 순서대로 1부터 번호를 매기고 대상·조작·관찰/상태를 명시하세요.');
      size+=step.target.length+step.action.length+step.observation.length;
    }
    assert(size<=100000,'순차 동작 기록 전체가 너무 깁니다.');
  }
}
/** Includes all record context; never contains question keys or explanations. */
export function sequenceMaterialText(material) {
  return [`순차 동작 기록: ${material.title}`,`기록 구분: ${sequenceEvidenceLabel(material.evidenceType)}`,`환경: ${material.environment}`,`초기 상태: ${material.initialState}`,
    ...material.steps.flatMap(step=>[`${step.step}단계`,`대상: ${step.target}`,`조작: ${step.action}`,`관찰/상태: ${step.observation}`])].join('\n\n');
}
