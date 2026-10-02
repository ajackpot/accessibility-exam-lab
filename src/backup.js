import {assertSafeData,DomainError,grade,sessionResult,validateBank,SUBJECTS,copy} from './domain.js?v=0.2.4';
export const MAX_BACKUP_BYTES=10*1024*1024;
function requireValue(test,message){if(!test)throw new DomainError(message,'IMPORT');}
const ident=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x);
const number=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function exportBackup(sessions){return JSON.stringify({format:'accessibility-exam-lab-backup',schemaVersion:1,exportedAt:new Date().toISOString(),sessions},null,2);}
export function validateSession(s) {
  requireValue(s&&s.schemaVersion===1&&ident(s.sessionId)&&Number.isInteger(s.revision)&&s.revision>=0,'세션 ID·스키마·개정판이 올바르지 않습니다.');
  requireValue(['prepared','active','submitted','expired','abandoned','converted'].includes(s.status),'알 수 없는 세션 상태입니다.');
  const c=s.config;requireValue(c&&['timed','untimed'].includes(c.mode)&&['written','practical'].includes(c.type)&&['practice','mock'].includes(c.kind)&&['all','s1','s2','s3','s4','s5','practical'].includes(c.subjectId)&&['all','new','wrong'].includes(c.pool)&&[4,5].includes(c.optionCount),'세션 설정이 올바르지 않습니다.');
  requireValue(Number.isInteger(c.count)&&c.count>=1&&c.count<=500,'세션 문항 수가 올바르지 않습니다.');
  if(c.mode==='timed')requireValue(Number.isInteger(c.minutes)&&c.minutes>=1&&c.minutes<=1440,'제한 시간이 올바르지 않습니다.');
  requireValue(ident(s.bankVersion)&&number(s.createdAt)&&typeof s.clockTrusted==='boolean','세션 메타데이터가 올바르지 않습니다.');
  requireValue(Array.isArray(s.items)&&s.items.length>0&&s.items.length<=500&&Number.isInteger(s.currentIndex)&&s.currentIndex>=0&&s.currentIndex<s.items.length,'문항 스냅샷이나 현재 위치가 올바르지 않습니다.');
  const ids=new Set();for(const item of s.items) {
    requireValue(ident(item.instanceId)&&!ids.has(item.instanceId)&&item.bankVersion===s.bankVersion&&item.type===c.type,'스냅샷 식별자 또는 버전 오류입니다.');ids.add(item.instanceId);
    const q=copy(item),options=item.options||[];
    if(item.type==='written') {requireValue([4,5].includes(options.length)&&new Set(options.map(o=>o.optionId)).size===options.length&&options.filter(o=>o.role==='correct').length===1&&options.some(o=>o.optionId===item.correctOptionId&&o.role==='correct'),'스냅샷 정답이 유일하지 않습니다.');q.links=options.map(o=>({optionId:o.optionId,optionRevision:o.revision,role:o.role,contextExplanation:o.contextExplanation,compatibilitySetId:'snapshot'}));q.supportedOptionCounts=[options.length];}
    validateBank({schemaVersion:item.bankSchemaVersion??1,bankVersion:s.bankVersion,releasedAt:new Date(s.createdAt).toISOString(),syllabusVersion:'snapshot',changeSummary:'backup snapshot',subjects:SUBJECTS,sources:item.sources,options,questions:[q],corrections:[]});
  }
  requireValue(s.answers&&typeof s.answers==='object'&&!Array.isArray(s.answers),'답안 객체 오류입니다.');
  for(const [key,answer] of Object.entries(s.answers)) {
    const item=s.items.find(i=>i.instanceId===key);requireValue(item,'알 수 없는 문항의 답안입니다.');
    if(item.type==='written')requireValue(typeof answer==='string'&&item.options.some(o=>o.optionId===answer),'알 수 없는 필기 답안입니다.');
    else {requireValue(answer&&typeof answer==='object'&&!Array.isArray(answer),'실기 답안 오류입니다.');for(const [pkey,value] of Object.entries(answer)){if(pkey==='freeResponse'){requireValue(typeof value==='string'&&value.length<=1000000,'서술 답안이 너무 길거나 잘못되었습니다.');continue;}const part=item.parts.find(p=>p.partId===pkey);requireValue(part,'알 수 없는 실기 세부 답안입니다.');requireValue(part.kind==='multi'?Array.isArray(value)&&new Set(value).size===value.length&&value.every(v=>part.choices.some(c=>c.id===v)):typeof value==='string'&&(part.kind==='text'||part.choices.some(c=>c.id===value)),'실기 답안 값 오류입니다.');}}
  }
  for(const name of ['revealed','exported','flags'])requireValue(s[name]&&typeof s[name]==='object'&&!Array.isArray(s[name])&&Object.entries(s[name]).every(([key,value])=>ids.has(key)&&typeof value==='boolean'),`${name} 기록 오류입니다.`);
  requireValue(Array.isArray(s.attempts)&&s.attempts.length<=s.items.length,'풀이 기록 수가 올바르지 않습니다.');
  const attemptIds=new Set();for(const a of s.attempts){const item=s.items.find(i=>i.instanceId===a.instanceId);requireValue(item&&!attemptIds.has(a.instanceId)&&a.sessionId===s.sessionId&&a.attemptId===`${s.sessionId}:${item.instanceId}`,'중복되거나 연결이 끊긴 풀이 기록입니다.');attemptIds.add(a.instanceId);requireValue(a.questionId===item.questionId&&a.revision===item.revision&&a.key===`${item.templateId}@${item.learningGoalRevision}`&&a.templateId===item.templateId&&a.learningGoalRevision===item.learningGoalRevision&&a.subjectId===item.subjectId&&a.type===item.type&&a.testOnly===item.testOnly&&a.mode===c.mode&&JSON.stringify(a.topicIds)===JSON.stringify(item.topicIds),'풀이 분류가 스냅샷과 다릅니다.');requireValue(JSON.stringify(a.grade)===JSON.stringify(grade(item,a.answer))&&JSON.stringify(a.answer)===JSON.stringify(s.answers[item.instanceId]??null),'저장된 답안·채점 결과가 일치하지 않습니다.');requireValue(number(a.confirmedAt)&&typeof a.revealedBefore==='boolean'&&typeof a.exportedBefore==='boolean'&&typeof a.converted==='boolean','풀이 시각과 도움 기록 오류입니다.');}
  if(s.status!=='prepared') requireValue(number(s.startedAt)&&number(s.lastWallAt),'시작 및 저장 시각이 없습니다.');
  if(c.mode==='timed'&&s.status!=='prepared')requireValue(number(s.expiresAt)&&s.expiresAt===s.startedAt+c.minutes*60000,'만료 시각이 제한 시간과 다릅니다.');
  if(c.mode==='untimed')requireValue(s.expiresAt===null,'무제한 세션에 만료 시각이 있습니다.');
  if(s.recoveryDraft)requireValue(s.recoveryDraft.excludedFromGrade===true&&number(s.recoveryDraft.observedAt)&&typeof s.recoveryDraft.reason==='string'&&s.recoveryDraft.answers&&typeof s.recoveryDraft.answers==='object','미채점 복구 초안 오류입니다.');
  if(s.exposureEvents)requireValue(Array.isArray(s.exposureEvents)&&s.exposureEvents.every(e=>typeof e.key==='string'&&['explanation','prompt'].includes(e.kind)&&number(e.at)),'도움 열람 기록 오류입니다.');
  requireValue(Array.isArray(s.timingChanges)&&s.timingChanges.length<=1000&&Array.isArray(s.warnings),'시간 변경 기록 오류입니다.');
  if(['submitted','expired'].includes(s.status)){requireValue(number(s.endedAt)&&number(s.observedAt),'종료 시각 오류입니다.');if(c.mode==='timed')requireValue(s.attempts.length===s.items.length&&number(s.elapsedMs)&&s.elapsedMs<=c.minutes*60000,'시간제 최종 기록이 불완전합니다.');requireValue(JSON.stringify(s.result)===JSON.stringify(sessionResult(s)),'결과 요약이 답안과 일치하지 않습니다.');}
  if(c.mode==='timed'&&['active','prepared','abandoned','converted'].includes(s.status))requireValue(s.attempts.length===0,'미완료 시간제에 확정 점수가 포함되었습니다.');
  return s;
}
export function parseBackup(raw) {
  requireValue(typeof raw==='string'&&new TextEncoder().encode(raw).byteLength<=MAX_BACKUP_BYTES,'백업 파일은 UTF-8 JSON, 최대 10MB여야 합니다.');let b;try{b=JSON.parse(raw);}catch{throw new DomainError('JSON 파일을 읽을 수 없습니다. 원본 기록은 바꾸지 않았습니다.','IMPORT');}assertSafeData(b);requireValue(b?.format==='accessibility-exam-lab-backup'&&b.schemaVersion===1,'지원하지 않는 백업 형식 또는 버전입니다.');requireValue(Array.isArray(b.sessions)&&b.sessions.length<=1000,'백업은 최대 1000세션까지 가져올 수 있습니다.');const ids=new Set();for(const s of b.sessions){requireValue(!ids.has(s.sessionId),'백업 파일 안에 중복 세션 ID가 있습니다.');ids.add(s.sessionId);validateSession(s);}return b;
}

