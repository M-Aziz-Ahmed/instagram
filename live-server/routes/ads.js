const express = require("express");
const Ad = require("../models/ad");

const router = express.Router();

// GET /config
// Publishes the AdSense publisher id to the client at request time.
//
// This used to be read only from NEXT_PUBLIC_ADSENSE_CLIENT, which is inlined
// into the client bundle at *build* time. That meant the only way to configure
// it was a full rebuild + redeploy of the frontend, so an admin who added an
// AdSense ad saw an empty slot with no way to tell why. Reading a plain
// (non-NEXT_PUBLIC) server env var here means the live server can be
// reconfigured on its own.
//
// A publisher id is not a secret — it ships in every page AdSense serves — so
// this is safe to expose without auth.
router.get("/config", (req, res) => {
    return res.json({
        adsenseClient:
            process.env.ADSENSE_CLIENT || process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "",
    });
});

// GET /
// Delivers the ads eligible right now for a given placement.
//
// Placements are selected with `slot` (a real string field on the Ad schema,
// see models/ad.js). This router used to filter on `position` with string
// values while `position` is a Number, so no ad could ever match and every
// client silently received an empty array. `position` is now only the numeric
// sort weight within a slot.
const { AD_SLOTS } = require("../models/ad");
const { isProUser } = require("../lib/economy");
const { optionalAuth } = require("../middleware/auth");

const VALID_SLOTS = new Set(AD_SLOTS);

router.get("/", optionalAuth, async (req, res) => {
    try {
        // Pro is ad-free. Checked here rather than in each placement component
        // so the promise holds for every surface at once, including any added
        // later, and so an ad cannot be smuggled in by calling the API directly.
        if (req.userId && await isProUser(req.userId)) {
            return res.json([]);
        }

        const now = new Date();
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

        const query = {
            isActive: true,
            $and: [
                { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
                { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
            ],
        };

        const slot = typeof req.query.slot === "string" ? req.query.slot.trim() : "";
        if (VALID_SLOTS.has(slot)) {
            query.slot = slot;
        } else if (slot) {
            // Unknown placement: return empty rather than serving whatever is
            // scheduled. This keeps a typo in a client from dumping unrelated
            // placements onto the page.
            return res.json([]);
        } else {
            // No slot requested: only serve ads that were never assigned to a
            // specific surface, so a bare /api/ads call cannot bypass placement
            // targeting.
            query.slot = "";
        }

        const ads = await Ad.find(query)
            .sort({ position: 1, createdAt: -1 })
            .limit(limit)
            .lean();

        return res.json(ads);
    } catch (err) {
        console.error("Ads GET error:", err);
        return res.status(500).json({ error: "Failed to fetch ads" });
    }
});

module.exports = router;
