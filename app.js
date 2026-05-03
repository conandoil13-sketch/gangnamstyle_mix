const STORAGE_KEYS = {
  lastUrl: "gangnam-last-url",
  youtubeVolume: "gangnam-youtube-volume",
  padVolume: "gangnam-pad-volume",
};

const DEFAULT_VIDEO_URL = "https://www.youtube.com/watch?v=_Ngk-DCHfD0";
const DEFAULT_VIDEO_ID = "_Ngk-DCHfD0";
const DEFAULT_TRACK_NAME = "기본 트랙";
const VOLUME_CURVE_EXPONENT = 2;
const PAD_BOOST_MULTIPLIER = 1.75;
const PAD_FALLBACK_POOL_SIZE = 2;
const PAD_COLORS = [
  { glow: "rgba(0, 255, 255, 0.34)", border: "rgba(110, 255, 255, 0.72)", inner: "rgba(180, 255, 255, 0.18)" },
  { glow: "rgba(255, 0, 255, 0.34)", border: "rgba(255, 120, 255, 0.72)", inner: "rgba(255, 190, 255, 0.18)" },
  { glow: "rgba(255, 255, 0, 0.34)", border: "rgba(255, 255, 130, 0.74)", inner: "rgba(255, 255, 190, 0.2)" },
  { glow: "rgba(255, 70, 70, 0.34)", border: "rgba(255, 140, 140, 0.72)", inner: "rgba(255, 205, 205, 0.18)" },
  { glow: "rgba(70, 255, 120, 0.34)", border: "rgba(140, 255, 175, 0.72)", inner: "rgba(195, 255, 210, 0.18)" },
  { glow: "rgba(70, 140, 255, 0.34)", border: "rgba(140, 185, 255, 0.72)", inner: "rgba(195, 220, 255, 0.18)" },
];

