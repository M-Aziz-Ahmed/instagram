"use client";

const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;

let audioCtx = null;
let soundEnabled = true;

function getCtx() {
    if (!audioCtx && AudioCtx) {
        audioCtx = new AudioCtx();
    }
    return audioCtx;
}

export function setSoundEnabled(enabled) {
    soundEnabled = enabled;
}

export function isSoundEnabled() {
    return soundEnabled;
}

function noise(ctx, duration, volume = 0.12) {
    const len = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(ctx.currentTime);
}

function tone(ctx, freq, duration, type = "sine", volume = 0.12, delay = 0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.01);
}

export function playMoveSound() {
    if (!soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    tone(ctx, 180, 0.04, "sine", 0.18);
    tone(ctx, 320, 0.06, "sine", 0.10, 0.01);
    tone(ctx, 200, 0.03, "triangle", 0.06, 0.02);
}

export function playCaptureSound() {
    if (!soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    noise(ctx, 0.04, 0.15);
    tone(ctx, 150, 0.08, "square", 0.10);
    tone(ctx, 280, 0.06, "sawtooth", 0.08, 0.02);
    tone(ctx, 120, 0.10, "sine", 0.12, 0.03);
    tone(ctx, 400, 0.04, "sine", 0.06, 0.05);
}

export function playCheckSound() {
    if (!soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    tone(ctx, 600, 0.08, "sine", 0.15);
    tone(ctx, 750, 0.06, "sine", 0.12, 0.06);
    tone(ctx, 900, 0.12, "sine", 0.10, 0.12);
    tone(ctx, 1100, 0.08, "triangle", 0.08, 0.18);
}

export function playCheckmateSound() {
    if (!soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    tone(ctx, 400, 0.15, "sine", 0.18);
    tone(ctx, 500, 0.12, "sine", 0.15, 0.10);
    tone(ctx, 650, 0.12, "sine", 0.14, 0.20);
    tone(ctx, 800, 0.12, "sine", 0.16, 0.30);
    tone(ctx, 1000, 0.20, "sine", 0.18, 0.40);
    tone(ctx, 1200, 0.25, "triangle", 0.12, 0.55);
}

export function playCastleSound() {
    if (!soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    tone(ctx, 200, 0.04, "sine", 0.14);
    tone(ctx, 160, 0.04, "sine", 0.12, 0.05);
    tone(ctx, 250, 0.06, "sine", 0.10, 0.08);
    tone(ctx, 300, 0.05, "triangle", 0.08, 0.12);
}

export function playPromotionSound() {
    if (!soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    tone(ctx, 500, 0.08, "sine", 0.12);
    tone(ctx, 600, 0.08, "sine", 0.14, 0.08);
    tone(ctx, 800, 0.12, "sine", 0.16, 0.16);
    tone(ctx, 1000, 0.15, "triangle", 0.12, 0.28);
}

export function playGameStartSound() {
    if (!soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    tone(ctx, 440, 0.08, "sine", 0.08);
    tone(ctx, 550, 0.08, "sine", 0.08, 0.10);
    tone(ctx, 660, 0.08, "sine", 0.08, 0.20);
    tone(ctx, 880, 0.12, "sine", 0.10, 0.30);
}

export function playNotificationSound() {
    if (!soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    tone(ctx, 880, 0.08, "sine", 0.10);
    tone(ctx, 1100, 0.10, "sine", 0.08, 0.08);
}

export function playIllegalSound() {
    if (!soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    tone(ctx, 200, 0.08, "sawtooth", 0.08);
    tone(ctx, 150, 0.10, "sawtooth", 0.06, 0.06);
}

export function playClickSound() {
    if (!soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    tone(ctx, 600, 0.02, "sine", 0.06);
}
