import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

/* eslint-disable react-hooks/exhaustive-deps */

const socket = io("https://watchparty1-m6yv.onrender.com");

export default function App() {
  const playerRef = useRef(null);
  const suppressRef = useRef(false); // to avoid echo
  const pendingStateRef = useRef(null);
  const readyRef = useRef(false);
  const lastValidTimeRef = useRef(0); // Cache last valid time
  const hasInteractedRef = useRef(false); // Track if user has interacted with video
  const hasReceivedInitialSyncRef = useRef(false); // Track if received initial server sync
  const [videoUrl, setVideoUrl] = useState("");

  // Safe accessors for YT Player methods (player object may not always expose them yet)
  function safeGetVideoId(player) {
    try {
      if (!player) return "";
      if (typeof player.getVideoData === "function") {
        return player.getVideoData()?.video_id || "";
      }
    } catch (err) {
      console.warn("safeGetVideoId failed:", err);
    }
    return "";
  }

  function safeGetCurrentTime(player) {
    try {
      if (!player || typeof player.getCurrentTime !== "function") {
        return lastValidTimeRef.current;
      }

      let time = player.getCurrentTime();

      // Retry if 0 (YT often returns 0 briefly)
      if (time === 0) {
        const retry = player.getCurrentTime();
        if (retry > 0) {
          lastValidTimeRef.current = retry;
          return retry;
        }
      }

      // Invalid time? Use cached
      if (time == null || isNaN(time)) {
        return lastValidTimeRef.current;
      }

      // Accept only positive time
      if (time > 0) {
        lastValidTimeRef.current = time;
      }

      return time;
    } catch (err) {
      console.warn("safeGetCurrentTime error:", err);
      return lastValidTimeRef.current;
    }
  }

  // --- YouTube API Callbacks ---

  // --- Apply server updates ---
  const applyServerState = useCallback((data) => {
    console.log("📥 Received control event", data);
    const player = playerRef.current;
    // If player isn't ready yet, store the latest state and apply when ready
    if (!player || !readyRef.current) {
      console.log("⏸️ Player not ready, queuing state");
      pendingStateRef.current = data;
      return;
    }

    const { videoId, playing, time } = data;
    const currentId = safeGetVideoId(player);
    const currentTime = safeGetCurrentTime(player);

    // Update cached time with server's time if it's valid
    if (time > 0) {
      lastValidTimeRef.current = time;
      console.log("💾 Updated cached time to:", time);
    }

    // Mark that we've received initial sync
    hasReceivedInitialSyncRef.current = true;

    suppressRef.current = true;

    // Change video if different
    if (videoId && videoId !== currentId) {
      safeLoadVideoById(player, videoId, time || 0);
    } else {
      if (Math.abs(currentTime - (time || 0)) > 0.5) {
        safeSeekTo(player, time || 0);
      }
    }

    // Always apply play/pause state
    playing ? safePlay(player) : safePause(player);

    setTimeout(() => {
      console.log("🔓 Suppression released");
      suppressRef.current = false;
    }, 1500);
  }, []);

  const onPlayerReady = useCallback((event) => {
    // Store the actual player reference from the event
    if (event && event.target) {
      playerRef.current = event.target;
    }
    readyRef.current = true;
    console.log("✅ Player ready", {
      player: playerRef.current,
      hasPlayVideo: typeof playerRef.current?.playVideo,
    });
    // If we received a server state before the player was ready, apply it now
    if (pendingStateRef.current) {
      console.log("Applying pending server state", pendingStateRef.current);
      // applyServerState will check readyRef again, but we know it's ready
      applyServerState(pendingStateRef.current);
      pendingStateRef.current = null;
    }
  }, []);

  const onPlayerStateChange = useCallback((event) => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    // Ignore if this was triggered by a server sync
    if (suppressRef.current) {
      console.log("🚫 Suppressed state change");
      return;
    }

    const state = event.data;

    // Only handle PLAYING and PAUSED states
    if (
      state !== window.YT.PlayerState.PLAYING &&
      state !== window.YT.PlayerState.PAUSED
    ) {
      return;
    }

    // Add a small delay to let the player settle and get accurate time
    setTimeout(() => {
      // Block emitting until we've received initial sync from server
      if (!hasReceivedInitialSyncRef.current) {
        console.log("⏳ Waiting for initial sync before emitting");
        return;
      }

      // Double-check suppression
      if (suppressRef.current) {
        console.log("🚫 Suppression active during emit, skipping");
        return;
      }

      const currentTime = safeGetCurrentTime(player);
      const videoId = safeGetVideoId(player);
      const playerState = player.getPlayerState?.();

      // Only block the very first buffering at time 0 (before any interaction)
      // After user has interacted, allow emitting even at time 0
      if (
        !hasInteractedRef.current &&
        currentTime === 0 &&
        (playerState === 3 || playerState === 5)
      ) {
        console.log("⏸️ Ignoring initial buffering state at time 0");
        return;
      }

      // Mark that user has interacted with the video
      hasInteractedRef.current = true;

      console.log("🎮 State change:", { state, currentTime, videoId });

      if (state === window.YT.PlayerState.PLAYING) {
        console.log("📤 Emitting PLAY with time:", currentTime);
        socket.emit("control", {
          type: "play",
          targetTime: currentTime,
          videoId,
        });
      } else if (state === window.YT.PlayerState.PAUSED) {
        console.log("📤 Emitting PAUSE with time:", currentTime);
        socket.emit("control", {
          type: "pause",
          targetTime: currentTime,
          videoId,
        });
      }
    }, 100);
  }, []);

  // Safe play/pause wrappers with logging
  function safePlay(player) {
    try {
      if (!player) return console.warn("safePlay: no player");
      if (typeof player.playVideo === "function") return player.playVideo();
      console.warn("safePlay: playVideo not available on player", player);
    } catch (err) {
      console.error("safePlay error:", err);
    }
  }

  function safePause(player) {
    try {
      if (!player) return console.warn("safePause: no player");
      if (typeof player.pauseVideo === "function") return player.pauseVideo();
      console.warn("safePause: pauseVideo not available on player", player);
    } catch (err) {
      console.error("safePause error:", err);
    }
  }

  function safeLoadVideoById(player, videoId, time) {
    try {
      if (!player) return console.warn("safeLoadVideoById: no player");
      if (typeof player.loadVideoById === "function") {
        return player.loadVideoById(videoId, time || 0);
      }
      console.warn("safeLoadVideoById: loadVideoById not available");
    } catch (err) {
      console.error("safeLoadVideoById error:", err);
    }
  }

  function safeSeekTo(player, time) {
    try {
      if (!player) return console.warn("safeSeekTo: no player");
      if (typeof player.seekTo === "function") {
        return player.seekTo(time || 0, true);
      }
      console.warn("safeSeekTo: seekTo not available");
    } catch (err) {
      console.error("safeSeekTo error:", err);
    }
  }

  // --- Create player and socket connections ---
  useEffect(() => {
    function createPlayer() {
      // Don't store the constructor result; onReady will give us the actual player
      new window.YT.Player("player", {
        height: "390",
        width: "640",
        videoId: "", // default video
        playerVars: { controls: 1 },
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange,
        },
      });
    }

    if (window.YT && window.YT.Player) createPlayer();
    else window.onYouTubeIframeAPIReady = createPlayer;

    socket.on("sync_state", applyServerState);
    socket.on("control_event", applyServerState);

    return () => {
      socket.off("sync_state", applyServerState);
      socket.off("control_event", applyServerState);
    };
  }, []);

  // --- Manual control buttons ---
  const sendControl = (type) => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    const time = safeGetCurrentTime(player);
    const videoId = safeGetVideoId(player);

    // Don't send if time is 0 (video hasn't started or cache not initialized)
    if (time === 0) {
      console.warn(
        "⚠️ Cannot send control - time is 0. Use YouTube player controls first."
      );
      return;
    }

    // Apply locally first for immediate feedback, but suppress the
    // outgoing state that will be fired by the player's onStateChange.
    console.log("📤 sendControl", {
      type,
      time,
      videoId,
      ready: readyRef.current,
    });
    suppressRef.current = true;
    if (type === "play") safePlay(player);
    if (type === "pause") safePause(player);

    // Give the player a short moment to transition, then release suppression.
    setTimeout(() => (suppressRef.current = false), 700);

    // Broadcast to others
    socket.emit("control", { type, targetTime: time, videoId });
  };

  const changeVideo = () => {
    const id = extractVideoId(videoUrl);
    if (!id) return alert("Invalid YouTube URL");
    socket.emit("control", {
      type: "change_video",
      videoId: id,
      targetTime: 0,
    });
    setVideoUrl("");
  };

  function extractVideoId(url) {
    const match = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:&|$)/);
    return match ? match[1] : null;
  }

  return (
    <div
      style={{
        background: "#111",
        color: "#fff",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="Enter YouTube URL"
          style={{ width: 300, marginRight: 8 }}
        />
        <button onClick={changeVideo}>Load</button>
      </div>

      <div
        id="player"
        style={{ width: 640, height: 390, background: "#000" }}
      />

      <div style={{ marginTop: 16 }}>
        <button onClick={() => sendControl("play")}>Play</button>
        <button onClick={() => sendControl("pause")} style={{ marginLeft: 8 }}>
          Pause
        </button>
      </div>
    </div>
  );
}
