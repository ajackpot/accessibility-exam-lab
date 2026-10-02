import {DomainError,copy,validateBank,sha256,SCHEMA_VERSION} from './domain.js?v=0.2.3';
const DB_NAME='accessibility-exam-lab';
export class StorageError extends Error {constructor(message,code='STORAGE'){super(message);this.name='StorageError';this.code=code;}}
export async function openStore(factory=globalThis.indexedDB) {
  if(!factory)throw new StorageError('이 브라우저에서 IndexedDB를 사용할 수 없습니다. 비공개 창 설정을 확인하세요.');
  return new Promise((resolve,reject)=>{const request=factory.open(DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'sessionId'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');};request.onerror=()=>reject(new StorageError('학습 저장소를 열 수 없습니다. 기존 기록을 지우지 말고 저장 공간과 브라우저 설정을 확인하세요.'));request.onblocked=()=>reject(new StorageError('저장소 업그레이드가 다른 탭에 막혔습니다. 다른 학습 앱 탭을 닫아 주세요.'));request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(new Store(db));};});
}
export class Store {
  constructor(db){this.db=db;}
  async read(name,key){return new Promise((resolve,reject)=>{const tx=this.db.transaction(name,'readonly'),r=key===undefined?tx.objectStore(name).getAll():tx.objectStore(name).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new StorageError('저장한 자료를 읽을 수 없습니다.'));});}
  sessions(){return this.read('sessions');} session(id){return this.read('sessions',id);} meta(key){return this.read('meta',key);}
  async putMeta(key,value){return this.transaction(['meta'],tx=>tx.objectStore('meta').put(value,key));}
  async insert(session){return this.transaction(['sessions'],tx=>tx.objectStore('sessions').add(session));}
  async transaction(names,work){return new Promise((resolve,reject)=>{const tx=this.db.transaction(names,'readwrite');let result;try{result=work(tx);}catch(error){tx.abort();reject(error);return;}tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new StorageError('저장하지 못했습니다. 저장 공간 부족 또는 브라우저 제한일 수 있습니다. 새로고침하면 미저장 입력을 잃을 수 있으니 백업하세요.'));tx.onabort=()=>reject(new StorageError('저장을 완료하지 못했습니다. 마지막 저장 기록은 유지됩니다.'));});}
  async update(sessionId,expectedRevision,mutator) {
    return new Promise((resolve,reject)=>{const tx=this.db.transaction('sessions','readwrite'),store=tx.objectStore('sessions'),req=store.get(sessionId);let result,error;
      req.onsuccess=()=>{try{const current=req.result;if(!current)throw new StorageError('세션을 찾을 수 없습니다.','MISSING');if(current.revision!==expectedRevision)throw new StorageError('다른 탭에서 답안이 변경되었습니다. 이 탭의 저장을 멈췄습니다. 최신 기록을 다시 열어 주세요.','CONFLICT');result=mutator(copy(current));if(result.sessionId!==sessionId)throw new StorageError('세션 식별자를 바꿀 수 없습니다.');result.revision=current.revision+1;store.put(result);}catch(e){error=e;tx.abort();}};
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(error||new StorageError('답안을 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인하세요.'));tx.onabort=()=>reject(error||new StorageError('저장되지 않았습니다. 입력 내용은 화면에 남아 있습니다. 백업 후 다시 시도하세요.'));
    });
  }
  async convert(oldId,revision,mutator){return new Promise((resolve,reject)=>{const tx=this.db.transaction('sessions','readwrite'),store=tx.objectStore('sessions'),r=store.get(oldId);let result,error;r.onsuccess=()=>{try{if(r.result?.revision!==revision)throw new StorageError('다른 탭과 변경 충돌이 있습니다. 최신 기록을 열어 주세요.','CONFLICT');result=mutator(copy(r.result));result.old.revision=revision+1;store.put(result.old);store.add(result.next);}catch(e){error=e;tx.abort();}};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(error||new StorageError('전환 저장에 실패했습니다. 기존 시간제는 유지됩니다.'));});}
  async importSessions(sessions,replace=false){return new Promise((resolve,reject)=>{const tx=this.db.transaction('sessions','readwrite'),store=tx.objectStore('sessions');let imported=0,duplicates=0,conflicts=0;if(replace)store.clear();for(const session of sessions){if(replace){store.put(session);imported++;continue;}const req=store.get(session.sessionId);req.onsuccess=()=>{if(!req.result){store.add(session);imported++;}else if(JSON.stringify(req.result)===JSON.stringify(session))duplicates++;else conflicts++;};}tx.oncomplete=()=>resolve({imported,duplicates,conflicts});tx.onerror=tx.onabort=()=>reject(new StorageError('가져오기를 저장하지 못했습니다. 기존 기록은 유지됩니다.'));});}
  async clearSessions(){return this.transaction(['sessions'],tx=>tx.objectStore('sessions').clear());}
}
export async function fetchBank(baseURL,fetcher=globalThis.fetch) {
  const manifestURL=new URL('data/manifest.json',baseURL);const response=await fetcher(manifestURL,{cache:'no-store'});if(!response.ok)throw new DomainError('문제 은행 정보를 내려받지 못했습니다. 마지막 정상 버전을 유지합니다.','NETWORK');const manifest=await response.json();
  if(manifest.schemaVersion!==SCHEMA_VERSION||!/^releases\/[A-Za-z0-9_.-]+\/bank\.json$/.test(manifest.file)||!/^[a-f0-9]{64}$/.test(manifest.sha256)||typeof manifest.bankVersion!=='string'||manifest.file!==`releases/${manifest.bankVersion}/bank.json`)throw new DomainError('문제 은행 manifest 구조 또는 호환성 오류입니다.','MANIFEST');
  const bankURL=new URL(manifest.file,new URL('data/',baseURL));if(bankURL.origin!==manifestURL.origin)throw new DomainError('외부 문제 은행 주소는 허용하지 않습니다.');
  const r=await fetcher(bankURL,{cache:'no-store'});if(!r.ok)throw new DomainError('문제 은행 파일 다운로드가 실패했습니다.','NETWORK');const bytes=await r.text();if(new TextEncoder().encode(bytes).byteLength>25*1024*1024)throw new DomainError('문제 은행 파일이 너무 큽니다.');if(await sha256(bytes)!==manifest.sha256)throw new DomainError('문제 은행 해시가 일치하지 않습니다. 손상된 업데이트를 적용하지 않았습니다.','HASH');const bank=validateBank(JSON.parse(bytes));if(bank.bankVersion!==manifest.bankVersion||bank.releasedAt!==manifest.releasedAt)throw new DomainError('파일 버전이 manifest와 다릅니다.');return {manifest,bank,checkedAt:Date.now()};
}
export async function updateBank(store,baseURL,fetcher=globalThis.fetch){const bundle=await fetchBank(baseURL,fetcher);const previous=store.meta?await store.meta('bank'):null;if(previous?.manifest?.bankVersion===bundle.manifest.bankVersion&&previous.manifest.sha256!==bundle.manifest.sha256)throw new DomainError('동일 버전의 내용이 바뀌어 업데이트를 거부했습니다. 새 버전으로 배포해야 합니다.','IMMUTABLE');if(previous?.bank&&Date.parse(previous.bank.releasedAt)>Date.parse(bundle.bank.releasedAt))throw new DomainError('현재보다 오래된 은행이어서 자동 적용하지 않았습니다.','STALE');await store.putMeta('bank',bundle);return bundle;}
/** Holds a browser Web Lock until release. IndexedDB CAS still protects every write. */
export async function acquireEditor(sessionId,locks=globalThis.navigator?.locks) {
  if(!locks)return {acquired:true,release:()=>{},fallback:true};
  let release;const wait=new Promise(r=>release=r);let decide;const acquired=new Promise(r=>decide=r);
  locks.request(`accessibility-exam-lab:session:${sessionId}`,{ifAvailable:true},async lock=>{decide(!!lock);if(lock)await wait;}).catch(()=>decide(false));
  return {acquired:await acquired,release,fallback:false};
}
