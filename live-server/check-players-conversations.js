#!/usr/bin/env node

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

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

const MONGODB_URI = process.env.MONGODB_URI;
const { WARERA, WARERA_MESSENGER_USER_ID } = require('../lib/config.js');
const WARERA_JWT = process.env.WARERA_JWT;
const WARERA_CF_CLEARANCE = process.env.WARERA_CF_CLEARANCE;

if (!WARERA_JWT) {
  console.error('❌ WARERA_JWT not set in .env.local');
  process.exit(1);
}

const WareraPlayerSchema = new mongoose.Schema(
  {
    wareraId: { type: String, required: true, unique: true },
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

const WareraPlayer = mongoose.models.WareraPlayer || mongoose.model('WareraPlayer', WareraPlayerSchema, 'warera_players');

const API_BASE = WARERA.messagingApi;

function buildCookieHeader() {
  const parts = [`jwt=${WARERA_JWT}`];
  if (WARERA_CF_CLEARANCE) {
    parts.push(`cf_clearance=${WARERA_CF_CLEARANCE}`);
  }
  return parts.join('; ');
}

async function getConversations() {
  const url = `${API_BASE}/conversation.getConversationsPaginated?batch=1`;
  
  const payload = {
    '0': { json: { limit: 50 } },
    '1': { json: { limit: 50 } }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': buildCookieHeader(),
      'Origin': WARERA.appUrl,
      'Referer': WARERA.appUrl + '/',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }

  return data[0]?.result?.data?.items || [];
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');
  
  // Get all unmessaged players
  const players = await WareraPlayer.find({ ingameMessaged: { $ne: true } })
    .select('wareraId username level')
    .sort({ createdAt: -1 })
    .limit(20);
  
  // Get existing conversations
  const conversations = await getConversations();
  const myUserId = WARERA_MESSENGER_USER_ID;
  const directConvs = conversations.filter(c => c.type === 'direct');
  const conversationUserIds = new Set(
    directConvs.map(c => c.participants?.find(p => p !== myUserId)).filter(Boolean)
  );
  
  console.log(`\n📋 Unmessaged Players (${players.length}):\n`);
  
  for (const player of players) {
    const hasConv = conversationUserIds.has(player.wareraId);
    const status = hasConv ? '✅ CAN MESSAGE' : '❌ NEEDS MANUAL CONV';
    console.log(`${status} - ${player.username} (Level ${player.level})`);
    console.log(`  WarEra ID: ${player.wareraId}`);
    console.log(`  Profile: https://app.warera.io/user/${player.wareraId}`);
    console.log('');
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  Can auto-message: ${players.filter(p => conversationUserIds.has(p.wareraId)).length}`);
  console.log(`  Need manual conv: ${players.filter(p => !conversationUserIds.has(p.wareraId)).length}`);
  
  await mongoose.disconnect();
}

main().catch(console.error);