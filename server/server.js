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

  // Handle user control actions
  socket.on("control", ({ type, targetTime, videoId }) => {
    console.log("📨 Received control:", { type, targetTime, videoId });
    if (videoId) session.videoId = videoId;
    session.playing = type === "play";
    session.time = targetTime;
    session.lastUpdateTs = Date.now();

    console.log("📤 Broadcasting state:", session);
    io.emit("control_event", { ...session, type });
  });
});

server.listen(5000, () => console.log("Server running on port 5000"));
