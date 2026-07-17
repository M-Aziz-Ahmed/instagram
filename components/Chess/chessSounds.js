"use client";

const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;

function createTone(ctx, freq, duration, type = "sine", volume = 0.15) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
}

function createNoise(ctx, duration, volume = 0.08) {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * volume;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime);
}

let audioCtx = null;
function getCtx() {
    if (!audioCtx && AudioCtx) {
        audioCtx = new AudioCtx();
    }
    return audioCtx;
}

export function playMoveSound() {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    createTone(ctx, 300, 0.08, "sine", 0.12);
    setTimeout(() => createTone(ctx, 500, 0.06, "sine", 0.08), 30);
}

export function playCaptureSound() {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    createNoise(ctx, 0.06, 0.15);
    createTone(ctx, 200, 0.12, "square", 0.1);
    setTimeout(() => createTone(ctx, 350, 0.08, "square", 0.08), 40);
}

export function playCheckSound() {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    createTone(ctx, 800, 0.15, "sine", 0.15);
    setTimeout(() => createTone(ctx, 1000, 0.12, "sine", 0.12), 60);
    setTimeout(() => createTone(ctx, 1200, 0.1, "sine", 0.1), 120);
}

export function playCheckmateSound() {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    createTone(ctx, 600, 0.2, "sine", 0.2);
    setTimeout(() => createTone(ctx, 800, 0.2, "sine", 0.18), 150);
    setTimeout(() => createTone(ctx, 1200, 0.3, "sine", 0.22), 300);
}

export function playGameStartSound() {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    createTone(ctx, 400, 0.1, "sine", 0.1);
    setTimeout(() => createTone(ctx, 500, 0.1, "sine", 0.1), 100);
    setTimeout(() => createTone(ctx, 600, 0.15, "sine", 0.12), 200);
}

export function playNotificationSound() {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    createTone(ctx, 880, 0.1, "sine", 0.1);
    setTimeout(() => createTone(ctx, 1100, 0.12, "sine", 0.1), 80);
}
