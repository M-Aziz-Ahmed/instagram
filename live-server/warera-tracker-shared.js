#!/usr/bin/env node

/**
 * SHARED DATA WARERA TRACKER
 * 
 * Unified tracker for countries, parties, and MUs using shared global data.
 * Runs every 5 minutes to check for new players and entity members.
 * 
 * Architecture:
 * - Global player/entity data (no duplication)
 * - Per-server notification tracking
 * - Per-server webhooks and templates
 */

let fetchFn = globalThis.fetch;
if (!fetchFn) {
  try { fetchFn = require('node-fetch'); } catch {
    const https = require('https');
    const http = require('http');
    fetchFn = (url, opts = {}) => new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.request(url, { method: opts.method || 'GET', headers: opts.headers || {} }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: () => Promise.resolve(body), json: () => Promise.resolve(JSON.parse(body)) }));
      });
      req.on('error', reject);
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }
}
const fetch = fetchFn;

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load environment
const envCandidates = [
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '.env.local'),
  path.join(__dirname, '.env'),
];
for (const envPath of envCandidates) {
  if (!fs.existsSync(envPath)) continue;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

let DISCORD_COLORS;
try {
  DISCORD_COLORS = require('../lib/config.js').DISCORD_COLORS;
} catch (e) {
  DISCORD_COLORS = { success: 0x57f287, error: 0xed4245, info: 0x5865f2, green: 0x10b981, amber: 0xf59e0b };
}

const { mergeServerConfig, getAllActiveServers, dropLegacyIndexes } = require('./multi-tenant.js');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const CYCLE_INTERVAL_MS = 5 * 60 * 1000;
const FULL_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

// ============================================================================
// SHARED GLOBAL SCHEMAS (No serverId - data shared across all servers)
// ============================================================================

const GlobalPlayerSchema = new mongoose.Schema({
  wareraId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  usernameLower: { type: String, required: true },
  level: { type: Number, default: 1 },
  countryId: { type: String, required: true },
  joinedAt: { type: Date, required: true },
  xp: { type: Number, default: 0 },
  wealth: { type: Number, default: 0 },
  militaryRank: { type: Number, default: 0 },
  isActive: { type: Boolean, default: false },
  lastSeen: { type: Date },
}, { timestamps: true, collection: 'warera_players_global' });

GlobalPlayerSchema.index({ wareraId: 1 });
GlobalPlayerSchema.index({ countryId: 1, joinedAt: -1 });

const GlobalCountryCacheSchema = new mongoose.Schema({
  countryId: { type: String, required: true, unique: true },
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
    joinedAt: Date,
  }],
  levelDistribution: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true, collection: 'country_cache_global' });

const GlobalEntityCacheSchema = new mongoose.Schema({
  type: { type: String, enum: ['party', 'mu'], required: true },
  entityId: { type: String, required: true },
  name: { type: String },
  memberIds: { type: [String], default: [] },
  applicationIds: { type: [String], default: [] },
  members: [{
    wareraId: String,
    username: String,
    level: Number,
    isActive: Boolean,
  }],
  applications: [{
    wareraId: String,
    username: String,
    level: Number,
    status: String,
  }],
  lastFetched: { type: Date },
}, { timestamps: true, collection: 'entity_cache_global' });

GlobalEntityCacheSchema.index({ type: 1, entityId: 1 }, { unique: true });

// ============================================================================
// SERVER-SPECIFIC SCHEMAS (Keep serverId - different per server)
// ============================================================================

const ServerPlayerTrackingSchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
  wareraId: { type: String, required: true },
  notified: { type: Boolean, default: false },
  notifiedAt: { type: Date },
  ingameMessaged: { type: Boolean, default: false },
  ingameMessagedAt: { type: Date },
}, { timestamps: true, collection: 'server_player_tracking' });

ServerPlayerTrackingSchema.index({ serverId: 1, wareraId: 1 }, { unique: true });

const TrackedEntitySchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
  type: { type: String, enum: ['party', 'mu', 'country'], required: true },
  entityId: { type: String, required: true },
  name: { type: String },
  notifiedMemberIds: { type: [String], default: [] },
  notifiedApplicationIds: { type: [String], default: [] },
  webhooks: {
    newMember: { type: String },
    newApplication: { type: String },
    newPlayer: { type: String },
  },
  notify: {
    newMember: { type: Boolean, default: true },
    newApplication: { type: Boolean, default: true },
    newPlayer: { type: Boolean, default: true },
  },
  templates: {
    newMember: { type: String },
    newApplication: { type: String },
    newPlayer: { type: String },
  },
  lastChecked: { type: Date },
}, { timestamps: true, collection: 'tracked_entities' });

TrackedEntitySchema.index({ serverId: 1, type: 1, entityId: 1 }, { unique: true });

// Models
const GlobalPlayer = mongoose.models.GlobalPlayer || mongoose.model('GlobalPlayer', GlobalPlayerSchema);
const GlobalCountryCache = mongoose.models.GlobalCountryCache || mongoose.model('GlobalCountryCache', GlobalCountryCacheSchema);
const GlobalEntityCache = mongoose.models.GlobalEntityCache || mongoose.model('GlobalEntityCache', GlobalEntityCacheSchema);
const ServerPlayerTracking = mongoose.models.ServerPlayerTracking || mongoose.model('ServerPlayerTracking', ServerPlayerTrackingSchema);
const TrackedEntity = mongoose.models.TrackedEntity || mongoose.model('TrackedEntity', TrackedEntitySchema);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Global rate limiter - 200 requests per minute shared across all operations
let globalRequestCount = 0;
let globalWindowStart = Date.now();
const RATE_LIMIT = 180; // Use 180 to be safe (90% of 200)

async function globalRateLimit() {
  const now = Date.now();
  const elapsed = now - globalWindowStart;
  
  // Reset counter every minute
  if (elapsed > 60000) {
    globalRequestCount = 0;
    globalWindowStart = now;
  }
  
  // If we've hit the limit, wait until next minute
  if (globalRequestCount >= RATE_LIMIT) {
    const waitTime = 60000 - elapsed + 1000;
    console.log(`[Rate Limit] Hit ${RATE_LIMIT} req/min - waiting ${Math.round(waitTime/1000)}s...`);
    await sleep(waitTime);
    globalRequestCount = 0;
    globalWindowStart = Date.now();
  }
  
  globalRequestCount++;
  await sleep(350); // 350ms between requests = max ~171/min
}

function makeRateLimiter(config) {
  return async function paced(fn) {
    await globalRateLimit();
    return fn();
  };
}

function makeApi(config) {
  const { api, apiKey } = config.warera;
  return async (procedure, input) => {
    await globalRateLimit();
    const url = `${api}/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) throw new Error(`WarEra API error: ${res.status}`);
    const data = await res.json();
    return data.result.data;
  };
}

function renderTemplate(template, vars) {
  let out = template || '';
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value ?? ''));
  }
  return out;
}

function buildWelcomeMessage(config, username, countryName) {
  const mu = config.warera?.muUrl || '';
  const party = config.warera?.partyUrl || '';
  const invite = config.warera?.discordInvite || '';
  
  let msg = `Hi ${username}! Welcome to ${countryName} in WarEra! 🇵🇰\n\n`;
  if (mu) msg += `Join our Military Unit:\n${mu}\n`;
  if (party) msg += `Join our Party:\n${party}\n`;
  if (invite) msg += `\nJoin our Discord:\n${invite}\n`;
  msg += `\nLet's grow together!`;
  
  return msg;
}

async function sendPlayerNotification(player, countryName, countryFlag, config) {
  const webhookUrl = config.webhooks?.newPlayer || config.webhooks?.join;
  if (!webhookUrl) return;

  const profileUrl = `${config.warera.appUrl}/user/${player.wareraId}`;
  const welcomeMsg = buildWelcomeMessage(config, player.username, countryName);
  const timezone = config.branding?.timezone || 'Asia/Karachi';
  const locale = config.branding?.locale || 'en-PK';
  const accent = parseInt((config.branding?.accent || '#5865F2').replace('#', ''), 16) || 0x5865f2;

  const embed = {
    title: `${countryFlag} New ${countryName} Player Joined WarEra!`,
    color: accent,
    fields: [
      { name: '👤 Username', value: player.username, inline: true },
      { name: '📊 Level', value: String(player.level), inline: true },
      { name: '⏰ Joined', value: new Date(player.joinedAt).toLocaleString(locale, { timeZone: timezone }), inline: true },
      { name: '🔗 Profile', value: profileUrl, inline: false },
      { name: '📋 Copy-Paste In-Game Message', value: `\`\`\`${welcomeMsg}\`\`\``, inline: false },
    ],
    footer: { text: `${config.serverName} • WarEra Player Tracker` },
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: 'WarEra Tracker',
        avatar_url: 'https://app.warera.io/favicon.ico',
        embeds: [embed] 
      }),
    });
  } catch (err) {
    console.error(`[${config.serverName}] Notification error:`, err.message);
  }
}

