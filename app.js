/**
 * AirWave Complete Client Engine
 * - Broadcast Spaces (Audio Multicast Mesh)
 * - Low-Lag Direct 1-on-1 Voice & Video Calls (WebRTC Peer-to-Peer)
 * - Direct Media Messaging (Images, Videos, Voice Notes, Text via RTCDataChannel)
 * - Online Presence, Custom Statuses & Search Directory
 */

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// Global App State
const state = {
  userId: localStorage.getItem('airwave_userId') || 'peer_' + Math.random().toString(36).substring(2, 9),
  username: localStorage.getItem('airwave_username') || '',
  statusMsg: localStorage.getItem('airwave_statusMsg') || 'Hey there! I am using AirWave.',
  apiUrl: localStorage.getItem('airwave_apiUrl') || '',

  // Directory & Presence
  usersDirectory: [],
  activeChatPeer: null, // Selected User object for Chat/Call

  // Direct 1-on-1 Call State
  call: {
    pc: null,
    active: false,
    type: null, // 'voice' | 'video'
    peerId: null,
    localStream: null,
    remoteStream: null,
    timerInterval: null,
    startTime: null,
    candidateQueue: []
  },
  pendingIncomingCall: null,

  // Direct 1-on-1 DataChannel Chat State
  dataChannelPeerId: null,
  dataChannelPc: null,
  dataChannel: null,
  dataChannelCandidateQueue: [],

  // Voice Note Recorder
  mediaRecorder: null,
  recordedAudioChunks: [],
  recordStartTime: null,
  recordTimerInterval: null,

  // Broadcast Space State
  broadcast: {
    role: 'IDLE', // 'IDLE' | 'BROADCASTER' | 'LISTENER'
    activeRoomId: null,
    localStream: null,
    audioContext: null,
    analyser: null,
    animationFrame: null,
    isMuted: false,
    peers: new Map(), // listenerId -> { pc, queue }
    listenerPc: null,
    listenerQueue: []
  },

  pollingIntervals: {
    signals: null,
    presence: null,
    spaces: null
  }
};

// DOM Cache
const dom = {
  onboardingSection: document.getElementById('onboardingSection'),
  appWorkspace: document.getElementById('appWorkspace'),
  joinForm: document.getElementById('joinForm'),
  usernameInput: document.getElementById('usernameInput'),
  statusMsgInput: document.getElementById('statusMsgInput'),
  apiUrlInput: document.getElementById('apiUrlInput'),
  userBadge: document.getElementById('userBadge'),
  displayUsername: document.getElementById('displayUsername'),
  btnSettings: document.getElementById('btnSettings'),
  toastContainer: document.getElementById('toastContainer'),

  // Users Directory
  userSearchInput: document.getElementById('userSearchInput'),
  usersList: document.getElementById('usersList'),

  // Chat View
  chatPeerName: document.getElementById('chatPeerName'),
  chatPeerStatus: document.getElementById('chatPeerStatus'),
  chatPeerOnlineDot: document.getElementById('chatPeerOnlineDot'),
  chatMessages: document.getElementById('chatMessages'),
  chatTextInput: document.getElementById('chatTextInput'),
  btnSendText: document.getElementById('btnSendText'),
  imageFileInput: document.getElementById('imageFileInput'),
  videoFileInput: document.getElementById('videoFileInput'),
  btnTriggerImage: document.getElementById('btnTriggerImage'),
  btnTriggerVideo: document.getElementById('btnTriggerVideo'),
  btnRecordVoice: document.getElementById('btnRecordVoice'),
  voiceRecordingPreview: document.getElementById('voiceRecordingPreview'),
  voiceRecordTimer: document.getElementById('voiceRecordTimer'),
  btnCancelVoiceRecord: document.getElementById('btnCancelVoiceRecord'),
  btnSendVoiceRecord: document.getElementById('btnSendVoiceRecord'),
  btnStartDirectAudioCall: document.getElementById('btnStartDirectAudioCall'),
  btnStartDirectVideoCall: document.getElementById('btnStartDirectVideoCall'),

  // Direct Call View
  activeCallView: document.getElementById('activeCallView'),
  callTypeBadge: document.getElementById('callTypeBadge'),
  callPeerName: document.getElementById('callPeerName'),
  callStatusTimer: document.getElementById('callStatusTimer'),
  btnToggleCallCam: document.getElementById('btnToggleCallCam'),
  btnToggleCallMic: document.getElementById('btnToggleCallMic'),
  btnEndCall: document.getElementById('btnEndCall'),
  remoteVideo: document.getElementById('remoteVideo'),
  localVideo: document.getElementById('localVideo'),
  remoteCallAudio: document.getElementById('remoteCallAudio'),

  // Incoming Call Modal
  incomingCallModal: document.getElementById('incomingCallModal'),
  incomingCallerName: document.getElementById('incomingCallerName'),
  incomingCallType: document.getElementById('incomingCallType'),
  btnRejectCall: document.getElementById('btnRejectCall'),
  btnAcceptCall: document.getElementById('btnAcceptCall'),

  // Live Spaces UI
  roomsGrid: document.getElementById('roomsGrid'),
  btnOpenBroadcastModal: document.getElementById('btnOpenBroadcastModal'),
  broadcastModal: document.getElementById('broadcastModal'),
  btnCloseBroadcastModal: document.getElementById('btnCloseBroadcastModal'),
  startBroadcastForm: document.getElementById('startBroadcastForm'),
  streamTitleInput: document.getElementById('streamTitleInput'),
  streamCategoryInput: document.getElementById('streamCategoryInput'),
  broadcasterConsole: document.getElementById('broadcasterConsole'),
  broadcastTitleDisplay: document.getElementById('broadcastTitleDisplay'),
  listenerCount: document.getElementById('listenerCount'),
  btnToggleBroadcastMic: document.getElementById('btnToggleBroadcastMic'),
  btnEndBroadcast: document.getElementById('btnEndBroadcast'),
  visualizerCanvas: document.getElementById('visualizerCanvas'),
  listenerDeck: document.getElementById('listenerDeck'),
  listenerRoomTitle: document.getElementById('listenerRoomTitle'),
  listenerPeerStatus: document.getElementById('listenerPeerStatus'),
  remoteBroadcastAudio: document.getElementById('remoteBroadcastAudio'),
  btnLeaveSpace: document.getElementById('btnLeaveSpace')
};

