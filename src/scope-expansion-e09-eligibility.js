/** One reviewed E09 final-filter decision, applied only to fresh selection.
 * Published content, saved snapshots, answers, grades and history stay intact. */
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const SCOPE_E09_ELIGIBILITY_POLICY = freeze({
  "schemaVersion": 1,
  "kind": "scope_expansion_final_filter_new_session_eligibility",
  "policyId": "scope-expansion-e09-001",
  "decidedAt": "2026-10-27T02:23:46.677420+00:00",
  "effectiveAt": "2026-10-27T02:27:28.620910+00:00",
  "decisionSha256": "e0d307f8e3225d8fb2480bf7a3990941d28a1e64e2b9dfe90672a4ee92212251",
  "sourceBank": {
    "version": "2026.10.27-scope-expansion.e08.1-service.1",
    "sha256": "ebb5cade415b165eefb6e653f08ab9df8f406ea74f3be116ef62014cbf2de7e4"
  },
  "excluded": [
    {
      "questionId": "se04-s01-w01",
      "revision": 1,
      "itemBundleCanonicalSha256": "53e25c5aea28f4f401df4252a1efbf91fda735c24e7dd4905136e98c17484c0e",
      "disposition": "merge",
      "mergedInto": "r006-standards-s5-w01",
      "mergedIntoPin": {
        "questionId": "r006-standards-s5-w01",
        "revision": 1,
        "itemBundleCanonicalSha256": "da70c0b615996357060004459dbea617febd9f5d3631b5ef82ab23ee6b1e2677"
      }
    },
    {
      "questionId": "se04-s02-w03",
      "revision": 1,
      "itemBundleCanonicalSha256": "67ecd66ba2a1d2c97f7b9ae107007ddbab6268bf2d67284ab897a0ff3707f102",
      "disposition": "scope_excluded",
      "mergedInto": null,
      "mergedIntoPin": null
    },
    {
      "questionId": "se04-s02-w04",
      "revision": 1,
      "itemBundleCanonicalSha256": "5b3f6c498815c527c37df16458c01db42e5ed18a7ba696135e186ce3f3eec800",
      "disposition": "scope_excluded",
      "mergedInto": null,
      "mergedIntoPin": null
    }
  ]
});
const effectiveAt=Date.parse(SCOPE_E09_ELIGIBILITY_POLICY.effectiveAt);
/** Reserve only the three reviewed IDs across cached banks. A later revision
 * needs a separately reviewed policy; callers cannot provide exclusions. */
export function isScopeExpansionE09Excluded(question,now=Date.now()) {
  if(!Number.isFinite(now))throw new RangeError('E09 new-session eligibility requires a finite time.');
  return now>=effectiveAt&&SCOPE_E09_ELIGIBILITY_POLICY.excluded.some(target=>target.questionId===question?.questionId);
}