async function sendEntityNotification(type, entityName, member, config, notificationType) {
  const webhook = config.webhooks?.[notificationType];
  if (!webhook) return;

  const profileUrl = `${config.warera.appUrl}/user/${member.wareraId}`;
  const template = config.templates?.[notificationType] || '';
  
  const message = renderTemplate(template, {
    [type === 'party' ? 'partyName' : 'muName']: entityName,
    username: member.username,
    level: member.level,
    wareraId: member.wareraId,
    profileUrl,
  });

  const title = notificationType === 'newMember' 
    ? `🎉 New ${type === 'party' ? 'Party' : 'MU'} Member!`
    : `📝 New ${type === 'party' ? 'Party' : 'MU'} Application!`;
  
  const color = notificationType === 'newMember' ? DISCORD_COLORS.green : DISCORD_COLORS.amber;

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: config.serverName || 'WarEra Tracker',
        embeds: [{
          title,
          description: message,
          color,
          footer: { text: config.serverName },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (err) {
    console.error(`[${config.serverName}] Entity notification error:`, err.message);
  }
}

// ============================================================================
// COUNTRY TRACKING
// ============================================================================

async function enumeratePlayerIds(config, countryId) {
  const allIds = [];
  let cursor = null;
  let hasMore = true;
  let iterations = 0;
  const proc = makeApi(config);
  const paced = makeRateLimiter(config);

  while (hasMore && iterations < 1000) {
    iterations++;
    try {
      const input = { countryId };
      if (cursor) input.cursor = cursor;
      const data = await paced(() => proc('user.getUsersByCountry', input));
      allIds.push(...data.items.map(p => p._id));
      cursor = data.nextCursor || null;
      hasMore = !!cursor;
    } catch (err) {
      console.error(`[Country] API error: ${err.message}`);
      if (err.message.includes('429')) {
        await sleep(30000);
      } else {
        break;
      }
    }
  }

  return allIds;
}

async function trackNewPlayersForCountry(country, servers, config) {
  console.log(`[Country ${country.name}] Fetching players...`);
  
  const proc = makeApi(config);
  const paced = makeRateLimiter(config);
  
  // Get all player IDs from API
  const apiIds = await enumeratePlayerIds(config, country.id);
  console.log(`[Country ${country.name}] Found ${apiIds.length} players in API`);

  // Get existing global players
  const existingIds = await GlobalPlayer.find({ countryId: country.id }).distinct('wareraId');
  const existingSet = new Set(existingIds);

  // Find truly new players
  const newIds = apiIds.filter(id => !existingSet.has(id));
  console.log(`[Country ${country.name}] ${newIds.length} new players globally`);

  // Fetch and store new players in GLOBAL database
  for (const id of newIds) {
    try {
      await sleep(100);
      const details = await paced(() => proc('user.getUserById', { userId: id }));
      
      await GlobalPlayer.findOneAndUpdate(
        { wareraId: id },
        {
          wareraId: id,
          username: details.username,
          usernameLower: details.username.toLowerCase(),
          level: details.leveling?.level || 1,
          countryId: country.id,
          joinedAt: new Date(details.createdAt || Date.now()),
        },
        { upsert: true }
      );
      
      console.log(`[Country ${country.name}] Added ${details.username} to global DB`);
    } catch (err) {
      console.error(`[Country ${country.name}] Error fetching player ${id}:`, err.message);
    }
  }

  // Now notify each server about players they haven't been notified about
  for (const server of servers) {
    const serverId = server._id;
    const serverConfig = mergeServerConfig(server);
    
    // Check if this server tracks this country
    const tracksCountry = serverConfig.countries.some(c => c.id === country.id);
    if (!tracksCountry) continue;

    // Get players this server has already been notified about
    const notifiedIds = await ServerPlayerTracking.find({ 
      serverId, 
      notified: true 
    }).distinct('wareraId');
    const notifiedSet = new Set(notifiedIds);

    // Find players to notify this server about
    const toNotify = apiIds.filter(id => !notifiedSet.has(id));
    
    if (toNotify.length === 0) {
      console.log(`[${serverConfig.serverName}] ${country.name}: All caught up`);
      continue;
    }

    console.log(`[${serverConfig.serverName}] ${country.name}: ${toNotify.length} players to notify about`);

    // Notify about each player
    for (const id of toNotify) {
      const player = await GlobalPlayer.findOne({ wareraId: id });
      if (!player) continue;

      await sendPlayerNotification(player, country.name, country.flag, serverConfig);

      // Mark server as notified
      await ServerPlayerTracking.findOneAndUpdate(
        { serverId, wareraId: id },
        {
          serverId,
          wareraId: id,
          notified: true,
          notifiedAt: new Date(),
        },
        { upsert: true }
      );

      console.log(`[${serverConfig.serverName}] Notified about ${player.username}`);
    }
  }
}

// ============================================================================
// PARTY/MU TRACKING
// ============================================================================

async function trackEntity(entity, config) {
  const { type, entityId, webhooks, notify, templates } = entity;
  const label = type === 'party' ? `Party ${entityId}` : `MU ${entityId}`;
  const proc = makeApi(config);
  const paced = makeRateLimiter(config);

  console.log(`[${config.serverName}] [${label}] Checking...`);

  try {
    let entityData, applications;
    
    if (type === 'party') {
      [entityData, applications] = await Promise.all([
        proc('party.getById', { partyId: entityId }),
        proc('partyApplication.getByParty', { partyId: entityId }).catch(() => []),
      ]);
    } else if (type === 'mu') {
      [entityData, applications] = await Promise.all([
        proc('mu.getById', { muId: entityId }),
        proc('muOfferApplication.getManyPaginated', { muId: entityId, limit: 50 }).catch(() => ({ items: [] })),
      ]);
      applications = applications.items || applications || [];
    }

    const members = entityData.members || [];
    const apps = applications || [];

    // Update GLOBAL cache
    await GlobalEntityCache.findOneAndUpdate(
      { type, entityId },
      {
        type,
        entityId,
        name: entityData.name,
        memberIds: members.map(String),
        applicationIds: apps.map(a => String(a._id || a.userId)),
        lastFetched: new Date(),
      },
      { upsert: true }
    );

    // Get what THIS server has been notified about
    const prev = await TrackedEntity.findOne({ serverId: entity.serverId, type, entityId }).lean();
    const prevMemberIds = new Set(prev?.notifiedMemberIds || []);
    const prevAppIds = new Set(prev?.notifiedApplicationIds || []);

    const newMembers = members.filter(id => !prevMemberIds.has(String(id)));
    const newApps = apps.filter(a => !prevAppIds.has(String(a._id || a.userId)));

    console.log(`[${config.serverName}] [${label}] ${newMembers.length} new members, ${newApps.length} new apps`);

    // Fetch details and notify
    for (const mid of newMembers) {
      if (!notify?.newMember || !webhooks?.newMember) continue;
      try {
        const d = await paced(() => proc('user.getUserById', { userId: mid }));
        await sendEntityNotification(type, entityData.name, {
          wareraId: d._id,
          username: d.username,
          level: d.leveling?.level || 0,
        }, { ...config, webhooks, templates }, 'newMember');
        await sleep(100);
      } catch (err) {
        console.error(`[${label}] Member fetch error:`, err.message);
      }
    }

    for (const app of newApps) {
      if (!notify?.newApplication || !webhooks?.newApplication) continue;
      try {
        const uid = app.userId || app._id;
        const d = await paced(() => proc('user.getUserById', { userId: uid }));
        await sendEntityNotification(type, entityData.name, {
          wareraId: d._id,
          username: d.username,
          level: d.leveling?.level || 0,
        }, { ...config, webhooks, templates }, 'newApplication');
        await sleep(100);
      } catch (err) {
        console.error(`[${label}] Application fetch error:`, err.message);
      }
    }

    // Update tracked entity with new notified IDs
    await TrackedEntity.findOneAndUpdate(
      { serverId: entity.serverId, type, entityId },
      {
        $addToSet: {
          notifiedMemberIds: { $each: newMembers.map(String) },
          notifiedApplicationIds: { $each: newApps.map(a => String(a._id || a.userId)) },
        },
        lastChecked: new Date(),
      },
      { upsert: true }
    );

  } catch (err) {
    console.error(`[${label}] Error:`, err.message);
  }
}

// ============================================================================
// MAIN CYCLE
// ============================================================================

async function startWarEraCycle() {
  console.log('[WarEra] ========================================');
  console.log('[WarEra]  Starting cycle...');
  console.log('[WarEra] ========================================');

  const servers = await getAllActiveServers();
  console.log(`[WarEra] ${servers.length} server(s) to process.`);

  if (servers.length === 0) return;

  // Get all unique countries across all servers
  const allCountries = new Map();
  for (const server of servers) {
    const config = mergeServerConfig(server);
    for (const country of config.countries) {
      allCountries.set(country.id, country);
    }
  }

  // Use first server's config for API calls (they all use same WarEra API)
  const refConfig = mergeServerConfig(servers[0]);

  // Track each country (globally, notify all servers)
  for (const country of allCountries.values()) {
    try {
      await trackNewPlayersForCountry(country, servers, refConfig);
    } catch (err) {
      console.error(`[Country ${country.name}] Error:`, err.message);
    }
  }

  // Track entities (per-server)
  for (const server of servers) {
    const config = mergeServerConfig(server);
    const entities = await TrackedEntity.find({ serverId: server._id, type: { $in: ['party', 'mu'] } }).lean();
    
    for (const entity of entities) {
      try {
        await trackEntity(entity, config);
      } catch (err) {
        console.error(`[${config.serverName}] Entity error:`, err.message);
      }
    }
  }

  console.log(`[WarEra] Cycle complete. Next in ${CYCLE_INTERVAL_MS / 60000}min.\n`);
}

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[WarEra] Connected to MongoDB');

  const dropped = await dropLegacyIndexes();
  if (dropped) console.log(`[WarEra] Dropped ${dropped} legacy index(es)`);

  console.log('[WarEra] SHARED DATA ARCHITECTURE ACTIVE');
  console.log('[WarEra] - Global player/entity cache');
  console.log('[WarEra] - Per-server notification tracking');
  console.log('[WarEra] - No data duplication\n');

  await startWarEraCycle();
  setInterval(startWarEraCycle, CYCLE_INTERVAL_MS);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[WarEra] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { startWarEraCycle };
