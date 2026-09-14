const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
const fetch = require("node-fetch");

const IPTV_URL = "https://iptv-org.github.io/iptv/index.m3u";

function parseM3u(text) {
    const channels = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("#EXTINF")) {
            // Parse EXTINF line
            const meta = {};
            const pairs = line.substring(9).split(/[&;]/);
            for (const pair of pairs) {
                const eq = pair.indexOf("=");
                if (eq > 0) {
                    const key = pair.substring(0, eq).trim();
                    const val = pair.substring(eq + 1).trim().replace(/"/g, "");
                    meta[key] = val;
                }
            }
            // Next non-EXTINF line is the URL
            i++;
            const url = lines[i] ? lines[i].trim() : "";
            if (url) {
                channels.push({
                    name: meta.tvg_name || meta.name || "Unknown",
                    logo: meta.tvg_logo || meta.tvg_logo || "",
                    group: meta.group_title || meta.group || "Unknown",
                    url: url,
                });
            }
        }
    }
    return channels;
}

async function fetchPlaylist() {
    try {
        const res = await fetch(IPTV_URL, { redirect: "follow", timeout: 15000 });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const channels = parseM3u(text);
        return channels;
    } catch (e) {
        console.error("IPTV fetch error:", e.message);
        return [];
    }
}

module.exports = { fetchPlaylist, parseM3U };