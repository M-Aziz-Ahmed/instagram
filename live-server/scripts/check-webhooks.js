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

const { Server } = require('./multi-tenant.js');

const MONGODB_URI = process.env.MONGODB_URI;

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected!\n');

  const servers = await Server.find({}).lean();
  console.log(`Found ${servers.length} server(s)\n`);

  for (const server of servers) {
    console.log(`\n========================================`);
    console.log(`Server: ${server.name}`);
    console.log(`Status: ${server.status}`);
    console.log(`Owner: ${server.ownerDiscordId}`);
    console.log(`\nWebhooks:`);
    console.log(`  join: ${server.webhooks?.join || '(empty)'}`);
    console.log(`  status: ${server.webhooks?.status || '(empty)'}`);
    console.log(`  country: ${server.webhooks?.country || '(empty)'}`);
    console.log(`  mu: ${server.webhooks?.mu || '(empty)'}`);
    console.log(`  party: ${server.webhooks?.party || '(empty)'}`);
    console.log(`  newPlayer: ${server.webhooks?.newPlayer || '(empty)'}`);
    
    // Check if any webhook looks invalid
    for (const [key, value] of Object.entries(server.webhooks || {})) {
      if (value && !value.startsWith('https://')) {
        console.log(`  ⚠️  WARNING: ${key} doesn't start with https:// - Value: ${value.substring(0, 50)}`);
      }
    }
  }

  await mongoose.disconnect();
  console.log('\n\nDone!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
