STUN servers inject karne wala idea badhiya tha! Isse tumhare connection drops kafi hadd tak ruk jayenge jab users alag-alag networks par honge.

Lekin is upgraded code me abhi bhi ek major issue bacha hai jo tumhare app ka main feature tod raha hai: **Video State Sync (Play/Pause/Seek)** aur **Two-way Handshake**.

Abhi ke logic ke hisab se, Host jab video play ya pause karega, toh Guest ke browser ko kuch pata nahi chalega kyunki tumne video events ko track karke dusre peer ko message bhejna miss kar diya hai. Dusra, Host ka naam Guest ko kabhi pata nahi chalega kyunki handshake sirf ek-tarfa ho raha hai.

In saari cheezon ko sahi karke, maine tumhara finalized production-ready code niche update kar diya hai.

---

## 🛠️ Kya Badlaav Kiye Hain?

* **Video Control Event Listeners:** Host ke video player par `onplay`, `onpause`, aur `onseeking` track karne ke liye event listeners lagaye hain.
* **Two-way Handshake Fix:** Jab Guest apna naam `handshake` event se bhejega, toh Host use receive karke wapas apna naam `handshake-reply` ke zariye bhejega.
* **Property Name Fix:** PeerJS configuration me `urls` (plural) ki jagah standard rule ke mutabik `{ url: '...' }` ya `{ urls: [...] }` dono valid hote hain, par array structure ko robust banaya hai takki network lookup me crash na ho.

---

## 💻 Finalized JavaScript Code