const PAD_KEYS = ["Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];
const SOUNDS = (window.PAD_CONFIG ?? []).map((item) => ({
  label: item.name,
  src: `./sound/${item.file}`,
}));

const dom = {
  urlInput: document.querySelector("#url-input"),
  loadUrlButton: document.querySelector("#load-url-button"),
  playerStatus: document.querySelector("#player-status"),
  nowPlaying: document.querySelector("#now-playing"),
  playButton: document.querySelector("#play-button"),
  pauseButton: document.querySelector("#pause-button"),
  stopButton: document.querySelector("#stop-button"),
  youtubeVolumeLabel: document.querySelector("#youtube-volume-label"),
  youtubeVolume: document.querySelector("#youtube-volume"),
  padVolume: document.querySelector("#pad-volume"),
  padGrid: document.querySelector("#pad-grid"),
};

let player;
let activeVideoId = "";
let activeTrackTitle = "";
let padVolumePercent = Number(localStorage.getItem(STORAGE_KEYS.padVolume) ?? 100);
let youtubeVolumePercent = Number(localStorage.getItem(STORAGE_KEYS.youtubeVolume) ?? 70);
let pendingVideo = null;
let audioContext = null;
let padGainNode = null;
let padCompressorNode = null;
let padBuffers = new Map();
let padAudioPools = new Map();

const isMobileDevice =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  window.matchMedia("(pointer: coarse)").matches;
const prefersHtmlAudioPads = /iPhone|iPad|iPod/i.test(navigator.userAgent);

dom.urlInput.value = localStorage.getItem(STORAGE_KEYS.lastUrl) ?? DEFAULT_VIDEO_URL;
dom.youtubeVolume.value = String(youtubeVolumePercent);
dom.padVolume.value = String(padVolumePercent);
if (isMobileDevice) {
  dom.youtubeVolumeLabel.textContent = "볼륨 (모바일 제한 있음)";
}

function setStatus(text) {
  dom.playerStatus.textContent = text;
}

function setNowPlaying(text) {
  dom.nowPlaying.textContent = text;
}

function normalizePadName(label) {
  return label.replace(/[-_]/g, " ").replace(/\.[^.]+$/, "");
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function applyVolumeCurve(percent) {
  const normalized = clampPercent(percent) / 100;
  return Math.pow(normalized, VOLUME_CURVE_EXPONENT);
}

function getPadGain() {
  return applyVolumeCurve(padVolumePercent) * PAD_BOOST_MULTIPLIER;
}

function getYouTubeVolume() {
  return Math.round(applyVolumeCurve(youtubeVolumePercent) * 100);
}

function getFallbackVolume() {
  return Math.min(1, getPadGain());
}

function createPadAudioInstance(soundSrc) {
  const audio = new Audio(soundSrc);
  audio.preload = "metadata";
  audio.playsInline = true;
  audio.volume = getFallbackVolume();
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

function playPadFallback(soundSrc) {
  const pool = ensurePadAudioPool(soundSrc, 1);
  const reusableAudio =
    pool.find((audio) => audio.paused || audio.ended) ??
    (() => {
      const audio = createPadAudioInstance(soundSrc);
      if (pool.length < PAD_FALLBACK_POOL_SIZE) {
        pool.push(audio);
      }
      return audio;
    })();

  reusableAudio.volume = getFallbackVolume();
  reusableAudio.currentTime = 0;
  reusableAudio.play().catch(() => {
    setStatus("브라우저가 오디오 재생을 막았어요. 한 번 클릭 후 다시 시도해보세요.");
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

  const jobs = SOUNDS.map(async (sound) => {
    if (padBuffers.has(sound.src)) {
      return;
    }

    try {
      const response = await fetch(sound.src);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
      padBuffers.set(sound.src, audioBuffer);
    } catch (error) {
      // Fallback path below will still allow playback.
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
    setStatus("브라우저가 오디오 재생을 막았어요. 한 번 클릭 후 다시 시도해보세요.");
  });
}

function extractVideoId(input) {
  if (!input) return "";
  const trimmed = input.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return url.pathname.slice(1, 12);
    }

    if (host === "youtube.com" || host === "music.youtube.com" || host.endsWith(".youtube.com")) {
      if (url.searchParams.get("v")) {
        return url.searchParams.get("v");
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const shortsIndex = parts.indexOf("shorts");
      const embedIndex = parts.indexOf("embed");

      if (shortsIndex >= 0 && parts[shortsIndex + 1]) {
        return parts[shortsIndex + 1];
      }

      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return parts[embedIndex + 1];
      }
    }
  } catch (error) {
    return "";
  }

  return "";
}

function loadVideo(videoId, title = "직접 불러온 트랙") {
  if (!videoId) return;
  if (!player) {
    pendingVideo = { videoId, title };
    setStatus("플레이어 준비 후 자동 재생");
    return;
  }
  activeVideoId = videoId;
  activeTrackTitle = title;
  player.loadVideoById(videoId);
  setNowPlaying(title);
}

function onYouTubeIframeAPIReady() {
  player = new YT.Player("player", {
    height: "100%",
    width: "100%",
    videoId: DEFAULT_VIDEO_ID,
    playerVars: {
      playsinline: 1,
      rel: 0,
    },
    events: {
      onReady: (event) => {
        setStatus("준비 완료");
        event.target.setVolume(getYouTubeVolume());
        if (pendingVideo) {
          const { videoId, title } = pendingVideo;
          pendingVideo = null;
          loadVideo(videoId, title);
          return;
        }
        if (dom.urlInput.value) {
          const savedId = extractVideoId(dom.urlInput.value);
          if (savedId) {
            loadVideo(savedId, DEFAULT_TRACK_NAME);
            return;
          }
        }
        setNowPlaying(DEFAULT_TRACK_NAME);
      },
      onStateChange: (event) => {
        const states = {
          [-1]: "대기 중",
          0: "재생 종료",
          1: "재생 중",
          2: "일시정지",
          3: "버퍼링",
          5: "영상 준비됨",
        };
        setStatus(states[event.data] ?? "상태 확인 중");
      },
      onError: () => {
        setStatus("재생 오류");
      },
    },
  });
}

window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

function createPadButton(sound, index) {
  const button = document.createElement("button");
  button.className = "pad-button";
  button.type = "button";
  button.dataset.sound = sound.src;
  let lastTriggerAt = 0;

  const assignedKey = PAD_KEYS[index] ?? String(index + 1);
  button.innerHTML = `
    <span class="pad-key">${assignedKey}</span>
    <span class="pad-name">${normalizePadName(sound.label)}</span>
  `;

  const trigger = () => {
    const now = Date.now();
    if (now - lastTriggerAt < 120) {
      return;
    }
    lastTriggerAt = now;

    const glowColor = PAD_COLORS[Math.floor(Math.random() * PAD_COLORS.length)];
    playPadSound(sound.src);
    button.style.setProperty("--pad-glow", glowColor.glow);
    button.style.setProperty("--pad-border", glowColor.border);
    button.style.setProperty("--pad-inner-glow", glowColor.inner);
    button.classList.add("active");
    window.setTimeout(() => button.classList.remove("active"), 160);
  };

  button.addEventListener("pointerdown", trigger);
  button.addEventListener("touchstart", trigger, { passive: true });
  button.addEventListener("click", trigger);
  return { button, assignedKey, trigger };
}

const padTriggers = new Map();
SOUNDS.forEach((sound, index) => {
  const { button, assignedKey, trigger } = createPadButton(sound, index);
  dom.padGrid.appendChild(button);
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
      if (!prefersHtmlAudioPads) {
        ensureAudioContext();
        preloadPadSounds();
      }
    },
    { once: true }
  );
});

document.addEventListener(
  "dblclick",
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);

function loadFromUrlInput() {
  const value = dom.urlInput.value.trim();
  const videoId = extractVideoId(value);

  if (!videoId) {
    setStatus("링크에서 영상 ID를 찾지 못했어요");
    return;
  }

  localStorage.setItem(STORAGE_KEYS.lastUrl, value);
  loadVideo(videoId, "링크에서 불러온 트랙");
}

dom.loadUrlButton.addEventListener("click", loadFromUrlInput);

dom.urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadFromUrlInput();
  }
});

dom.youtubeVolume.addEventListener("input", (event) => {
  youtubeVolumePercent = Number(event.target.value);
  localStorage.setItem(STORAGE_KEYS.youtubeVolume, String(youtubeVolumePercent));
  if (player?.setVolume) {
    player.setVolume(getYouTubeVolume());
  }
  if (player?.isMuted?.() && youtubeVolumePercent > 0) {
    player.unMute?.();
  }
});

dom.padVolume.addEventListener("input", (event) => {
  padVolumePercent = Number(event.target.value);
  localStorage.setItem(STORAGE_KEYS.padVolume, String(padVolumePercent));
  if (padGainNode) {
    padGainNode.gain.value = getPadGain();
  }
  padAudioPools.forEach((pool) => {
    pool.forEach((audio) => {
      audio.volume = getFallbackVolume();
    });
  });
});

dom.playButton.addEventListener("click", () => player?.playVideo());
dom.pauseButton.addEventListener("click", () => player?.pauseVideo());
dom.stopButton.addEventListener("click", () => player?.stopVideo());

setStatus("플레이어 로딩 중");
setNowPlaying(activeTrackTitle || "아직 없음");
