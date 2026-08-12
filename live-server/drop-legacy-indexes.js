#!/usr/bin/env node

// Standalone script to drop legacy unique indexes from pre-multi-tenant schema.
// Run with: node scripts/drop-legacy-indexes.js
// Requires MONGODB_URI in .env.local or .env

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load env
const envCandidates = [
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '.env.local'),
  path.join(__dirname, '.env'),
];
for (const envPath of envCandidates) {
  if (!fs.existsSync(envPath)) continue;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

// Intended multi-tenant compound unique keys per collection.
const COLLECTION_UNIQUE_KEYS = {
  country_cache: [['serverId', 'countryId']],
  country_stats_history: [['serverId', 'countryId', 'date']],
  warera_players: [['serverId', 'wareraId']],
  tracked_entities: [['serverId', 'type', 'entityId']],
  player_notes: [['serverId', 'wareraId']],
};

async function dropLegacyIndexes() {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return 0;

  let dropped = 0;
  for (const [coll, intendedKeys] of Object.entries(COLLECTION_UNIQUE_KEYS)) {
    let indexes;
    try {
      indexes = await mongoose.connection.db.collection(coll).indexes();
    } catch (e) {
      continue;
    }
    const intendedSets = intendedKeys.map((k) => new Set(k));
    for (const index of indexes) {
      if (index.name === '_id_') continue;
      if (!index.unique) continue;
      const fields = Object.keys(index.key);
      const fieldSet = new Set(fields);
      const isLegacy = intendedSets.some(
        (s) =>
          s.size > fieldSet.size &&
          [...fieldSet].every((f) => s.has(f))
      );
      if (!isLegacy) continue;
      try {
        await mongoose.connection.db.collection(coll).dropIndex(index.name);
        console.log(`[Index] Dropped legacy unique index ${coll}.${index.name} (${fields.join(', ')})`);
        dropped++;
      } catch (e) {
        console.warn(`[Index] Failed to drop ${coll}.${index.name}: ${e.message}`);
      }
    }
  }
  return dropped;
}

async function main() {
  console.log('[Index] Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('[Index] Connected. Scanning for legacy unique indexes...');

  const dropped = await dropLegacyIndexes();
  if (dropped) {
    console.log(`[Index] Done. Dropped ${dropped} legacy unique index(es).`);
  } else {
    console.log('[Index] No legacy unique indexes found.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[Index] Fatal error:', err);
  process.exit(1);
});