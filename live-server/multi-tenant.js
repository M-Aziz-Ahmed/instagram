// Shared multi-tenant helpers for the standalone tracker scripts.
//
// These scripts run as plain Node (CJS) and cannot import from `@/lib/*`, so
// this module re-implements the per-server config merge that the Next.js app
// does in lib/server-config.js, reading the `servers` collection directly.

const mongoose = require('mongoose');

// Prefer the repo's lib/config.js when present. In a standalone deployment the
// scripts are copied without the Next.js app tree, so fall back to env-driven
// host defaults (env is loaded by each script before requiring this module).
let DEFAULT_CONFIG;
let KNOWN_COUNTRIES;
try {
  const hostConfig = require('../lib/config.js');
  DEFAULT_CONFIG = hostConfig.DEFAULT_CONFIG;
  KNOWN_COUNTRIES = hostConfig.KNOWN_COUNTRIES;
} catch (e) {
  const fallbackCountries = [];
  for (const [name, flag, envKey] of [
    ['Pakistan', '🇵🇰', 'PAKISTAN_COUNTRY_ID'],
    ['India', '🇮🇳', 'INDIA_COUNTRY_ID'],
    ['Iraq', '🇮🇶', 'IRAQ_COUNTRY_ID'],
  ]) {
    const id = process.env[envKey];
    if (id) fallbackCountries.push({ id, name, flag });
  }
  if (fallbackCountries.length === 0) {
    fallbackCountries.push({
      id: process.env.PAKISTAN_COUNTRY_ID || '6813b6d546e731854c7ac8da',
      name: 'Pakistan',
      flag: '🇵🇰',
    });
  }
  KNOWN_COUNTRIES = fallbackCountries;
  DEFAULT_CONFIG = {
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
      muUrl: process.env.WARERA_MU_URL || 'https://app.warera.io/mu/6a69bcb743e8ce9321e37cde',
      partyUrl: process.env.WARERA_PARTY_URL || 'https://app.warera.io/party/6a641ccf9c4f8dd1cfc8d784',
      discordInvite: process.env.DISCORD_INVITE_URL || 'https://discord.gg/pwYZxGUAG6',
    },
    countries: KNOWN_COUNTRIES,
    defaultCountryId: KNOWN_COUNTRIES[0]?.id || process.env.PAKISTAN_COUNTRY_ID || '6813b6d546e731854c7ac8da',
    webhooks: {
      join: process.env.DISCORD_JOIN_WEBHOOK || '',
      status: process.env.DISCORD_WEBHOOK_URL || '',
      applications: process.env.DISCORD_WEBHOOK_URL || '',
      newMember: '',
      newApplication: '',
      newPlayer: '',
      country: '',
      mu: '',
      party: '',
    },
    templates: { welcome: '', newMember: '', newApplication: '', newPlayer: '' },
    settings: {
      rateLimitPerMinute: parseInt(process.env.WARERA_RATE_LIMIT_PER_MINUTE || '180', 10) || 180,
      requireCountryMatch: true,
      autoAssignRoleOnApproval: true,
      notifyOnRegistration: true,
      flagDuplicateGameNames: true,
    },
  };
}

const CountrySettingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    flag: { type: String, default: '' },
  },
  { _id: false }
);

const ServerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, sparse: true },
    guildId: { type: String, default: '' },
    ownerDiscordId: { type: String, required: true },
    inviteCode: { type: String, sparse: true },
    status: { type: String, enum: ['setup', 'active', 'paused'], default: 'setup' },
    branding: {
      tagline: { type: String, default: '' },
      accent: { type: String, default: '#5865F2' },
      timezone: { type: String, default: 'Asia/Karachi' },
      locale: { type: String, default: 'en-PK' },
    },
    discord: {
      memberRoleId: { type: String, default: '' },
      adminRoleId: { type: String, default: '' },
      botToken: { type: String, default: '' },
    },
    warera: {
      api: { type: String, default: 'https://api2.warera.io/trpc' },
      messagingApi: { type: String, default: 'https://api6.warera.io/trpc' },
      appUrl: { type: String, default: 'https://app.warera.io' },
      apiKey: { type: String, default: '' },
      jwt: { type: String, default: '' },
      cfClearance: { type: String, default: '' },
      messengerUserId: { type: String, default: '' },
      muUrl: { type: String, default: '' },
      partyUrl: { type: String, default: '' },
      discordInvite: { type: String, default: '' },
    },
    countries: { type: [CountrySettingSchema], default: [] },
    defaultCountryId: { type: String, default: '' },
    webhooks: {
      join: { type: String, default: '' },
      status: { type: String, default: '' },
      applications: { type: String, default: '' },
      newMember: { type: String, default: '' },
      newApplication: { type: String, default: '' },
      newPlayer: { type: String, default: '' },
      country: { type: String, default: '' },
      mu: { type: String, default: '' },
      party: { type: String, default: '' },
    },
    templates: {
      welcome: { type: String, default: '' },
      newMember: { type: String, default: '' },
      newApplication: { type: String, default: '' },
      newPlayer: { type: String, default: '' },
    },
    admins: { type: [String], default: [] },
    settings: {
      rateLimitPerMinute: { type: Number, default: 180 },
      requireCountryMatch: { type: Boolean, default: true },
      autoAssignRoleOnApproval: { type: Boolean, default: true },
      notifyOnRegistration: { type: Boolean, default: true },
      flagDuplicateGameNames: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

const Server = mongoose.models.Server || mongoose.model('Server', ServerSchema, 'servers');

function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override || {})) {
    const b = base[key];
    const o = override[key];
    if (
      b &&
      typeof b === 'object' &&
      !Array.isArray(b) &&
      o &&
      typeof o === 'object' &&
      !Array.isArray(o)
    ) {
      out[key] = deepMerge(b, o);
    } else {
      out[key] = o;
    }
  }
  return out;
}

