window.createPadEngine = function createPadEngine(options) {
  const {
    sounds,
    padKeys,
    padGrid,
    padVolumeInput,
    initialVolumePercent,
    onStatus,
    storageKey,
  } = options;

  const PAD_FALLBACK_POOL_SIZE = 12;
  const PAD_BOOST_MULTIPLIER = 1.75;
  const VOLUME_CURVE_EXPONENT = 2;
  const padAudioPools = new Map();
  const padTriggers = new Map();
  const prefersHtmlAudioPads = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isTouchDevice =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches;
  const padColors = [
    { glow: "rgba(0, 255, 255, 0.34)", border: "rgba(110, 255, 255, 0.72)", inner: "rgba(180, 255, 255, 0.18)" },
    { glow: "rgba(255, 0, 255, 0.34)", border: "rgba(255, 120, 255, 0.72)", inner: "rgba(255, 190, 255, 0.18)" },
    { glow: "rgba(255, 255, 0, 0.34)", border: "rgba(255, 255, 130, 0.74)", inner: "rgba(255, 255, 190, 0.2)" },
    { glow: "rgba(255, 70, 70, 0.34)", border: "rgba(255, 140, 140, 0.72)", inner: "rgba(255, 205, 205, 0.18)" },
    { glow: "rgba(70, 255, 120, 0.34)", border: "rgba(140, 255, 175, 0.72)", inner: "rgba(195, 255, 210, 0.18)" },
    { glow: "rgba(70, 140, 255, 0.34)", border: "rgba(140, 185, 255, 0.72)", inner: "rgba(195, 220, 255, 0.18)" },
  ];

  let volumePercent = initialVolumePercent;
  let audioContext = null;
  let padGainNode = null;
  let padCompressorNode = null;
  let padBuffers = new Map();

  function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
  }

  function applyVolumeCurve(percent) {
    const normalized = clampPercent(percent) / 100;
    return Math.pow(normalized, VOLUME_CURVE_EXPONENT);
  }

  function getPadGain() {
    return applyVolumeCurve(volumePercent) * PAD_BOOST_MULTIPLIER;
  }

  function getFallbackVolume() {
    return Math.min(1, getPadGain());
  }

  function createPadAudioInstance(soundSrc) {
    const audio = new Audio(soundSrc);
    audio.preload = "auto";
    audio.playsInline = true;
    audio.volume = getFallbackVolume();
    audio.load();
    return audio;
  }

  function ensurePadAudioPool(soundSrc, initialSize = 1) {
    const existingPool = padAudioPools.get(soundSrc);
    if (existingPool) {
      return existingPool;
    }

    const pool = Array.from({ length: initialSize }, () => createPadAudioInstance(soundSrc));
    padAudioPools.set(soundSrc, pool);
    return pool;
  }

  function warmPadPools() {
    sounds.forEach((sound) => {
      const pool = ensurePadAudioPool(sound.src, 2);
      pool.forEach((audio) => {
        audio.volume = getFallbackVolume();
        if (audio.preload !== "auto") {
          audio.preload = "auto";
        }
        if (audio.readyState < 2) {
          audio.load();
        }
      });
    });
  }

  function scheduleWarmPadPools() {
    const warm = () => warmPadPools();

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(warm, { timeout: 1200 });
      return;
    }

    window.setTimeout(warm, 120);
  }

  function playPadFallback(soundSrc) {
    const pool = ensurePadAudioPool(soundSrc, 2);
    const reusableAudio =
      pool.find((audio) => audio.paused || audio.ended) ??
      (() => {
        if (pool.length < PAD_FALLBACK_POOL_SIZE) {
          const audio = createPadAudioInstance(soundSrc);
          pool.push(audio);
          return audio;
        }

        return pool[0];
      })();

    reusableAudio.volume = getFallbackVolume();
    try {
      reusableAudio.pause();
      reusableAudio.currentTime = 0;
    } catch (error) {
      // Ignore reset failures and still attempt immediate playback.
    }
    reusableAudio.play().catch(() => {
      onStatus("브라우저가 오디오 재생을 막았어요. 한 번 클릭 후 다시 시도해보세요.");
    });
  }

  function ensureAudioContext() {
    if (prefersHtmlAudioPads) {
      return null;
    }

    if (!window.AudioContext && !window.webkitAudioContext) {
      return null;
    }

    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass();
      padGainNode = audioContext.createGain();
      padCompressorNode = audioContext.createDynamicsCompressor();
      padCompressorNode.threshold.value = -18;
      padCompressorNode.knee.value = 12;
      padCompressorNode.ratio.value = 8;
      padCompressorNode.attack.value = 0.002;
      padCompressorNode.release.value = 0.16;
      padGainNode.gain.value = getPadGain();
      padGainNode.connect(padCompressorNode);
      padCompressorNode.connect(audioContext.destination);
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  }

  async function preloadPadSounds() {
    const context = ensureAudioContext();
    if (!context) {
      return;
    }

    const jobs = sounds.map(async (sound) => {
      if (padBuffers.has(sound.src)) {
        return;
      }

      try {
        const response = await fetch(sound.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
        padBuffers.set(sound.src, audioBuffer);
      } catch (error) {
        // Fallback HTMLAudio playback still works.
      }
    });

    await Promise.allSettled(jobs);
  }

  function playPadSound(soundSrc) {
    if (prefersHtmlAudioPads) {
      playPadFallback(soundSrc);
      return;
    }

    const context = ensureAudioContext();
    const buffer = padBuffers.get(soundSrc);

    if (context && padGainNode && buffer) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(padGainNode);
      source.start(0);
      return;
    }

    const audio = new Audio(soundSrc);
    audio.preload = "auto";
    audio.volume = getPadGain();
    audio.currentTime = 0;
    audio.play().catch(() => {
      onStatus("브라우저가 오디오 재생을 막았어요. 한 번 클릭 후 다시 시도해보세요.");
    });
  }

  function normalizePadName(label) {
    return label.replace(/[-_]/g, " ").replace(/\.[^.]+$/, "");
  }

  function triggerPad(soundSrc, button) {
    const glowColor = padColors[Math.floor(Math.random() * padColors.length)];
    playPadSound(soundSrc);
    button.style.setProperty("--pad-glow", glowColor.glow);
    button.style.setProperty("--pad-border", glowColor.border);
    button.style.setProperty("--pad-inner-glow", glowColor.inner);
    button.classList.add("active");
    window.setTimeout(() => button.classList.remove("active"), 160);
  }

  function createPadButton(sound, index) {
    const button = document.createElement("button");
    button.className = "pad-button";
    button.type = "button";
    button.dataset.sound = sound.src;

    const assignedKey = padKeys[index] ?? String(index + 1);
    button.innerHTML = `
      <span class="pad-key">${assignedKey}</span>
      <span class="pad-name">${normalizePadName(sound.label)}</span>
    `;

    const trigger = () => {
      triggerPad(sound.src, button);
    };

    if (window.PointerEvent) {
      button.addEventListener("pointerdown", trigger);
    } else if (isTouchDevice) {
      button.addEventListener("touchstart", trigger, { passive: true });
    } else {
      button.addEventListener("click", trigger);
    }

    return { button, assignedKey, trigger };
  }

  sounds.forEach((sound, index) => {
    const { button, assignedKey, trigger } = createPadButton(sound, index);
    padGrid.appendChild(button);
    padTriggers.set(assignedKey.toLowerCase(), trigger);
  });

  document.addEventListener("keydown", (event) => {
    if (event.repeat) return;

    const tagName = document.activeElement?.tagName?.toLowerCase();
    if (tagName === "input" || tagName === "textarea") return;

    const trigger = padTriggers.get(event.key.toLowerCase());
    if (trigger) {
      trigger();
    }
  });

  ["pointerdown", "touchstart", "keydown"].forEach((eventName) => {
    document.addEventListener(
      eventName,
      () => {
        warmPadPools();
        if (!prefersHtmlAudioPads) {
          ensureAudioContext();
          preloadPadSounds();
        }
      },
      { once: true }
    );
  });

  scheduleWarmPadPools();

  padVolumeInput.addEventListener("input", (event) => {
    volumePercent = Number(event.target.value);
    localStorage.setItem(storageKey, String(volumePercent));
    if (padGainNode) {
      padGainNode.gain.value = getPadGain();
    }
    padAudioPools.forEach((pool) => {
      pool.forEach((audio) => {
        audio.volume = getFallbackVolume();
      });
    });
  });

  return {
    setVolumePercent(nextValue) {
      volumePercent = nextValue;
      padVolumeInput.value = String(nextValue);
    },
  };
};
