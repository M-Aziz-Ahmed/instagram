// Call ring tones (incoming ring for the callee, ringback for the caller).
// Synthesized with Web Audio so no audio assets are needed.

let audioContext = null;
let ringTimer = null;
let masterGain = null;

// Create/resume the AudioContext. Browsers only allow audio after a user
// gesture, so we hook passive listeners to unlock on the first interaction.
export function unlockCallAudio() {
    if (typeof window === "undefined") return;
    const init = () => {
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch {}
        }
        if (audioContext && audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
        }
    };
    init();
    ["pointerdown", "keydown", "touchstart", "click"].forEach((evt) => {
        window.addEventListener(evt, init, { passive: true, once: true });
    });
}

function ensureMaster() {
    if (!masterGain && audioContext) {
        masterGain = audioContext.createGain();
        masterGain.gain.value = 1;
        masterGain.connect(audioContext.destination);
    }
    if (masterGain) {
        const now = audioContext.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(1, now);
    }
}

function burstAt(freqA, freqB, time, duration, volume) {
    const ctx = audioContext;
    if (!ctx) return;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.value = freqA;
    osc2.frequency.value = freqB;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(masterGain);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.02);
    gain.gain.setValueAtTime(volume, time + duration - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + 0.05);
    osc2.stop(time + duration + 0.05);
}

function playCycle(type) {
    const ctx = audioContext;
    if (!ctx || !masterGain) return;
    const t0 = ctx.currentTime + 0.05;
    if (type === "incoming") {
        // Classic double burst: ring ... ring ... pause
        burstAt(440, 480, t0, 0.5, 0.22);
        burstAt(440, 480, t0 + 0.8, 0.5, 0.22);
    } else {
        // Ringback: steady single tone
        burstAt(425, 425, t0, 1.0, 0.16);
    }
}

function startRing(type) {
    unlockCallAudio();
    if (!audioContext) return;
    const begin = () => {
        ensureMaster();
        if (ringTimer) clearInterval(ringTimer);
        ringTimer = setInterval(
            () => {
                if (!audioContext) return;
                if (audioContext.state === "suspended") {
                    audioContext.resume().catch(() => {});
                    return;
                }
                playCycle(type);
            },
            type === "incoming" ? 3400 : 4200
        );
        playCycle(type);
    };
    if (audioContext.state === "suspended") {
        audioContext.resume().then(begin).catch(() => {});
    } else {
        begin();
    }
}

export function startIncomingRing() {
    startRing("incoming");
}

export function startOutgoingRing() {
    startRing("outgoing");
}

export function stopRing() {
    if (ringTimer) {
        clearInterval(ringTimer);
        ringTimer = null;
    }
    if (masterGain && audioContext) {
        const now = audioContext.currentTime;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value || 0.0001, now);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    }
}