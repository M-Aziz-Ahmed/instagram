const crypto = require("crypto");

const PIN_MIN = 4;
const PIN_MAX = 8;

function isValidPin(pin) {
    return typeof pin === "string" && /^\d+$/.test(pin) && pin.length >= PIN_MIN && pin.length <= PIN_MAX;
}

function hashPin(pin) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(String(pin), salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
    if (!stored || typeof stored !== "string") return false;
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(String(pin), salt, 64).toString("hex");
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(candidate, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = { isValidPin, hashPin, verifyPin };
