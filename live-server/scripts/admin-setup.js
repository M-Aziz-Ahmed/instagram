const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length) process.env[key.trim()] = valueParts.join('=').trim();
  }
});

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection('warera_users');

  const filter = { discordId: '833990313039233064' };
  const update = { $set: { isAdmin: true, isRegistered: true, status: 'approved', gameName: 'Admin', country: 'Pakistan' } };

  const result = await col.updateOne(filter, update, { upsert: true });
  console.log('Upserted:', result.upsertedCount > 0 ? 'new user created' : 'existing user updated');

  await mongoose.disconnect();
}

main().catch(console.error);
