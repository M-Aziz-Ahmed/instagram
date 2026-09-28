const mongoose = require("mongoose");

/**
 * Rolling location observations for a signed-in account.
 *
 * Answers "what is this account's last known location" and "where does it
 * usually connect from", which `User.signupLocation` cannot answer (that is
 * fixed at signup) and which `SystemLog` cannot answer for more than 30 days
 * (it TTLs).
 *
 * ── Shape ───────────────────────────────────────────────────────────────────
 * One document per user, holding three views of the same data:
 *
 *   latest   the most recent observation, with its own timestamp
 *   history  the N most recent *place changes* — not every heartbeat
 *   places   distinct places seen in the window, with visit counts
 *
 * Why "place changes" and not every observation: a user on wifi all afternoon
 * would otherwise fill the 20-slot history with one location, and the history
 * would answer nothing. Collapsing repeats means the history reads as a
 * journey, which is what an investigator is actually looking for.
 *
 * ── Retention ───────────────────────────────────────────────────────────────
 * The TTL on `updatedAt` is the whole retention story: a record that has not
 * been refreshed for RETENTION_DAYS expires, so an inactive account's
 * observations disappear rather than accumulating forever. Any write refreshes
 * the document, which slides the window.
 *
 * The origin record is deliberately NOT here — it is on the User document and
 * does not expire.
 */

const placeSchema = new mongoose.Schema({
    key:         { type: String, required: true }, // "PK|Islamabad|Islamabad"
    country:     { type: String, default: "" },
    countryCode: { type: String, default: "" },
    region:      { type: String, default: "" },
    city:        { type: String, default: "" },
    lat:         { type: Number, default: null },
    lon:         { type: Number, default: null },
    tz:          { type: String, default: "" },
    count:       { type: Number, default: 0 },
    firstSeen:   { type: Date, default: Date.now },
    lastSeen:    { type: Date, default: Date.now },
}, { _id: false });

const observationSchema = new mongoose.Schema({
    ip:          { type: String, default: null },
    network:     { type: String, default: null },
    country:     { type: String, default: "" },
    countryCode: { type: String, default: "" },
    region:      { type: String, default: "" },
    city:        { type: String, default: "" },
    lat:         { type: Number, default: null },
    lon:         { type: Number, default: null },
    tz:          { type: String, default: "" },
    device:      { type: String, default: "" },
    at:          { type: Date, default: Date.now },
}, { _id: false });

/** Place-change slots kept. Deep enough to show a trip, shallow enough to read. */
const MAX_HISTORY = 20;
/** Distinct places kept. A heavy traveller or a VPN-hopper hits this and stops. */
const MAX_PLACES = 25;

const subscriberLocationSchema = new mongoose.Schema({
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    username: { type: String, default: "" }, // denormalised: the disclosure query filters on it
    latest:   { type: observationSchema, default: null },
    history:  { type: [observationSchema], default: [] },
    places:   { type: [placeSchema], default: [] },
    // Distinguishes a city/VPN/mobile flip from a person actually moving. A
    // change of address inside the same place key updates `latest` and the
    // place counter but does not consume a history slot.
    updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// The retention policy, in one place. Overridable because the legal floor
// differs by jurisdiction and this is the number a compliance question is
// actually about.
const RETENTION_DAYS = Math.max(
    1,
    Number(process.env.SUBSCRIBER_LOCATION_RETENTION_DAYS) || 30,
);
subscriberLocationSchema.index({ updatedAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });
// Disclosure reads by username; the globe drill-down groups by place.
subscriberLocationSchema.index({ username: 1 });
subscriberLocationSchema.index({ "places.key": 1, "places.count": -1 });
subscriberLocationSchema.index({ "places.city": 1, "places.countryCode": 1 });

module.exports = mongoose.models.SubscriberLocation
    || mongoose.model("SubscriberLocation", subscriberLocationSchema);

module.exports.MAX_HISTORY = MAX_HISTORY;
module.exports.MAX_PLACES = MAX_PLACES;
module.exports.RETENTION_DAYS = RETENTION_DAYS;
module.exports.placeSchema = placeSchema;
module.exports.observationSchema = observationSchema;