/* ================= Notification Utilities ================= */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const colors = {
    info: 'bg-slate-800 text-indigo-400 border-indigo-500/40',
    success: 'bg-slate-800 text-emerald-400 border-emerald-500/40',
    error: 'bg-slate-800 text-rose-400 border-rose-500/40'
  };

  toast.className = `border px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 text-xs font-medium transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto ${colors[type] || colors.info}`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i><span>${message}</span>`;

  dom.toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ================= REST Signaling API Wrapper ================= */
async function apiCall(method, body = null, params = null) {
  let url = state.apiUrl;
  if (params) {
    const query = new URLSearchParams(params).toString();
    url += (url.includes('?') ? '&' : '?') + query;
  }

  const options = { method, mode: 'cors', redirect: 'follow' };
  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
    options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
  }

  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
  return await res.json();
}

/* ================= Initialization ================= */
window.addEventListener('DOMContentLoaded', () => {
  localStorage.setItem('airwave_userId', state.userId);

  if (state.username && state.apiUrl) {
    initApp();
  } else {
    dom.usernameInput.value = state.username;
    dom.statusMsgInput.value = state.statusMsg;
    dom.apiUrlInput.value = state.apiUrl;
  }

  // Bind Listeners
  dom.joinForm.addEventListener('submit', handleOnboarding);
  dom.btnSettings.addEventListener('click', resetConfig);
  dom.userSearchInput.addEventListener('input', renderUsersDirectory);

  // Chat UI Actions
  dom.btnSendText.addEventListener('click', sendTextMessage);
  dom.chatTextInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendTextMessage(); });
  dom.btnTriggerImage.addEventListener('click', () => dom.imageFileInput.click());
  dom.btnTriggerVideo.addEventListener('click', () => dom.videoFileInput.click());
  dom.imageFileInput.addEventListener('change', (e) => handleFileUpload(e, 'image'));
  dom.videoFileInput.addEventListener('change', (e) => handleFileUpload(e, 'video'));
  dom.btnRecordVoice.addEventListener('click', toggleVoiceRecording);
  dom.btnCancelVoiceRecord.addEventListener('click', cancelVoiceRecording);
  dom.btnSendVoiceRecord.addEventListener('click', finalizeVoiceRecording);

  // Direct Calling
  dom.btnStartDirectAudioCall.addEventListener('click', () => initiateDirectCall('voice'));
  dom.btnStartDirectVideoCall.addEventListener('click', () => initiateDirectCall('video'));
  dom.btnToggleCallCam.addEventListener('click', toggleCallCamera);
  dom.btnToggleCallMic.addEventListener('click', toggleCallMicrophone);
  dom.btnEndCall.addEventListener('click', terminateActiveCall);
  dom.btnAcceptCall.addEventListener('click', acceptIncomingCall);
  dom.btnRejectCall.addEventListener('click', rejectIncomingCall);

  // Broadcast Spaces UI
  dom.btnOpenBroadcastModal.addEventListener('click', () => dom.broadcastModal.classList.remove('hidden'));
  dom.btnCloseBroadcastModal.addEventListener('click', () => dom.broadcastModal.classList.add('hidden'));
  dom.startBroadcastForm.addEventListener('submit', handleStartBroadcast);
  dom.btnToggleBroadcastMic.addEventListener('click', toggleBroadcastMute);
  dom.btnEndBroadcast.addEventListener('click', endBroadcastSpace);
  dom.btnLeaveSpace.addEventListener('click', leaveBroadcastSpace);
});

async function handleOnboarding(e) {
  e.preventDefault();
  state.username = dom.usernameInput.value.trim();
  state.statusMsg = dom.statusMsgInput.value.trim() || 'Available';
  state.apiUrl = dom.apiUrlInput.value.trim();

  localStorage.setItem('airwave_username', state.username);
  localStorage.setItem('airwave_statusMsg', state.statusMsg);
  localStorage.setItem('airwave_apiUrl', state.apiUrl);

  try {
    showToast('Connecting to Signaling Engine...', 'info');
    await sendHeartbeat();
    initApp();
  } catch (err) {
    showToast(`Signaling connection failed: ${err.message}`, 'error');
  }
}

function resetConfig() {
  if (confirm('Reconfigure username and API endpoint?')) {
    clearInterval(state.pollingIntervals.signals);
    clearInterval(state.pollingIntervals.presence);
    clearInterval(state.pollingIntervals.spaces);
    localStorage.removeItem('airwave_apiUrl');
    location.reload();
  }
}

function initApp() {
  dom.onboardingSection.classList.add('hidden');
  dom.appWorkspace.classList.remove('hidden');
  dom.userBadge.classList.remove('hidden');
  dom.userBadge.classList.add('flex');
  dom.displayUsername.textContent = state.username;

  // Pollers
  sendHeartbeat();
  state.pollingIntervals.presence = setInterval(sendHeartbeat, 10000);
  fetchUsersDirectory();
  setInterval(fetchUsersDirectory, 8000);

  refreshBroadcastSpaces();
  state.pollingIntervals.spaces = setInterval(refreshBroadcastSpaces, 5000);

  // Core Real-Time Signaling Poller (1.5s for fast call pickup)
  state.pollingIntervals.signals = setInterval(pollIncomingSignals, 1500);
}

/* ================= Presence & Directory ================= */
async function sendHeartbeat() {
  try {
    await apiCall('POST', {
      action: 'heartbeat',
      userId: state.userId,
      username: state.username,
      statusMsg: state.statusMsg
    });
  } catch (e) {
    console.warn('Heartbeat failed', e);
  }
}

async function fetchUsersDirectory() {
  try {
    const res = await apiCall('GET', null, { action: 'getUsers' });
    if (res.success && res.users) {
      state.usersDirectory = res.users.filter(u => u.userId !== state.userId);
      renderUsersDirectory();
    }
  } catch (e) {
    console.warn('Directory fetch failed', e);
  }
}

function renderUsersDirectory() {
  const query = dom.userSearchInput.value.toLowerCase().trim();
  dom.usersList.innerHTML = '';

  const filtered = state.usersDirectory.filter(user => {
    return user.username.toLowerCase().includes(query) ||
           (user.statusMsg && user.statusMsg.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    dom.usersList.innerHTML = `<div class="col-span-2 text-center py-6 text-slate-500 text-xs">No users matching search</div>`;
    return;
  }

  filtered.forEach(user => {
    const card = document.createElement('div');
    card.className = `p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${state.activeChatPeer && state.activeChatPeer.userId === user.userId ? 'bg-indigo-950/30 border-indigo-500/40' : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'}`;

    card.innerHTML = `
      <div class="flex items-center space-x-3 truncate">
        <div class="relative">
          <div class="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-indigo-400">
            ${escapeHtml(user.username.substring(0, 2).toUpperCase())}
          </div>
          <span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ${user.isOnline ? 'bg-emerald-400' : 'bg-slate-600'} ring-2 ring-slate-950"></span>
        </div>
        <div class="truncate">
          <h5 class="text-xs font-bold text-white truncate">${escapeHtml(user.username)}</h5>
          <p class="text-[11px] text-slate-400 truncate">${escapeHtml(user.statusMsg || (user.isOnline ? 'Active now' : 'Offline'))}</p>
        </div>
      </div>
      <div class="flex items-center space-x-1">
        <button class="btn-user-chat w-7 h-7 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white flex items-center justify-center text-xs transition" title="Chat">
          <i class="fa-solid fa-message"></i>
        </button>
        <button class="btn-user-call w-7 h-7 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white flex items-center justify-center text-xs transition" title="Voice Call">
          <i class="fa-solid fa-phone"></i>
        </button>
      </div>
    `;

    // Click handler to open chat & set active peer
    card.addEventListener('click', () => selectChatPeer(user));
    card.querySelector('.btn-user-chat').addEventListener('click', (e) => {
      e.stopPropagation();
      selectChatPeer(user);
    });
    card.querySelector('.btn-user-call').addEventListener('click', (e) => {
      e.stopPropagation();
      selectChatPeer(user);
      initiateDirectCall('voice');
    });

    dom.usersList.appendChild(card);
  });
}

