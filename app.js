const STORAGE_KEYS = {
  lastUrl: "gangnam-last-url",
  youtubeVolume: "gangnam-youtube-volume",
  padVolume: "gangnam-pad-volume",
};

const DEFAULT_VIDEO_URL = "https://www.youtube.com/watch?v=_Ngk-DCHfD0";
const DEFAULT_VIDEO_ID = "_Ngk-DCHfD0";
const DEFAULT_TRACK_NAME = "기본 트랙";
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
  youtubeVolume: document.querySelector("#youtube-volume"),
  padVolume: document.querySelector("#pad-volume"),
  padGrid: document.querySelector("#pad-grid"),
};

let player;
let activeVideoId = "";
let activeTrackTitle = "";
let padVolume = Number(localStorage.getItem(STORAGE_KEYS.padVolume) ?? 1);
let youtubeVolume = Number(localStorage.getItem(STORAGE_KEYS.youtubeVolume) ?? 70);
let pendingVideo = null;

dom.urlInput.value = localStorage.getItem(STORAGE_KEYS.lastUrl) ?? DEFAULT_VIDEO_URL;
dom.youtubeVolume.value = String(youtubeVolume);
dom.padVolume.value = String(Math.round(padVolume * 100));

function setStatus(text) {
  dom.playerStatus.textContent = text;
}

function setNowPlaying(text) {
  dom.nowPlaying.textContent = text;
}

function normalizePadName(label) {
  return label.replace(/[-_]/g, " ").replace(/\.[^.]+$/, "");
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
        event.target.setVolume(youtubeVolume);
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

  const assignedKey = PAD_KEYS[index] ?? String(index + 1);
  button.innerHTML = `
    <span class="pad-key">${assignedKey}</span>
    <span class="pad-name">${normalizePadName(sound.label)}</span>
  `;

  const trigger = () => {
    const glowColor = PAD_COLORS[Math.floor(Math.random() * PAD_COLORS.length)];
    const audio = new Audio(sound.src);
    audio.volume = padVolume;
    audio.currentTime = 0;
    audio.play().catch(() => {
      setStatus("브라우저가 오디오 재생을 막았어요. 한 번 클릭 후 다시 시도해보세요.");
    });

    button.style.setProperty("--pad-glow", glowColor.glow);
    button.style.setProperty("--pad-border", glowColor.border);
    button.style.setProperty("--pad-inner-glow", glowColor.inner);
    button.classList.add("active");
    window.setTimeout(() => button.classList.remove("active"), 160);
  };

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
  youtubeVolume = Number(event.target.value);
  localStorage.setItem(STORAGE_KEYS.youtubeVolume, String(youtubeVolume));
  if (player?.setVolume) {
    player.setVolume(youtubeVolume);
  }
});

dom.padVolume.addEventListener("input", (event) => {
  padVolume = Number(event.target.value) / 100;
  localStorage.setItem(STORAGE_KEYS.padVolume, String(padVolume));
});

dom.playButton.addEventListener("click", () => player?.playVideo());
dom.pauseButton.addEventListener("click", () => player?.pauseVideo());
dom.stopButton.addEventListener("click", () => player?.stopVideo());

setStatus("플레이어 로딩 중");
setNowPlaying(activeTrackTitle || "아직 없음");