```javascript
let peer = null;
let conn = null;
let roomCode = "";
let isHost = false;
let localStream = null;
let myName = "";
let guestNickName = "Friend";

const video = document.getElementById("video-player");
const chatBox = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const connStatus = document.getElementById("conn-status");
const roomBadge = document.getElementById("room-badge");
const streamBtn = document.getElementById("stream-btn");

// STEP 1 NAME LOGIC
function saveUsername() {
  const nameInp = document.getElementById("username-input").value.trim();
  if (!nameInp) {
    document.getElementById("name-error").textContent = "Please enter a valid nickname.";
    return;
  }
  myName = nameInp;
  document.getElementById("name-screen").classList.remove("active");
  document.getElementById("lobby").classList.add("active");
  
  const welcomeMsg = document.getElementById("welcome-msg");
  if (welcomeMsg) {
    welcomeMsg.textContent = `Logged in as: ${myName}`;
  }
}

function createRoom() {
  roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
  isHost = true;
  initPeer(roomCode);
}

function joinRoom() {
  const code = document.getElementById("room-input").value.trim().toUpperCase();
  if (!code) {
    document.getElementById("lobby-error").textContent = "Enter a valid code.";
    return;
  }
  roomCode = code;
  isHost = false;
  initPeer("guest_" + Math.random().toString(36).substr(2, 5));
}

// ── FIXED CONNECTION CHANNELS (FOR PUBLIC NETWORKS) ──
function initPeer(id) {
  peer = new Peer(id, { 
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    }
  });

  peer.on("open", () => {
    showWatchScreen();
    if (isHost) {
      document.getElementById("host-file-bar").style.display = "flex";
      setStatus("Waiting for guest...", false);
      sysMsg("Room initialized! Share the code above with your friend.");
    } else {
      connectToHost();
    }
  });

  peer.on("connection", (c) => {
    conn = c;
    setupConn();
  });

  peer.on("call", (call) => {
    call.answer(); 
    call.on("stream", (remoteStream) => {
      video.srcObject = remoteStream;
      video.play().catch(() => sysMsg("📢 Tap anywhere on screen to activate audio/video sync!"));
    });
  });
}

function connectToHost() {
  setStatus("Connecting...", false);
  conn = peer.connect(roomCode, { reliable: true });
  setupConn();
}

function setupConn() {
  conn.on("open", () => {
    setStatus("Connected", true);
    document.getElementById("peer-name").textContent = isHost ? "● Guest Inside" : "● Host Connected";
    
    // Handshake user identity instantly
    send({ type: "handshake", name: myName });
    sysMsg(isHost ? "A guest joined the room!" : "Connected to host room dashboard!");

    // Host ke liye video state listeners bind karo
    if (isHost) {
      setupVideoSync();
    }
  });

  conn.on("data", handleData);
}

// ── NEW: SYNC LISTENERS FOR HOST ──
function setupVideoSync() {
  video.onplay = () => {
    send({ type: "video-sync", action: "play", time: video.currentTime });
  };
  video.onpause = () => {
    send({ type: "video-sync", action: "pause", time: video.currentTime });
  };
  video.onseeking = () => {
    send({ type: "video-sync", action: "seek", time: video.currentTime });
  };
}

function handleHostVideoSelection(event) {
  const file = event.target.files[0];
  if (!file) return;

  video.src = URL.createObjectURL(file);
  video.srcObject = null; 
  video.load();
  
  sysMsg(`Selected localized media asset. Ready to fire streaming.`);
  streamBtn.disabled = false; 
}

function startMovieStreaming() {
  if (!video.src && !video.captureStream) return;

  try {
    if (video.captureStream) {
      localStream = video.captureStream();
    } else if (video.mozCaptureStream) {
      localStream = video.mozCaptureStream();
    }

    if (localStream && conn && conn.peer) {
      peer.call(conn.peer, localStream);
      sysMsg("📺 Movie pipeline active! Tap play to synchronize.");
      video.play();
    }
  } catch (err) {
    console.error(err);
    sysMsg("⚠️ Media Capture restrictions hit on your current browser context.");
  }
}

function send(data) {
  if (conn && conn.open) conn.send(data);
}

function handleData(data) {
  switch (data.type) {
    case "handshake":
      guestNickName = data.name;
      document.getElementById("peer-name").textContent = `● ${guestNickName}`;
      if (isHost) {
        // Host wapas Guest ko reply bhejega taaki guest ko host ka name pata chale
        send({ type: "handshake-reply", name: myName });
      }
      break;

    case "handshake-reply":
      guestNickName = data.name;
      document.getElementById("peer-name").textContent = `● ${guestNickName}`;
      break;

    case "video-sync":
      // Sirf Guest hi Host ke commands execute karega
      if (!isHost) {
        if (data.action === "play") {
          video.currentTime = data.time;
          video.play().catch(() => {});
        } else if (data.action === "pause") {
          video.pause();
          video.currentTime = data.time;
        } else if (data.action === "seek") {
          video.currentTime = data.time;
        }
      }
      break;

    case "chat":
      addMsg(data.text, "them", guestNickName); 
      break;
      
    case "emoji":
      addEmoji(data.emoji, "them"); 
      break;
  }
}

function showWatchScreen() {
  document.getElementById("lobby").classList.remove("active");
  document.getElementById("watch-screen").classList.add("active");
  roomBadge.textContent = roomCode;
}

function sendChat() {
  const text = chatInput.value.trim(); if (!text) return;
  addMsg(text, "me", myName); 
  send({ type: "chat", text }); 
  chatInput.value = "";
}

function chatKeydown(e) { if (e.key === "Enter") sendChat(); }
function sendEmoji(emoji) { addEmoji(emoji, "me"); send({ type: "emoji", emoji }); }

function addMsg(text, who, senderName) {
  const div = document.createElement("div"); 
  div.className = "msg " + who;
  
  const spanName = document.createElement("span");
  spanName.className = "msg-sender";
  spanName.textContent = who === "me" ? "You" : senderName;
  
  const textNode = document.createTextNode(": " + text);
  
  div.appendChild(spanName);
  div.appendChild(textNode);
  
  chatBox.appendChild(div); 
  chatBox.scrollTop = chatBox.scrollHeight;
}

function addEmoji(emoji, who) {
  const div = document.createElement("div"); 
  div.className = "msg system"; 
  div.style.fontSize = "1.2rem"; 
  div.style.background = "none";
  div.style.border = "none";
  div.textContent = who === "me" ? `You sent ${emoji}` : `${guestNickName} sent ${emoji}`;
  chatBox.appendChild(div); 
  chatBox.scrollTop = chatBox.scrollHeight;
}

function sysMsg(text) {
  const div = document.createElement("div"); div.className = "msg system"; div.textContent = text;
  chatBox.appendChild(div); chatBox.scrollTop = chatBox.scrollHeight;
}

function setStatus(text, connected) {
  connStatus.textContent = "● " + text; connStatus.className = "status " + (connected ? "connected" : "disconnected");
}

function copyRoomCode() { 
  navigator.clipboard.writeText(roomCode); 
  showToast("Room Code Copied!"); 
}

function showToast(msg) { 
  const t = document.getElementById("toast"); 
  t.textContent = msg; 
  t.classList.add("show"); 
  setTimeout(() => t.classList.remove("show"), 2500); 
}

```