function selectChatPeer(user) {
  state.activeChatPeer = user;
  dom.chatPeerName.textContent = user.username;
  dom.chatPeerStatus.textContent = user.statusMsg || (user.isOnline ? 'Online' : 'Offline');
  dom.chatPeerOnlineDot.classList.toggle('hidden', !user.isOnline);

  renderUsersDirectory();
  ensureDataChannelConnection(user.userId);
}

/* ================= Direct 1-on-1 WebRTC DataChannel (Chat & Files) ================= */
async function ensureDataChannelConnection(peerId) {
  if (state.dataChannelPeerId === peerId && state.dataChannel && state.dataChannel.readyState === 'open') {
    return;
  }

  // Cleanup existing DC
  if (state.dataChannelPc) {
    state.dataChannelPc.close();
  }

  state.dataChannelPeerId = peerId;
  state.dataChannelCandidateQueue = [];

  const pc = new RTCPeerConnection(RTC_CONFIG);
  state.dataChannelPc = pc;

  // Create DataChannel with Binary capability
  const dc = pc.createDataChannel('airwave-mesh-chat', { ordered: true });
  setupDataChannelEvents(dc);
  state.dataChannel = dc;

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      apiCall('POST', {
        action: 'postSignal',
        fromPeer: state.userId,
        toPeer: peerId,
        type: 'DC_ICE_CANDIDATE',
        payload: e.candidate
      }).catch(console.error);
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await apiCall('POST', {
    action: 'postSignal',
    fromPeer: state.userId,
    toPeer: peerId,
    type: 'DC_OFFER',
    payload: offer
  });
}

