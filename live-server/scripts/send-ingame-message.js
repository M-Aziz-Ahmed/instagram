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
  console.log('Add your JWT token from browser cookies:');
  console.log('  WARERA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
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

async function sendInGameMessage(recipientId, content) {
  // First, try to find existing direct conversation
  const myUserId = WARERA_MESSENGER_USER_ID;
  
  const conversations = await getConversations();
  
  let conversationId = null;
  for (const conv of conversations) {
    if (conv.type === 'direct' && 
        conv.participants?.includes(myUserId) && 
        conv.participants?.includes(recipientId)) {
      conversationId = conv._id;
      break;
    }
  }

  if (!conversationId) {
    throw new Error(`No direct conversation found with ${recipientId}. You must first manually open chat with this user in WarEra UI to create the conversation.`);
  }

  console.log(`Using conversation: ${conversationId}`);

  const url = `${API_BASE}/message.createMessage`;
  
  const payload = { conversationId, message: content };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': buildCookieHeader(),
      'Origin': WARERA.appUrl,
      'Referer': WARERA.appUrl + '/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }

  if (data?.error) {
    throw new Error(`API Error: ${JSON.stringify(data.error)}`);
  }

  return data;
}

async function getConversations() {
  const url = `${API_BASE}/conversation.getConversationsPaginated?batch=1`;
  
  const payload = {
    '0': { json: { limit: 20 } },
    '1': { json: { limit: 20 } }
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
  const recipientUsername = process.argv[2];
  const message = process.argv[3];

  if (!recipientUsername || !message) {
    console.log('Usage: node scripts/send-ingame-message.js <recipientUsername> "<message>"');
    console.log('Example: node scripts/send-ingame-message.js "PlayerName" "Hi! Join our Discord: https://discord.gg/xyz"');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const recipient = await WareraPlayer.findOne({ usernameLower: recipientUsername.toLowerCase() });
  if (!recipient) {
    console.error(`❌ Player "${recipientUsername}" not found in database`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`📤 Sending message to ${recipient.username} (${recipient.wareraId})...`);

  try {
    const result = await sendInGameMessage(recipient.wareraId, message);
    console.log('✅ Message sent successfully!');
    console.log('Response:', JSON.stringify(result, null, 2));

    await WareraPlayer.findOneAndUpdate(
      { wareraId: recipient.wareraId },
      { ingameMessaged: true, ingameMessagedAt: new Date() },
      { returnDocument: 'after' }
    );
    console.log('✅ Marked as messaged in database');
  } catch (err) {
    console.error('❌ Failed to send message:', err.message);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});