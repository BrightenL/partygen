// PartyGen 客户端主逻辑:房间连接、状态渲染、生成流程
(function () {
  const $ = (id) => document.getElementById(id);
  const screens = { lobby: $('screen-lobby'), room: $('screen-room'), game: $('screen-game') };
  // pg_pid 用 sessionStorage:每个标签页是独立玩家(localStorage 会让同浏览器多标签页互相顶号)
  let ws = null, meId = sessionStorage.getItem('pg_pid') || null, meName = '', isHost = false;
  let roomCode = '', lastSeq = 0;
  const ctx = { send: sendAction, sendRt, rerender: () => {}, meId: null, meName: '', strokes: [] };
  let lastGame = null, lastYou = null;

  function show(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg; t.classList.remove('hidden');
    window.sfx?.pop();
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), ms);
  }

  // ---------- 大厅 ----------
  $('nameInput').value = localStorage.getItem('pg_name') || '';
  const IDEAS = ['周杰伦歌曲猜歌大赛', '美食主题谁是卧底', '来玩俄罗斯方块', '合成大西瓜', 'FPS大乱斗', '拳皇擂台赛', '动漫你画我猜', '朋友互吐槽投票'];
  IDEAS.forEach((t) => {
    const c = document.createElement('span');
    c.className = 'chip'; c.textContent = t;
    c.onclick = () => { $('ideaInput').value = t; };
    $('ideaChips').append(c);
  });

  async function createRoom() {
    const res = await fetch('/api/rooms', { method: 'POST' });
    const { code } = await res.json();
    join(code);
  }

  function join(code) {
    meName = $('nameInput').value.trim() || '玩家' + Math.floor(Math.random() * 99);
    localStorage.setItem('pg_name', meName);
    roomCode = code;
    connect();
  }

  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn, .opt, .ctrl-btn, .lib-item, .chip');
    if (!btn) return;
    window.sfx?.tap();
    const dot = document.createElement('span');
    dot.className = 'ripple-dot';
    const r = btn.getBoundingClientRect();
    dot.style.left = (e.clientX - r.left) + 'px';
    dot.style.top  = (e.clientY - r.top)  + 'px';
    btn.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove());
  }, { passive: true });

  $('btnCreate').onclick = createRoom;
  $('btnJoin').onclick = () => {
    const code = $('codeInput').value.trim();
    if (code.length === 4) join(code); else toast('请输入 4 位房间号');
  };

  // ---------- WebSocket ----------
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', code: roomCode, name: meName, playerId: meId }));
    ws.onmessage = (e) => handle(JSON.parse(e.data));
    ws.onclose = () => setTimeout(() => { if (roomCode) connect(); }, 1500);
  }

  function sendAction(action) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'action', action }));
  }

  function sendRt(data) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'rt', data }));
  }

  function handle(msg) {
    if (msg.type === 'error') return toast(msg.error);
    if (msg.type === 'rtc') return window.PartyVoice.onSignal(msg.from, msg.data);
    if (msg.type === 'joined') {
      meId = msg.playerId; ctx.meId = meId; ctx.meName = meName;
      sessionStorage.setItem('pg_pid', meId);
      isHost = msg.isHost;
      $('roomCode').textContent = msg.code;
      $('hostGen').classList.toggle('hidden', !isHost);
      $('guestWait').classList.toggle('hidden', isHost);
      show('room');
      history.replaceState(null, '', `?room=${msg.code}`);
      initVoice();
      loadLibrary();
      return;
    }
    if (msg.type === 'members') {
      window.PartyVoice.sync(msg.members);
      return renderSeats(msg.members);
    }
    if (msg.type === 'generating') {
      $('genStatus').classList.remove('hidden');
      $('genResult').classList.add('hidden');
      $('guestWait').classList.add('hidden');
      $('genStatusText').textContent = `AI 正在设计:「${msg.idea}」…`;
      return;
    }
    if (msg.type === 'generated') {
      $('genStatus').classList.add('hidden');
      $('genResult').classList.remove('hidden');
      $('guestWait').classList.add('hidden');
      $('genTemplate').textContent = `🎮 ${msg.templateName}${msg.demo ? ' · 演示内容' : ' · AI 生成'}`;
      $('genTitle').textContent = msg.title;
      $('genReason').textContent = msg.reason || '';
      $('btnStart').classList.toggle('hidden', !isHost);
      show('room');
      return;
    }
    if (msg.type === 'generateFailed') {
      $('genStatus').classList.add('hidden');
      toast('生成失败:' + msg.error);
      return;
    }
    if (msg.type === 'gameStopped') {
      lastGame = null; lastView = null;
      if (ctx.onDestroy) { try { ctx.onDestroy(); } catch {} }
      ctx.onDestroy = null; ctx.onUpdate = null; ctx.onRt = null;
      show('room'); return;
    }
    if (msg.type === 'rt') { if (ctx.onRt) ctx.onRt(msg.from, msg.data); return; }
    if (msg.type === 'game') return renderGame(msg.game, msg.you);
  }

  // ---------- 房间渲染 ----------
  function renderSeats(members) {
    const wrap = $('seats');
    wrap.innerHTML = '';
    const slots = Math.max(8, members.length);
    for (let i = 0; i < slots; i++) {
      const m = members[i];
      const seat = document.createElement('div');
      if (m) {
        seat.className = 'seat' + (m.isHost ? ' host' : '') + (m.online ? '' : ' offline');
        const mic = m.voice ? `<span class="mic${m.mic ? '' : ' muted-mic'}">${m.mic ? '🎙️' : '🔇'}</span>` : '';
        seat.innerHTML = `<div class="avatar">${escapeHtml(m.name[0] || '?')}${mic}</div><div class="seat-name">${escapeHtml(m.name)}</div>`;
      } else {
        seat.className = 'seat empty';
        seat.innerHTML = `<div class="avatar">+</div><div class="seat-name">空位</div>`;
      }
      wrap.append(seat);
    }
  }

  // ---------- 语音 ----------
  const V = window.PartyVoice;
  function sendVoiceState() {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'voice', on: V.enabled, mic: V.micOn }));
  }
  function initVoice() {
    V.init({
      myId: meId,
      sendSignal: (to, data) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'rtc', to, data })); },
      onStateChange: renderVoiceBtns,
    });
    renderVoiceBtns();
  }
  function renderVoiceBtns() {
    ['btnVoice', 'btnVoiceGame'].forEach((id) => {
      const b = $(id);
      if (!b) return;
      if (!V.supported) { b.classList.add('hidden'); return; }
      b.classList.remove('hidden');
      if (!V.enabled) { b.textContent = '🎧 开语音'; b.classList.remove('on', 'off-mic'); }
      else if (V.micOn) { b.textContent = '🎙️ 语音中'; b.classList.add('on'); b.classList.remove('off-mic'); }
      else { b.textContent = '🔇 已闭麦'; b.classList.add('on', 'off-mic'); }
    });
  }
  let voiceHoldFired = false;
  async function onVoiceBtn() {
    if (voiceHoldFired) { voiceHoldFired = false; return; } // 长按已处理,吞掉随后的 click
    if (!V.enabled) {
      const r = await V.enable();
      if (r !== true) return toast(r.error);
      toast('语音已开启,轻点可闭麦/开麦,长按关闭语音');
    } else {
      V.toggleMic();
    }
    sendVoiceState();
  }
  function onVoiceHold(id) { // 长按关闭语音
    const b = $(id);
    if (!b) return;
    let t = null;
    b.addEventListener('pointerdown', () => {
      t = setTimeout(() => {
        t = null; voiceHoldFired = true;
        if (V.enabled) { V.disable(); sendVoiceState(); toast('语音已关闭'); }
      }, 700);
    });
    ['pointerup', 'pointerleave'].forEach((ev) => b.addEventListener(ev, () => {
      if (t) { clearTimeout(t); t = null; }
    }));
  }
  $('btnVoice').onclick = onVoiceBtn;
  $('btnVoiceGame').onclick = onVoiceBtn;
  onVoiceHold('btnVoice');
  onVoiceHold('btnVoiceGame');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 生成 ----------
  $('btnGenerate').onclick = async () => {
    const idea = $('ideaInput').value.trim();
    if (!idea) return toast('先描述一下想玩什么~');
    $('btnGenerate').disabled = true;
    try {
      const res = await fetch(`/api/rooms/${roomCode}/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idea }),
      });
      if (!res.ok) toast((await res.json()).error || '生成失败');
    } finally { $('btnGenerate').disabled = false; }
  };

  // ---------- 热门游戏库 ----------
  async function loadLibrary() {
    if (!isHost) return;
    try {
      const { items } = await (await fetch('/api/library')).json();
      const sec = $('libSection'), list = $('libList');
      if (!items || !items.length) return sec.classList.add('hidden');
      sec.classList.remove('hidden');
      list.innerHTML = '';
      items.forEach((it) => {
        const el = document.createElement('button');
        el.className = 'lib-item';
        el.innerHTML = `<span class="lib-title">${escapeHtml(it.title)}</span><span class="lib-meta">${it.plays > 0 ? `🔥${it.plays} · ` : ''}${escapeHtml(it.idea)}</span>`;
        el.onclick = async () => {
          const res = await fetch(`/api/rooms/${roomCode}/pick`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: it.id }),
          });
          if (!res.ok) toast((await res.json()).error || '选择失败');
        };
        list.append(el);
      });
    } catch { /* 库不可用不影响主流程 */ }
  }

  $('btnStart').onclick = () => ws.send(JSON.stringify({ type: 'start' }));
  $('btnStop').onclick = () => ws.send(JSON.stringify({ type: 'stopGame' }));
  $('btnShare').onclick = async () => {
    const url = `${location.origin}?room=${roomCode}`;
    try { await navigator.clipboard.writeText(`来我的 PartyGen 房间玩游戏!房间号 ${roomCode}\n${url}`); toast('邀请已复制'); }
    catch { toast(`房间号 ${roomCode}`); }
  };

  // ---------- 游戏渲染 ----------
  let lastGameId = null;
  function renderGame(game, you) {
    // 新一局:重置定序与视图状态(否则上一局的 seq 会把新局的低 seq 状态全部当旧包丢弃)
    if (game.gameId !== lastGameId) {
      lastGameId = game.gameId;
      lastSeq = 0; lastView = null; lastViewSeq = null; lastViewTitle = null; lastClear = 0;
      lastGame = null;
      if (ctx.onDestroy) { try { ctx.onDestroy(); } catch {} }
      ctx.onDestroy = null; ctx.onUpdate = null; ctx.onRt = null;
      window.sfx?.start();
    }
    if (game.seq && game.seq <= lastSeq) return;
    lastSeq = game.seq || 0;

    // 增量笔画:同一局 draw 视图下只补画,不整页重绘
    const ui = game.ui || {};
    const isSameDrawView = lastGame && ui.view === 'draw' && lastGame.ui?.view === 'draw'
      && lastGame.ui.drawerId === ui.drawerId && lastGame.ui.timer !== undefined;
    lastGame = game; lastYou = you;
    window.__pgPlayers = game.players || [];
    show('game');
    $('gameTitle').textContent = game.title || '';
    $('btnStop').classList.toggle('hidden', !isHost);

    const timerEl = $('gameTimer');
    timerEl.textContent = ui.timer != null && ui.timer >= 0 ? ui.timer : '';
    const isLow = ui.timer != null && ui.timer <= 5;
    timerEl.classList.toggle('low', isLow);
    if (isLow && ui.timer > 0) window.sfx?.countdown();

    if (game.toast) toast(game.toast);

    // 私有信息条(你的词/你来画)
    const pb = $('privateBar');
    if (you && (you.word || you.hint)) {
      pb.classList.remove('hidden');
      pb.innerHTML = `${escapeHtml(you.hint || '')} <b>${escapeHtml(you.word || '')}</b>`;
    } else pb.classList.add('hidden');

    // 计分条
    const sb = $('scorebar');
    sb.innerHTML = '';
    (game.players || []).forEach((p) => {
      const el = document.createElement('span');
      el.className = 'sc';
      el.innerHTML = `${escapeHtml(p.name)} <b>${game.scores?.[p.id] ?? 0}</b>`;
      sb.append(el);
    });

    if (isSameDrawView) {
      // 只处理增量:新笔画 / 清空
      if (ui.clear !== lastClear) { ctx.onClear && ctx.onClear(); ctx.strokes = []; lastClear = ui.clear; }
      if (ui.lastStroke && ctx.onStroke) { ctx.strokes.push(ui.lastStroke); ctx.onStroke(ui.lastStroke); }
      // 聊天/计时更新仍需重绘文本区,简化处理:每 tick 不重建 canvas,聊天区下轮重建
      return;
    }

    // 实时类视图(自带渲染循环):同视图的后续状态走 onUpdate 增量更新,不重建 DOM
    if (lastView === ui.view && ctx.onUpdate) { ctx.lastUi = ui; ctx.onUpdate(ui, you); return; }

    // 全量渲染
    const view = ui.view;
    const root = $('gameView');
    // 销毁上一个实时视图的渲染循环/处理器
    if (ctx.onDestroy) { try { ctx.onDestroy(); } catch {} }
    ctx.onDestroy = null; ctx.onUpdate = null; ctx.onRt = null;
    root.innerHTML = '';
    // 视图切换时重置一次性状态
    if (!lastView || lastView !== view || ui.seq !== lastViewSeq || ui.title !== lastViewTitle) {
      ctx.myChoice = null; ctx.myVote = null;
    }
    lastView = view; lastViewSeq = ui.seq; lastViewTitle = ui.title;
    ctx.you = you;
    ctx.strokes = view === 'draw' ? collectStrokes(ui) : [];
    ctx.lastUi = ui;
    ctx.rerender = () => {
      const v = (ctx.lastUi || ui).view;
      const r = window.GameRenderers[v];
      if (!r) return;
      if (ctx.onDestroy) { try { ctx.onDestroy(); } catch {} }
      ctx.onDestroy = null; ctx.onUpdate = null; ctx.onRt = null;
      root.innerHTML = '';
      r(ctx.lastUi || ui, ctx, root);
    };
    const renderer = window.GameRenderers[view];
    if (renderer) renderer(ui, ctx, root);
    else root.innerHTML = `<p class="g-sub">加载中…</p>`;
  }
  let lastView = null, lastViewSeq = null, lastViewTitle = null, lastClear = 0;
  function collectStrokes(ui) { return ctx.strokes || []; }

  // URL 直达房间
  const params = new URLSearchParams(location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    $('codeInput').value = roomParam;
    if (localStorage.getItem('pg_name')) join(roomParam);
  }
})();