function setupDataChannelEvents(dc) {
  dc.binaryType = 'arraybuffer';

  dc.onopen = () => {
    dom.chatPeerStatus.textContent = 'Direct P2P Encrypted Active';
    showToast('Direct P2P DataChannel connected', 'success');
  };

  dc.onclose = () => {
    dom.chatPeerStatus.textContent = 'P2P DataChannel disconnected';
  };

  dc.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      appendChatMessage(data.sender, data.type, data.content, 'inbound', data.timestamp);
    } catch (err) {
      console.error('DataChannel parse error:', err);
    }
  };
}

function sendTextMessage() {
  const text = dom.chatTextInput.value.trim();
  if (!text || !state.activeChatPeer) return;

  const payload = {
    sender: state.username,
    type: 'text',
    content: text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  if (state.dataChannel && state.dataChannel.readyState === 'open') {
    state.dataChannel.send(JSON.stringify(payload));
    appendChatMessage('You', 'text', text, 'outbound', payload.timestamp);
    dom.chatTextInput.value = '';
  } else {
    showToast('Connecting direct P2P mesh... Try sending in a moment', 'info');
    ensureDataChannelConnection(state.activeChatPeer.userId);
  }
}

function handleFileUpload(event, type) {
  const file = event.target.files[0];
  if (!file || !state.activeChatPeer) return;

  if (file.size > 25 * 1024 * 1024) {
    showToast('File exceeds maximum size of 25MB', 'error');
    return;
  }

  showToast(`Transferring ${file.name} directly via P2P...`, 'info');
  const reader = new FileReader();
  reader.onload = () => {
    const payload = {
      sender: state.username,
      type: type, // 'image' or 'video'
      content: reader.result, // DataURL
      fileName: file.name,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (state.dataChannel && state.dataChannel.readyState === 'open') {
      state.dataChannel.send(JSON.stringify(payload));
      appendChatMessage('You', type, reader.result, 'outbound', payload.timestamp);
      event.target.value = '';
    } else {
      showToast('P2P connection busy or re-establishing', 'error');
    }
  };
  reader.readAsDataURL(file);
}

/* ================= Voice Audio Note Recorder ================= */
async function toggleVoiceRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    finalizeVoiceRecording();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordedAudioChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);

    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.recordedAudioChunks.push(e.data);
    };

    state.mediaRecorder.start();
    dom.voiceRecordingPreview.classList.remove('hidden');

    state.recordStartTime = Date.now();
    state.recordTimerInterval = setInterval(() => {
      const sec = Math.floor((Date.now() - state.recordStartTime) / 1000);
      dom.voiceRecordTimer.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }, 500);

  } catch (err) {
    showToast(`Microphone access denied: ${err.message}`, 'error');
  }
}

function cancelVoiceRecording() {
  if (state.mediaRecorder) {
    state.mediaRecorder.stop();
    state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
  }
  clearInterval(state.recordTimerInterval);
  dom.voiceRecordingPreview.classList.add('hidden');
}

