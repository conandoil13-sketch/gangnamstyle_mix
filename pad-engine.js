window.createPadEngine = function createPadEngine(options) {
  const {
    sounds,
    padKeys,
    alternatePadKeys = [],
    padGrid,
    padVolumeInput,
    initialVolumePercent,
    onStatus,
    storageKey,
    sfxEngine,
  } = options;

  const PAD_BOOST_MULTIPLIER = 1.75;
  const VOLUME_CURVE_EXPONENT = 2;
  const padTriggers = new Map();
  const soundMap = new Map(sounds.map((sound) => [sound.id, sound]));
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

  function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
  }

  function applyVolumeCurve(percent) {
    const normalized = clampPercent(percent) / 100;
    return Math.pow(normalized, VOLUME_CURVE_EXPONENT);
  }

  function getPadGain() {
    return Math.min(1, applyVolumeCurve(volumePercent) * PAD_BOOST_MULTIPLIER);
  }

  function normalizePadName(label) {
    return label.replace(/[-_]/g, " ").replace(/\.[^.]+$/, "");
  }

  function triggerPad(soundId, button) {
    const glowColor = padColors[Math.floor(Math.random() * padColors.length)];
    sfxEngine.playSound(soundId, { volume: getPadGain() });
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
    button.dataset.sound = sound.id;

    const assignedKey = padKeys[index] ?? String(index + 1);
    button.innerHTML = `
      <span class="pad-key">${assignedKey}</span>
      <span class="pad-name">${normalizePadName(sound.label)}</span>
    `;

    const trigger = () => {
      triggerPad(sound.id, button);
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
    const alternateKey = alternatePadKeys[index];
    if (alternateKey) {
      padTriggers.set(alternateKey.toLowerCase(), trigger);
    }
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

  ["pointerdown", "touchstart", "click"].forEach((eventName) => {
    document.addEventListener(
      eventName,
      () => {
        sfxEngine.unlock().then(() => sfxEngine.warmAll());
      },
      { once: true }
    );
  });

  padVolumeInput.addEventListener("input", (event) => {
    volumePercent = Number(event.target.value);
    localStorage.setItem(storageKey, String(volumePercent));
  });

  return {
    setVolumePercent(nextValue) {
      volumePercent = nextValue;
      padVolumeInput.value = String(nextValue);
    },
    hasSound(id) {
      return soundMap.has(id);
    },
  };
};
