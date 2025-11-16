#  WatchParty – Realtime YouTube Sync Application

A simple watch-party app where multiple users can watch the same YouTube video in sync — play, pause, seekto,  change videos, and stay perfectly synchronized.

---

##  Live Demo

### **Frontend (Vercel)**  
🔗 https://watchparty-omega.vercel.app  

### **Backend (Render)**  
🔗 https://watchparty1-m6yv.onrender.com/

---

#  Features

- 🔄 Real-time sync for **play**, **pause**, and **seek**
- 🎬 Sync video changes (when any user loads a new YouTube link)
- ✨ Built using YouTube Iframe API for accurate playback control
- 👥 Multi-user support (all users view the same state)
- ⚡ Socket.IO for realtime event communication

---

# Tech Stack

### **Frontend**
- React (Vite)
- Socket.IO Client
- YouTube Iframe API

### **Backend**
- Node.js + Express
- Socket.IO
- Render deployment

---

# Local Setup Instructions

## 1️⃣ Clone the repo
```bash
git clone https://github.com/ShrutiGupta73vns/watchparty.git
cd watchparty
▶️ 2️⃣ Run Backend Locally
cd server
npm install
npm start
Backend runs at:http://localhost:5000
💻 3️⃣ Run Frontend Locally

cd client
npm install
npm run dev
Frontend runs at:http://localhost:5173
Make sure in your frontend code: const socket = io("http://localhost:5000"); 
📘 Architecture Overview
The system uses a real-time event-driven architecture powered by Socket.IO.

User A <─────> Socket.IO Server <─────> User B
             (Global Session State)
Flow
1. Any user performs an action
Play
Pause
Seek
Change video

2. Client emits a socket event

{
  "type": "play",
  "targetTime": 42.3,
  "videoId": "YoutubeVideoId"
}
3. Server updates the global session

session = {
  videoId,
  playing,
  time,
  lastUpdateTs
}
4. Server broadcasts to all users
Clients update their YouTube players accordingly.

5. New user joins
They receive:

sync_state = { videoId, time, playing }
and instantly match the current playback.

🧠 Key Technical Decisions
✔ Socket.IO for real-time sync
Reliable, has auto-reconnect, works well with React, and ideal for event broadcasting.

✔ Centralized session state
Keeping a single truth on the server ensures:
No drift between users
New users sync instantly

✔ Suppression Logic
Prevents infinite loops:

When server updates the client → client ignores the resulting YouTube onStateChange event

✔ YouTube Iframe API
Chosen over simple embed because it supports:

Accurate getCurrentTime()

loadVideoById()

Reliable playback events

⚠️ Known Limitations
1. When a user seeks to a different time, the video briefly pauses for all clients because the YouTube API triggers a pause event during seeking.

Improvement:

This can be handled better by detecting seek actions and suppressing the automatic pause event so other clients don’t pause.



2. Seeking behavior is basic
Perfect synchronized seeking could be improved further.

3. No chat or user list
Focus is only video synchronization.

4. Initial buffering from YouTube may temporarily show 0 time
This is a YouTube API limitation; mitigated with cached time logic.

🧪 How to Test the App
✔ Open the app in two tabs or two different devices:
https://watchparty-omega.vercel.app

1️⃣ Enter a YouTube link in Tab A
→ The video should load in Tab B instantly

2️⃣ Click Play in Tab A
→ Tab B should start playing at the same time

3️⃣ Click Pause in Tab B
→ Tab A pauses immediately

4️⃣ Seek in any tab
→ Other tab follows

5️⃣ Change the video again
→ Both tabs load the new video together