function finalizeVoiceRecording() {
  if (!state.mediaRecorder) return;

  state.mediaRecorder.onstop = () => {
    const blob = new Blob(state.recordedAudioChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onload = () => {
      const payload = {
        sender: state.username,
        type: 'audio',
        content: reader.result,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (state.dataChannel && state.dataChannel.readyState === 'open') {
        state.dataChannel.send(JSON.stringify(payload));
        appendChatMessage('You', 'audio', reader.result, 'outbound', payload.timestamp);
      } else {
        showToast('P2P DataChannel closed', 'error');
      }
    };
    reader.readAsDataURL(blob);
    state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
  };

  state.mediaRecorder.stop();
  clearInterval(state.recordTimerInterval);
  dom.voiceRecordingPreview.classList.add('hidden');
}

function appendChatMessage(sender, type, content, direction, time) {
  const isOut = direction === 'outbound';
  const msgWrap = document.createElement('div');
  msgWrap.className = `flex flex-col ${isOut ? 'items-end' : 'items-start'} space-y-1`;

  let innerContent = '';
  if (type === 'text') {
    innerContent = `<div class="px-3.5 py-2 rounded-2xl max-w-[85%] break-words ${isOut ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-100 rounded-tl-none'} shadow-md">${escapeHtml(content)}</div>`;
  } else if (type === 'image') {
    innerContent = `<div class="p-1 rounded-xl max-w-[80%] bg-slate-800 border border-slate-700 overflow-hidden"><img src="${content}" class="rounded-lg max-h-48 w-full object-cover cursor-pointer" onclick="window.open('${content}')"/></div>`;
  } else if (type === 'video') {
    innerContent = `<div class="p-1 rounded-xl max-w-[85%] bg-slate-800 border border-slate-700 overflow-hidden"><video src="${content}" controls class="rounded-lg max-h-48 w-full"></video></div>`;
  } else if (type === 'audio') {
    innerContent = `<div class="p-2 rounded-2xl ${isOut ? 'bg-indigo-600' : 'bg-slate-800'} border border-slate-700/50"><audio src="${content}" controls class="h-8 max-w-[220px]"></audio></div>`;
  }

  msgWrap.innerHTML = `
    <div class="text-[10px] text-slate-500 px-1">${escapeHtml(sender)} • ${time}</div>
    ${innerContent}
  `;

  dom.chatMessages.appendChild(msgWrap);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

/* ================= Direct 1-on-1 Audio/Video Calling ================= */
async function initiateDirectCall(callType) {
  if (!state.activeChatPeer) {
    showToast('Select a user from the directory to call', 'error');
    return;
  }
  if (state.call.active) {
    showToast('Another call is already in progress', 'error');
    return;
  }

  state.call.type = callType;
  state.call.peerId = state.activeChatPeer.userId;
  state.call.active = true;
  state.call.candidateQueue = [];

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
    });
    state.call.localStream = stream;
    dom.localVideo.srcObject = stream;
  } catch (err) {
    showToast(`Media devices access rejected: ${err.message}`, 'error');
    state.call.active = false;
    return;
  }

  // Setup UI
  dom.activeCallView.classList.remove('hidden');
  dom.callTypeBadge.textContent = `${callType} Call`;
  dom.callPeerName.textContent = `Calling ${state.activeChatPeer.username}...`;
  dom.callStatusTimer.textContent = 'Signaling peer...';

  const pc = new RTCPeerConnection(RTC_CONFIG);
  state.call.pc = pc;

  // Add Local Tracks
  state.call.localStream.getTracks().forEach(track => pc.addTrack(track, state.call.localStream));

  pc.ontrack = (event) => {
    if (callType === 'video') {
      dom.remoteVideo.srcObject = event.streams[0];
    } else {
      dom.remoteCallAudio.srcObject = event.streams[0];
      dom.remoteCallAudio.play().catch(console.warn);
    }
    dom.callStatusTimer.textContent = 'Connected (P2P Mesh)';
    startCallTimer();
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      apiCall('POST', {
        action: 'postSignal',
        fromPeer: state.userId,
        toPeer: state.call.peerId,
        type: 'CALL_ICE_CANDIDATE',
        payload: event.candidate
      }).catch(console.error);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      terminateActiveCall();
    }
  };

  // Create Call Offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await apiCall('POST', {
    action: 'postSignal',
    fromPeer: state.userId,
    toPeer: state.call.peerId,
    type: 'CALL_OFFER',
    payload: {
      sdp: offer,
      callType: callType,
      callerName: state.username
    }
  });
}

function startCallTimer() {
  state.call.startTime = Date.now();
  clearInterval(state.call.timerInterval);
  state.call.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.call.startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    dom.callStatusTimer.textContent = `In call • ${m}:${s}`;
  }, 1000);
}

function toggleCallCamera() {
  if (!state.call.localStream) return;
  const videoTrack = state.call.localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    dom.btnToggleCallCam.classList.toggle('bg-rose-600', !videoTrack.enabled);
  }
}

function toggleCallMicrophone() {
  if (!state.call.localStream) return;
  const audioTrack = state.call.localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    dom.btnToggleCallMic.classList.toggle('bg-rose-600', !audioTrack.enabled);
  }
}

function terminateActiveCall() {
  if (state.call.pc) {
    state.call.pc.close();
    state.call.pc = null;
  }
  if (state.call.localStream) {
    state.call.localStream.getTracks().forEach(t => t.stop());
    state.call.localStream = null;
  }

  if (state.call.active && state.call.peerId) {
    apiCall('POST', {
      action: 'postSignal',
      fromPeer: state.userId,
      toPeer: state.call.peerId,
      type: 'CALL_HANGUP',
      payload: {}
    }).catch(() => {});
  }

  clearInterval(state.call.timerInterval);
  dom.activeCallView.classList.add('hidden');
  dom.remoteVideo.srcObject = null;
  dom.localVideo.srcObject = null;
  dom.remoteCallAudio.srcObject = null;
  state.call.active = false;
  state.call.peerId = null;
  showToast('Call ended', 'info');
}

