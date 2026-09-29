// Guards the per-post roll-up that feeds /admin/analytics "Top posts".
//
// These are structural assertions on the aggregation pipelines, not execution
// tests: the traps here are all "the pipeline is valid Mongo and quietly
// computes the wrong number", which is exactly the class of bug a require() or
// a smoke request cannot catch.
//
// The one that actually bit: reach is a set of distinct viewers, and the test
// for "does this event have a viewer" has to be built from real booleans.
// Written the natural way — an $or over $ifNull'd raw field values — Mongo
// coerces "" to TRUE, so every event with an empty sessionId joined the set as
// the literal key "|" and reach was inflated by exactly the number of those
// events. It ran without error the whole time.
const A = require("../analyticsHelpers");

let failures = 0;
function check(label, got, want) {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    const pass = g === w;
    if (!pass) failures++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${label}`);
    if (!pass) console.log(`        got  ${g}\n        want ${w}`);
}
function ok(label, cond) {
    if (!cond) failures++;
    console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
}

const MATCH = { postId: { $ne: null } };

// --- counts stage ------------------------------------------------------------
const counts = A.postCountsPipeline(MATCH);
const group = counts.find((s) => s.$group).$group;

check("counts: groups by postId", group._id, "$postId");
check("counts: only impressions count as impressions", group.impressions, {
    $sum: { $cond: [{ $eq: ["$type", "post_impression"] }, 1, 0] },
});
check("counts: shares are counted separately", group.shares, {
    $sum: { $cond: [{ $eq: ["$type", "post_share"] }, 1, 0] },
});

// Every click type the client actually sends must be classified as a click, and
// "impression" must NOT be — it is already counted on its own line, and
// double-counting it would make CTR meaningless. ($in takes [value, array].)
const clickTypes = group.clicks.$sum.$cond[0].$in[1];
check("counts: click types", clickTypes, [
    "post_click", "post_profile_click", "post_link_click", "post_hashtag_click",
]);
ok("counts: impression is not also a click", !clickTypes.includes("post_impression"));
ok("counts: pipeline is capped by the caller, not here",
    !counts.some((s) => s.$limit));

// --- viewer (reach) stage ----------------------------------------------------
const viewers = A.viewerSetPipeline(MATCH);
const vgroup = viewers.find((s) => s.$group).$group;
const cond = vgroup.viewers.$addToSet.$cond;

ok("reach: the accumulator is a set, not a sum", typeof vgroup.viewers.$addToSet === "object");

// THE REGRESSION GUARD. Two booleans under an $or, never raw field values.
const hasViewerTest = cond[0];
ok("reach: viewer test is an $or (userId OR sessionId)", "$or" in hasViewerTest);
ok("reach: viewer test is NOT an $and (that would drop anonymous visitors)",
    !("$and" in hasViewerTest));
ok("reach: viewer test operands are booleans, not field values",
    hasViewerTest.$or.every((clause) => "$not" in clause && "$in" in clause.$not));
// The precise shape of the original bug: an $or whose operands are raw values
// straight out of $ifNull, so $or is really testing truthiness.
ok("reach: no operand is a bare $ifNull (the truthiness bug)",
    !hasViewerTest.$or.some((clause) => "$ifNull" in clause));

// $nin is a query operator; in an aggregation expression it is an error, and the
// correct spelling of "neither empty nor missing" is $not + $in.
ok("reach: no $nin inside an aggregation expression",
    !JSON.stringify(cond).includes('"$nin"'));
ok("reach: emptiness is tested against both \"\" and null",
    JSON.stringify(hasViewerTest).includes('["",null]'));

// A viewer with neither id cannot be told apart from anyone else, so the event
// must contribute nothing rather than a placeholder key.
check("reach: unidentified viewers are removed, not keyed", cond[2], "$$REMOVE");

const keyExpr = JSON.stringify(cond[1]);

// The key is the account when there is one, so one person on a phone AND a
// laptop is one viewer rather than two. That is the whole difference between
// "reach" and "how many browsers opened this".
ok("reach: account is preferred over session", keyExpr.indexOf("userId") < keyExpr.indexOf("sessionId"));
ok("reach: account and session keys are namespaced apart", keyExpr.includes('"u:"') && keyExpr.includes('"s:"'));
ok("reach: no empty-string join can produce a bare separator key",
    !cond[1].$concat.some((part) => part === "|"));

// --- exported click list must stay in step with the route --------------------
check("click types are exported for the route to reuse", A.POST_CLICK_TYPES, clickTypes);

console.log(failures === 0 ? "\nALL POST ANALYTICS ROLLUP TESTS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
