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

// Load environment files (.env.local in the repo, .env for standalone deployments)
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
const {
  mergeServerConfig,
  getAllActiveServers,
  buildWelcomeTemplate,
  dropLegacyIndexes,
} = require('./multi-tenant.js');

// Central fallback config used only when lib/config.js is unavailable
// (standalone deployment). Per-server settings override these from the DB.
function loadFallbackConfig() {
  const discordInvite = process.env.DISCORD_INVITE_URL || 'https://discord.gg/pwYZxGUAG6';
  const muUrl = process.env.WARERA_MU_URL || 'https://app.warera.io/mu/6a69bcb743e8ce9321e37cde';
  const partyUrl = process.env.WARERA_PARTY_URL || 'https://app.warera.io/party/6a641ccf9c4f8dd1cfc8d784';
  return {
    serverName: process.env.SERVER_NAME || 'War Era',
    branding: { tagline: 'Party Authentication System', accent: '#5865F2', timezone: 'Asia/Karachi', locale: 'en-PK' },
    discord: {
      memberRoleId: process.env.DISCORD_MEMBER_ROLE_ID || '',
      adminRoleId: process.env.DISCORD_ADMIN_ROLE_ID || '',
      botToken: process.env.DISCORD_BOT_TOKEN || '',
    },
    warera: {
      api: process.env.WARERA_API || 'https://api2.warera.io/trpc',
      messagingApi: process.env.WARERA_MESSAGING_API || 'https://api6.warera.io/trpc',
      appUrl: process.env.WARERA_APP_URL || 'https://app.warera.io',
      apiKey: process.env.WARERA_API_KEY || '',
      jwt: process.env.WARERA_JWT || '',
      cfClearance: process.env.WARERA_CF_CLEARANCE || '',
      messengerUserId: process.env.WARERA_MESSENGER_USER_ID || '6a67479b242243db4030a007',
      muUrl,
      partyUrl,
      discordInvite,
    },
    countries: [{ id: process.env.PAKISTAN_COUNTRY_ID || '6813b6d546e731854c7ac8da', name: 'Pakistan', flag: '🇵🇰' }],
    defaultCountryId: process.env.PAKISTAN_COUNTRY_ID || '6813b6d546e731854c7ac8da',
    webhooks: {
      join: process.env.DISCORD_JOIN_WEBHOOK || '',
      status: process.env.DISCORD_WEBHOOK_URL || '',
      applications: process.env.DISCORD_WEBHOOK_URL || '',
      newMember: '',
      newApplication: '',
      newPlayer: '',
    },
    templates: { welcome: '', newMember: '', newApplication: '', newPlayer: '' },
    settings: { rateLimitPerMinute: parseInt(process.env.WARERA_RATE_LIMIT_PER_MINUTE || '180', 10) || 180 },
  };
}

// If the servers collection is empty (fresh standalone deploy) we still want to
// keep working on host-env defaults — synthesize a pseudo-server for that case.
let fallbackServer = null;
async function resolveServers() {
  const servers = await getAllActiveServers();
  if (servers.length === 0) {
    if (!fallbackServer) fallbackServer = { _id: null, name: loadFallbackConfig().serverName };
    return [fallbackServer];
  }
  return servers;
}

function configFor(server) {
  if (server._id === null) return loadFallbackConfig();
  return mergeServerConfig(server);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const TrackedEntitySchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server' },
  type: { type: String, enum: ['party', 'mu', 'country'], required: true },
  entityId: { type: String, required: true },
  name: { type: String },
  webhookUrl: { type: String },
  lastFetched: { type: Date },
  totalMembers: { type: Number, default: 0 },
  totalApplications: { type: Number, default: 0 },
  memberIds: { type: [String], default: [] },
  applicationIds: { type: [String], default: [] },
}, { timestamps: true });

TrackedEntitySchema.index({ serverId: 1, type: 1, entityId: 1 }, { unique: true });

const TrackedEntity = mongoose.models.TrackedEntity || mongoose.model('TrackedEntity', TrackedEntitySchema, 'tracked_entities');

const PAGE_SIZE = 50;
const FULL_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;
const CYCLE_INTERVAL_MS = 1500;

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
    joinedAt: Date,
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

const WareraPlayerSchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server' },
  wareraId: { type: String, required: true },
  username: { type: String, required: true },
  usernameLower: { type: String, required: true },
  level: { type: Number, default: 1 },
  countryId: { type: String, required: true },
  joinedAt: { type: Date, required: true },
  notified: { type: Boolean, default: false },
  ingameMessaged: { type: Boolean, default: false },
  ingameMessagedAt: { type: Date },
}, { timestamps: true });
WareraPlayerSchema.index({ serverId: 1, wareraId: 1 }, { unique: true });

const CountryCache = mongoose.models.CountryCache || mongoose.model('CountryCache', CountryCacheSchema, 'country_cache');
const CountryHistory = mongoose.models.CountryHistory || mongoose.model('CountryHistory', CountryHistorySchema, 'country_stats_history');
const WareraPlayer = mongoose.models.WareraPlayer || mongoose.model('WareraPlayer', WareraPlayerSchema, 'warera_players');

// Per-server rate limiter (each server has its own config + key).
function makeRateLimiter(config) {
  const limit = config.settings?.rateLimitPerMinute || 180;
  let start = Date.now();
  let count = 0;
  return async function paced(fn) {
    const now = Date.now();
    if (now - start > 60000) {
      start = now;
      count = 0;
    }
    if (count >= limit) {
      const wait = 60000 - (now - start);
      console.log(`[WarEra] [Rate] ${count} req/min — pausing ${Math.round(wait / 1000)}s to respect the API limit...`);
      await sleep(wait + 1000);
      start = Date.now();
      count = 0;
    }
    count++;
    return fn();
  };
}

function makeApi(config) {
  const { api, apiKey } = config.warera;
  return async (procedure, input) => {
    const url = `${api}/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) throw new Error(`WarEra API error: ${res.status}`);
    const data = await res.json();
    return data.result.data;
  };
}

function resolveWebhook(config, key) {
  return config.webhooks?.[key] || '';
}

async function sendDiscordNotification(webhookUrl, title, fields, color = DISCORD_COLORS.green, config = null) {
  if (!webhookUrl) return;
  const serverName = config?.serverName || 'War Era';
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: serverName,
        embeds: [{ title, color, fields, footer: { text: serverName }, timestamp: new Date().toISOString() }],
      }),
    });
  } catch (err) {
    console.error('[WarEra] Discord error:', err.message);
  }
}

function renderTemplate(template, vars) {
  let out = template || '';
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value ?? ''));
  }
  return out;
}

function buildCountryWelcomeMessage(config, username, countryName) {
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

async function sendCountryPlayerNotification(webhookUrl, player, countryName, welcomeMsg, config) {
  if (!webhookUrl) return;
  
  const profileUrl = `${config.warera.appUrl}/user/${player.wareraId}`;
  const timezone = config.branding?.timezone || 'Asia/Karachi';
  const locale = config.branding?.locale || 'en-PK';
  const accent = parseInt((config.branding?.accent || '#5865F2').replace('#', ''), 16) || 0x5865f2;
  const serverName = config.serverName || 'WarEra Tracker';
  
  const embed = {
    title: `🇵🇰 New ${countryName} Player Joined WarEra!`,
    color: accent,
    fields: [
      { name: '👤 Username', value: player.username, inline: true },
      { name: '📊 Level', value: String(player.level), inline: true },
      { name: '⏰ Joined', value: player.joinedAt, inline: true },
      { name: '🔗 Profile', value: profileUrl, inline: false },
      { name: '📋 Copy-Paste In-Game Message', value: `\`\`\`${welcomeMsg}\`\`\``, inline: false },
    ],
    footer: { text: `${serverName} • WarEra Player Tracker` },
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
    console.error('[WarEra] Country player notification error:', err.message);
  }
}

