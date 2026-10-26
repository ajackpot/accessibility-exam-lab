/** Optional structured practical tasks. Source and learner strings are never rewritten. */
export const INSPECTION_FIELDS = [
  {key:'guidelines',label:'검사항목·지침'},
  {key:'locations',label:'파일·원본 줄'},
  {key:'cause',label:'원인과 사용자 영향'},
  {key:'improvement',label:'개선안'},
];
export const sourceLines = content => content.split(/\r\n|\n|\r/);
export const isManualPart = part => ['code','inspection'].includes(part.kind);
const object = value => !!value&&typeof value==='object'&&!Array.isArray(value);
const string = (value,max=100000) => typeof value==='string'&&value.trim().length>0&&value.length<=max;
const identifier = value => typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const integer = (value,min,max) => Number.isInteger(value)&&value>=min&&value<=max;
const onlyKeys = (value,keys) => object(value)&&Object.keys(value).every(key=>keys.includes(key));
export function validManualAnswer(part,value,{reference=false}={}) {
  if(!isManualPart(part))return false;
  if(part.kind==='code')return typeof value==='string'&&value.length<=1000000&&(!reference||value.trim().length>0);
  return onlyKeys(value,INSPECTION_FIELDS.map(field=>field.key))&&INSPECTION_FIELDS.every(({key})=>reference?string(value[key]):value[key]===undefined||(typeof value[key]==='string'&&value[key].length<=100000));
}
export function manualPartAnswered(part,value) {
  if(!validManualAnswer(part,value))return false;
  return part.kind==='code'?value.trim()!=='':INSPECTION_FIELDS.some(({key})=>value[key]?.trim());
}
function validateReference(q,reference,assert) {
  assert(onlyKeys(reference,['filename','startLine','endLine','blankId']),`${q.questionId}: 자료 참조 형식 오류`);
  const material=q.materials?.find(m=>m.filename===reference.filename&&m.purpose==='question');
  assert(material,`${q.questionId}: 참조할 문제 자료 파일이 없습니다.`);
  const count=sourceLines(material.content).length;
  assert(integer(reference.startLine,1,count)&&(reference.endLine===undefined||integer(reference.endLine,reference.startLine,count)),`${q.questionId}: 원본 줄 참조 범위를 확인하세요.`);
  assert(reference.blankId===undefined||identifier(reference.blankId),`${q.questionId}: 빈칸 참조 ID 오류`);
}
export function validatePracticalTask(q,schemaVersion,assert) {
  if(q.practicalTask===undefined)return false;
  const task=q.practicalTask;
  assert(q.type==='practical'&&schemaVersion===3&&onlyKeys(task,['schemaVersion','serviceType','title','screenDescription','behaviorDescription','requirements','answerInstructions','errorCount','blanks'])&&task.schemaVersion===1,`${q.questionId}: 구조화 실기는 schema3의 practicalTask v1이어야 합니다.`);
  assert(identifier(task.serviceType)&&string(task.title,500)&&string(task.screenDescription)&&string(task.behaviorDescription)&&string(task.answerInstructions),`${q.questionId}: 대문항명·서비스·화면·동작·답안 형식 안내가 필요합니다.`);
  assert(Array.isArray(task.requirements)&&task.requirements.length>0&&task.requirements.length<=100&&task.requirements.every(value=>string(value,10000)),`${q.questionId}: 수행 요구조건 목록이 필요합니다.`);
  assert(Array.isArray(q.materials)&&q.materials.every(m=>object(m)&&typeof m.content==='string'),`${q.questionId}: 공통 자료 목록과 원문을 확인하세요.`);
  const materials=q.materials.filter(m=>m.purpose==='question');
  assert(materials.length>0&&new Set(materials.map(m=>m.filename)).size===materials.length,`${q.questionId}: 공통 문제 자료의 파일명을 구분하세요.`);
  assert(Array.isArray(q.parts)&&q.parts.length>0,`${q.questionId}: 세부 문항이 필요합니다.`);
  for(const part of q.parts) {
    assert(object(part)&&Array.isArray(part.references)&&part.references.length>0&&part.references.length<=30,`${q.questionId}: 세부 문항의 원본 자료 참조가 필요합니다.`);
    for(const reference of part.references)validateReference(q,reference,assert);
    if(isManualPart(part))assert(part.points===0&&part.scoring==='manual'&&validManualAnswer(part,part.referenceAnswer,{reference:true})&&part.accepted===undefined&&part.correct===undefined&&part.normalization===undefined&&part.choices===undefined,`${q.questionId}/${part.partId}: 코드·평가 답안은 0점 미채점과 별도 참고 답안을 사용하세요.`);
  }
  if(q.family==='implementation') {
    assert(task.errorCount===undefined&&Array.isArray(task.blanks)&&task.blanks.length>=5&&task.blanks.length<=10,`${q.questionId}: 구현형 빈칸은 5~10개가 필요합니다.`);
    assert(q.freeResponsePrompt===''&&!q.parts.some(p=>p.kind==='inspection'),`${q.questionId}: 구현형에는 별도 사유 서술을 요구하지 않습니다.`);
    const ids=new Set(),parts=new Set();
    for(const blank of task.blanks) {
      assert(onlyKeys(blank,['blankId','partId','filename','startLine','endLine'])&&identifier(blank.blankId)&&!ids.has(blank.blankId)&&!parts.has(blank.partId),`${q.questionId}: 빈칸과 답안 항목의 연결은 유일해야 합니다.`);
      const part=q.parts.find(p=>p.partId===blank.partId);
      assert(part&&['code','text','single','multi'].includes(part.kind),`${q.questionId}: 빈칸에 연결된 답안 항목이 없습니다.`);
      const {partId,...reference}=blank;validateReference(q,reference,assert);
      assert(part.references.some(r=>r.blankId===blank.blankId&&r.filename===blank.filename&&r.startLine===blank.startLine&&(r.endLine??r.startLine)===(blank.endLine??blank.startLine)),`${q.questionId}: 빈칸과 세부 문항의 원본 참조가 다릅니다.`);
      ids.add(blank.blankId);parts.add(partId);
    }
    for(const part of q.parts)for(const reference of part.references)if(reference.blankId!==undefined)assert(task.blanks.some(blank=>blank.blankId===reference.blankId&&blank.partId===part.partId&&blank.filename===reference.filename&&blank.startLine===reference.startLine&&(blank.endLine??blank.startLine)===(reference.endLine??reference.startLine)),`${q.questionId}: 연결되지 않은 빈칸 참조입니다.`);
  } else {
    assert(q.family==='inspection'&&integer(task.errorCount,10,20)&&task.blanks===undefined&&q.parts.some(p=>p.kind==='inspection')&&!q.parts.some(p=>p.kind==='code'),`${q.questionId}: 평가형은 10~20개 오류와 네 관점의 평가 응답을 사용하세요.`);
    assert(q.parts.every(p=>p.references.every(r=>r.blankId===undefined)),`${q.questionId}: 평가형에는 구현 빈칸 참조를 넣지 않습니다.`);
  }
  return true;
}
export function validatePracticalView(item,view,assert,materials=(item.materials||[]).filter(m=>m.purpose==='question')) {
  assert(item.type==='practical'&&onlyKeys(view,['files','selectedFile','showLineNumbers','activePartId']), '실기 자료 위치 형식 오류');
  assert(view.selectedFile===undefined||materials.some(m=>m.filename===view.selectedFile),'저장한 자료 파일이 없습니다.');
  assert(view.activePartId===undefined||item.parts.some(p=>p.partId===view.activePartId),'저장한 세부 문항이 없습니다.');
  assert(view.showLineNumbers===undefined||typeof view.showLineNumbers==='boolean','줄 번호 표시 상태 오류');
  assert(view.files===undefined||object(view.files),'자료 위치 목록 오류');
  for(const [filename,state] of Object.entries(view.files||{})) {
    const material=materials.find(m=>m.filename===filename);
    assert(material&&onlyKeys(state,['selectionStart','selectionEnd','selectionDirection','scrollTop','scrollLeft']),'자료 위치의 파일 또는 필드 오류');
    for(const key of ['selectionStart','selectionEnd'])assert(state[key]===undefined||integer(state[key],0,material.content.length),'자료 선택 위치가 원문 범위를 벗어났습니다.');
    assert(state.selectionStart===undefined||state.selectionEnd===undefined||state.selectionStart<=state.selectionEnd,'자료 선택 범위 오류');
    assert(state.selectionDirection===undefined||['forward','backward','none'].includes(state.selectionDirection),'자료 선택 방향 오류');
    for(const key of ['scrollTop','scrollLeft'])assert(state[key]===undefined||(typeof state[key]==='number'&&Number.isFinite(state[key])&&state[key]>=0),'자료 스크롤 위치 오류');
  }
  return view;
}
export function practicalTaskPromptLines(item) {
  const task=item.practicalTask;
  if(!task)return [];
  return [
    `대문항: ${task.title}\n서비스 유형: ${task.serviceType}`,
    '화면 설명 (원문) 시작',task.screenDescription,'화면 설명 (원문) 끝',
    '동작 설명 (원문) 시작',task.behaviorDescription,'동작 설명 (원문) 끝',
    '수행 요구조건 (원문)',...task.requirements,
    '답안 형식·대안·중복 처리 안내 (원문)',task.answerInstructions,
    ...(task.errorCount===undefined?[]:[`평가 대상 오류 수: ${task.errorCount}`]),
    '원본 줄 번호는 1부터 세며 빈 줄을 포함한다. CRLF는 한 줄바꿈이고 화면 자동 줄바꿈은 줄 수를 바꾸지 않는다. 자료 원문에는 표시용 줄 번호를 넣지 않는다.',
    ...(task.blanks||[]).map(blank=>`빈칸 ${blank.blankId}: ${blank.filename}, 원본 ${blank.startLine}${blank.endLine===undefined?'':`~${blank.endLine}`}줄 / 세부 문항: ${item.parts.find(p=>p.partId===blank.partId).prompt}`),
    ...item.parts.flatMap(part=>[`세부 문항: ${part.prompt}`,...part.references.map(ref=>`참조: ${ref.filename}, 원본 ${ref.startLine}${ref.endLine===undefined?'':`~${ref.endLine}`}줄${ref.blankId?`, 빈칸 ${ref.blankId}`:''}`)]),
  ];
}
