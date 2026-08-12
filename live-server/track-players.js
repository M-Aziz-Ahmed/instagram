#!/usr/bin/env node

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

const MONGODB_URI = process.env.MONGODB_URI;

const WareraPlayerSchema = new mongoose.Schema(
  {
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
  },
  { timestamps: true }
);
WareraPlayerSchema.index({ serverId: 1, wareraId: 1 }, { unique: true });

const WareraPlayer =
  mongoose.models.WareraPlayer ||
  mongoose.model('WareraPlayer', WareraPlayerSchema, 'warera_players');

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
  // Use purpose-specific webhook with fallback chain
  const webhookUrl = config.webhooks?.country || config.webhooks?.newPlayer || config.webhooks?.status || config.webhooks?.join;
  
  // Debug: Log what webhook we're trying to use
  console.log(`  [${config.serverName}] Webhook selection: country=${config.webhooks?.country ? 'SET' : 'EMPTY'}, newPlayer=${config.webhooks?.newPlayer ? 'SET' : 'EMPTY'}, status=${config.webhooks?.status ? 'SET' : 'EMPTY'}, join=${config.webhooks?.join ? 'SET' : 'EMPTY'}`);
  console.log(`  [${config.serverName}] Selected webhook URL: ${webhookUrl ? webhookUrl.substring(0, 50) + '...' : 'NONE'}`);
  
  if (!webhookUrl) {
    console.log(`  [${config.serverName}] No country webhook, skipping notification`);
    return;
  }
  
  // Validate webhook URL format
  if (!webhookUrl.startsWith('https://discord.com/api/webhooks/') && !webhookUrl.startsWith('https://discordapp.com/api/webhooks/')) {
    console.error(`  [${config.serverName}] Invalid webhook URL format: ${webhookUrl}`);
    return;
  }

  const profileUrl = `${config.warera.appUrl}/user/${player.wareraId}`;
  
  // Build the welcome message with all links
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
      {
        name: '⏰ Joined',
        value: new Date(player.joinedAt).toLocaleString(locale, { timeZone: timezone }),
        inline: true,
      },
      { name: '🔗 Profile', value: profileUrl, inline: false },
      {
        name: '📋 Copy-Paste In-Game Message',
        value: `\`\`\`${welcome}\`\`\``,
        inline: false,
      },
    ],
    footer: { text: `${config.serverName} • WarEra Player Tracker` },
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: 'WarEra Tracker',
        avatar_url: 'https://app.warera.io/favicon.ico',
        embeds: [embed] 
      }),
    });
    if (!res.ok) {
      console.error(`  [${config.serverName}] Webhook error: ${res.status}`);
    } else {
      console.log(`  [${config.serverName}] Notification sent for ${player.username}`);
    }
  } catch (err) {
    console.error(`  [${config.serverName}] Notification error: ${err.message}`);
  }
}

async function sendInvitationMessage(player, config) {
  const webhookUrl = config.webhooks?.newPlayer || config.webhooks?.join;
  if (!webhookUrl) return;
  try {
    const content = buildWelcomeTemplate(config.serverName, config)(player.username);
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'WarEra Tracker', content }),
    });
    console.log(`  [${config.serverName}] Invitation sent for ${player.username}`);
  } catch (err) {
    console.error(`  [${config.serverName}] Invitation error: ${err.message}`);
  }
}

