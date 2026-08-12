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

  // Fix existing user
  const result = await db.collection('warera_users').updateOne(
    { discordId: '213ae7db-966d-4ae1-a8c0-e5db49629cb6' },
    { $set: { countryMatch: true, nameMatch: true } }
  );
  console.log('Fixed user:', result.modifiedCount, 'user(s)');

  await mongoose.disconnect();
}

main().catch(console.error);
