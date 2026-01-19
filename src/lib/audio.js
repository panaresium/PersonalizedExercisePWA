let audioCtx;
let masterGain;

export const initAudio = async () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    return audioCtx;
};

export const getAudioTime = () => audioCtx ? audioCtx.currentTime : 0;

export const setVolume = (val) => {
    if (masterGain) masterGain.gain.value = val;
};

const parsePattern = (pattern) => {
    // S P(120) L ...
    const tokens = pattern.split(' ').filter(Boolean);
    const events = [];
    let cursor = 0;

    tokens.forEach(token => {
        if (token === 'S') {
            events.push({ type: 'beep', start: cursor, duration: 0.12, freq: 880 });
            cursor += 0.12;
        } else if (token === 'L') {
            events.push({ type: 'beep', start: cursor, duration: 0.5, freq: 880 });
            cursor += 0.5;
        } else if (token.startsWith('P(')) {
            const ms = parseInt(token.match(/\d+/)[0]);
            cursor += ms / 1000;
        }
    });
    return events; // start times are relative to pattern start
};

export const schedulePattern = (pattern, startTime) => {
    if (!audioCtx) return;
    const events = parsePattern(pattern);

    events.forEach(event => {
        if (event.type === 'beep') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.value = event.freq;

            osc.connect(gain);
            gain.connect(masterGain);

            const time = startTime + event.start;

            // Envelope to avoid clicking
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(1, time + 0.01);
            gain.gain.setValueAtTime(1, time + event.duration - 0.01);
            gain.gain.linearRampToValueAtTime(0, time + event.duration);

            osc.start(time);
            osc.stop(time + event.duration + 0.1);
        }
    });
};