// Merge a server doc over the host defaults. Mirrors lib/server-config.js.
function mergeServerConfig(server) {
  if (!server) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  const raw = {
    branding: server.branding || {},
    discord: server.discord || {},
    warera: server.warera || {},
    webhooks: server.webhooks || {},
    templates: server.templates || {},
    settings: server.settings || {},
  };

  const config = deepMerge(DEFAULT_CONFIG, raw);

  if (Array.isArray(server.countries) && server.countries.length > 0) {
    config.countries = server.countries;
  }
  if (server.defaultCountryId) config.defaultCountryId = server.defaultCountryId;
  if (server.name) config.serverName = server.name;
  if (server.slug) config.serverSlug = server.slug;

  return config;
}

// Load every tenant that should be tracked (everything not paused).
async function getAllActiveServers() {
  return Server.find({ status: { $ne: 'paused' } }).lean();
}

// In-game welcome template built from per-server branding + links.
function buildWelcomeTemplate(serverName, config) {
  const mu = config.warera?.muUrl;
  const party = config.warera?.partyUrl;
  const invite = config.warera?.discordInvite;
  return (username) =>
    `Hi ${username}! Welcome to ${serverName} in WarEra! 🎉\n\n` +
    (invite ? `Join our Discord: ${invite}\n` : '') +
    (mu ? `Join our Military Unit: ${mu}\n` : '') +
    (party ? `Join our Party: ${party}\n` : '') +
    `\nLet's grow together!`;
}

// Intended multi-tenant compound unique keys per collection. Any existing
// UNIQUE index whose key set is a strict subset of one of these predates the
// multi-tenant refactor (e.g. `countryId_1` on country_cache) and must be
// dropped, otherwise the first second tenant to track the same country hits an
// E11000 duplicate key error.
const COLLECTION_UNIQUE_KEYS = {
  country_cache: [['serverId', 'countryId']],
  country_stats_history: [['serverId', 'countryId', 'date']],
  warera_players: [['serverId', 'wareraId']],
  tracked_entities: [['serverId', 'type', 'entityId']],
  player_notes: [['serverId', 'wareraId']],
};

// Drop legacy unique indexes that are strict subsets of the intended compound
// unique keys. Safe to run repeatedly: it only ever drops indexes that are not
// part of the current schema. Returns the number of indexes dropped.
async function dropLegacyIndexes() {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return 0;

  let dropped = 0;
  for (const [coll, intendedKeys] of Object.entries(COLLECTION_UNIQUE_KEYS)) {
    let indexes;
    try {
      indexes = await mongoose.connection.db.collection(coll).indexes();
    } catch (e) {
      continue; // collection does not exist yet
    }
    const intendedSets = intendedKeys.map((k) => new Set(k));
    for (const index of indexes) {
      if (index.name === '_id_') continue;
      if (!index.unique) continue;
      const fields = Object.keys(index.key);
      const fieldSet = new Set(fields);
      const isLegacy = intendedSets.some(
        (s) =>
          s.size > fieldSet.size &&
          [...fieldSet].every((f) => s.has(f))
      );
      if (!isLegacy) continue;
      try {
        await mongoose.connection.db.collection(coll).dropIndex(index.name);
        console.log(`[Index] Dropped legacy unique index ${coll}.${index.name} (${fields.join(', ')})`);
        dropped++;
      } catch (e) {
        console.warn(`[Index] Failed to drop ${coll}.${index.name}: ${e.message}`);
      }
    }
  }
  return dropped;
}

module.exports = {
  Server,
  KNOWN_COUNTRIES,
  mergeServerConfig,
  getAllActiveServers,
  buildWelcomeTemplate,
  dropLegacyIndexes,
};
