const mongoose = require("mongoose");

// Append-only ledger of every gem movement.
//
// Deliberately a separate collection rather than an array on the user document:
// an account that earns and spends over time would grow an unbounded embedded
// array and eventually hit the 16MB BSON document limit. The same reasoning
// that moved comments off the Post document applies here.
//
// `amount` is signed: positive credits, negative debits. `balanceAfter` is
// stored on each row so a balance can be audited or rebuilt from history without
// replaying the whole series.
const gemTransactionSchema = new mongoose.Schema({
    user:         { type: String, required: true, index: true },
    amount:       { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reason:       { type: String, required: true },
    // Free-form detail: which sku was bought, which admin granted it, etc.
    note:         { type: String, default: "" },
    // "system" for automated movement, otherwise the acting admin's username.
    by:           { type: String, default: "system" },
    createdAt:    { type: Date, default: Date.now },
});

gemTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.GemTransaction
    || mongoose.model("GemTransaction", gemTransactionSchema);
