// Notification sound utility

let audioContext = null;
let soundEnabled = true;
let initialized = false;

// Initialize audio context (must be called from a user gesture)
export function initAudio() {
    if (initialized) return audioContext;
    if (typeof window === 'undefined') return null;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        initialized = true;
        // Try to resume immediately (works if called from click handler)
        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }
    } catch (e) {
        console.warn('Web Audio API not supported:', e);
    }
    return audioContext;
}

// Play notification sound
export function playNotificationSound(type = 'default') {
    if (!soundEnabled || typeof window === 'undefined') return;
    
    const ctx = audioContext || initAudio();
    if (!ctx) return;

    try {
        // Resume audio context if suspended (browser policy)
        const play = () => {
            try {
                const oscillator = ctx.createOscillator();
                const gainNode = ctx.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(ctx.destination);

                const sounds = {
                    default: { freq1: 800, freq2: 1000, duration: 0.1 },
                    message: { freq1: 600, freq2: 900, duration: 0.15 },
                    like: { freq1: 900, freq2: 1200, duration: 0.08 },
                    comment: { freq1: 700, freq2: 1100, duration: 0.12 },
                    mention: { freq1: 850, freq2: 1150, duration: 0.13 },
                    love: { freq1: 1000, freq2: 1400, duration: 0.12 },
                    repost: { freq1: 750, freq2: 1050, duration: 0.1 },
                    follow: { freq1: 650, freq2: 950, duration: 0.12 },
                };

                const sound = sounds[type] || sounds.default;
                const now = ctx.currentTime;

                oscillator.frequency.setValueAtTime(sound.freq1, now);
                oscillator.frequency.exponentialRampToValueAtTime(sound.freq2, now + sound.duration);

                gainNode.gain.setValueAtTime(0, now);
                gainNode.gain.linearRampToValueAtTime(0.25, now + 0.01);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + sound.duration);

                oscillator.start(now);
                oscillator.stop(now + sound.duration + 0.1);

                // Second tone for richer sound
                const oscillator2 = ctx.createOscillator();
                const gainNode2 = ctx.createGain();

                oscillator2.connect(gainNode2);
                gainNode2.connect(ctx.destination);

                oscillator2.frequency.setValueAtTime(sound.freq1 * 1.5, now + 0.05);
                oscillator2.frequency.exponentialRampToValueAtTime(sound.freq2 * 1.5, now + sound.duration + 0.05);

                gainNode2.gain.setValueAtTime(0, now + 0.05);
                gainNode2.gain.linearRampToValueAtTime(0.15, now + 0.06);
                gainNode2.gain.exponentialRampToValueAtTime(0.01, now + sound.duration + 0.05);

                oscillator2.start(now + 0.05);
                oscillator2.stop(now + sound.duration + 0.15);
            } catch (e) {
                console.warn('Failed to play notification sound:', e);
            }
        };

        if (ctx.state === 'suspended') {
            ctx.resume().then(play).catch(() => {});
        } else {
            play();
        }
    } catch (e) {
        console.warn('Failed to play notification sound:', e);
    }
}

// Toggle sound on/off
export function toggleNotificationSound() {
    soundEnabled = !soundEnabled;
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem('notificationSoundEnabled', soundEnabled ? 'true' : 'false');
        } catch {}
    }
    return soundEnabled;
}

// Get sound enabled status
export function isSoundEnabled() {
    if (typeof window !== 'undefined') {
        try {
            const stored = localStorage.getItem('notificationSoundEnabled');
            if (stored !== null) {
                soundEnabled = stored === 'true';
            }
        } catch {}
    }
    return soundEnabled;
}

// Initialize sound preference from localStorage
if (typeof window !== 'undefined') {
    try {
        isSoundEnabled();
    } catch {}
}
