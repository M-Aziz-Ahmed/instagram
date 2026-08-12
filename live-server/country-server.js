const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const { mergeServerConfig, getAllActiveServers } = require('./multi-tenant.js');

const MONGODB_URI = process.env.MONGODB_URI;

// --- Schemas ---

const CountryCacheSchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server' },
  countryId: { type: String, required: true },
  countryName: { type: String, required: true },
  totalPlayers: { type: Number, default: 0 },
  players: [{
    wareraId: String,
    username: String,
    level: Number,
    xp: Number,
    wealth: Number,
    militaryRank: Number,
    isActive: Boolean,
    lastSeen: Date,
  }],
  levelDistribution: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });
CountryCacheSchema.index({ serverId: 1, countryId: 1 }, { unique: true });

const CountryHistorySchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server' },
  countryId: { type: String, required: true },
  countryName: { type: String, required: true },
  date: { type: String, required: true },
  totalPlayers: { type: Number, default: 0 },
}, { timestamps: true });
CountryHistorySchema.index({ serverId: 1, countryId: 1, date: 1 }, { unique: true });

const CountryCache = mongoose.models.CountryCache || mongoose.model('CountryCache', CountryCacheSchema, 'country_cache');
const CountryHistory = mongoose.models.CountryHistory || mongoose.model('CountryHistory', CountryHistorySchema, 'country_stats_history');

function apiFetch(config) {
  const { api, apiKey } = config.warera;
  return async (procedure, input) => {
    const url = `${api}/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) throw new Error(`WarEra API error: ${res.status}`);
    const data = await res.json();
    return data.result.data;
  };
}

// --- Core Functions ---

async function fetchAllPlayersByCountry(proc, countryId) {
  const allPlayers = [];
  let cursor = null;
  let hasMore = true;
  let iterations = 0;

  while (hasMore && iterations < 500) {
    iterations++;
    try {
      const input = { countryId };
      if (cursor) input.cursor = cursor;
      const data = await proc('user.getUsersByCountry', input);
      allPlayers.push(...data.items);
      if (data.nextCursor) {
        cursor = data.nextCursor;
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.error(`  API error at page ${iterations}:`, err.message);
      break;
    }
  }

  return allPlayers;
}

async function refreshCountry(serverId, proc, country, label) {
  console.log(`  [${label}] [${country.name}] Fetching all players...`);

  const allPlayers = await fetchAllPlayersByCountry(proc, country.id);
  console.log(`  [${label}] [${country.name}] Found ${allPlayers.length} players. Fetching details...`);

  const details = [];
  let fetched = 0;

  for (const p of allPlayers) {
    try {
      const d = await proc('user.getUserById', { userId: p._id });
      details.push({
        wareraId: d._id,
        username: d.username,
        level: d.leveling?.level || 0,
        xp: d.leveling?.totalXp || 0,
        wealth: d.stats?.wealth?.total || 0,
        militaryRank: d.militaryRank || 0,
        isActive: d.isActive,
        lastSeen: d.dates?.lastConnectionAt,
      });
      fetched++;
      if (fetched % 50 === 0) console.log(`  [${label}] [${country.name}] Fetched ${fetched}/${allPlayers.length} details...`);
    } catch {
      // skip
    }
  }

  details.sort((a, b) => b.level - a.level);

  const levelDistribution = {};
  for (const p of details) {
    const bracket = p.level >= 10 ? '10+' : String(p.level);
    levelDistribution[bracket] = (levelDistribution[bracket] || 0) + 1;
  }

  await CountryCache.findOneAndUpdate(
    { serverId, countryId: country.id },
    {
      serverId,
      countryId: country.id,
      countryName: country.name,
      totalPlayers: allPlayers.length,
      players: details,
      levelDistribution,
      lastUpdated: new Date(),
    },
    { upsert: true }
  );

  const today = new Date().toISOString().slice(0, 10);
  await CountryHistory.findOneAndUpdate(
    { serverId, countryId: country.id, date: today },
    { serverId, countryId: country.id, countryName: country.name, date: today, totalPlayers: allPlayers.length },
    { upsert: true }
  ).catch((err) => console.error(`  [${label}] History write error:`, err.message));

  console.log(`  [${label}] [${country.name}] Done. ${details.length} players with details.`);
}

// --- Main Loop ---

async function main() {
  console.log('========================================');
  console.log('  WarEra Backend Server Starting');
  console.log('========================================');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  async function runCycle() {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] Starting cycle...`);

    const servers = await getAllActiveServers();
    console.log(`Found ${servers.length} active server(s)`);

    for (const server of servers) {
      const config = mergeServerConfig(server);
      const proc = apiFetch(config);
      const label = config.serverName || server.name;

      for (const country of config.countries) {
        try {
          await refreshCountry(server._id, proc, country, label);
        } catch (err) {
          console.error(`[${label}] [${country.name}] Error:`, err.message);
        }
      }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`Cycle complete in ${elapsed}s. Next run in 30s.\n`);
  }

  // Run immediately, then every 30 seconds
  await runCycle();
  setInterval(runCycle, 30 * 1000);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
