const mongoose = require("mongoose");
const uri = "mongodb://azizahmed:I_hateyou2@localhost:27017/?authSource=admin";
(async () => {
  await mongoose.connect(uri);
  const col = mongoose.connection.db.collection("users");
  const indexes = await col.indexes();
  console.log("Current indexes:", indexes.map(i => ({ name: i.name, sparse: i.sparse, unique: i.unique })));
  try {
    await col.dropIndex("inviteCode_1");
    console.log("Dropped inviteCode_1 index. Mongoose will recreate it as sparse on next model load.");
  } catch (e) {
    console.log("dropIndex inviteCode_1 failed:", e.message);
  }
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