/** Partition by whole sessions; never alter IDs/answers or silently truncate a large session. */
export function partitionBackups(sessions,{maxBytes=MAX_BACKUP_BYTES,maxSessions=1000,exportedAt=new Date().toISOString()}={}) {
  requireValue(Array.isArray(sessions),'내보낼 세션 목록이 올바르지 않습니다.');
  requireValue(Number.isInteger(maxBytes)&&maxBytes>0&&Number.isInteger(maxSessions)&&maxSessions>0,'백업 분할 한도가 올바르지 않습니다.');
  const header=`{\n  "format": "accessibility-exam-lab-backup",\n  "schemaVersion": 1,\n  "exportedAt": ${JSON.stringify(exportedAt)},\n  "sessions": [\n`,footer='\n  ]\n}';
  const bytes=s=>new TextEncoder().encode(s).byteLength,overhead=bytes(header+footer),parts=[];let records=[],size=overhead;
  const flush=(restorable=true)=>{if(!records.length)return;const content=header+records.join(',\n')+footer;parts.push({content,byteLength:bytes(content),sessionCount:records.length,restorable,reason:restorable?'이 파일을 일반 JSON 가져오기로 복원할 수 있습니다.':'한 세션이 가져오기 크기 한도를 초과합니다. 원문 보존 전용이며 현재 앱으로 재가져오기 할 수 없습니다. 원본 브라우저 기록을 지우지 마세요.'});records=[];size=overhead;};
  for(const session of sessions){const record=JSON.stringify(session,null,2).split('\n').map(line=>'    '+line).join('\n'),recordBytes=bytes(record);if(overhead+recordBytes>maxBytes){flush();records=[record];flush(false);continue;}const extra=recordBytes+(records.length?2:0);if(records.length>=maxSessions||size+extra>maxBytes)flush();size+=recordBytes+(records.length?2:0);records.push(record);}
  flush();if(!parts.length){const content=JSON.stringify({format:'accessibility-exam-lab-backup',schemaVersion:1,exportedAt,sessions:[]},null,2);parts.push({content,byteLength:bytes(content),sessionCount:0,restorable:true,reason:'빈 기록 백업입니다.'});}
  return parts.map((part,index)=>({...part,filename:`접근성-연습-${part.restorable?'백업':'원문보존-가져오기불가'}-${String(index+1).padStart(3,'0')}.json`}));
}
