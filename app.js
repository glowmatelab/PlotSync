let peer = null;
let conn = null;
let roomCode = "";
let isHost = false;
let myName = "";
let isSyncing = false;

const video = document.getElementById("video-player");
const chatBox = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const connStatus = document.getElementById("conn-status");
const roomBadge = document.getElementById("room-badge");

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

// ── BACKEND PORT ROUTING FIX ──
function initPeer(id) {
  // PeerJS default cloud ko completely custom servers aur public cloud bridges se switch kiya hai
  peer = new Peer(id, {
    debug: 2,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
      ]
    }
  });

  peer.on("open", (openedId) => {
    console.log("Peer opened with ID:", openedId);
    showWatchScreen();
    document.getElementById("host-file-bar").style.display = "flex";
    
    if (isHost) {
      setStatus("Waiting for guest...", false);
      sysMsg("Room ready! Share code: " + roomCode);
    } else {
      setStatus("Connecting to Host...", false);
      // Chhota sa delay taaki host server register ho jaye properly
      setTimeout(() => { connectToHost(); }, 800);
    }
  });

  peer.on("connection", (c) => {
    console.log("Incoming connection from guest...");
    conn = c;
    setupConn();
  });

  peer.on("error", (err) => {
    console.error("PeerJS Core Error:", err);
    if (err.type === 'peer-unavailable') {
      sysMsg("⚠️ Room Code nahi mila. Check karo Host online hai ya nahi.");
    } else {
      sysMsg("⚠️ Connection network drop. Re-trying...");
    }
  });
}

function connectToHost() {
  if (!peer) return;
  console.log("Attempting P2P handshake with room:", roomCode);
  conn = peer.connect(roomCode, { 
    reliable: true 
  });
  setupConn();
}

function setupConn() {
  if (!conn) return;

  conn.on("open", () => {
    console.log("P2P Data Channel securely established!");
    setStatus("Connected", true);
    document.getElementById("peer-name").textContent = isHost ? "● Guest Inside" : "● Host Connected";
    
    send({ type: "handshake", name: myName });
    sysMsg("💥 Connected! Ab dono local file select karke watch party shuru karo!");
    
    setupVideoSync();
  });

  conn.on("data", handleData);
  
  conn.on("close", () => {
    setStatus("Disconnected", false);
    sysMsg("⚠️ Friend left the room.");
  });
}

function handleHostVideoSelection(event) {
  const file = event.target.files[0];
  if (!file) return;

  video.src = URL.createObjectURL(file);
  video.load();
  sysMsg(`🎬 Movie asset loaded locally.`);
}

function setupVideoSync() {
  video.onplay = () => {
    if (isSyncing) return;
    send({ type: "media-play", time: video.currentTime });
  };

  video.onpause = () => {
    if (isSyncing) return;
    send({ type: "media-pause" });
  };

  video.onseeking = () => {
    if (isSyncing) return;
    send({ type: "media-seek", time: video.currentTime });
  };
}

function send(data) {
  if (conn && conn.open) {
    conn.send(data);
  }
}

let guestNickName = "Friend";
function handleData(data) {
  switch (data.type) {
    case "handshake":
      guestNickName = data.name;
      document.getElementById("peer-name").textContent = `● ${guestNickName}`;
      break;
    case "chat":
      addMsg(data.text, "them", guestNickName); 
      break;
    case "emoji":
      addEmoji(data.emoji, "them"); 
      break;
    case "media-play":
      isSyncing = true;
      video.currentTime = data.time;
      video.play().catch(() => sysMsg("📢 Screen par ek baar tap karo audio sync ke liye!"));
      setTimeout(() => { isSyncing = false; }, 300);
      break;
    case "media-pause":
      isSyncing = true;
      video.pause();
      setTimeout(() => { isSyncing = false; }, 300);
      break;
    case "media-seek":
      isSyncing = true;
      video.currentTime = data.time;
      setTimeout(() => { isSyncing = false; }, 300);
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
  const textNode = document.createTextNode(text);
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
