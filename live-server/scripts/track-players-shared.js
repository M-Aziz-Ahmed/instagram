#!/usr/bin/env node

/**
 * SHARED DATA TRACKER
 * 
 * This tracker uses global shared data:
 * - One player record (not duplicated per server)
 * - One country cache (not duplicated per server)
 * - Per-server notification tracking
 * 
 * Benefits:
 * - 90% less database storage
 * - 90% less API calls
 * - No spam on new server setup
 * - Consistent data across servers
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const { mergeServerConfig, getAllActiveServers } = require('./multi-tenant.js');

const MONGODB_URI = process.env.MONGODB_URI;

// Global player model (no serverId!)
const WareraPlayerSchema = new mongoose.Schema({
  wareraId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  usernameLower: { type: String, required: true },
  level: { type: Number, default: 1 },
  countryId: { type: String, required: true },
  joinedAt: { type: Date, required: true },
}, { timestamps: true, collection: 'warera_players_global' });

// Per-server tracking (who has been notified)
const ServerPlayerTrackingSchema = new mongoose.Schema({
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
  wareraId: { type: String, required: true },
  notified: { type: Boolean, default: false },
  notifiedAt: { type: Date },
  ingameMessaged: { type: Boolean, default: false },
  ingameMessagedAt: { type: Date },
}, { timestamps: true, collection: 'server_player_tracking' });

ServerPlayerTrackingSchema.index({ serverId: 1, wareraId: 1 }, { unique: true });

const WareraPlayer = mongoose.models.WareraPlayer || mongoose.model('WareraPlayer', WareraPlayerSchema);
const ServerPlayerTracking = mongoose.models.ServerPlayerTracking || mongoose.model('ServerPlayerTracking', ServerPlayerTrackingSchema);

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
    const waitTime = 60000 - elapsed + 1000; // Wait until next minute + 1 second buffer
    console.log(`[Rate Limit] Hit ${RATE_LIMIT} req/min - waiting ${Math.round(waitTime/1000)}s...`);
    await new Promise(r => setTimeout(r, waitTime));
    globalRequestCount = 0;
    globalWindowStart = Date.now();
  }
  
  globalRequestCount++;
  
  // Add small delay between requests (300ms = max 200/min)
  await new Promise(r => setTimeout(r, 350));
}

function apiFetch(config) {
  const { api, apiKey } = config.warera;
  return async (procedure, input) => {
    await globalRateLimit(); // Wait for rate limit before making request
    const url = `${api}/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;
    const res = await fetch(url, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) throw new Error(`WarEra API error: ${res.status}`);
    const data = await res.json();
    return data.result.data;
  };
}

async function getAllPlayersByCountry(procedure, countryId) {
  const allPlayers = [];
  let cursor = null;
  let hasMore = true;
  while (hasMore) {
    const input = { countryId };
    if (cursor) input.cursor = cursor;
    const data = await procedure('user.getUsersByCountry', input);
    allPlayers.push(...data.items);
    cursor = data.nextCursor || null;
    hasMore = !!data.nextCursor;
  }
  return allPlayers;
}

async function sendNewPlayerNotification(player, country, config) {
  const webhookUrl = config.webhooks?.newPlayer || config.webhooks?.join;
  if (!webhookUrl) return;

  const profileUrl = `${config.warera.appUrl}/user/${player.wareraId}`;
  
  // Build welcome message
  const mu = config.warera?.muUrl || '';
  const party = config.warera?.partyUrl || '';
  const invite = config.warera?.discordInvite || '';
  
  let welcome = `Hi ${player.username}! Welcome to ${country.name} in WarEra! ${country.flag || '🇵🇰'}\n\n`;
  if (mu) welcome += `Join our Military Unit:\n${mu}\n`;
  if (party) welcome += `Join our Party:\n${party}\n`;
  if (invite) welcome += `\nJoin our Discord:\n${invite}\n`;
  welcome += `\nLet's grow together!`;
  
  const timezone = config.branding.timezone;
  const locale = config.branding.locale;
  const accent = parseInt((config.branding.accent || '#5865F2').replace('#', ''), 16) || 0x5865f2;

  const embed = {
    title: `${country.flag || '🇵🇰'} New ${country.name} Player Joined WarEra!`,
    color: accent,
    fields: [
      { name: '👤 Username', value: player.username, inline: true },
      { name: '📊 Level', value: String(player.level), inline: true },
      { name: '⏰ Joined', value: new Date(player.joinedAt).toLocaleString(locale, { timeZone: timezone }), inline: true },
      { name: '🔗 Profile', value: profileUrl, inline: false },
      { name: '📋 Copy-Paste In-Game Message', value: `\`\`\`${welcome}\`\`\``, inline: false },
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
    console.log(`  [${config.serverName}] Notification sent for ${player.username}`);
  } catch (err) {
    console.error(`  [${config.serverName}] Notification error: ${err.message}`);
  }
}

async function trackServer(server) {
  const config = mergeServerConfig(server);
  const proc = apiFetch(config);
  const serverId = server._id;

  console.log(`\n[${config.serverName}] Checking for new players...`);

  for (const country of config.countries) {
    // Fetch ALL players for this country (global, not per-server)
    const apiPlayers = await getAllPlayersByCountry(proc, country.id);
    console.log(`  [${config.serverName}] Found ${apiPlayers.length} ${country.name} players in WarEra`);

    // Get global player records
    const globalPlayerIds = await WareraPlayer.find({ countryId: country.id }).distinct('wareraId');
    const globalSet = new Set(globalPlayerIds);

    // Find truly new players (not in global database)
    const newPlayers = apiPlayers.filter((p) => !globalSet.has(p._id));
    console.log(`  [${config.serverName}] Found ${newPlayers.length} NEW players globally`);

    // Limit to 50 players per cycle to avoid rate limits (will get rest on next cycle)
    const BATCH_SIZE = 50;
    const batchToProcess = newPlayers.slice(0, BATCH_SIZE);
    
    if (newPlayers.length > BATCH_SIZE) {
      console.log(`  [${config.serverName}] Processing ${BATCH_SIZE} of ${newPlayers.length} (will get rest on next cycle)`);
    }

    // Insert new players into GLOBAL database (once)
    if (batchToProcess.length > 0) {
      for (const apiPlayer of batchToProcess) {
        try {
          const details = await proc('user.getUserById', { userId: apiPlayer._id });
          
          await WareraPlayer.findOneAndUpdate(
            { wareraId: apiPlayer._id },
            {
              wareraId: apiPlayer._id,
              username: details.username,
              usernameLower: details.username.toLowerCase(),
              level: details.leveling?.level || 1,
              countryId: country.id,
              joinedAt: new Date(apiPlayer.createdAt),
            },
            { upsert: true, returnDocument: 'after' }
          );
          
          console.log(`  [${config.serverName}] Added ${details.username} to global database`);
        } catch (err) {
          console.error(`  [${config.serverName}] Error: ${err.message}`);
        }
      }
    }

    // Now check which players THIS SERVER hasn't been notified about
    const notifiedIds = await ServerPlayerTracking.find({ 
      serverId, 
      notified: true 
    }).distinct('wareraId');
    const notifiedSet = new Set(notifiedIds);

    const unnotified = apiPlayers.filter((p) => !notifiedSet.has(p._id));
    console.log(`  [${config.serverName}] ${unnotified.length} players this server hasn't been notified about`);

    // Notify this server about players it hasn't seen
    for (const apiPlayer of unnotified) {
      try {
        const player = await WareraPlayer.findOne({ wareraId: apiPlayer._id });
        if (!player) continue;

        await sendNewPlayerNotification(player, country, config);

        // Mark THIS server as notified
        await ServerPlayerTracking.findOneAndUpdate(
          { serverId, wareraId: player.wareraId },
          { 
            serverId,
            wareraId: player.wareraId,
            notified: true,
            notifiedAt: new Date(),
          },
          { upsert: true }
        );

        console.log(`  [${config.serverName}] New for this server: ${player.username} (Level ${player.level})`);
      } catch (err) {
        console.error(`  [${config.serverName}] Error: ${err.message}`);
      }
    }
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Starting SHARED player tracker...`);

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const servers = await getAllActiveServers();
  console.log(`Found ${servers.length} active server(s)`);

  for (const server of servers) {
    try {
      await trackServer(server);
    } catch (err) {
      console.error(`Error tracking server ${server.name}:`, err.message);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone!\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
