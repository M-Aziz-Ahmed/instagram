const express = require("express");
const { fetchLinkPreview } = require("../utils/linkPreview");

const router = express.Router();

// GET /api/link-preview?url=https://example.com
router.get("/", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url query parameter required" });
    }
    if (!/^https?:\/\/[^\s]+$/i.test(url)) {
        return res.status(400).json({ error: "Invalid URL" });
    }

    try {
        const preview = await fetchLinkPreview(url);
        return res.json({ url, preview });
    } catch (err) {
        return res.status(400).json({ error: err.message || "Could not fetch preview" });
    }
});

module.exports = router;