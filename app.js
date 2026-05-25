let peer = null;
let conn = null;
let roomCode = "";
let isHost = false;
let localStream = null;
let myName = "";

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
  document.getElementById("welcome-msg").textContent = `Logged in as: ${myName}`;
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

function initPeer(id) {
  peer = new Peer(id, {
    debug: 0,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject"
        },
        {
          urls: "turn:openrelay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject"
        }
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
      video.play().catch(() => sysMsg("📢 Tap anywhere on chat to activate audio sync!"));
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
    
    // Handshake user identity instantly on open track link
    send({ type: "handshake", name: myName });
    sysMsg(isHost ? "A guest joined the room!" : "Connected to host room dashboard!");
  });

  conn.on("data", handleData);
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

let guestNickName = "Friend";
function handleData(data) {
  switch (data.type) {
    case "handshake":
      guestNickName = data.name;
      document.getElementById("peer-name").textContent = `● ${guestNickName}`;
      break;
    case "chat":
      addMsg(data.text, "them", guestNickName); break;
    case "emoji":
      addEmoji(data.emoji, "them"); break;
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
