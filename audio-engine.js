/**
 * Frequency — Audio Engine
 * Web Audio API beat clock + procedural techno loop generator
 *
 * Public API:
 *   AudioEngine.init()                    — start AudioContext (call on user gesture)
 *   AudioEngine.start(bpm)               — begin the loop + beat clock
 *   AudioEngine.stop()                   — halt everything
 *   AudioEngine.onBeat(callback)         — register beat callback, fires on every beat
 *   AudioEngine.offBeat(callback)        — unregister beat callback
 *   AudioEngine.getBeatProgress()        — 0.0–1.0, position within current beat
 *   AudioEngine.getBPM()                 — current BPM
 *   AudioEngine.setBPM(bpm)             — change BPM (takes effect on next bar)
 *   AudioEngine.currentBeat             — integer beat counter since start
 */

const AudioEngine = (() => {
  let ctx = null;
  let bpm = 120;
  let isRunning = false;
  let startTime = 0;
  let scheduledUpTo = 0;
  let beatCallbacks = [];
  let currentBeat = 0;
  let nextBeatTime = 0;
  let schedulerTimer = null;

  // How far ahead to schedule audio (seconds)
  const SCHEDULE_AHEAD = 0.1;
  // Scheduler interval (ms)
  const SCHEDULER_INTERVAL = 25;

  // --- Synthesis helpers ---

  function makeKick(time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);

    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.start(time);
    osc.stop(time + 0.3);
  }

  function makeHihat(time, open = false) {
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;

    const gain = ctx.createGain();
    const decay = open ? 0.18 : 0.04;

    gain.gain.setValueAtTime(open ? 0.4 : 0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(time);
    source.stop(time + decay);
  }

  function makeClap(time) {
    for (let i = 0; i < 3; i++) {
      const bufSize = ctx.sampleRate * 0.05;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let j = 0; j < bufSize; j++) data[j] = Math.random() * 2 - 1;

      const src = ctx.createBufferSource();
      src.buffer = buf;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      filter.Q.value = 0.5;

      const gain = ctx.createGain();
      const offset = i * 0.01;
      gain.gain.setValueAtTime(0.3, time + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, time + offset + 0.12);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start(time + offset);
      src.stop(time + offset + 0.12);
    }
  }

  function makeBass(time, note = 40) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, time);
    filter.frequency.exponentialRampToValueAtTime(200, time + 0.15);
    filter.Q.value = 8;

    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  // 16-step patterns (1 = fire, 0 = rest)
  const PATTERNS = {
    kick:   [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    clap:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hihat:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1],
    // bass notes (MIDI): -1 = silent
    bass:   [40,-1,-1,43, -1,-1,40,-1, -1,43,-1,-1, 40,-1,38,-1],
  };

  function scheduleStep(stepIndex, stepTime) {
    if (PATTERNS.kick[stepIndex])  makeKick(stepTime);
    if (PATTERNS.clap[stepIndex])  makeClap(stepTime);
    if (PATTERNS.hihat[stepIndex]) makeHihat(stepTime, stepIndex === 14);
    const bassNote = PATTERNS.bass[stepIndex];
    if (bassNote !== -1)           makeBass(stepTime, bassNote);
  }

  // --- Beat scheduler ---
  // Runs on setInterval, schedules audio slightly ahead of playback

  let stepIndex = 0;

  function scheduler() {
    const secondsPerStep = (60 / bpm) / 4; // 16th note grid

    while (nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(stepIndex % 16, nextBeatTime);

      // Fire beat callbacks on quarter notes (every 4 steps)
      if (stepIndex % 4 === 0) {
        const beatTime = nextBeatTime;
        const beatNum = Math.floor(stepIndex / 4);
        // Schedule callback via setTimeout, aligned to beat time
        const delay = Math.max(0, (beatTime - ctx.currentTime) * 1000);
        const capturedBeat = currentBeat;
        setTimeout(() => {
          currentBeat = capturedBeat;
          beatCallbacks.forEach(cb => {
            try { cb(currentBeat, beatTime); } catch(e) {}
          });
          currentBeat++;
        }, delay);
      }

      nextBeatTime += secondsPerStep;
      stepIndex++;
    }
  }

  // --- Public API ---

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function start(initialBpm = 120) {
    if (!ctx) init();
    if (isRunning) return;
    bpm = initialBpm;
    isRunning = true;
    stepIndex = 0;
    currentBeat = 0;
    nextBeatTime = ctx.currentTime + 0.05;
    schedulerTimer = setInterval(scheduler, SCHEDULER_INTERVAL);
  }

  function stop() {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  function onBeat(cb) {
    if (typeof cb === 'function' && !beatCallbacks.includes(cb)) {
      beatCallbacks.push(cb);
    }
  }

  function offBeat(cb) {
    beatCallbacks = beatCallbacks.filter(f => f !== cb);
  }

  function getBeatProgress() {
    if (!ctx || !isRunning) return 0;
    const secondsPerBeat = 60 / bpm;
    const elapsed = ctx.currentTime - (nextBeatTime - secondsPerBeat);
    return Math.min(1, Math.max(0, elapsed / secondsPerBeat));
  }

  function getBPM() { return bpm; }

  function setBPM(newBpm) { bpm = Math.max(60, Math.min(200, newBpm)); }

  return {
    init, start, stop,
    onBeat, offBeat,
    getBeatProgress,
    getBPM, setBPM,
    get currentBeat() { return currentBeat; },
  };
})();

// Export for module environments, or leave as global for browser
if (typeof module !== 'undefined') module.exports = AudioEngine;
