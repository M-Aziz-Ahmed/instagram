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

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const col = db.collection('warera_users');

  // Keep only the admin account, delete all others
  const adminDiscordId = 'b9a5c0a4-cab0-4b2b-a66f-d34aebb7e336';

  // Remove duplicates (non-admin entries)
  const result = await col.deleteMany({
    discordId: { $ne: adminDiscordId }
  });
  console.log(`Deleted ${result.deletedCount} duplicate users`);

  // Ensure admin is correct
  await col.updateOne(
    { discordId: adminDiscordId },
    { $set: { isAdmin: true, isRegistered: true, status: 'approved', gameName: 'Admin', country: 'Pakistan' } }
  );
  console.log('Admin account confirmed');

  // Show final state
  const users = await col.find({}).toArray();
  console.log(`\nFinal users: ${users.length}`);
  for (const u of users) {
    console.log(`- ${u.discordUsername} | admin: ${u.isAdmin} | status: ${u.status}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