async function sendSetupConfirmation(country, playerCount, config) {
  // Use purpose-specific webhook with fallback chain
  const webhookUrl = config.webhooks?.country || config.webhooks?.newPlayer || config.webhooks?.status || config.webhooks?.join;
  if (!webhookUrl) return;
  
  const accent = parseInt((config.branding.accent || '#5865F2').replace('#', ''), 16) || 0x5865f2;
  const serverName = config.serverName || 'WarEra Tracker';
  
  const embed = {
    title: '✅ WarEra Tracker Setup Complete!',
    description: `Your tracker is now active and monitoring **${country.name}** ${country.flag || '🇵🇰'} for new players.`,
    color: accent,
    fields: [
      { 
        name: '📊 Current Players', 
        value: `${playerCount} existing ${country.name} players have been imported.`, 
        inline: false 
      },
      { 
        name: '🔔 Notifications', 
        value: 'You will receive notifications here when **new players join** from now on.', 
        inline: false 
      },
      { 
        name: '⏱️ Tracking Frequency', 
        value: 'The tracker runs every 5 minutes to check for new players.', 
        inline: false 
      },
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
    console.log(`  [${config.serverName}] Setup confirmation sent for ${country.name}`);
  } catch (err) {
    console.error(`  [${config.serverName}] Setup confirmation error: ${err.message}`);
  }
}

async function trackServer(server) {
  const config = mergeServerConfig(server);
  const proc = apiFetch(config);
  const serverId = server._id;

  console.log(`\n[${config.serverName}] Checking for new players...`);

  // Check if this is the first run (no players tracked yet)
  const totalTracked = await WareraPlayer.countDocuments({ serverId });
  const isFirstRun = totalTracked === 0;

  if (isFirstRun) {
    console.log(`  [${config.serverName}] First run detected - will import existing players silently`);
  }

  for (const country of config.countries) {
    const apiPlayers = await getAllPlayersByCountry(proc, country.id);
    console.log(`  [${config.serverName}] Found ${apiPlayers.length} ${country.name} players in WarEra`);

    const existing = await WareraPlayer.find({ serverId, countryId: country.id }).select('wareraId');
    const existingIds = new Set(existing.map((p) => p.wareraId));

    const newPlayers = apiPlayers.filter((p) => !existingIds.has(p._id));
    console.log(`  [${config.serverName}] Found ${newPlayers.length} new ${country.name} players`);

    if (isFirstRun && newPlayers.length > 0) {
      console.log(`  [${config.serverName}] First run: Importing ${newPlayers.length} existing players (no notifications)`);
      
      // Bulk import existing players without notifications
      for (const apiPlayer of newPlayers) {
        try {
          const details = await proc('user.getUserById', { userId: apiPlayer._id });
          await WareraPlayer.findOneAndUpdate(
            { serverId, wareraId: apiPlayer._id },
            {
              serverId,
              wareraId: apiPlayer._id,
              username: details.username,
              usernameLower: details.username.toLowerCase(),
              level: details.leveling?.level || 1,
              countryId: country.id,
              joinedAt: new Date(apiPlayer.createdAt),
              notified: true, // Mark as notified to avoid spam
            },
            { upsert: true }
          );
        } catch (err) {
          console.error(`  [${config.serverName}] Error importing player ${apiPlayer._id}:`, err.message);
        }
      }
      
      // Send setup confirmation message
      await sendSetupConfirmation(country, newPlayers.length, config);
      
    } else if (newPlayers.length > 0) {
      // Normal operation: notify about new players
      for (const apiPlayer of newPlayers) {
        try {
          const details = await proc('user.getUserById', { userId: apiPlayer._id });

          const player = await WareraPlayer.findOneAndUpdate(
            { serverId, wareraId: apiPlayer._id },
            {
              serverId,
              wareraId: apiPlayer._id,
              username: details.username,
              usernameLower: details.username.toLowerCase(),
              level: details.leveling?.level || 1,
              countryId: country.id,
              joinedAt: new Date(apiPlayer.createdAt),
              notified: true,
            },
            { upsert: true, returnDocument: 'after' }
          );

          await sendNewPlayerNotification(player, country, config);
          await sendInvitationMessage(player, config);
          console.log(`  [${config.serverName}] New player: ${player.username} (Level ${player.level})`);
        } catch (err) {
          console.error(`  [${config.serverName}] Error processing player ${apiPlayer._id}:`, err.message);
        }
      }
    }
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Starting player check...`);

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clean up legacy unique indexes from the pre-multi-tenant schema.
  const dropped = await dropLegacyIndexes();
  if (dropped) console.log(`[Index] Dropped ${dropped} legacy unique index(es).`);

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
