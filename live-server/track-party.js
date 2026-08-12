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

const { mergeServerConfig, getAllActiveServers } = require('./multi-tenant.js');

const MONGODB_URI = process.env.MONGODB_URI;

const WareraPartyMemberSchema = new mongoose.Schema(
  {
    serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server' },
    wareraId: { type: String, required: true },
    username: { type: String, required: true },
    usernameLower: { type: String, required: true },
    level: { type: Number, default: 1 },
    partyId: { type: String, required: true },
    joinedAt: { type: Date, required: true },
    notified: { type: Boolean, default: false },
  },
  { timestamps: true }
);
WareraPartyMemberSchema.index({ serverId: 1, wareraId: 1 }, { unique: true });

const WareraPartyMember =
  mongoose.models.WareraPartyMember ||
  mongoose.model('WareraPartyMember', WareraPartyMemberSchema, 'warera_party_members');

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

async function sendNewMemberNotification(member, partyName, config) {
  // Use purpose-specific webhook with fallback chain
  const webhookUrl = config.webhooks?.party || config.webhooks?.status || config.webhooks?.join;
  if (!webhookUrl) {
    console.log(`  [${config.serverName}] No Party webhook, skipping notification`);
    return;
  }

  const profileUrl = `${config.warera.appUrl}/user/${member.wareraId}`;
  const partyUrl = config.warera?.partyUrl || '';
  const mu = config.warera?.muUrl || '';
  const invite = config.warera?.discordInvite || '';
  
  let welcome = `Hi ${member.username}! Thanks for joining our Party in WarEra! 🎉\n\n`;
  welcome += `Party: ${partyUrl}\n`;
  if (mu) welcome += `\nAlso join our Military Unit:\n${mu}\n`;
  if (invite) welcome += `\nJoin our Discord:\n${invite}\n`;
  welcome += `\nLet's grow together!`;
  
  const timezone = config.branding.timezone;
  const locale = config.branding.locale;
  const accent = parseInt((config.branding.accent || '#5865F2').replace('#', ''), 16) || 0x5865f2;

  const embed = {
    title: `🎉 New Member Joined ${partyName}!`,
    color: accent,
    fields: [
      { name: '👤 Username', value: member.username, inline: true },
      { name: '📊 Level', value: String(member.level), inline: true },
      {
        name: '⏰ Joined',
        value: new Date(member.joinedAt).toLocaleString(locale, { timeZone: timezone }),
        inline: true,
      },
      { name: '🔗 Profile', value: profileUrl, inline: false },
      {
        name: '📋 Copy-Paste In-Game Message',
        value: `\`\`\`${welcome}\`\`\``,
        inline: false,
      },
    ],
    footer: { text: `${config.serverName} • WarEra Party Tracker` },
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
      console.log(`  [${config.serverName}] Notification sent for ${member.username}`);
    }
  } catch (err) {
    console.error(`  [${config.serverName}] Notification error: ${err.message}`);
  }
}

async function sendSetupConfirmation(partyName, memberCount, config) {
  // Use purpose-specific webhook with fallback chain
  const webhookUrl = config.webhooks?.party || config.webhooks?.status || config.webhooks?.join;
  if (!webhookUrl) return;
  
  const accent = parseInt((config.branding.accent || '#5865F2').replace('#', ''), 16) || 0x5865f2;
  const serverName = config.serverName || 'WarEra Tracker';
  
  const embed = {
    title: '✅ Party Tracker Setup Complete!',
    description: `Your tracker is now monitoring **${partyName}** 🎉 for new members.`,
    color: accent,
    fields: [
      { 
        name: '📊 Current Members', 
        value: `${memberCount} existing party members have been imported.`, 
        inline: false 
      },
      { 
        name: '🔔 Notifications', 
        value: 'You will receive notifications here when **new members join** your Party.', 
        inline: false 
      },
      { 
        name: '⏱️ Tracking Frequency', 
        value: 'The tracker runs every 5 minutes to check for new members.', 
        inline: false 
      },
    ],
    footer: { text: `${serverName} • WarEra Party Tracker` },
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
    console.log(`  [${config.serverName}] Setup confirmation sent for Party`);
  } catch (err) {
    console.error(`  [${config.serverName}] Setup confirmation error: ${err.message}`);
  }
}

