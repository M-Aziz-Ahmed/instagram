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

async function main() {
  const limit = parseInt(process.argv[2]) || 50;
  const showAll = process.argv.includes('--all');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const query = showAll ? {} : { ingameMessaged: { $ne: true } };
  const players = await WareraPlayer.find(query)
    .select('wareraId username level joinedAt ingameMessaged ingameMessagedAt createdAt')
    .sort({ createdAt: -1 })
    .limit(limit);

  console.log(`\n📋 ${showAll ? 'All' : 'Unmessaged'} Players (latest ${limit}):\n`);

  if (players.length === 0) {
    console.log('No players found.');
  } else {
    players.forEach((p, i) => {
      const status = p.ingameMessaged ? '✅ MESSAGED' : '❌ NOT MESSAGED';
      const msgTime = p.ingameMessagedAt ? ` (at ${new Date(p.ingameMessagedAt).toLocaleString()})` : '';
      const joinTime = new Date(p.joinedAt).toLocaleString();
      console.log(`${i + 1}. ${p.username} (Level ${p.level})`);
      console.log(`   Joined: ${joinTime} | ${status}${msgTime}`);
      console.log(`   Profile: https://app.warera.io/user/${p.wareraId}`);
      console.log(`   Mark messaged: node scripts/mark-ingame-messaged.js "${p.username}"`);
      console.log('');
    });
  }

  const total = await WareraPlayer.countDocuments();
  const messaged = await WareraPlayer.countDocuments({ ingameMessaged: true });
  console.log(`\n📊 Total: ${total} | Messaged: ${messaged} | Pending: ${total - messaged}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});