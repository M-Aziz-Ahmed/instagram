// One-time, idempotent backfill for the `slot` field added to Ad.
//
// Before `slot` existed, placements were filtered on the numeric `position`
// field using string placement names, so no ad could ever match and every
// client got an empty array. Placements are now selected by `slot`.
//
// This script assigns every existing ad to the social feed - which is where
// unassigned ads used to render, because the feed was the only consumer - so
// nothing loses its placement. Re-run it any time; it only touches ads that
// have no slot yet, so it will not overwrite a placement chosen in the admin
// panel afterwards.
//
// Usage (from the repo root, with the live server's env loaded):
//   node tools/assign-ad-slots.mjs
//   node tools/assign-ad-slots.mjs --slot watch   # move leftovers elsewhere

import "dotenv/config";
import { MongoClient } from "mongodb";

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB;

if (!URI) {
    console.error("MONGODB_URI is not set. Load the live server's environment first.");
    process.exit(1);
}

const slotArgIndex = process.argv.indexOf("--slot");
const targetSlot = slotArgIndex !== -1 ? process.argv[slotArgIndex + 1] : "feed";

const VALID_SLOTS = new Set([
    "feed", "reels", "watch", "manga", "education", "sidebar",
]);

if (!VALID_SLOTS.has(targetSlot)) {
    console.error(`Unknown slot "${targetSlot}". Valid: ${[...VALID_SLOTS].join(", ")}`);
    process.exit(1);
}

const client = new MongoClient(URI);
try {
    await client.connect();
    const db = client.db(DB_NAME);
    const ads = db.collection("ads");

    // Only unassigned ads are touched.
    const result = await ads.updateMany(
        { $or: [{ slot: { $exists: false } }, { slot: null }, { slot: "" }] },
        { $set: { slot: targetSlot } },
    );

    console.log(`Assigned ${result.modifiedCount} ad(s) to slot "${targetSlot}".`);
    if (result.matchedCount === 0) {
        console.log("Nothing to do - every ad already has a slot.");
    }
} finally {
    await client.close();
}
