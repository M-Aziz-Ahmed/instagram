const mongoose = require("mongoose");
const uri = "mongodb://azizahmed:I_hateyou2@localhost:27017/?authSource=admin";
(async () => {
  await mongoose.connect(uri);
  const col = mongoose.connection.db.collection("users");
  const before = await col.countDocuments({ inviteCode: null });
  console.log("users with null inviteCode before:", before);
  // Attempt two inserts with null inviteCode to confirm no dup-key error
  try {
    await col.insertOne({ email: "nulltest1_" + Date.now() + "@example.com", inviteCode: null });
    await col.insertOne({ email: "nulltest2_" + Date.now() + "@example.com", inviteCode: null });
    console.log("OK: two null inviteCode inserts succeeded (index is sparse).");
    // cleanup
    await col.deleteMany({ email: /nulltest\d_.*@example\.com/ });
    console.log("cleaned up test users.");
  } catch (e) {
    console.log("STILL FAILS:", e.message);
  }
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
