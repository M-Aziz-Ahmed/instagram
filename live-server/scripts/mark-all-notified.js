#!/usr/bin/env node

/**
 * Mark all existing players as notified for ALL servers
 * Run this to stop spam after first setup
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

const MONGODB_URI = process.env.MONGODB_URI;

const ServerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: { type: String, enum: ['setup', 'active', 'paused'], default: 'setup' },
}, { timestamps: true, strict: false });

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

const Server = mongoose.models.Server || mongoose.model('Server', ServerSchema, 'servers');
const WareraPlayer = mongoose.models.WareraPlayer || mongoose.model('WareraPlayer', WareraPlayerSchema, 'warera_players');

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // Get all active servers
  const servers = await Server.find({ status: { $ne: 'paused' } }).lean();
  console.log(`Found ${servers.length} active server(s):\n`);

  for (const server of servers) {
    console.log(`[${server.name}] Checking players...`);
    
    const count = await WareraPlayer.countDocuments({ 
      serverId: server._id,
      notified: false 
    });
    
    if (count > 0) {
      const result = await WareraPlayer.updateMany(
        { serverId: server._id, notified: false },
        { $set: { notified: true } }
      );
      console.log(`  ✅ Marked ${result.modifiedCount} players as notified`);
    } else {
      console.log(`  ✓ All players already marked as notified`);
    }
  }

  console.log('\n✅ Done! All existing players across all servers are now marked as notified.');
  console.log('This will prevent spam on tracker restart.\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
