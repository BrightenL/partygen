// 格斗对战(拳皇式 1v1 擂台):两人对打其余观战,胜者守擂,轮流上台挑战。
// 动作/位置走 rt 中继;伤害由攻击方上报,服务端持有血量权威 + 限速防刷,回合限时防僵局。
import { baseState, rank } from '../engine.js';

export const meta = { id: 'fight', name: '格斗对战', minPlayers: 2, maxPlayers: 8 };

const ROUND_SEC = 60;
const MAX_HP = 100;

function fighterView(state, id) {
  const p = state.players.find((x) => x.id === id);
  return { id, name: p ? p.name : '?', hp: state.hp[id] ?? MAX_HP };
}

function buildUi(state) {
  state.ui = {
    view: 'fight',
    title: state.spec.title || '格斗对战',
    timer: state.roundTimer,
    seed: state.seed,
    a: fighterView(state, state.duel[0]),
    b: fighterView(state, state.duel[1]),
    queue: state.queue.map((id) => state.players.find((p) => p.id === id)?.name || '?'),
    round: state.round,
    theme: state.spec.theme || null, // AI 生成:{ fighters: [{emoji,name}...], moves: {punch,kick,block} 招式名 }
    feed: state.feed,
  };
}

function startDuel(state, a, b) {
  state.duel = [a, b];
  state.hp = { [a]: MAX_HP, [b]: MAX_HP };
  state.roundTimer = state.spec.roundSec ?? ROUND_SEC;
  state.lastHitAt = {};
  const an = state.players.find((p) => p.id === a).name;
  const bn = state.players.find((p) => p.id === b).name;
  state.toast = `⚔️ 第 ${state.round} 场:${an} VS ${bn}`;
  buildUi(state);
}

function finishDuel(state, winnerId, note) {
  const loserId = state.duel[0] === winnerId ? state.duel[1] : state.duel[0];
  state.scores[winnerId] += 20;
  const wn = state.players.find((p) => p.id === winnerId).name;
  state.feed = [...(state.feed || []), `第${state.round}场 🏆 ${wn}${note ? `(${note})` : ''}`].slice(-5);
  state.round++;
  state.queue.push(loserId);
  const challenger = state.queue.shift();
  const maxRounds = state.spec.rounds ?? 6;
  if (state.round > maxRounds) {
    state.phase = 'ended';
    state.ui = { view: 'final', title: '游戏结束', scores: rank(state) };
    return;
  }
  startDuel(state, winnerId, challenger);
}

export function init(spec, players, rng) {
  const state = baseState(players);
  state.spec = spec;
  state.seed = rng.int(2 ** 31);
  state.feed = [];
  const order = rng.shuffle(players.map((p) => p.id));
  state.queue = order.slice(2);
  state.round = 1;
  startDuel(state, order[0], order[1]);
  return state;
}

export function onAction(state, playerId, action) {
  if (state.phase !== 'playing') return null;
  // 命中上报:只有台上双方能打;限速 ≥0.4s/次(tick 粒度校验为同 tick 内最多 2 次)
  if (action.type === 'hit') {
    if (!state.duel.includes(playerId)) return null;
    const target = state.duel[0] === playerId ? state.duel[1] : state.duel[0];
    const now = state.tickCount || 0;
    const rec = state.lastHitAt[playerId] || { tick: -1, n: 0 };
    if (rec.tick === now && rec.n >= 2) return null;
    state.lastHitAt[playerId] = rec.tick === now ? { tick: now, n: rec.n + 1 } : { tick: now, n: 1 };
    const dmg = Math.min(15, Math.max(1, action.dmg | 0));
    state.hp[target] = Math.max(0, state.hp[target] - dmg);
    if (state.hp[target] <= 0) { finishDuel(state, playerId, 'KO'); return state; }
    buildUi(state);
    return state;
  }
  return null;
}

export function onTick(state) {
  if (state.phase !== 'playing') return null;
  state.tickCount = (state.tickCount || 0) + 1;
  state.roundTimer--;
  if (state.roundTimer <= 0) {
    // 时间到:血多者胜,平血则守擂者(duel[0])胜
    const [a, b] = state.duel;
    finishDuel(state, state.hp[a] >= state.hp[b] ? a : b, '时间到');
    return state;
  }
  buildUi(state);
  return state;
}

// 台上双方的位置/招式中继:{f:[x,facing,pose]} pose: idle|walk|punch|kick|block|hurt
export function onRt(state, playerId, data) {
  if (!state.duel.includes(playerId)) return null;
  if (Array.isArray(data.f) && data.f.length <= 3) return { data: { f: data.f } };
  return null;
}
