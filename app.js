const STORAGE_KEYS = {
  lastUrl: "gangnam-last-url",
  youtubeVolume: "gangnam-youtube-volume",
  padVolume: "gangnam-pad-volume",
};

const DEFAULT_VIDEO_URL = "https://www.youtube.com/watch?v=_Ngk-DCHfD0";
const DEFAULT_VIDEO_ID = "_Ngk-DCHfD0";
const DEFAULT_TRACK_NAME = "기본 트랙";
const VOLUME_CURVE_EXPONENT = 2;
const PAD_KEYS = ["Q", "W", "E", "R", "A", "S", "D", "F"];
const PAD_KEYS_KO = ["ㅂ", "ㅈ", "ㄷ", "ㄱ", "ㅁ", "ㄴ", "ㅇ", "ㄹ"];
const SOUNDS = (window.PAD_CONFIG ?? []).map((item) => ({
  id: item.file,
  label: item.name,
  src: `./sound/${item.file}`,
}));

const dom = {
  audioStartModal: document.querySelector("#audio-start-modal"),
  audioStartMessage: document.querySelector("#audio-start-message"),
  audioStartButton: document.querySelector("#audio-start-button"),
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

const initialUrl = localStorage.getItem(STORAGE_KEYS.lastUrl) ?? DEFAULT_VIDEO_URL;
const initialYouTubeVolume = Number(localStorage.getItem(STORAGE_KEYS.youtubeVolume) ?? 70);
const initialPadVolume = Number(localStorage.getItem(STORAGE_KEYS.padVolume) ?? 100);
let youtubeUnlocked = false;

dom.urlInput.value = initialUrl;
dom.youtubeVolume.value = String(initialYouTubeVolume);
dom.padVolume.value = String(initialPadVolume);

if (isMobileDevice) {
  dom.youtubeVolumeLabel.textContent = "볼륨 (모바일 제한 있음)";
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
  youtubeUnlocked = enabled;
  dom.urlInput.disabled = !enabled;
  dom.loadUrlButton.disabled = !enabled;
  dom.playButton.disabled = !enabled;
  dom.pauseButton.disabled = !enabled;
  dom.stopButton.disabled = !enabled;
  dom.youtubeVolume.disabled = !enabled;
}

const sfxEngine = window.createSfxEngine({
  sounds: SOUNDS,
  initialMasterVolume: 1,
  onStatus: setStatus,
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

const youtubeController = window.createYouTubeController({
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

dom.loadUrlButton.addEventListener("click", () => {
  if (!youtubeUnlocked) return;
  youtubeController.loadFromInput(dom.urlInput.value.trim());
});

dom.urlInput.addEventListener("keydown", (event) => {
  if (!youtubeUnlocked) return;
  if (event.key === "Enter") {
    youtubeController.loadFromInput(dom.urlInput.value.trim());
  }
});

dom.youtubeVolume.addEventListener("input", (event) => {
  if (!youtubeUnlocked) return;
  const nextValue = Number(event.target.value);
  localStorage.setItem(STORAGE_KEYS.youtubeVolume, String(nextValue));
  youtubeController.setVolumePercent(nextValue);
});

dom.playButton.addEventListener("click", () => {
  if (!youtubeUnlocked) return;
  youtubeController.play();
});

dom.pauseButton.addEventListener("click", () => {
  if (!youtubeUnlocked) return;
  youtubeController.pause();
});

dom.stopButton.addEventListener("click", () => {
  if (!youtubeUnlocked) return;
  youtubeController.stop();
});

dom.audioStartButton?.addEventListener("click", async () => {
  dom.audioStartButton.disabled = true;
  dom.audioStartMessage.textContent = "사운드 엔진 준비 중...";

  const context = await sfxEngine.unlock();
  if (!context) {
    dom.audioStartMessage.textContent =
      "자동 활성화가 안 됐어요. 상단 유튜브 Play 버튼을 눌러본 뒤 다시 시도해주세요.";
    dom.audioStartButton.disabled = false;
    return;
  }

  await sfxEngine.warmAll();
  setStatus("패드 준비 완료");
  setYouTubeControlsEnabled(true);
  closeAudioStartModal();
});

setYouTubeControlsEnabled(false);
setStatus("패드 준비 후 유튜브 사용 가능");
setNowPlaying("아직 없음");
