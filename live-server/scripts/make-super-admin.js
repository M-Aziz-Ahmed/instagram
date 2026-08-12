#!/usr/bin/env node

/**
 * Make a user a super admin across the entire app
 * Super admins can access any server's settings
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
const SUPER_ADMIN_DISCORD_ID = '833990313039233064';

const UserSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  discordUsername: { type: String },
  discordAvatar: { type: String },
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server' },
  serverRole: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  isAdmin: { type: Boolean, default: false },
  isSuperAdmin: { type: Boolean, default: false },
  status: { type: String, default: 'pending' },
}, { timestamps: true, strict: false });

const ServerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  ownerDiscordId: { type: String, required: true },
  admins: { type: [String], default: [] },
  status: { type: String, default: 'active' },
}, { timestamps: true, strict: false });

const User = mongoose.models.User || mongoose.model('User', UserSchema, 'users');
const Server = mongoose.models.Server || mongoose.model('Server', ServerSchema, 'servers');

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // Find or create the super admin user
  let user = await User.findOne({ discordId: SUPER_ADMIN_DISCORD_ID });
  
  if (!user) {
    console.log('User not found. Creating new super admin user...');
    user = await User.create({
      discordId: SUPER_ADMIN_DISCORD_ID,
      discordUsername: 'Super Admin',
      isSuperAdmin: true,
      isAdmin: true,
      serverRole: 'owner',
      status: 'approved',
    });
    console.log('✅ Created new super admin user');
  } else {
    console.log(`Found user: ${user.discordUsername || user.discordId}`);
    user.isSuperAdmin = true;
    user.isAdmin = true;
    await user.save();
    console.log('✅ Updated user to super admin');
  }

  // Add user as admin to all servers
  const servers = await Server.find({});
  console.log(`\nFound ${servers.length} server(s):`);

  for (const server of servers) {
    if (!server.admins.includes(SUPER_ADMIN_DISCORD_ID)) {
      server.admins.push(SUPER_ADMIN_DISCORD_ID);
      await server.save();
      console.log(`  ✅ Added to "${server.name}" as admin`);
    } else {
      console.log(`  ✓ Already admin of "${server.name}"`);
    }
  }

  console.log('\n✅ Done! User 833990313039233064 is now a super admin.');
  console.log('They can now:');
  console.log('  • Access any server\'s settings');
  console.log('  • Create new servers');
  console.log('  • Manage all servers');
  console.log('\nSign out and sign back in to refresh the session.\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