async function acceptIncomingCall() {
  const signal = state.pendingIncomingCall;
  if (!signal) return;

  dom.incomingCallModal.classList.add('hidden');
  const { fromPeer, payload } = signal;
  const { sdp, callType, callerName } = payload;

  state.call.type = callType;
  state.call.peerId = fromPeer;
  state.call.active = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false
    });
    state.call.localStream = stream;
    dom.localVideo.srcObject = stream;
  } catch (err) {
    showToast(`Device access failed: ${err.message}`, 'error');
    rejectIncomingCall();
    return;
  }

  dom.activeCallView.classList.remove('hidden');
  dom.callTypeBadge.textContent = `${callType} Call`;
  dom.callPeerName.textContent = `Call with ${callerName || fromPeer}`;
  dom.callStatusTimer.textContent = 'Connecting...';

  const pc = new RTCPeerConnection(RTC_CONFIG);
  state.call.pc = pc;

  state.call.localStream.getTracks().forEach(track => pc.addTrack(track, state.call.localStream));

  pc.ontrack = (event) => {
    if (callType === 'video') {
      dom.remoteVideo.srcObject = event.streams[0];
    } else {
      dom.remoteCallAudio.srcObject = event.streams[0];
      dom.remoteCallAudio.play().catch(console.warn);
    }
    dom.callStatusTimer.textContent = 'Connected (P2P Mesh)';
    startCallTimer();
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      apiCall('POST', {
        action: 'postSignal',
        fromPeer: state.userId,
        toPeer: fromPeer,
        type: 'CALL_ICE_CANDIDATE',
        payload: event.candidate
      }).catch(console.error);
    }
  };

  await pc.setRemoteDescription(new RTCSessionDescription(sdp));

  // Flush queued candidates
  while (state.call.candidateQueue.length > 0) {
    const cand = state.call.candidateQueue.shift();
    try {
      await pc.addIceCandidate(new RTCIceCandidate(cand));
    } catch (_) {}
  }

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await apiCall('POST', {
    action: 'postSignal',
    fromPeer: state.userId,
    toPeer: fromPeer,
    type: 'CALL_ANSWER',
    payload: answer
  });

  state.pendingIncomingCall = null;
}

function rejectIncomingCall() {
  if (state.pendingIncomingCall) {
    apiCall('POST', {
      action: 'postSignal',
      fromPeer: state.userId,
      toPeer: state.pendingIncomingCall.fromPeer,
      type: 'CALL_REJECT',
      payload: {}
    }).catch(console.error);
  }
  dom.incomingCallModal.classList.add('hidden');
  state.pendingIncomingCall = null;
}

/* ================= Real-Time Signal Dispatcher ================= */
async function pollIncomingSignals() {
  try {
    const res = await apiCall('GET', null, { action: 'getSignals', toPeer: state.userId });
    if (res.success && res.signals && res.signals.length > 0) {
      for (const sig of res.signals) {
        await processSignal(sig);
      }
    }

    // If Broadcaster in a Space, also poll room-level signals
    if (state.broadcast.role === 'BROADCASTER' && state.broadcast.activeRoomId) {
      const roomRes = await apiCall('GET', null, { action: 'getSignals', toPeer: state.broadcast.activeRoomId });
      if (roomRes.success && roomRes.signals) {
        for (const sig of roomRes.signals) {
          await processBroadcastSignal(sig);
        }
      }
    }
  } catch (err) {
    console.warn('Signaling poller warning:', err);
  }
}

