/** New-session priority only. These valid items remain published historical
 * content. No bank, saved item, answer, grade or statistic is rewritten. */
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const NEW_SESSION_ELIGIBILITY_POLICY=freeze({
  schemaVersion:1,
  kind:'existing_valid_content_new_session_eligibility',
  policyId:'existing-priority-001',
  reasonCode:'lower_pedagogical_priority',
  decidedAt:'2026-10-10T13:27:33.797986+00:00',
  effectiveAt:'2026-10-10T13:37:38.672Z',
  sourceDecision:{path:'docs/analysis/2026-10-10-existing-bank-value-terminal-decisions.json',sha256:'c4443769d90c4b45a1d7e3a075f776744149e78733dacb6ee8493b6ceafc78f3'},
  sourceBank:{version:'2026.10.09-regular.39',path:'data/releases/2026.10.09-regular.39/bank.json',sha256:'42cc772d52de759ee9c292f2d47bd71aa5e0371c8679fa7992a218ee68cda919'},
  excluded:[
    {questionId:'r019-policy-assistive-s1-w03',revision:1,itemBundleCanonicalSha256:'50d32d72e518ba966226efb652eeb509d999e6afb690f3a6209efe71fa2f7007'},
    {questionId:'r017-policy-accessibility-s1-w02',revision:2,itemBundleCanonicalSha256:'1228b526317a4305aec3136bf30d107e2b92a6d6584166503339c655ebd395ba'},
    {questionId:'r037-script-at-s5-w01',revision:1,itemBundleCanonicalSha256:'bbd14160ca1633d9965c5a4f1b73da6c9881c9000e0b99aecbc552c91ca3c7d2'},
    {questionId:'r027-policy-assistive-s5-w07',revision:1,itemBundleCanonicalSha256:'08b14fed14b40e0709bf9dd9f836a66bae64b0ffdc0511cbc6d9b2b511349c7a'},
    {questionId:'r014-dom-html-s3-w05',revision:1,itemBundleCanonicalSha256:'106d27a6368e059d958456388ed3ba8120641d08f1e43cd5df8f0825984090af'}
  ]
});
const effectiveAt=Date.parse(NEW_SESSION_ELIGIBILITY_POLICY.effectiveAt);
/** ID reservation is a conservative re-entry guard, not a new value judgment
 * about hypothetical revisions. Reconsideration needs a separate reviewed policy.
 * Never accept caller-supplied exclusions or mutate the question/bank. */
export function isPriorityPoolExcluded(question,now=Date.now()) {
  if(!Number.isFinite(now))throw new RangeError('New-session eligibility requires a finite time.');
  return now>=effectiveAt&&NEW_SESSION_ELIGIBILITY_POLICY.excluded.some(target=>target.questionId===question?.questionId);
}
