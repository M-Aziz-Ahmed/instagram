require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

async function markExistingPlayersAsImported() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    console.log('\nMarking all existing players as imported from MU...');
    
    // Update all players to add importedFromMU field
    const result = await mongoose.connection.db.collection('warera_players_global').updateMany(
      {},
      { 
        $set: { 
          importedFromMU: true 
        } 
      }
    );
    
    console.log(`✅ Marked ${result.modifiedCount} players as imported`);
    
    // Show some stats
    const totalPlayers = await mongoose.connection.db.collection('warera_players_global').countDocuments();
    const importedPlayers = await mongoose.connection.db.collection('warera_players_global').countDocuments({
      importedFromMU: true
    });
    
    console.log(`\nCurrent stats:`);
    console.log(`Total players: ${totalPlayers}`);
    console.log(`Imported players: ${importedPlayers}`);
    
  } catch (error) {
    console.error('❌ Error marking players:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

markExistingPlayersAsImported();
