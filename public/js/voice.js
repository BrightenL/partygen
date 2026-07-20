// PartyGen 语音层:浏览器 WebRTC 全网状连麦,信令走房间 WebSocket({type:'rtc', to, data})
// 连接规则:双方都开语音时,playerId 字典序大的一方发 offer(确定性,避免双向撞车)
(function () {
  const peers = new Map(); // peerId -> { pc, audio }
  let localStream = null;
  let myId = null;
  let enabled = false;
  let micOn = true;
  let sendSignal = null;   // (to, data) => void
  let onStateChange = null; // () => void  通知 UI 刷新

  const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  async function enable() {
    if (enabled) return true;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      return { error: location.protocol === 'http:' && location.hostname !== 'localhost'
        ? '语音需要 HTTPS(或 localhost)才能使用麦克风'
        : '无法访问麦克风:' + e.message };
    }
    enabled = true;
    micOn = true;
    onStateChange && onStateChange();
    return true;
  }

  function disable() {
    enabled = false;
    for (const [id] of peers) closePeer(id);
    if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
    onStateChange && onStateChange();
  }

  function toggleMic() {
    micOn = !micOn;
    if (localStream) localStream.getAudioTracks().forEach((t) => { t.enabled = micOn; });
    onStateChange && onStateChange();
    return micOn;
  }

  function closePeer(id) {
    const p = peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch {}
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    peers.delete(id);
  }

  function makePeer(peerId) {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    document.body.append(audio);
    const p = { pc, audio };
    peers.set(peerId, p);

    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    pc.ontrack = (e) => { audio.srcObject = e.streams[0]; audio.play().catch(() => {}); };
    pc.onicecandidate = (e) => { if (e.candidate) sendSignal(peerId, { candidate: e.candidate }); };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePeer(peerId);
    };
    return p;
  }

  // 成员列表更新时调用:与所有「也开了语音」的成员建立/清理连接
  function sync(members) {
    if (!enabled || !localStream) return;
    const voiceIds = new Set(members.filter((m) => m.voice && m.online && m.id !== myId).map((m) => m.id));
    for (const [id] of peers) if (!voiceIds.has(id)) closePeer(id);
    for (const id of voiceIds) {
      if (peers.has(id)) continue;
      if (myId > id) { // 字典序大的发起
        const p = makePeer(id);
        p.pc.createOffer().then((offer) => p.pc.setLocalDescription(offer))
          .then(() => sendSignal(id, { sdp: p.pc.localDescription }))
          .catch(() => closePeer(id));
      }
    }
  }

  // 收到对端信令
  async function onSignal(from, data) {
    if (!enabled || !localStream) return;
    let p = peers.get(from);
    try {
      if (data.sdp) {
        if (data.sdp.type === 'offer') {
          if (p) closePeer(from); // 对端重新发起,重建
          p = makePeer(from);
          await p.pc.setRemoteDescription(data.sdp);
          const answer = await p.pc.createAnswer();
          await p.pc.setLocalDescription(answer);
          sendSignal(from, { sdp: p.pc.localDescription });
        } else if (data.sdp.type === 'answer' && p) {
          await p.pc.setRemoteDescription(data.sdp);
        }
      } else if (data.candidate && p) {
        await p.pc.addIceCandidate(data.candidate).catch(() => {});
      }
    } catch { closePeer(from); }
  }

  window.PartyVoice = {
    init(opts) { myId = opts.myId; sendSignal = opts.sendSignal; onStateChange = opts.onStateChange; },
    enable, disable, toggleMic, sync, onSignal,
    get enabled() { return enabled; },
    get micOn() { return micOn; },
    get peerCount() { return peers.size; },
    supported: !!(navigator.mediaDevices && window.RTCPeerConnection),
  };
})();