async function trackServer(server) {
  const config = mergeServerConfig(server);
  const proc = apiFetch(config);
  const serverId = server._id;

  const partyUrl = config.warera?.partyUrl;
  if (!partyUrl) {
    console.log(`  [${config.serverName}] No Party URL configured, skipping`);
    return;
  }

  const partyIdMatch = partyUrl.match(/\/party\/([a-f0-9]+)/i);
  if (!partyIdMatch) {
    console.log(`  [${config.serverName}] Invalid Party URL format, skipping`);
    return;
  }

  const partyId = partyIdMatch[1];
  console.log(`\n[${config.serverName}] Checking Party for new members...`);

  // Check if this is the first run
  const totalTracked = await WareraPartyMember.countDocuments({ serverId });
  const isFirstRun = totalTracked === 0;

  if (isFirstRun) {
    console.log(`  [${config.serverName}] First run detected - will import existing members silently`);
  }

  try {
    const partyData = await proc('party.getById', { partyId });
    const partyName = partyData.name || 'Party';
    const apiMembers = partyData.members || [];
    
    console.log(`  [${config.serverName}] Found ${apiMembers.length} members in ${partyName}`);

    const existing = await WareraPartyMember.find({ serverId, partyId }).select('wareraId');
    const existingIds = new Set(existing.map((m) => m.wareraId));

    const newMembers = apiMembers.filter((m) => {
      const id = m.wareraId || m._id || m.userId;
      return id && !existingIds.has(id);
    });
    
    console.log(`  [${config.serverName}] Found ${newMembers.length} new members`);

    if (isFirstRun && newMembers.length > 0) {
      console.log(`  [${config.serverName}] First run: Importing ${newMembers.length} existing members (no notifications)`);
      
      // Bulk import existing members without notifications
      for (const apiMember of newMembers) {
        try {
          const memberId = apiMember.wareraId || apiMember._id || apiMember.userId;
          const details = await proc('user.getUserById', { userId: memberId });
          
          await WareraPartyMember.findOneAndUpdate(
            { serverId, wareraId: memberId },
            {
              serverId,
              wareraId: memberId,
              username: details.username,
              usernameLower: details.username.toLowerCase(),
              level: details.leveling?.level || apiMember.level || 1,
              partyId,
              joinedAt: new Date(),
              notified: true,
            },
            { upsert: true }
          );
        } catch (err) {
          console.error(`  [${config.serverName}] Error importing member:`, err.message);
        }
      }
      
      await sendSetupConfirmation(partyName, newMembers.length, config);
      
    } else if (newMembers.length > 0) {
      // Normal operation: notify about new members
      for (const apiMember of newMembers) {
        try {
          const memberId = apiMember.wareraId || apiMember._id || apiMember.userId;
          const details = await proc('user.getUserById', { userId: memberId });

          const member = await WareraPartyMember.findOneAndUpdate(
            { serverId, wareraId: memberId },
            {
              serverId,
              wareraId: memberId,
              username: details.username,
              usernameLower: details.username.toLowerCase(),
              level: details.leveling?.level || apiMember.level || 1,
              partyId,
              joinedAt: new Date(),
              notified: true,
            },
            { upsert: true, returnDocument: 'after' }
          );

          await sendNewMemberNotification(member, partyName, config);
          console.log(`  [${config.serverName}] New member: ${member.username} (Level ${member.level})`);
        } catch (err) {
          console.error(`  [${config.serverName}] Error processing member:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error(`  [${config.serverName}] Error tracking Party:`, err.message);
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Starting Party member check...`);

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
