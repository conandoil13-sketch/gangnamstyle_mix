window.createSfxEngine = function createSfxEngine(options) {
  const {
    sounds,
    initialMasterVolume = 1,
    onStatus = () => {},
  } = options;

  const audioBufferPromises = new Map();
  const audioBuffers = new Map();
  const activeSources = new Set();
  const sourceCleanup = new WeakMap();

  let audioContext = null;
  let masterGain = null;
  let unlocked = false;
  let masterVolume = initialMasterVolume;
  let muted = false;
  let warmAllPromise = null;

  function primeFetches() {
    sounds.forEach((sound) => {
      if (audioBufferPromises.has(sound.id)) {
        return;
      }

      const promise = fetch(sound.src)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to fetch ${sound.id}`);
          }
          return response.arrayBuffer();
        });

      audioBufferPromises.set(sound.id, promise);
    });
  }

  function ensureContext() {
    if (!window.AudioContext && !window.webkitAudioContext) {
      return null;
    }

    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass({
        latencyHint: "interactive",
      });
      masterGain = audioContext.createGain();
      masterGain.gain.value = muted ? 0 : masterVolume;
      masterGain.connect(audioContext.destination);
    }

    return audioContext;
  }

  function syncMasterGain() {
    if (!masterGain) {
      return;
    }

    masterGain.gain.value = muted ? 0 : masterVolume;
  }

  async function unlock() {
    const context = ensureContext();
    if (!context) {
      return null;
    }

    try {
      if (context.state !== "running") {
        await context.resume();
      }
      unlocked = true;
    } catch (error) {
      onStatus("오디오 컨텍스트를 시작하지 못했어요.");
      return null;
    }

    return context;
  }

  async function loadBuffer(id) {
    if (audioBuffers.has(id)) {
      return audioBuffers.get(id);
    }

    const context = await unlock();
    if (!context) {
      return null;
    }

    const arrayBufferPromise = audioBufferPromises.get(id);
    if (!arrayBufferPromise) {
      return null;
    }

    try {
      const arrayBuffer = await arrayBufferPromise;
      const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
      audioBuffers.set(id, decoded);
      return decoded;
    } catch (error) {
      onStatus(`사운드 로딩 실패: ${id}`);
      return null;
    }
  }

  async function warmAll() {
    if (warmAllPromise) {
      return warmAllPromise;
    }

    warmAllPromise = Promise.allSettled(sounds.map((sound) => loadBuffer(sound.id)));
    return warmAllPromise;
  }

  async function primeOutput() {
    const context = await unlock();
    if (!context || !masterGain) {
      return false;
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gainNode.gain.value = 0.0001;

    oscillator.connect(gainNode);
    gainNode.connect(masterGain);

    const now = context.currentTime;
    oscillator.start(now);
    oscillator.stop(now + 0.02);

    await new Promise((resolve) => {
      oscillator.addEventListener("ended", resolve, { once: true });
    });

    try {
      oscillator.disconnect();
      gainNode.disconnect();
    } catch (error) {
      // Ignore cleanup issues after priming.
    }

    return true;
  }

  async function primeSample(id, options = {}) {
    const context = await unlock();
    if (!context || !masterGain) {
      return false;
    }

    const buffer = await loadBuffer(id);
    if (!buffer) {
      return false;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const gainNode = context.createGain();
    gainNode.gain.value = typeof options.volume === "number" ? options.volume : 0.18;

    source.connect(gainNode);
    gainNode.connect(masterGain);

    const maxDuration = Math.max(
      0.03,
      Math.min(buffer.duration, typeof options.maxDuration === "number" ? options.maxDuration : 0.08)
    );
    const now = context.currentTime;

    await new Promise((resolve) => {
      source.addEventListener("ended", resolve, { once: true });
      source.start(now, 0, maxDuration);
      source.stop(now + maxDuration);
    });

    try {
      source.disconnect();
      gainNode.disconnect();
    } catch (error) {
      // Ignore cleanup issues after priming.
    }

    return true;
  }

  function removeSource(source) {
    const cleanup = sourceCleanup.get(source);
    if (cleanup) {
      cleanup();
      sourceCleanup.delete(source);
    }
  }

  async function playSound(id, options = {}) {
    const context = await unlock();
    if (!context) {
      return;
    }

    const buffer = await loadBuffer(id);
    if (!buffer) {
      return;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const gainNode = context.createGain();
    gainNode.gain.value = typeof options.volume === "number" ? options.volume : 1;

    source.connect(gainNode);
    gainNode.connect(masterGain);

    const cleanup = () => {
      activeSources.delete(source);
      try {
        source.disconnect();
      } catch (error) {
        // Ignore disconnect failures after node disposal.
      }
      try {
        gainNode.disconnect();
      } catch (error) {
        // Ignore disconnect failures after node disposal.
      }
    };

    activeSources.add(source);
    sourceCleanup.set(source, cleanup);
    source.addEventListener("ended", cleanup, { once: true });

    source.start(0);
  }

  primeFetches();

  return {
    unlock,
    warmAll,
    primeOutput,
    primeSample,
    playSound,
    setMasterVolume(nextValue) {
      masterVolume = nextValue;
      syncMasterGain();
    },
    setMuted(nextValue) {
      muted = nextValue;
      syncMasterGain();
    },
    get activeSources() {
      return activeSources;
    },
    removeSource,
    get unlocked() {
      return unlocked;
    },
  };
};
