// PartyGen 房间服务:HTTP 静态托管 + WebSocket 房间(定序广播、状态快照、掉线处理)
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import path from 'path';
import { GAMES } from './registry.js';
import { makeRng } from './engine.js';
import { generateGame, validateSpec } from './gen/generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const rooms = new Map(); // code -> Room

function roomCode() {
  let c;
  do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(c));
  return c;
}

function createRoom(hostName) {
  const code = roomCode();
  const room = {
    code,
    hostId: null,
    members: new Map(), // playerId -> {id, name, ws, online}
    game: null,         // { templateId, title, state, rng, seq }
    pendingSpec: null,  // 生成完等待房主开始
    seed: Math.floor(Math.random() * 2 ** 31),
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function membersView(room) {
  return [...room.members.values()].map((m) => ({
    id: m.id, name: m.name, online: m.online, isHost: m.id === room.hostId,
    voice: !!m.voice, mic: !!m.mic,
  }));
}

function send(ws, type, payload) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}

function broadcast(room, type, payload) {
  for (const m of room.members.values()) send(m.ws, type, payload);
}

// 广播游戏状态:公共 ui + 各自的 privateUi;toast 广播后清除
function broadcastState(room) {
  const g = room.game;
  if (!g) return;
  g.seq++;
  const s = g.state;
  const pub = {
    seq: g.seq, templateId: g.templateId, title: g.title,
    phase: s.phase, round: s.round, ui: s.ui, scores: s.scores,
    players: s.players, toast: s.toast || null,
  };
  for (const m of room.members.values()) {
    send(m.ws, 'game', { game: pub, you: s.privateUi?.[m.id] || null });
  }
  s.toast = null;
}

function startGame(room) {
  const { templateId, title, spec } = room.pendingSpec;
  const g = GAMES[templateId];
  const players = [...room.members.values()].filter((m) => m.online).map((m) => ({ id: m.id, name: m.name }));
  if (players.length < g.meta.minPlayers) {
    return { error: `「${g.meta.name}」至少需要 ${g.meta.minPlayers} 人(当前在线 ${players.length} 人)` };
  }
  const rng = makeRng(room.seed + Date.now() % 100000);
  room.game = { templateId, title, state: g.init(spec, players.slice(0, g.meta.maxPlayers), rng), rng, seq: 0 };
  broadcastState(room);
  return {};
}

// 每秒 tick 所有进行中的游戏
setInterval(() => {
  for (const room of rooms.values()) {
    const g = room.game;
    if (!g || g.state.phase === 'ended') continue;
    const next = GAMES[g.templateId].onTick(g.state, g.rng);
    if (next) { g.state = next; broadcastState(room); }
  }
  // 清理:2小时无人房间
  for (const [code, room] of rooms) {
    const anyOnline = [...room.members.values()].some((m) => m.online);
    if (!anyOnline && Date.now() - room.createdAt > 2 * 3600e3) rooms.delete(code);
  }
}, 1000);

// ---------- HTTP API ----------
app.post('/api/rooms', (req, res) => {
  const room = createRoom();
  res.json({ code: room.code });
});

app.post('/api/rooms/:code/generate', async (req, res) => {
  const room = rooms.get(req.params.code);
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const idea = String(req.body.idea || '').slice(0, 500);
  if (!idea.trim()) return res.status(400).json({ error: '请输入游戏想法' });
  broadcast(room, 'generating', { idea });
  try {
    const out = await generateGame(idea);
    const err = validateSpec(out.templateId, out.spec);
    if (err) return res.status(500).json({ error: `生成结果校验失败:${err}` });
    room.pendingSpec = out;
    broadcast(room, 'generated', {
      templateId: out.templateId, templateName: GAMES[out.templateId].meta.name,
      title: out.title, reason: out.reason, demo: !!out.demo,
      minPlayers: GAMES[out.templateId].meta.minPlayers,
    });
    res.json({ ok: true });
  } catch (e) {
    broadcast(room, 'generateFailed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ---------- WebSocket ----------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let room = null, me = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const r = rooms.get(String(msg.code));
      if (!r) return send(ws, 'error', { error: '房间不存在' });
      room = r;
      const pid = String(msg.playerId || Math.random().toString(36).slice(2, 10));
      const existing = room.members.get(pid);
      me = existing || { id: pid, name: String(msg.name || '玩家').slice(0, 12) };
      me.ws = ws; me.online = true;
      room.members.set(pid, me);
      if (!room.hostId) room.hostId = pid;
      send(ws, 'joined', { playerId: pid, code: room.code, isHost: pid === room.hostId });
      broadcast(room, 'members', { members: membersView(room) });
      if (room.pendingSpec && !room.game) {
        const out = room.pendingSpec;
        send(ws, 'generated', {
          templateId: out.templateId, templateName: GAMES[out.templateId].meta.name,
          title: out.title, reason: out.reason, demo: !!out.demo,
          minPlayers: GAMES[out.templateId].meta.minPlayers,
        });
      }
      if (room.game) { // 中途加入:发快照(以观战身份看当前局)
        const g = room.game;
        send(ws, 'game', {
          game: { seq: g.seq, templateId: g.templateId, title: g.title, phase: g.state.phase, ui: g.state.ui, scores: g.state.scores, players: g.state.players },
          you: g.state.privateUi?.[pid] || null,
        });
      }
      return;
    }

    if (!room || !me) return;

    if (msg.type === 'start') {
      if (me.id !== room.hostId || !room.pendingSpec) return;
      const { error } = startGame(room);
      if (error) send(ws, 'error', { error });
      return;
    }

    if (msg.type === 'action') {
      const g = room.game;
      if (!g || g.state.phase === 'ended') return;
      const next = GAMES[g.templateId].onAction(g.state, me.id, msg.action || {}, g.rng);
      if (next) { g.state = next; broadcastState(room); }
      return;
    }

    // 语音状态(是否开启语音、是否闭麦)→ 广播成员列表
    if (msg.type === 'voice') {
      me.voice = !!msg.on;
      me.mic = !!msg.mic;
      broadcast(room, 'members', { members: membersView(room) });
      return;
    }

    // WebRTC 信令转发:{to, data} → 目标成员收到 {from, data}
    if (msg.type === 'rtc') {
      const target = room.members.get(String(msg.to));
      if (target) send(target.ws, 'rtc', { from: me.id, data: msg.data });
      return;
    }

    if (msg.type === 'stopGame') {
      if (me.id !== room.hostId || !room.game) return;
      room.game = null;
      broadcast(room, 'gameStopped', {});
      return;
    }
  });

  ws.on('close', () => {
    if (!room || !me) return;
    me.online = false;
    me.voice = false;
    broadcast(room, 'members', { members: membersView(room) });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`PartyGen listening on http://localhost:${PORT}`);
  console.log(`AI generation: ${process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'enabled' : 'demo mode (built-in content)'}`);
});
