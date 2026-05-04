window.createMobilePadAudioEngine = function createMobilePadAudioEngine(options) {
  const {
    sounds,
    initialMasterVolume = 1,
    onStatus = () => {},
    testSoundId = "",
  } = options;

  const soundMap = new Map(sounds.map((sound) => [sound.id, sound]));
  const activePlayers = new Set();

  let unlocked = false;
  let masterVolume = initialMasterVolume;
  let muted = false;

  function getOutputVolume(volume) {
    if (muted) {
      return 0;
    }

    const base = typeof volume === "number" ? volume : 1;
    return Math.max(0, Math.min(1, base * masterVolume));
  }

  function cleanupPlayer(player) {
    activePlayers.delete(player);
    player.onended = null;
    player.onerror = null;
    player.src = "";
  }

  function primeMedia(sound) {
    return new Promise((resolve) => {
      const audio = document.createElement("audio");
      audio.preload = "auto";
      audio.src = sound.src;
      audio.playsInline = true;

      const finish = () => {
        audio.oncanplaythrough = null;
        audio.onerror = null;
        resolve();
      };

      audio.oncanplaythrough = finish;
      audio.onerror = finish;
      audio.load();
    });
  }

  async function unlock() {
    unlocked = true;
    return true;
  }

  async function warmAll() {
    await Promise.allSettled(sounds.map((sound) => primeMedia(sound)));
    return true;
  }

  async function forceOpenOutput() {
    const targetSound = soundMap.get(testSoundId) ?? sounds[0];
    if (!targetSound) {
      unlocked = true;
      return true;
    }

    const audio = document.createElement("audio");
    audio.src = targetSound.src;
    audio.preload = "auto";
    audio.playsInline = true;
    audio.volume = 0.12;

    try {
      await audio.play();
      window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.src = "";
      }, 80);
      unlocked = true;
      return true;
    } catch (error) {
      onStatus("모바일 오디오 출력을 시작하지 못했어요.");
      audio.src = "";
      return false;
    }
  }

  async function primeOutput() {
    return unlock();
  }

  async function primeSample(id, options = {}) {
    return playSound(id, options);
  }

  async function playSound(id, options = {}) {
    const sound = soundMap.get(id);
    if (!sound) {
      return false;
    }

    const player = document.createElement("audio");
    player.src = sound.src;
    player.preload = "auto";
    player.playsInline = true;
    player.volume = getOutputVolume(options.volume);

    const cleanup = () => cleanupPlayer(player);
    player.onended = cleanup;
    player.onerror = cleanup;
    activePlayers.add(player);

    try {
      await player.play();
      return true;
    } catch (error) {
      cleanup();
      onStatus(`모바일 패드 재생 실패: ${id}`);
      return false;
    }
  }

  return {
    unlock,
    warmAll,
    forceOpenOutput,
    primeOutput,
    primeSample,
    playSound,
    setMasterVolume(nextValue) {
      masterVolume = Math.max(0, Math.min(1, nextValue));
    },
    setMuted(nextValue) {
      muted = Boolean(nextValue);
    },
    get activeSources() {
      return activePlayers;
    },
    removeSource(source) {
      cleanupPlayer(source);
    },
    get unlocked() {
      return unlocked;
    },
  };
};
