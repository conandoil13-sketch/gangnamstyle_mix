const STORAGE_KEYS = {
  lastUrl: "gangnam-last-url",
  youtubeVolume: "gangnam-youtube-volume",
  padVolume: "gangnam-pad-volume",
};

const DEFAULT_VIDEO_URL = "https://www.youtube.com/watch?v=_Ngk-DCHfD0";
const DEFAULT_VIDEO_ID = "_Ngk-DCHfD0";
const DEFAULT_TRACK_NAME = "기본 트랙";
const MOBILE_TEST_SOUND_ID = "yeoja2.m4a";
const VOLUME_CURVE_EXPONENT = 2;
const PAD_KEYS = ["Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V", "Y", "U", "I", "O", "H"];
const PAD_KEYS_KO = ["ㅂ", "ㅈ", "ㄷ", "ㄱ", "ㅁ", "ㄴ", "ㅇ", "ㄹ", "ㅋ", "ㅌ", "ㅊ", "ㅍ", "ㅛ", "ㅕ", "ㅑ", "ㅐ", "ㅗ"];
const SOUNDS = (window.PAD_CONFIG ?? []).map((item) => ({
  id: item.file,
  label: item.name,
  src: `./sound/${item.file}`,
}));

const dom = {
  audioStartModal: document.querySelector("#audio-start-modal"),
  audioStartMessage: document.querySelector("#audio-start-message"),
  audioStartButton: document.querySelector("#audio-start-button"),
  padModeLink: document.querySelector("#pad-mode-link"),
  musicModeLink: document.querySelector("#music-mode-link"),
  playerPanel: document.querySelector("#player-panel"),
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

const isMobileDevice =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  window.matchMedia("(pointer: coarse)").matches;

const params = new URLSearchParams(window.location.search);
const currentMode = params.get("mode") === "music" ? "music" : "pad";
const isMusicMode = currentMode === "music";

const initialUrl = localStorage.getItem(STORAGE_KEYS.lastUrl) ?? DEFAULT_VIDEO_URL;
const initialYouTubeVolume = Number(localStorage.getItem(STORAGE_KEYS.youtubeVolume) ?? 70);
const initialPadVolume = Number(localStorage.getItem(STORAGE_KEYS.padVolume) ?? 100);
let youtubeUnlocked = false;
let youtubeController = null;
let youtubeControllerPromise = null;

dom.urlInput.value = initialUrl;
dom.youtubeVolume.value = String(initialYouTubeVolume);
dom.padVolume.value = String(initialPadVolume);

if (isMobileDevice) {
  dom.youtubeVolumeLabel.textContent = "볼륨 (모바일 제한 있음)";
}

document.body.dataset.mode = currentMode;
dom.padModeLink?.classList.toggle("active", !isMusicMode);
dom.musicModeLink?.classList.toggle("active", isMusicMode);
if (!isMusicMode) {
  dom.playerPanel?.classList.add("hidden");
}

function setStatus(text) {
  dom.playerStatus.textContent = text;
}

function setNowPlaying(text) {
  dom.nowPlaying.textContent = text;
}

function closeAudioStartModal() {
  dom.audioStartModal?.classList.add("hidden");
}

function setYouTubeControlsEnabled(enabled) {
  if (!isMusicMode) {
    youtubeUnlocked = false;
    return;
  }

  youtubeUnlocked = enabled;
  dom.urlInput.disabled = !enabled;
  dom.loadUrlButton.disabled = !enabled;
  dom.playButton.disabled = !enabled;
  dom.pauseButton.disabled = !enabled;
  dom.stopButton.disabled = !enabled;
  dom.youtubeVolume.disabled = !enabled;
}

function loadScript(src, key) {
  const existing = document.querySelector(`script[data-load-key="${key}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loadKey = key;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
      once: true,
    });
    document.body.appendChild(script);
  });
}

function ensureYouTubeController() {
  if (!isMusicMode) {
    return Promise.resolve(null);
  }

  if (youtubeController) {
    return Promise.resolve(youtubeController);
  }

  if (!youtubeControllerPromise) {
    youtubeControllerPromise = (async () => {
      await loadScript("./youtube-controller.js", "youtube-controller");
      await loadScript("https://www.youtube.com/iframe_api", "youtube-iframe-api");

      youtubeController = window.createYouTubeController({
        playerElementId: "player",
        initialUrl,
        defaultVideoId: DEFAULT_VIDEO_ID,
        defaultTrackName: DEFAULT_TRACK_NAME,
        initialVolumePercent: initialYouTubeVolume,
        volumeExponent: VOLUME_CURVE_EXPONENT,
        onStatus: setStatus,
        onNowPlaying: setNowPlaying,
        storageKey: STORAGE_KEYS.lastUrl,
      });

      return youtubeController;
    })();
  }

  return youtubeControllerPromise;
}

const sfxEngine = window.createMobilePadAudioEngine({
  sounds: SOUNDS,
  initialMasterVolume: 1,
  onStatus: setStatus,
  testSoundId: MOBILE_TEST_SOUND_ID,
});

const padEngine = window.createPadEngine({
  sounds: SOUNDS,
  padKeys: PAD_KEYS,
  alternatePadKeys: PAD_KEYS_KO,
  padGrid: dom.padGrid,
  padVolumeInput: dom.padVolume,
  initialVolumePercent: initialPadVolume,
  onStatus: setStatus,
  storageKey: STORAGE_KEYS.padVolume,
  sfxEngine,
});

dom.loadUrlButton.addEventListener("click", () => {
  if (!youtubeUnlocked || !youtubeController) return;
  youtubeController.loadFromInput(dom.urlInput.value.trim());
});

dom.urlInput.addEventListener("keydown", (event) => {
  if (!youtubeUnlocked || !youtubeController) return;
  if (event.key === "Enter") {
    youtubeController.loadFromInput(dom.urlInput.value.trim());
  }
});

dom.youtubeVolume.addEventListener("input", (event) => {
  if (!youtubeUnlocked || !youtubeController) return;
  const nextValue = Number(event.target.value);
  localStorage.setItem(STORAGE_KEYS.youtubeVolume, String(nextValue));
  youtubeController.setVolumePercent(nextValue);
});

dom.playButton.addEventListener("click", () => {
  if (!youtubeUnlocked || !youtubeController) return;
  youtubeController.play();
});

dom.pauseButton.addEventListener("click", () => {
  if (!youtubeUnlocked || !youtubeController) return;
  youtubeController.pause();
});

dom.stopButton.addEventListener("click", () => {
  if (!youtubeUnlocked || !youtubeController) return;
  youtubeController.stop();
});

dom.audioStartButton?.addEventListener("click", async () => {
  dom.audioStartButton.disabled = true;
  dom.audioStartMessage.textContent = "패드 출력을 여는 중...";

  const forcedOutput = await sfxEngine.forceOpenOutput();
  if (!forcedOutput) {
    dom.audioStartMessage.textContent =
      "패드 출력 활성화가 안 됐어요. 다시 한 번 눌러보거나 음원 포함 모드에서 유튜브 Play를 눌러주세요.";
    dom.audioStartButton.disabled = false;
    return;
  }

  dom.audioStartMessage.textContent = "사운드 엔진 준비 중...";

  const primed = await sfxEngine.primeOutput();
  if (!primed) {
    dom.audioStartMessage.textContent =
      "출력 활성화에 실패했어요. 다시 한 번 눌러보거나 음원 포함 모드에서 유튜브 Play를 눌러주세요.";
    dom.audioStartButton.disabled = false;
    return;
  }

  await sfxEngine.warmAll();

  if (isMusicMode) {
    dom.audioStartMessage.textContent = "유튜브 컨트롤 준비 중...";
    try {
      await ensureYouTubeController();
    } catch (error) {
      dom.audioStartMessage.textContent = "유튜브 컨트롤을 불러오지 못했어요.";
      dom.audioStartButton.disabled = false;
      return;
    }
  }
  setStatus("패드 준비 완료");
  setYouTubeControlsEnabled(true);
  closeAudioStartModal();
});

setYouTubeControlsEnabled(false);
setStatus(isMusicMode ? "패드 준비 후 유튜브 사용 가능" : "패드 전용 모드");
setNowPlaying(isMusicMode ? "아직 없음" : "패드 전용 모드");
