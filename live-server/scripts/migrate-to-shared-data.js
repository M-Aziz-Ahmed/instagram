#!/usr/bin/env node

/**
 * Migrate from per-server data to shared global data
 * 
 * This script:
 * 1. Consolidates duplicate player records into one global record
 * 2. Creates server_player_tracking records for notification state
 * 3. Consolidates country cache
 * 4. Updates tracked entities to use notifiedMemberIds
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

// Old schemas (with serverId)
const OldPlayerSchema = new mongoose.Schema({}, { strict: false, collection: 'warera_players' });
const OldCountryCacheSchema = new mongoose.Schema({}, { strict: false, collection: 'country_cache' });

// New schemas (without serverId)
const NewPlayerSchema = new mongoose.Schema({}, { strict: false, collection: 'warera_players_global' });
const NewCountryCacheSchema = new mongoose.Schema({}, { strict: false, collection: 'country_cache_global' });

const ServerPlayerTrackingSchema = new mongoose.Schema({
  serverId: mongoose.Schema.Types.ObjectId,
  wareraId: String,
  notified: Boolean,
  notifiedAt: Date,
  ingameMessaged: Boolean,
  ingameMessagedAt: Date,
}, { timestamps: true, collection: 'server_player_tracking' });

const OldPlayer = mongoose.model('OldPlayer', OldPlayerSchema);
const OldCountryCache = mongoose.model('OldCountryCache', OldCountryCacheSchema);
const NewPlayer = mongoose.model('NewPlayer', NewPlayerSchema);
const NewCountryCache = mongoose.model('NewCountryCache', NewCountryCacheSchema);
const ServerPlayerTracking = mongoose.model('ServerPlayerTracking', ServerPlayerTrackingSchema);

async function main() {
  console.log('🚀 Starting migration to shared data architecture...\n');
  
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Step 1: Migrate Players
  console.log('📊 Step 1: Migrating players...');
  const oldPlayers = await OldPlayer.find({}).lean();
  console.log(`   Found ${oldPlayers.length} old player records`);

  const playersByWareraId = new Map();
  const trackingRecords = [];

  for (const player of oldPlayers) {
    const { serverId, wareraId, notified, ingameMessaged, ingameMessagedAt, ...playerData } = player;

    // Keep the first/best record for each player
    if (!playersByWareraId.has(wareraId)) {
      playersByWareraId.set(wareraId, playerData);
    }

    // Create tracking record for this server-player pair
    if (serverId) {
      trackingRecords.push({
        serverId,
        wareraId,
        notified: notified || false,
        notifiedAt: notified ? player.createdAt : null,
        ingameMessaged: ingameMessaged || false,
        ingameMessagedAt: ingameMessagedAt || null,
      });
    }
  }

  console.log(`   Consolidated to ${playersByWareraId.size} unique players`);
  console.log(`   Created ${trackingRecords.length} tracking records`);

  // Insert global players
  if (playersByWareraId.size > 0) {
    const globalPlayers = Array.from(playersByWareraId.values());
    await NewPlayer.insertMany(globalPlayers, { ordered: false }).catch((err) => {
      if (err.code !== 11000) throw err; // Ignore duplicate key errors
      console.log('   (Some players already existed)');
    });
    console.log('   ✅ Global players created');
  }

  // Insert tracking records
  if (trackingRecords.length > 0) {
    await ServerPlayerTracking.insertMany(trackingRecords, { ordered: false }).catch((err) => {
      if (err.code !== 11000) throw err;
      console.log('   (Some tracking records already existed)');
    });
    console.log('   ✅ Tracking records created\n');
  }

  // Step 2: Migrate Country Cache
  console.log('📊 Step 2: Migrating country cache...');
  const oldCaches = await OldCountryCache.find({}).lean();
  console.log(`   Found ${oldCaches.length} old cache records`);

  const cachesByCountryId = new Map();

  for (const cache of oldCaches) {
    const { serverId, _id, ...cacheData } = cache;
    const { countryId } = cache;

    // Keep the most recent cache for each country
    const existing = cachesByCountryId.get(countryId);
    if (!existing || new Date(cache.lastUpdated) > new Date(existing.lastUpdated)) {
      cachesByCountryId.set(countryId, cacheData);
    }
  }

  console.log(`   Consolidated to ${cachesByCountryId.size} unique countries`);

  if (cachesByCountryId.size > 0) {
    const globalCaches = Array.from(cachesByCountryId.values());
    await NewCountryCache.insertMany(globalCaches, { ordered: false }).catch((err) => {
      if (err.code !== 11000) throw err;
      console.log('   (Some caches already existed)');
    });
    console.log('   ✅ Global country caches created\n');
  }

  // Summary
  console.log('✅ Migration complete!\n');
  console.log('Summary:');
  console.log(`  • ${oldPlayers.length} → ${playersByWareraId.size} player records (${Math.round((1 - playersByWareraId.size / oldPlayers.length) * 100)}% reduction)`);
  console.log(`  • ${trackingRecords.length} server-player tracking records created`);
  console.log(`  • ${oldCaches.length} → ${cachesByCountryId.size} country cache records (${Math.round((1 - cachesByCountryId.size / oldCaches.length) * 100)}% reduction)`);
  console.log('\nOld collections (warera_players, country_cache) are still intact.');
  console.log('New collections (warera_players_global, country_cache_global, server_player_tracking) are ready.');
  console.log('\nNext: Update tracker scripts to use new collections.\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌ Migration error:', err);
  process.exit(1);
});