async function trackEntity(server, config, entity) {
  const { type, entityId, webhooks, notify, templates, name } = entity;
  const label = type === 'party' ? `Party ${entityId}` : type === 'mu' ? `MU ${entityId}` : `Country ${entityId}`;
  const proc = makeApi(config);
  const paced = makeRateLimiter(config);
  const serverId = server._id;

  try {
    if (type === 'party') {
      const [partyData, applications] = await Promise.all([
        proc('party.getById', { partyId: entityId }),
        proc('partyApplication.getByParty', { partyId: entityId }).catch(() => []),
      ]);

      const members = partyData.members || [];
      const apps = applications || [];

      const prev = await TrackedEntity.findOne({ serverId, type, entityId }).lean();
      const prevMemberIds = new Set((prev?.memberIds || []).map(String));
      const prevAppIds = new Set((prev?.applicationIds || []).map(String));

      const newMembers = members.filter(id => !prevMemberIds.has(String(id)));
      const newApps = apps.filter(a => !prevAppIds.has(String(a._id || a.userId)));

      const newMemberDetails = [];
      for (const mid of newMembers) {
        try {
          const d = await paced(() => proc('user.getUserById', { userId: mid }));
          newMemberDetails.push({ username: d.username, level: d.leveling?.level || 0, wareraId: d._id });
          await sleep(100);
        } catch {
          newMemberDetails.push({ username: `Unknown (${mid})`, level: 0, wareraId: mid });
        }
      }

      const newAppDetails = [];
      for (const app of newApps) {
        try {
          const uid = app.userId || app._id;
          const d = await paced(() => proc('user.getUserById', { userId: uid }));
          newAppDetails.push({ username: d.username, level: d.leveling?.level || 0, wareraId: d._id });
          await sleep(100);
        } catch {
          newAppDetails.push({ username: `Unknown (${app._id || app.userId})`, level: 0, wareraId: app._id || app.userId });
        }
      }

      await TrackedEntity.findOneAndUpdate(
        { serverId, type, entityId },
        {
          serverId,
          type,
          entityId,
          name: partyData.name || name || entityId,
          lastFetched: new Date(),
          totalMembers: members.length,
          totalApplications: apps.length,
          memberIds: members.map(String),
          applicationIds: apps.map(a => String(a._id || a.userId)),
        },
        { upsert: true }
      );

      const partyName = partyData.name || name || entityId;

      if (notify?.newMember && newMembers.length > 0 && webhooks?.newMember) {
        const template = templates?.newMember || '🎉 **New Party Member!**\n**Party:** {partyName}\n**Member:** {username} (Level {level})\n**Profile:** /user/{wareraId}';
        for (const member of newMemberDetails) {
          const message = renderTemplate(template, { partyName, username: member.username, level: member.level, wareraId: member.wareraId, profileUrl: `${config.warera.appUrl}/user/${member.wareraId}` });
          await sendDiscordNotification(webhooks.newMember, 'New Party Member Joined!', [{ name: 'Party', value: partyName, inline: true }, { name: 'Member', value: message, inline: false }], DISCORD_COLORS.green, config);
        }
      }

      if (notify?.newApplication && newApps.length > 0 && webhooks?.newApplication) {
        const template = templates?.newApplication || '📝 **New Party Application!**\n**Party:** {partyName}\n**Applicant:** {username} (Level {level})\n**Profile:** /user/{wareraId}';
        for (const app of newAppDetails) {
          const message = renderTemplate(template, { partyName, username: app.username, level: app.level, wareraId: app.wareraId, profileUrl: `${config.warera.appUrl}/user/${app.wareraId}` });
          await sendDiscordNotification(webhooks.newApplication, 'New Party Application!', [{ name: 'Party', value: partyName, inline: true }, { name: 'Applicant', value: message, inline: false }], DISCORD_COLORS.amber, config);
        }
      }

      console.log(`[WarEra] [${label}] ${members.length} members, ${apps.length} apps, ${newMembers.length} new members, ${newApps.length} new apps.`);
    } else if (type === 'mu') {
      const [muData, applications] = await Promise.all([
        proc('mu.getById', { muId: entityId }),
        proc('muOfferApplication.getManyPaginated', { muId: entityId, limit: 50 }).catch(() => []),
      ]);

      const members = muData.members || [];
      const apps = applications?.items || applications || [];

      const prev = await TrackedEntity.findOne({ serverId, type, entityId }).lean();
      const prevMemberIds = new Set((prev?.memberIds || []).map(String));
      const prevAppIds = new Set((prev?.applicationIds || []).map(String));

      const newMembers = members.filter(id => !prevMemberIds.has(String(id)));
      const newApps = apps.filter(a => !prevAppIds.has(String(a._id || a.userId)));

      const newMemberDetails = [];
      for (const mid of newMembers) {
        try {
          const d = await paced(() => proc('user.getUserById', { userId: mid }));
          newMemberDetails.push({ username: d.username, level: d.leveling?.level || 0, wareraId: d._id });
          await sleep(100);
        } catch {
          newMemberDetails.push({ username: `Unknown (${mid})`, level: 0, wareraId: mid });
        }
      }

      const newAppDetails = [];
      for (const app of newApps) {
        try {
          const uid = app.userId || app._id;
          const d = await paced(() => proc('user.getUserById', { userId: uid }));
          newAppDetails.push({ username: d.username, level: d.leveling?.level || 0, wareraId: d._id });
          await sleep(100);
        } catch {
          newAppDetails.push({ username: `Unknown (${app._id || app.userId})`, level: 0, wareraId: app._id || app.userId });
        }
      }

      await TrackedEntity.findOneAndUpdate(
        { serverId, type, entityId },
        {
          serverId,
          type,
          entityId,
          name: muData.name || name || entityId,
          lastFetched: new Date(),
          totalMembers: members.length,
          totalApplications: apps.length,
          memberIds: members.map(String),
          applicationIds: apps.map(a => String(a._id || a.userId)),
        },
        { upsert: true }
      );

      const muName = muData.name || name || entityId;

      if (notify?.newMember && newMembers.length > 0 && webhooks?.newMember) {
        const template = templates?.newMember || '🎉 **New MU Member!**\n**MU:** {muName}\n**Member:** {username} (Level {level})\n**Profile:** /user/{wareraId}';
        for (const member of newMemberDetails) {
          const message = renderTemplate(template, { muName, username: member.username, level: member.level, wareraId: member.wareraId, profileUrl: `${config.warera.appUrl}/user/${member.wareraId}` });
          await sendDiscordNotification(webhooks.newMember, 'New MU Member Joined!', [{ name: 'MU', value: muName, inline: true }, { name: 'Member', value: message, inline: false }], DISCORD_COLORS.green, config);
        }
      }

      if (notify?.newApplication && newApps.length > 0 && webhooks?.newApplication) {
        const template = templates?.newApplication || '📝 **New MU Application!**\n**MU:** {muName}\n**Applicant:** {username} (Level {level})\n**Profile:** /user/{wareraId}';
        for (const app of newAppDetails) {
          const message = renderTemplate(template, { muName, username: app.username, level: app.level, wareraId: app.wareraId, profileUrl: `${config.warera.appUrl}/user/${app.wareraId}` });
          await sendDiscordNotification(webhooks.newApplication, 'New MU Application!', [{ name: 'MU', value: muName, inline: true }, { name: 'Applicant', value: message, inline: false }], DISCORD_COLORS.amber, config);
        }
      }

      console.log(`[WarEra] [${label}] ${members.length} members, ${apps.length} apps, ${newMembers.length} new members, ${newApps.length} new apps.`);
    } else if (type === 'country') {
      console.log(`[WarEra] [${label}] Country tracking - checking for new players...`);

      const apiIds = await enumeratePlayerIds(config, entityId, label);
      const existing = await TrackedEntity.findOne({ serverId, type, entityId }).lean();
      const existingIds = new Set((existing?.memberIds || []).map(String));

      const newIds = apiIds.filter((id) => !existingIds.has(id));
      console.log(`[WarEra] [${label}] Found ${newIds.length} new players`);

      const countryName = name || entityId;

      for (const id of newIds) {
        try {
          await sleep(100);
          const details = await paced(() => proc('user.getUserById', { userId: id }));
          const playerData = {
            username: details.username,
            level: details.leveling?.level || 1,
            wareraId: details._id,
            joinedAt: new Date(details.createdAt || Date.now()).toLocaleString(config.branding?.locale || 'en-PK', { timeZone: config.branding?.timezone || 'Asia/Karachi' }),
          };

          await TrackedEntity.findOneAndUpdate(
            { serverId, type, entityId },
            { 
              $push: { memberIds: id },
              $set: { 
                lastFetched: new Date(),
                totalMembers: apiIds.length 
              }
            },
            { upsert: true }
          );

          if (notify?.newPlayer && webhooks?.newPlayer) {
            const profileUrl = `${config.warera.appUrl}/user/${playerData.wareraId}`;
            
            // Build welcome message with MU, Party, and Discord invite
            const welcomeMsg = buildCountryWelcomeMessage(config, playerData.username, countryName);
            
            // Use template if provided, otherwise use default
            const template = templates?.newPlayer || `🎉 **New {countryName} Player Joined WarEra!**

👤 **Username**
{username}

📊 **Level**
{level}

⏰ **Joined**
{joinedAt}

🔗 **Profile**
{profileUrl}

📋 **Copy-Paste In-Game Message**
\`\`\`
{welcomeMessage}
\`\`\``;
            
            const message = renderTemplate(template, { 
              countryName, 
              username: playerData.username, 
              level: playerData.level, 
              wareraId: playerData.wareraId, 
              joinedAt: playerData.joinedAt, 
              profileUrl,
              welcomeMessage: welcomeMsg
            });
            
            // Send as embed with proper formatting
            await sendCountryPlayerNotification(webhooks.newPlayer, playerData, countryName, welcomeMsg, config);
          }

          console.log(`[WarEra] [${label}] New: ${playerData.username} (Level ${playerData.level})`);
        } catch (err) {
          console.error(`[WarEra] [${label}] Error:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error(`[WarEra] [${label}] Error:`, err.message);
  }
}

async function trackAllEntities(server, config) {
  const serverId = server._id;
  const entities = await TrackedEntity.find({ serverId, type: { $in: ['party', 'mu'] } }).lean();
  if (entities.length === 0) return;
  console.log(`[WarEra] [${config.serverName}] Tracking ${entities.length} entity/entities...`);
  for (const entity of entities) {
    await trackEntity(server, config, entity);
  }
}

async function enumeratePlayerIds(config, countryId, label) {
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
      console.error(`[WarEra] [${label}] API error at page ${iterations}:`, err.message);
      if (err.message.includes('429')) {
        console.log(`[WarEra] [${label}] Rate limited, waiting 30s...`);
        await sleep(30000);
      } else {
        break;
      }
    }
  }

  return allIds;
}

async function fetchPlayerDetails(config, ids, label) {
  const details = [];
  let fetched = 0;
  const proc = makeApi(config);
  const paced = makeRateLimiter(config);

  for (const id of ids) {
    try {
      const d = await paced(() => proc('user.getUserById', { userId: id }));
      details.push({
        wareraId: d._id,
        username: d.username,
        level: d.leveling?.level || 0,
        xp: d.leveling?.totalXp || 0,
        wealth: d.stats?.wealth?.total || 0,
        militaryRank: d.militaryRank || 0,
        isActive: d.isActive,
        lastSeen: d.dates?.lastConnectionAt,
        joinedAt: d.createdAt || null,
      });
      fetched++;
      if (fetched % 50 === 0) console.log(`[WarEra] [${label}] Fetched ${fetched}/${ids.length} details...`);
    } catch (err) {
      if (err.message && err.message.includes('429')) {
        console.log(`[WarEra] [${label}] Rate limited on details, waiting 30s...`);
        await sleep(30000);
      }
    }
  }

  return details;
}

async function refreshCountry(server, config, country) {
  const serverId = server._id;
  console.log(`[WarEra] [${config.serverName}] [${country.name}] Fetching player list...`);

  const allIds = await enumeratePlayerIds(config, country.id, country.name);
  console.log(`[WarEra] [${config.serverName}] [${country.name}] Found ${allIds.length} players.`);

  const cachedDoc = await CountryCache.findOne({ serverId, countryId: country.id }).lean();
  const cachedById = new Map();
  if (cachedDoc?.players) {
    for (const p of cachedDoc.players) cachedById.set(p.wareraId, p);
  }

  const newIds = allIds.filter(id => !cachedById.has(id));

  // Full refresh only when the cached data is stale (default 2h), so steady-state
  // cycles stay tiny. New players are always fetched regardless.
  const cacheAge = cachedDoc?.lastUpdated
    ? Date.now() - new Date(cachedDoc.lastUpdated).getTime()
    : Infinity;
  const fullDue = cacheAge >= FULL_REFRESH_INTERVAL_MS;

  const idsToFetch = fullDue ? allIds : newIds;
  const staleMins = Math.max(0, Math.ceil((FULL_REFRESH_INTERVAL_MS - cacheAge) / 60000));
  console.log(`[WarEra] [${config.serverName}] [${country.name}] ${fullDue ? 'Full refresh (cache stale)' : `Cache fresh — full refresh in ~${staleMins}min`} — fetching ${idsToFetch.length} detail${idsToFetch.length === 1 ? '' : 's'} (${newIds.length} new).`);

  const fetched = await fetchPlayerDetails(config, idsToFetch, country.name);

  // Merge: keep cached players, overlay freshly fetched, add new
  const merged = new Map(cachedById);
  for (const d of fetched) merged.set(d.wareraId, d);
  const finalPlayers = [...merged.values()];
  finalPlayers.sort((a, b) => b.level - a.level);

  const levelDistribution = {};
  for (const p of finalPlayers) {
    const bracket = p.level >= 10 ? '10+' : String(p.level);
    levelDistribution[bracket] = (levelDistribution[bracket] || 0) + 1;
  }

  await CountryCache.findOneAndUpdate(
    { serverId, countryId: country.id },
    {
      serverId,
      countryId: country.id,
      countryName: country.name,
      totalPlayers: allIds.length,
      players: finalPlayers,
      levelDistribution,
      lastUpdated: new Date(),
    },
    { upsert: true }
  );

  const today = new Date().toISOString().slice(0, 10);
  await CountryHistory.findOneAndUpdate(
    { serverId, countryId: country.id, date: today },
    { serverId, countryId: country.id, countryName: country.name, date: today, totalPlayers: allIds.length },
    { upsert: true }
  ).catch(err => console.error(`[WarEra] [${country.name}] History write error:`, err.message));

  console.log(`[WarEra] [${config.serverName}] [${country.name}] Done. ${finalPlayers.length} players cached (${newIds.length} new).`);
}

async function sendInvitationMessage(config, playerData) {
  const webhookUrl = resolveWebhook(config, 'newPlayer') || resolveWebhook(config, 'join');
  if (!webhookUrl) return;
  try {
    const content = config.templates?.welcome || buildWelcomeTemplate(config.serverName, config)(playerData.username);
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: config.serverName || 'WarEra Tracker', content }),
    });
  } catch (err) {
    console.error('[WarEra] Discord invitation error:', err.message);
  }
}

async function trackNewPlayers(server, config) {
  const serverId = server._id;
  const paced = makeRateLimiter(config);
  const proc = makeApi(config);

  for (const country of config.countries) {
    console.log(`[WarEra] [${config.serverName}] Checking for new ${country.name} players...`);
    const apiIds = await enumeratePlayerIds(config, country.id, `Tracker-${country.name}`);

    const existing = await WareraPlayer.find({ serverId, countryId: country.id }).select('wareraId');
    const existingIds = new Set(existing.map((p) => p.wareraId));

    const newIds = apiIds.filter((id) => !existingIds.has(id));
    console.log(`[WarEra] [${config.serverName}] Found ${newIds.length} new ${country.name} players`);

    for (const id of newIds) {
      try {
        const details = await paced(() => proc('user.getUserById', { userId: id }));
        const player = await WareraPlayer.findOneAndUpdate(
          { serverId, wareraId: id },
          {
            serverId,
            wareraId: id,
            username: details.username,
            usernameLower: details.username.toLowerCase(),
            level: details.leveling?.level || 1,
            countryId: country.id,
            joinedAt: new Date(details.createdAt || Date.now()),
            notified: true,
          },
          { upsert: true, new: true }
        );

        const profileUrl = `${config.warera.appUrl}/user/${player.wareraId}`;
        const ingameMessageTemplate = buildWelcomeTemplate(config.serverName, config)(player.username);
        const webhookUrl = resolveWebhook(config, 'join');

        await sendDiscordNotification(webhookUrl, `🎉 New ${country.name} Player Joined WarEra!`, [
          { name: '👤 Username', value: player.username, inline: true },
          { name: '📊 Level', value: String(player.level), inline: true },
          { name: '⏰ Joined', value: new Date(player.joinedAt).toLocaleString(config.branding?.locale || 'en-PK', { timeZone: config.branding?.timezone || 'Asia/Karachi' }), inline: true },
          { name: '🔗 Profile', value: profileUrl, inline: false },
          { name: '📋 Copy-Paste In-Game Message', value: `\`\`\`${ingameMessageTemplate}\`\`\``, inline: false },
        ], DISCORD_COLORS.green, config);

        console.log(`[WarEra] [${config.serverName}] New: ${player.username} (Level ${player.level})`);
      } catch (err) {
        console.error(`[WarEra] [${config.serverName}] Error:`, err.message);
      }
    }
  }
}

