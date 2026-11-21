const mixLevel = .32256;
const turnPeak = .61;
const threeCarLevel = .88;
const engineSettings = [
  { pitch: 1, level: .74 },
  { pitch: .947, level: .65 },
  { pitch: .974, level: .56 },
];

function smooth(start, end, value) {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function exhaustLoop(context) {
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, 2 * sampleRate, sampleRate);
  const samples = buffer.getChannelData(0);
  // Give the six-cylinder exhaust a firing tone, lower engine orders and some air around the harmonics.
  const harmonics = [.11, .135, .33, .07, .045, .19, .028, .022, .082, .025, .013, .045];
  const cycle = new Float32Array(1024);
  for (let index = 0; index < cycle.length; index++) {
    const phase = 2 * Math.PI * index / cycle.length;
    cycle[index] = harmonics.reduce((sum, level, order) =>
      sum + level * Math.sin((order + 1) * phase + .31 * order), 0);
  }

  let random = 47219;
  let air = 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    const angle = 2 * Math.PI * time;
    const phase = (time * 144 % 1) * cycle.length;
    const position = Math.floor(phase);
    const pulse = cycle[position] + (cycle[(position + 1) % cycle.length] - cycle[position]) * (phase - position);
    random = (Math.imul(1664525, random) + 1013904223) >>> 0;
    air += .095 * ((random / 0x80000000 - 1) - air);
    const seam = smooth(0, .018, time) * (1 - smooth(1.982, 2, time));
    const flutter = 1 + .042 * Math.sin(17 * angle) + .026 * Math.sin(31 * angle);
    samples[index] = .82 * pulse * flutter + .27 * seam * air + .028 * Math.sin(1187 * angle);
  }
  return buffer;
}

export function createEngineMix(context) {
  const master = context.createGain();
  master.gain.value = mixLevel;
  master.connect(context.destination);
  const exhaust = exhaustLoop(context);
  const voices = engineSettings.map(({ pitch, level }, index) => {
    const source = context.createBufferSource();
    source.buffer = exhaust;
    source.loop = true;
    const glass = context.createBiquadFilter();
    glass.type = 'lowpass';
    glass.frequency.value = 490;
    const gain = context.createGain();
    gain.gain.value = 0;
    const stereo = context.createStereoPanner();
    source.connect(glass).connect(gain).connect(stereo).connect(master);
    source.start(0, index * .083);
    return { source, glass, gain, stereo, pitch, level };
  });

  function moveCar(index, progress, screenX, groupSize, at = context.currentTime) {
    const { source, glass, gain, stereo, pitch, level } = voices[index];
    const proximity = progress < turnPeak
      ? smooth(0, turnPeak, progress)
      : 1 - smooth(turnPeak, 1, progress);
    const cornerLift = smooth(.29, .58, progress) * (1 - smooth(.60, .88, progress));
    const doppler = 1.09 - .22 * smooth(.54, .75, progress);
    const shift = smooth(.78, .81, progress) * (1 - smooth(.81, .91, progress));
    const revs = .88 + .42 * progress - .23 * cornerLift - .13 * shift;
    source.playbackRate.setTargetAtTime(revs * doppler * pitch, at, .05);
    glass.frequency.setTargetAtTime(490 + proximity * 1700, at, .04);
    gain.gain.setTargetAtTime(proximity ** 1.36 * level * (groupSize === 3 ? threeCarLevel : 1), at, .027);
    stereo.pan.setTargetAtTime(.29 * Math.min(1, Math.max(-1, screenX)) - .09, at, .05);
  }

  return {
    moveCar,
    silence() {
      const now = context.currentTime;
      for (const { gain } of voices) gain.gain.setTargetAtTime(0, now, .009);
    },
    setMuted(muted) {
      master.gain.setTargetAtTime(muted ? 0 : mixLevel, context.currentTime, .008);
    },
  };
}

export function createMonzaAudio(onStatus) {
  let context;
  let mix;
  let muted = false;
  let available = typeof window.AudioContext === 'function';

  function unlock() {
    if (muted || !available) return;
    if (!context) {
      try {
        context = new AudioContext();
        mix = createEngineMix(context);
        context.addEventListener('statechange', onStatus);
      } catch {
        available = false;
        onStatus();
        return;
      }
    }
    if (context.state !== 'running') context.resume().catch(onStatus);
    onStatus();
  }

  return {
    unlock,
    get muted() { return muted; },
    get status() {
      if (!available) return 'unavailable';
      return context?.state === 'running' ? 'ready' : 'waiting';
    },
    setMuted(value) {
      muted = value;
      mix?.setMuted(muted);
      onStatus();
    },
    moveCar(index, progress, screenX, groupSize) {
      if (context?.state === 'running') mix?.moveCar(index, progress, screenX, groupSize);
    },
    silence() { mix?.silence(); },
  };
}
