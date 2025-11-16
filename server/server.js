const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// Global session state
const session = {
  videoId: "",
  playing: false,
  time: 0,
  lastUpdateTs: Date.now(),
};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Send current state when someone joins
  socket.emit("sync_state", session);

  // Handle all control messages
  socket.on("control", ({ type, targetTime, videoId }) => {
    console.log("📨 Received control:", { type, targetTime, videoId });

    if (type === "change_video") {
      // Handle video change explicitly
      session.videoId = videoId;
      session.time = 0;
      session.playing = false;

    } else if (type === "play") {
      session.playing = true;
      session.time = targetTime;

      if (videoId) session.videoId = videoId;

    } else if (type === "pause") {
      session.playing = false;
      session.time = targetTime;

      if (videoId) session.videoId = videoId;
    }

    session.lastUpdateTs = Date.now();

    console.log("📤 Broadcasting:", { ...session, type });
    io.emit("control_event", { ...session, type });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server running on " + PORT));
