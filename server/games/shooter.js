// 竞技场射击(FPS 玩法的 2D 顶视角版):虚拟摇杆移动 + 朝最近敌人射击,限时击杀赛。
// 位置/子弹走 rt 通道 10Hz 中继(客户端插值);命中由射击方客户端判定后上报,服务端限速防刷。
import { baseState, rank } from '../engine.js';

export const meta = { id: 'shooter', name: '竞技场射击', minPlayers: 2, maxPlayers: 8 };

function buildUi(state) {
  state.ui = {
    view: 'shooter',
    title: state.spec.title || '竞技场射击',
    timer: state.timer,
    seed: state.seed,
    kills: state.kills,
    theme: state.spec.theme || null, // { playerEmoji, arena } AI 可自定义
    feed: state.feed,
    lastKill: state.lastKill, // { victim, seq } 被击杀客户端据此重生
  };
}

export function init(spec, players, rng) {
  const state = baseState(players);
  state.spec = spec;
  state.timer = Math.min(300, Math.max(60, spec.duration ?? 120));
  state.seed = rng.int(2 ** 31);
  state.kills = {};
  state.lastHitAt = {}; // 命中限速:防止客户端刷分
  state.feed = [];
  state.lastKill = null;
  state.killSeq = 0;
  for (const p of players) state.kills[p.id] = 0;
  buildUi(state);
  return state;
}

export function onAction(state, playerId, action) {
  if (state.phase !== 'playing' || !(playerId in state.scores)) return null;
  if (action.type === 'kill') {
    const victim = String(action.target || '');
    if (!(victim in state.scores) || victim === playerId) return null;
    // 同一击杀者至少间隔 1 tick(客户端射速+重生远大于此,超频视为作弊丢弃)
    const now = state.tickCount || 0;
    const last = state.lastHitAt[playerId];
    if (last != null && now - last < 1) return null;
    state.lastHitAt[playerId] = now;
    state.kills[playerId]++;
    state.scores[playerId] += 10;
    const kn = state.players.find((p) => p.id === playerId).name;
    const vn = state.players.find((p) => p.id === victim).name;
    state.feed = [...(state.feed || []), `${kn} ⚔️ ${vn}`].slice(-4);
    state.lastKill = { victim, seq: ++state.killSeq };
    buildUi(state);
    return state;
  }
  return null;
}

export function onTick(state) {
  if (state.phase !== 'playing') return null;
  state.tickCount = (state.tickCount || 0) + 1;
  state.timer--;
  if (state.timer <= 0) {
    state.phase = 'ended';
    state.ui = { view: 'final', title: '游戏结束', scores: rank(state) };
    return state;
  }
  buildUi(state);
  return state;
}

// 位置与开火事件中继:{p:[x,y,angle,hp]} 或 {fire:[x,y,angle]}
export function onRt(state, playerId, data) {
  if (!(playerId in state.scores)) return null;
  if (Array.isArray(data.p) && data.p.length <= 4) return { data: { p: data.p.map(Number) } };
  if (Array.isArray(data.fire) && data.fire.length === 3) return { data: { fire: data.fire.map(Number) } };
  return null;
}
