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

const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'warera_users' });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Upsert admin user
  const result = await User.findOneAndUpdate(
    { discordId: 'b9a5c0a4-cab0-4b2b-a66f-d34aebb7e336' },
    {
      discordId: 'b9a5c0a4-cab0-4b2b-a66f-d34aebb7e336',
      isAdmin: true,
      isRegistered: true,
      status: 'approved',
      gameName: 'Admin',
      country: 'Pakistan',
    },
    { upsert: true, new: true }
  );

  console.log('Admin user:', result.discordUsername || 'created');

  await mongoose.disconnect();
}

main().catch(console.error);
