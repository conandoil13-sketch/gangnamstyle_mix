window.createYouTubeController = function createYouTubeController(options) {
  const {
    playerElementId,
    initialUrl,
    defaultVideoId,
    defaultTrackName,
    initialVolumePercent,
    volumeExponent,
    onStatus,
    onNowPlaying,
    storageKey,
  } = options;

  let player = null;
  let pendingVideo = null;
  let activeVideoId = "";
  let activeTrackTitle = "";
  let volumePercent = initialVolumePercent;
  let playerBootstrapped = false;

  function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
  }

  function applyVolumeCurve(percent) {
    const normalized = clampPercent(percent) / 100;
    return Math.pow(normalized, volumeExponent);
  }

  function getYouTubeVolume() {
    return Math.round(applyVolumeCurve(volumePercent) * 100);
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
      onStatus("플레이어 준비 후 자동 재생");
      return;
    }
    activeVideoId = videoId;
    activeTrackTitle = title;
    player.loadVideoById(videoId);
    onNowPlaying(title);
  }

  function bootstrapPlayer() {
    if (playerBootstrapped || !window.YT?.Player) {
      return;
    }

    playerBootstrapped = true;
    player = new YT.Player(playerElementId, {
      height: "100%",
      width: "100%",
      videoId: defaultVideoId,
      playerVars: {
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: handleReady,
        onStateChange: (event) => {
          const states = {
            [-1]: "대기 중",
            0: "재생 종료",
            1: "재생 중",
            2: "일시정지",
            3: "버퍼링",
            5: "영상 준비됨",
          };
          onStatus(states[event.data] ?? "상태 확인 중");
        },
        onError: () => {
          onStatus("재생 오류");
        },
      },
    });
  }

  function handleReady(event) {
    onStatus("준비 완료");
    event.target.setVolume(getYouTubeVolume());
    if (pendingVideo) {
      const { videoId, title } = pendingVideo;
      pendingVideo = null;
      loadVideo(videoId, title);
      return;
    }
    const savedId = extractVideoId(initialUrl);
    if (savedId) {
      loadVideo(savedId, defaultTrackName);
      return;
    }
    onNowPlaying(defaultTrackName);
  }

  if (window.YT?.Player) {
    bootstrapPlayer();
  } else {
    window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
      bootstrapPlayer();
    };
  }

  return {
    extractVideoId,
    loadFromInput(value) {
      const videoId = extractVideoId(value);
      if (!videoId) {
        onStatus("링크에서 영상 ID를 찾지 못했어요");
        return;
      }

      localStorage.setItem(storageKey, value);
      loadVideo(videoId, "링크에서 불러온 트랙");
    },
    setVolumePercent(nextValue) {
      volumePercent = nextValue;
      if (player?.setVolume) {
        player.setVolume(getYouTubeVolume());
      }
      if (player?.isMuted?.() && volumePercent > 0) {
        player.unMute?.();
      }
    },
    play() {
      player?.playVideo();
    },
    pause() {
      player?.pauseVideo();
    },
    stop() {
      player?.stopVideo();
    },
  };
};