async function processSignal(signal) {
  const { fromPeer, type, payload } = signal;

  // 1. Direct Calling Engine Signals
  if (type === 'CALL_OFFER') {
    if (state.call.active) {
      // Busy reject
      apiCall('POST', { action: 'postSignal', fromPeer: state.userId, toPeer: fromPeer, type: 'CALL_REJECT', payload: { reason: 'busy' } });
      return;
    }
    state.pendingIncomingCall = signal;
    dom.incomingCallerName.textContent = payload.callerName || fromPeer;
    dom.incomingCallType.textContent = `Incoming ${payload.callType} Call`;
    dom.incomingCallModal.classList.remove('hidden');
  } 
  else if (type === 'CALL_ANSWER') {
    if (state.call.pc) {
      await state.call.pc.setRemoteDescription(new RTCSessionDescription(payload));
      while (state.call.candidateQueue.length > 0) {
        const cand = state.call.candidateQueue.shift();
        try {
          await state.call.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (_) {}
      }
    }
  } 
  else if (type === 'CALL_ICE_CANDIDATE') {
    if (state.call.pc && state.call.pc.remoteDescription) {
      try {
        await state.call.pc.addIceCandidate(new RTCIceCandidate(payload));
      } catch (_) {}
    } else {
      state.call.candidateQueue.push(payload);
    }
  } 
  else if (type === 'CALL_REJECT' || type === 'CALL_HANGUP') {
    showToast('Call ended by peer', 'info');
    terminateActiveCall();
    dom.incomingCallModal.classList.add('hidden');
  }

  // 2. Direct DataChannel Chat Signals
  else if (type === 'DC_OFFER') {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    state.dataChannelPc = pc;
    state.dataChannelPeerId = fromPeer;

    pc.ondatachannel = (e) => {
      state.dataChannel = e.channel;
      setupDataChannelEvents(e.channel);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        apiCall('POST', {
          action: 'postSignal',
          fromPeer: state.userId,
          toPeer: fromPeer,
          type: 'DC_ICE_CANDIDATE',
          payload: e.candidate
        }).catch(console.error);
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(payload));
    while (state.dataChannelCandidateQueue.length > 0) {
      const c = state.dataChannelCandidateQueue.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (_) {}
    }

    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);

    await apiCall('POST', {
      action: 'postSignal',
      fromPeer: state.userId,
      toPeer: fromPeer,
      type: 'DC_ANSWER',
      payload: ans
    });
  } 
  else if (type === 'DC_ANSWER') {
    if (state.dataChannelPc) {
      await state.dataChannelPc.setRemoteDescription(new RTCSessionDescription(payload));
      while (state.dataChannelCandidateQueue.length > 0) {
        const c = state.dataChannelCandidateQueue.shift();
        try {
          await state.dataChannelPc.addIceCandidate(new RTCIceCandidate(c));
        } catch (_) {}
      }
    }
  } 
  else if (type === 'DC_ICE_CANDIDATE') {
    if (state.dataChannelPc && state.dataChannelPc.remoteDescription) {
      try {
        await state.dataChannelPc.addIceCandidate(new RTCIceCandidate(payload));
      } catch (_) {}
    } else {
      state.dataChannelCandidateQueue.push(payload);
    }
  }

  // 3. Space Listener Signals
  else if (type === 'SPACE_ANSWER' && state.broadcast.role === 'LISTENER') {
    if (state.broadcast.listenerPc) {
      await state.broadcast.listenerPc.setRemoteDescription(new RTCSessionDescription(payload));
      while (state.broadcast.listenerQueue.length > 0) {
        const c = state.broadcast.listenerQueue.shift();
        try {
          await state.broadcast.listenerPc.addIceCandidate(new RTCIceCandidate(c));
        } catch (_) {}
      }
    }
  }
}

/* ================= Broadcast Spaces Engine ================= */
async function handleStartBroadcast(e) {
  e.preventDefault();
  const title = dom.streamTitleInput.value.trim();
  const category = dom.streamCategoryInput.value;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    state.broadcast.localStream = stream;
    setupAudioAnalysis(stream);
  } catch (err) {
    showToast(`Microphone permission denied: ${err.message}`, 'error');
    return;
  }

  const roomId = 'room_' + Math.random().toString(36).substring(2, 9);
  state.broadcast.activeRoomId = roomId;
  state.broadcast.role = 'BROADCASTER';

  await apiCall('POST', {
    action: 'createBroadcast',
    roomId,
    broadcasterId: state.userId,
    title,
    category
  });

  dom.broadcastModal.classList.add('hidden');
  dom.broadcasterConsole.classList.remove('hidden');
  dom.broadcastTitleDisplay.textContent = title;
  showToast('Space is now live!', 'success');
}

function setupAudioAnalysis(stream) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  state.broadcast.audioContext = new AudioContext();
  state.broadcast.analyser = state.broadcast.audioContext.createAnalyser();
  state.broadcast.analyser.fftSize = 64;

  const source = state.broadcast.audioContext.createMediaStreamSource(stream);
  source.connect(state.broadcast.analyser);

  const canvas = dom.visualizerCanvas;
  const ctx = canvas.getContext('2d');
  const buffer = new Uint8Array(state.broadcast.analyser.frequencyBinCount);

  function draw() {
    state.broadcast.animationFrame = requestAnimationFrame(draw);
    state.broadcast.analyser.getByteFrequencyData(buffer);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barW = (canvas.width / buffer.length) * 2.2;
    let x = 0;
    for (let i = 0; i < buffer.length; i++) {
      const barH = (buffer[i] / 255) * canvas.height;
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(x, canvas.height - barH, barW - 2, barH);
      x += barW;
    }
  }
  draw();
}

