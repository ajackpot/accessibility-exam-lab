/** Optional structured practical tasks. Source and learner strings are never rewritten. */
export const INSPECTION_FIELDS = [
  {key:'guidelines',label:'검사항목·지침'},
  {key:'locations',label:'파일·원본 줄'},
  {key:'cause',label:'원인과 사용자 영향'},
  {key:'improvement',label:'개선안'},
];
export const sourceLines = content => content.split(/\r\n|\n|\r/);
export const isManualPart = part => ['code','inspection'].includes(part.kind);
const ISSUE_ENTRY_GUIDANCE='한 이슈의 지침·위치·원인과 사용자 영향·개선안을 하나의 입력란 세트에 작성하고 이슈별로 저장합니다. 이슈 번호는 목록 순서에 따라 표시됩니다.';
const INSPECTION_DISPLAY_REPLACEMENTS=[
  ['각 오류에 E01처럼 임의 식별자를 붙이고 네 입력란에서 같은 식별자로 대응한다.',ISSUE_ENTRY_GUIDANCE],
  ['각 오류에 E01 같은 식별자를 임의로 정하고 지침·위치·원인과 영향·개선의 네 입력란에서 같은 식별자로 연결하시오.',ISSUE_ENTRY_GUIDANCE],
  ['오류마다 같은 식별 번호로 지침/기술 근거, 파일과 핵심 줄 또는 좁은 범위·줄 집합, 원인과 사용자 영향, 개선안을 연결한다.','지침/기술 근거, 파일과 핵심 줄 또는 좁은 범위·줄 집합, 원인과 사용자 영향, 개선안을 한 이슈의 입력란 세트에 작성하고 이슈별로 저장한다. 이슈 번호는 목록 순서에 따라 표시된다.'],
  ['오류별 지침/기술 근거, 파일과 원본 줄 또는 좁은 범위·줄 집합, 원인과 사용자 영향, 개선안을 같은 번호로 연결한다.','지침/기술 근거, 파일과 원본 줄 또는 좁은 범위·줄 집합, 원인과 사용자 영향, 개선안을 한 이슈의 입력란 세트에 작성하고 이슈별로 저장한다. 이슈 번호는 목록 순서에 따라 표시된다.'],
  ['세부 자동판정은 전체 평가보고서의 수동 평가와 분리한다.','앱은 실기 답안을 자동 판정하거나 점수를 매기지 않는다.'],
];
/** Presentation only: replace known obsolete instructions without rewriting source data. */
export function inspectionDisplayInstructions(item) {
  const text=item?.practicalTask?.answerInstructions;
  return item?.parts?.some(part=>part.kind==='inspection')&&typeof text==='string'
    ?INSPECTION_DISPLAY_REPLACEMENTS.reduce((value,[before,after])=>value.split(before).join(after),text):text;
}
export function inspectionDisplayPrompt(part) {
  if(part?.kind!=='inspection'||typeof part.prompt!=='string')return part?.prompt;
  return part.prompt.replace('네 입력란에서 같은 오류 번호로 연결하시오.','이슈별 입력란 세트에 작성하여 저장하시오.')
    .replace('같은 오류는 네 입력란에서 같은 식별자로 대응하시오.','같은 오류의 네 관점은 하나의 이슈로 저장하시오.');
}
const object = value => !!value&&typeof value==='object'&&!Array.isArray(value);
const string = (value,max=100000) => typeof value==='string'&&value.trim().length>0&&value.length<=max;
const identifier = value => typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);
const integer = (value,min,max) => Number.isInteger(value)&&value>=min&&value<=max;
const onlyKeys = (value,keys) => object(value)&&Object.keys(value).every(key=>keys.includes(key));
const inspectionKeys=INSPECTION_FIELDS.map(field=>field.key);
const inspectionFields=(value,{complete=false,nonempty=false,extra=[]}={})=>onlyKeys(value,[...inspectionKeys,...extra])&&inspectionKeys.every(key=>nonempty?string(value[key]):complete?typeof value[key]==='string'&&value[key].length<=100000:value[key]===undefined||(typeof value[key]==='string'&&value[key].length<=100000));
const hasInspectionText=value=>INSPECTION_FIELDS.some(({key})=>value?.[key]?.trim());
const issueError=message=>Object.assign(new Error(message),{name:'DomainError',code:'INVALID'});
export const ISSUE_ANSWER_MAX_LENGTH=1000000;
/** Only learner answers use this format; bank reference answers remain verbatim. */
export function isIssueAnswer(value) {
  if(!onlyKeys(value,['format','issues','draft','deleted','legacy'])||value.format!=='issue-list-v1'||!Array.isArray(value.issues))return false;
  const issue=row=>inspectionFields(row,{complete:true,extra:['id']})&&identifier(row.id);
  if(!value.issues.every(issue))return false;
  const ids=new Set(value.issues.map(row=>row.id));if(ids.size!==value.issues.length)return false;
  if(value.draft!==undefined&&(!inspectionFields(value.draft,{complete:true,extra:['id']})||(value.draft.id!==undefined&&(!identifier(value.draft.id)||!ids.has(value.draft.id)))))return false;
  if(value.deleted!==undefined){
    if(!Array.isArray(value.deleted))return false;
    for(const row of value.deleted){if(!onlyKeys(row,['issue','index'])||!issue(row.issue)||!integer(row.index,0,Number.MAX_SAFE_INTEGER)||ids.has(row.issue.id))return false;ids.add(row.issue.id);}
  }
  if(value.legacy!==undefined&&!inspectionFields(value.legacy))return false;
  return JSON.stringify(value).length<=ISSUE_ANSWER_MAX_LENGTH;
}
export function toIssueAnswer(value) {
  if(value===undefined)return {format:'issue-list-v1',issues:[]};
  if(isIssueAnswer(value))return structuredClone(value);
  if(inspectionFields(value))return {format:'issue-list-v1',issues:[],legacy:structuredClone(value)};
  throw issueError('이슈 답안의 형식 또는 저장 크기를 확인하세요.');
}
function checkedIssueAnswer(value){if(!isIssueAnswer(value))throw issueError('이슈 답안의 형식 또는 저장 크기를 확인하세요.');return value;}
export function setInspectionDraft(value,draft) {
  const next=toIssueAnswer(value);
  if(!inspectionFields(draft,{complete:true,extra:['id']}))throw issueError('초안의 네 필드 형식을 확인하세요.');
  if(next.draft&&next.draft.id!==draft?.id)throw issueError('현재 초안을 등록하거나 취소한 뒤 다른 이슈를 편집하세요.');
  next.draft=structuredClone(draft);return checkedIssueAnswer(next);
}
export function commitInspectionDraft(value,{id}={}) {
  const next=toIssueAnswer(value),draft=next.draft;
  if(!draft||!hasInspectionText(draft))throw issueError('이슈 내용을 입력한 뒤 등록하세요.');
  if(draft.id!==undefined){
    if(id!==undefined&&id!==draft.id)throw issueError('수정 중인 이슈의 식별자를 바꿀 수 없습니다.');
    next.issues[next.issues.findIndex(row=>row.id===draft.id)]={...draft};
  }else{
    if(!identifier(id)||next.issues.some(row=>row.id===id)||next.deleted?.some(row=>row.issue.id===id))throw issueError('새 이슈에는 중복되지 않는 식별자가 필요합니다.');
    next.issues.push({...draft,id});
  }
  delete next.draft;return checkedIssueAnswer(next);
}
export function cancelInspectionDraft(value){const next=toIssueAnswer(value);delete next.draft;return next;}
export function deleteInspectionIssue(value,id) {
  const next=toIssueAnswer(value),index=next.issues.findIndex(row=>row.id===id);
  if(index<0)throw issueError('삭제할 이슈가 없습니다.');
  if(next.draft?.id===id)throw issueError('이슈의 수정 초안을 저장하거나 취소한 뒤 삭제하세요.');
  const [issue]=next.issues.splice(index,1);(next.deleted??=[]).push({issue,index});return checkedIssueAnswer(next);
}
export function restoreInspectionIssue(value,id) {
  const next=toIssueAnswer(value),index=next.deleted?.findIndex(row=>row.issue.id===id)??-1;
  if(index<0)throw issueError('복구할 이슈가 없습니다.');
  const [row]=next.deleted.splice(index,1);next.issues.splice(Math.min(row.index,next.issues.length),0,row.issue);
  if(!next.deleted.length)delete next.deleted;return checkedIssueAnswer(next);
}
export function moveInspectionIssue(value,id,toIndex) {
  const next=toIssueAnswer(value),index=next.issues.findIndex(row=>row.id===id);
  if(index<0||!integer(toIndex,0,next.issues.length-1))throw issueError('이슈의 이동 위치를 확인하세요.');
  const [issue]=next.issues.splice(index,1);next.issues.splice(toIndex,0,issue);return next;
}
const inspectionFieldLines=value=>INSPECTION_FIELDS.flatMap(({key,label})=>[label,typeof value?.[key]==='string'?value[key]:'[미작성]']);
function referenceInspectionData(part) {
  const value=part?.referenceAnswer;
  if(part?.kind!=='inspection'||!inspectionFields(value,{nonempty:true}))return null;
  const fields={};let expected=null;
  for(const key of inspectionKeys){
    const rows=[],supplements=[],baseLines=[];
    for(const line of sourceLines(value[key])){
      const base=/^(E\d{2,})[:.] (.+)$/.exec(line),extra=/^(E\d{2,}) 보완\. (.+)$/.exec(line);
      if(base&&!supplements.length){rows.push({id:base[1],text:base[2]});baseLines.push(line);}
      else if(extra)supplements.push({id:extra[1],text:line});
      else return null; // No guessing about unlabeled continuations or partial records.
    }
    const ids=rows.map(row=>row.id);
    if(!ids.length||ids.some((id,index)=>id!=='E'+String(index+1).padStart(2,'0'))||new Set(ids).size!==ids.length)return null;
    if(expected&&JSON.stringify(ids)!==JSON.stringify(expected))return null;expected??=ids;
    if(supplements.some(row=>!ids.includes(row.id)))return null;
    fields[key]={rows,supplements,baseText:baseLines.join('\n')};
  }
  const baseGroups=expected.map((id,index)=>({id,...Object.fromEntries(inspectionKeys.map(key=>[key,fields[key].rows[index].text]))}));
  const groups=baseGroups.map(row=>({...row,...Object.fromEntries(inspectionKeys.map(key=>[key,[row[key],...fields[key].supplements.filter(extra=>extra.id===row.id).map(extra=>extra.text)].join('\n')]))}));
  return {groups,baseGroups,fields};
}
/** Explicit E## identifiers must be complete and ordered equally in all four fields. */
export function inspectionReferenceGroups(part){return referenceInspectionData(part)?.groups??null;}
/** Remove only a provably identical top-level representation; retain every extra byte. */
export function inspectionReferenceRemainder(item) {
  if(item?.parts?.length!==1||typeof item.referenceAnswer!=='string')return null;
  const part=item.parts[0],data=referenceInspectionData(part);if(!data)return null;
  if(item.practicalTask?.errorCount!==undefined&&item.practicalTask.errorCount!==data.groups.length)return null;
  const pipe=data.baseGroups.map(row=>`${row.id} | ${row.guidelines}\n위치: ${row.locations}\n원인·영향: ${row.cause}\n개선: ${row.improvement}`).join('\n\n');
  const numbered=data.baseGroups.map(row=>`${row.id}\n지침: ${row.guidelines}\n위치: ${row.locations}\n원인·사용자 영향: ${row.cause}\n개선: ${row.improvement}`).join('\n\n');
  const prefixes=[pipe,`전체 평가 참고 답안 — ${data.groups.length}개 독립 원인\n\n${numbered}`,
    '전체 평가 참고 답안\n\n'+inspectionKeys.map(key=>key+'\n'+part.referenceAnswer[key]).join('\n\n'),
    '전체 평가 참고 답안\n\n'+inspectionKeys.map(key=>key+'\n'+data.fields[key].baseText).join('\n\n')];
  for(const prefix of prefixes)if(item.referenceAnswer===prefix||item.referenceAnswer.startsWith(prefix+'\n\n'))return item.referenceAnswer.slice(prefix.length);
  return null;
}
/** Stored issues, unsaved edits and untouched legacy text each have their own boundary. */
export function inspectionAnswerText(value,{reference=false}={}) {
  if(!reference&&isIssueAnswer(value)){
    const lines=[];
    value.issues.forEach((issue,index)=>lines.push(`등록 이슈 ${index+1}`,...inspectionFieldLines(issue)));
    if(value.draft){const index=value.issues.findIndex(issue=>issue.id===value.draft.id);lines.push(index<0?'목록 미등록 초안':'수정 중 초안: 등록 이슈 '+(index+1)+' (아직 미적용)',...inspectionFieldLines(value.draft));}
    if(value.legacy!==undefined)lines.push('이전 네 필드 답안 원문 (이슈별로 자동 결합하지 않음)',...inspectionFieldLines(value.legacy));
    return lines.length?lines.join('\n\n'):'[미작성]';
  }
  if(value!==undefined&&!inspectionFields(value))throw issueError('평가 답안의 원문 형식을 확인하세요.');
  const groups=reference?inspectionReferenceGroups({kind:'inspection',referenceAnswer:value}):null;
  return groups?groups.flatMap(issue=>[`이슈 ${issue.id}`,...inspectionFieldLines(issue)]).join('\n\n'):inspectionFieldLines(value).join('\n\n');
}
export function validManualAnswer(part,value,{reference=false}={}) {
  if(!isManualPart(part))return false;
  if(part.kind==='code')return typeof value==='string'&&value.length<=1000000&&(!reference||value.trim().length>0);
  return (!reference&&isIssueAnswer(value))||inspectionFields(value,{nonempty:reference});
}
export function manualPartAnswered(part,value) {
  if(!validManualAnswer(part,value))return false;
  return part.kind==='code'?value.trim()!=='':isIssueAnswer(value)?value.issues.some(hasInspectionText)||hasInspectionText(value.draft)||hasInspectionText(value.legacy):hasInspectionText(value);
}
function validateReference(q,reference,assert) {
  assert(onlyKeys(reference,['filename','startLine','endLine','blankId']),`${q.questionId}: 자료 참조 형식 오류`);
  const material=q.materials?.find(m=>(m.type===undefined||m.type==='code')&&m.filename===reference.filename&&m.purpose==='question');
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
  assert(Array.isArray(q.materials)&&q.materials.every(m=>object(m)&&((m.type===undefined||m.type==='code')?typeof m.content==='string':m.type==='text'&&Array.isArray(m.items)&&m.items.every(value=>typeof value==='string'))),`${q.questionId}: 공통 자료 목록과 원문을 확인하세요.`);
  const materials=q.materials.filter(m=>m.purpose==='question'&&(m.type===undefined||m.type==='code'));
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
  materials=materials.filter(m=>m.type===undefined||m.type==='code');
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
    ...(isUnscoredPractical(item)&&item.parts.some(part=>part.kind==='inspection')?[
      '현재 이슈별 답안 작성·검토 방식 (원문의 과거 입력·채점 안내보다 우선)',ISSUE_ENTRY_GUIDANCE,
      '앱은 실기 답안을 자동 판정하거나 점수를 매기지 않는다. 아래 원문의 같은 식별자를 네 입력란에 반복하는 안내와 세부 자동판정 안내는 과거 방식이다. 원문의 지침·위치·대안·중복 처리 등 과제 판단 조건은 그대로 적용한다. 등록 이슈, 아직 등록하지 않은 초안, 수정 중 초안과 이전 네 필드 답안 원문은 각각 구분하여 검토한다.',
    ]:[]),
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

/** P01 changes only assessment presentation; source/manual answer bytes are retained. */
export const isUnscoredPractical = item => item?.type==='practical'&&item.assessmentMode==='unscored'&&!!item.practicalTask;
const UNSCORED_PROSE_REPLACEMENTS = [["notes","자동점수1점은 공통 자료의 표시 대상 식별 관찰에만 해당한다. 접근성 평가보고서·구현 코드의 수행 점수는 별도 수동 기준이며 이 자동점수로 대체하지 않는다.","답안을 작성한 뒤 모범 답안과 검토 기준을 참고해 접근성 평가보고서·구현 코드를 스스로 비교한다. 앱은 점수를 매기지 않는다."],["rubric.description","오류당 원인군1점+타당한 기준1점. 같은 원인의 반복 지적은 중복 가산하지 않는다.","오류별 원인군과 타당한 기준이 연결되는지 확인한다. 같은 원인의 반복 지적은 하나로 묶는다."],["rubric.description","오류당 판별 가능한 원본 위치1점+원인에서 발생하는 사용자 영향1점. 정확한 한 줄만 강제하지 않는다.","오류별 판별 가능한 원본 위치와 원인에서 발생하는 사용자 영향을 확인한다. 정확한 한 줄만 강제하지 않는다."],["rubric.description","오류당 원인을 해소하고 기존 기능을 보존하는 개선2점. 동등한 대안 인정. 공식 배점이 아닌 수동 참고 기준이다.","오류별 원인을 해소하고 기존 기능을 보존하는 개선인지 확인한다. 동등한 대안을 인정한다. 자율 비교를 위한 참고 기준이다."],["referenceAnswer","제한형 자료 관찰 답: result-count. 이 항목은1점의 위치 식별 관찰이며 전체 접근성 수행 능력 점수가 아니다.","자료 관찰 참고: result-count. 공통 자료의 표시 대상을 확인할 때 참고한다."],["rubric.description","비공식 수동 참고 기준이며 앱 자동점수에 합산하지 않는다.","자율 비교를 위한 참고 기준이다."],["notes","자동관찰1점은 날짜 선택값을 읽는 항목에만 해당하며 전체 접근성 평가·구현 수행 점수가 아니다. 큰 과제는 별도 비공식 수동 기준으로 검토한다.","답안을 작성한 뒤 모범 답안과 검토 기준을 참고해 접근성 평가·구현 결과를 스스로 비교한다. 앱은 점수를 매기지 않는다."],["referenceAnswer","제한형 자료 관찰 답: 2026-11-10. 날짜 선택값의 식별1점이며 전체 접근성 수행 능력 점수가 아니다.","자료 관찰 참고: 2026-11-10. 날짜 선택값을 확인할 때 참고한다."],["rubric.description","비공식 수동 기준이며 자동점수와 분리한다.","자율 비교를 위한 참고 기준이다."],["notes","수동 답안은 자동 정오·점수 통계에 합산하지 않는다. 선택형 세부 문항의 배점과 수동 검토용 루브릭은 별개다.","답안을 작성한 뒤 모범 답안과 검토 기준으로 스스로 비교한다. 앱은 정오를 판정하거나 점수를 매기지 않는다."],["rubric.description","오류별로 성립하는 검사항목을 1점씩 수동 검토한다. 복수 관련 지침은 중복 가산하지 않는다.","오류별로 성립하는 검사항목을 확인한다. 같은 오류의 복수 관련 지침은 하나로 묶는다."],["rubric.description","오류별 핵심 코드와 필요한 연결 위치를 1점씩 수동 검토한다. 타당한 줄 집합·범위를 인정한다.","오류별 핵심 코드와 필요한 연결 위치를 확인한다. 타당한 줄 집합·범위를 인정한다."],["rubric.description","오류별 실제 발생 원인과 사용자 영향을 연결하면 1점씩 수동 검토한다.","오류별 실제 발생 원인과 사용자 영향이 연결되는지 확인한다."],["rubric.description","오류별 명세를 유지하는 유효한 수정안을 1점씩 수동 검토한다. 동등한 코드를 인정한다.","오류별 명세를 유지하는 유효한 수정안인지 확인한다. 동등한 코드를 인정한다."],["referenceAnswer","자동 세부 문항 참고 답안\nfilter-result: ","추가 자료 해설\n"],["referenceAnswer","다른 관련 지침을 추가했다는 이유로 감점하지 않는다.","다른 관련 지침을 추가한 답도 인정한다."],["rubric.description","주변 코드와 연결되어 정상 동작하면 2점, 접근성 의미는 충족하나 국소적인 실행 결함이 있으면 1점, 핵심 요구를 충족하지 않으면 0점으로 수동 검토한다.","주변 코드와 연결되어 정상 동작하는지, 접근성 의미를 충족하는지, 국소적인 실행 결함이나 핵심 요구의 누락이 있는지 확인한다."],["referenceAnswer","자동 세부 문항 참고 답안\nnative-activation: ","추가 자료 해설\n"],["referenceAnswer","따옴표·들여쓰기·선언 방식의 의미 보존 차이로 감점하지 않는다.","따옴표·들여쓰기·선언 방식의 의미 보존 차이가 있는 동등 코드를 인정한다."],["referenceAnswer","자동 세부 문항 참고 답안\nplay-event: ","추가 자료 해설\n"],["referenceAnswer","자동 세부 문항 참고 답안\nplay-failure: ","추가 자료 해설\n"],["notes","모든 답안은 0점 수동 검토 대상이며 자동 정오·점수·정답률에 합산하지 않는다. 참고 답안과 표현이 달라도 같은 조건을 충족하는 대안을 인정한다.","모든 답안은 무채점 자율 비교 대상이다. 참고 답안과 표현이 달라도 같은 조건을 충족하는 대안을 인정한다."],["referenceAnswer","관련 지침 추가는 허용하되 지침 개수로 가산하지 않는다.","관련 지침 추가는 허용하되 지침 개수만으로 더 많은 오류를 찾았다고 판단하지 않는다."]];
export function unscoredPracticalContent(item) {
  if(item?.type!=='practical'||!item.practicalTask)throw new Error('구조화 실기만 무채점 연습으로 이어갈 수 있습니다.');
  const next=structuredClone(item);
  const rewrite=(value,field)=>typeof value==='string'?UNSCORED_PROSE_REPLACEMENTS.filter(row=>row[0]===field).reduce((text,[,before,after])=>text.split(before).join(after),value):value;
  next.assessmentMode='unscored';next.parts=next.parts.filter(isManualPart);
  if(next.notes)next.notes=next.notes.map(value=>rewrite(value,'notes'));
  if(next.referenceAnswer!==undefined)next.referenceAnswer=rewrite(next.referenceAnswer,'referenceAnswer');
  if(next.rubric)next.rubric=next.rubric.map(row=>({...row,points:0,description:rewrite(row.description,'rubric.description')}));
  return next;
}