async function startServerCycle(server, config) {
  const start = Date.now();

  try {
    await trackNewPlayers(server, config);
  } catch (err) {
    console.error(`[WarEra] [${config.serverName}] Tracker error:`, err.message);
  }

  const trackedCountries = await TrackedEntity.find({ serverId: server._id, type: 'country' }).lean();
  for (const country of trackedCountries) {
    try {
      await refreshCountry(server, config, { id: country.entityId, name: country.name || country.entityId });
    } catch (err) {
      console.error(`[WarEra] [${country.entityId}] Error:`, err.message);
    }
  }

  // Also refresh every country the server tracks via its settings.
  for (const country of config.countries) {
    try {
      await refreshCountry(server, config, country);
    } catch (err) {
      console.error(`[WarEra] [${country.name}] Error:`, err.message);
    }
  }

  // Auto-track tracked entities (parties, MUs)
  try {
    await trackAllEntities(server, config);
  } catch (err) {
    console.error(`[WarEra] [${config.serverName}] Entity tracking error:`, err.message);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[WarEra] [${config.serverName}] Cycle complete in ${elapsed}s.`);
}

async function startWarEraCycle() {
  console.log('[WarEra] ========================================');
  console.log('[WarEra]  Starting cycle...');
  console.log('[WarEra] ========================================');

  const servers = await resolveServers();
  console.log(`[WarEra] ${servers.length} server(s) to process.`);

  for (const server of servers) {
    try {
      const config = configFor(server);
      await startServerCycle(server, config);
    } catch (err) {
      console.error(`[WarEra] [${server.name || server._id}] Server cycle error:`, err.message);
    }
  }

  console.log(`[WarEra] All servers processed. Next in ${CYCLE_INTERVAL_MS / 1000}s.\n`);
}

let running = false;

async function runLoop() {
  if (running) return;
  running = true;
  try {
    await startWarEraCycle();
  } catch (err) {
    console.error('[WarEra] Cycle error:', err.message);
  } finally {
    running = false;
  }
  setTimeout(runLoop, CYCLE_INTERVAL_MS);
}

async function initWarEraTracker() {
  console.log('[WarEra] Initializing WarEra tracker...');

  // Clean up legacy unique indexes from the pre-multi-tenant schema once the
  // DB connection is up (server.js connects before calling this).
  // We wait for connection if needed, then drop legacy indexes BEFORE the
  // first cycle runs — otherwise the first tracker cycle hits E11000 on
  // countryId_1.
  try {
    if (mongoose.connection && mongoose.connection.readyState !== 1) {
      await new Promise((resolve, reject) => {
        mongoose.connection.once('connected', resolve);
        mongoose.connection.once('error', reject);
      });
    }
    const dropped = await dropLegacyIndexes();
    if (dropped) console.log(`[Index] Dropped ${dropped} legacy unique index(es).`);
  } catch (err) {
    console.warn('[Index] Legacy index cleanup skipped:', err.message);
  }

  // Run first cycle after 5 seconds (let server finish starting),
  // then chain cycles back-to-back with a 5-minute gap — never overlapping.
  setTimeout(runLoop, 5000);
}

module.exports = { initWarEraTracker };

if (require.main === module) {
  initWarEraTracker();
}