async function processBroadcastSignal(signal) {
  const { fromPeer, type, payload } = signal;

  if (type === 'SPACE_OFFER' && state.broadcast.role === 'BROADCASTER') {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerEntry = { pc, queue: [] };
    state.broadcast.peers.set(fromPeer, peerEntry);

    state.broadcast.localStream.getTracks().forEach(track => {
      pc.addTrack(track, state.broadcast.localStream);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        apiCall('POST', {
          action: 'postSignal',
          fromPeer: state.broadcast.activeRoomId,
          toPeer: fromPeer,
          type: 'SPACE_ICE_CANDIDATE',
          payload: e.candidate
        }).catch(console.error);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        state.broadcast.peers.delete(fromPeer);
        dom.listenerCount.textContent = state.broadcast.peers.size;
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(payload));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await apiCall('POST', {
      action: 'postSignal',
      fromPeer: state.broadcast.activeRoomId,
      toPeer: fromPeer,
      type: 'SPACE_ANSWER',
      payload: answer
    });

    dom.listenerCount.textContent = state.broadcast.peers.size;
  }
}

async function joinBroadcastSpace(roomId, title) {
  if (state.broadcast.role !== 'IDLE' || state.call.active) {
    showToast('Finish your current call or space before joining another', 'error');
    return;
  }

  // Audio unlock
  dom.remoteBroadcastAudio.srcObject = null;
  dom.remoteBroadcastAudio.play().catch(() => {});

  state.broadcast.role = 'LISTENER';
  state.broadcast.activeRoomId = roomId;
  state.broadcast.listenerQueue = [];

  dom.listenerDeck.classList.remove('hidden');
  dom.listenerRoomTitle.textContent = title;
  dom.listenerPeerStatus.textContent = 'Connecting P2P Audio...';

  const pc = new RTCPeerConnection(RTC_CONFIG);
  state.broadcast.listenerPc = pc;

  pc.addTransceiver('audio', { direction: 'recvonly' });

  pc.ontrack = (event) => {
    dom.remoteBroadcastAudio.srcObject = event.streams[0];
    dom.remoteBroadcastAudio.play().catch(console.warn);
    dom.listenerPeerStatus.textContent = 'Connected (Audio Live)';
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      apiCall('POST', {
        action: 'postSignal',
        fromPeer: state.userId,
        toPeer: roomId,
        type: 'SPACE_ICE_CANDIDATE',
        payload: event.candidate
      }).catch(console.error);
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await apiCall('POST', {
    action: 'postSignal',
    fromPeer: state.userId,
    toPeer: roomId,
    type: 'SPACE_OFFER',
    payload: offer
  });
}

function toggleBroadcastMute() {
  if (!state.broadcast.localStream) return;
  state.broadcast.isMuted = !state.broadcast.isMuted;
  state.broadcast.localStream.getAudioTracks()[0].enabled = !state.broadcast.isMuted;
  dom.btnToggleBroadcastMic.classList.toggle('bg-rose-600', state.broadcast.isMuted);
  showToast(state.broadcast.isMuted ? 'Muted' : 'Microphone Live', 'info');
}

async function endBroadcastSpace() {
  if (confirm('End this broadcast space?')) {
    await apiCall('POST', { action: 'endBroadcast', roomId: state.broadcast.activeRoomId });
    state.broadcast.peers.forEach(({ pc }) => pc.close());
    state.broadcast.peers.clear();
    if (state.broadcast.localStream) state.broadcast.localStream.getTracks().forEach(t => t.stop());
    if (state.broadcast.animationFrame) cancelAnimationFrame(state.broadcast.animationFrame);
    if (state.broadcast.audioContext) state.broadcast.audioContext.close();

    state.broadcast.role = 'IDLE';
    state.broadcast.activeRoomId = null;
    dom.broadcasterConsole.classList.add('hidden');
    refreshBroadcastSpaces();
    showToast('Space ended', 'info');
  }
}

function leaveBroadcastSpace() {
  if (state.broadcast.listenerPc) {
    state.broadcast.listenerPc.close();
    state.broadcast.listenerPc = null;
  }
  dom.remoteBroadcastAudio.srcObject = null;
  dom.listenerDeck.classList.add('hidden');
  state.broadcast.role = 'IDLE';
  state.broadcast.activeRoomId = null;
  showToast('Left space', 'info');
}

async function refreshBroadcastSpaces() {
  try {
    const res = await apiCall('GET', null, { action: 'getActiveBroadcasts' });
    if (!res.success || !res.rooms) return;

    dom.roomsGrid.innerHTML = '';
    const activeRooms = res.rooms.filter(r => r.roomId !== state.broadcast.activeRoomId);

    activeRooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-4 flex justify-between items-center transition';
      card.innerHTML = `
        <div>
          <span class="text-[10px] font-bold uppercase bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">${escapeHtml(room.category || 'Space')}</span>
          <h4 class="text-sm font-bold text-white mt-1">${escapeHtml(room.title)}</h4>
          <p class="text-[11px] text-slate-500">Host: ${escapeHtml(room.broadcasterId)}</p>
        </div>
        <button class="bg-slate-800 hover:bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-xl transition flex items-center space-x-1.5">
          <i class="fa-solid fa-headphones"></i>
          <span>Tune In</span>
        </button>
      `;
      card.querySelector('button').addEventListener('click', () => joinBroadcastSpace(room.roomId, room.title));
      dom.roomsGrid.appendChild(card);
    });
  } catch (err) {
    console.warn('Spaces poll failed', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}