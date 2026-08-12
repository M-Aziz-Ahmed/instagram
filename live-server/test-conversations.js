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

  return data;
}

async function main() {
  console.log('Fetching conversations...');
  try {
    const data = await getConversations();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();