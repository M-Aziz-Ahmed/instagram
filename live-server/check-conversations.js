#!/usr/bin/env node

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

const { WARERA, WARERA_MESSENGER_USER_ID } = require('../lib/config.js');
const WARERA_JWT = process.env.WARERA_JWT;
const WARERA_CF_CLEARANCE = process.env.WARERA_CF_CLEARANCE;

if (!WARERA_JWT) {
  console.error('❌ WARERA_JWT not set in .env.local');
  process.exit(1);
}

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
  const myUserId = WARERA_MESSENGER_USER_ID;
  
  console.log('Fetching conversations...');
  const conversations = await getConversations();
  
  console.log(`\n📬 Your Direct Conversations (${conversations.filter(c => c.type === 'direct').length}):\n`);
  
  const directConvs = conversations.filter(c => c.type === 'direct');
  
  for (const conv of directConvs) {
    const otherId = conv.participants?.find(p => p !== myUserId);
    const lastMsg = conv.lastMessage?.message?.slice(0, 50) || 'No messages';
    const lastMsgTime = conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleString() : 'Never';
    
    console.log(`Conversation ID: ${conv._id}`);
    console.log(`  Other user: ${otherId}`);
    console.log(`  Last message: "${lastMsg}"`);
    console.log(`  Last message at: ${lastMsgTime}`);
    console.log(`  Unread: ${conv.unreadCount}`);
    console.log('');
  }
  
  const otherIds = directConvs.map(c => c.participants?.find(p => p !== myUserId)).filter(Boolean);
  console.log('\n✅ Can message these users (conversation exists):');
  otherIds.forEach(id => console.log(`  - ${id}`));
  
  console.log('\n❌ Need manual conversation creation for other users');
}

main().catch(console.error);