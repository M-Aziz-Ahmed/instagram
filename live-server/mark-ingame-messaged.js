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
  const username = process.argv[2];
  if (!username) {
    console.log('Usage: node scripts/mark-ingame-messaged.js <username>');
    console.log('Example: node scripts/mark-ingame-messaged.js "PlayerName"');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const player = await WareraPlayer.findOneAndUpdate(
    { usernameLower: username.toLowerCase() },
    { ingameMessaged: true, ingameMessagedAt: new Date() },
    { returnDocument: 'after' }
  );

  if (player) {
    console.log(`✅ Marked ${player.username} as in-game messaged at ${player.ingameMessagedAt}`);
  } else {
    console.log(`❌ Player "${username}" not found in database`);
    console.log('Available players:');
    const players = await WareraPlayer.find({}).select('username level ingameMessaged').sort({ createdAt: -1 }).limit(20);
    players.forEach(p => console.log(`  - ${p.username} (Level ${p.level}) ${p.ingameMessaged ? '✅ Messaged' : '❌ Not messaged'}`));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});