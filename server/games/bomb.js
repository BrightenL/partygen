import { baseState, rank } from '../engine.js';

// 数字炸弹:1-100 之间藏一个炸弹数字,轮流猜,范围收缩,猜中者受罚(-分),其余+分
export const meta = { id: 'bomb', name: '数字炸弹', minPlayers: 2, maxPlayers: 12 };

const TURN_TIME = 15;

function startRound(state, rng) {
  state.low = 1;
  state.high = 100;
  state.bomb = 1 + rng.int(100);
  state.timer = TURN_TIME;
  syncUi(state);
  return state;
}

function syncUi(state) {
  const cur = state.players[state.turnIdx % state.players.length];
  state.ui = {
    view: 'bomb',
    title: `第 ${state.round}/${state.spec.rounds ?? 3} 轮`,
    subtitle: `炸弹藏在 ${state.low} ~ ${state.high} 之间`,
    low: state.low,
    high: state.high,
    current: cur.name,
    actionFor: cur.id,
    timer: state.timer,
    history: state.history || [],
  };
}

export function init(spec, players, rng) {
  const state = baseState(players);
  state.spec = spec;
  state.turnIdx = 0;
  state.history = [];
  return startRound(state, rng);
}

function boom(state, pid, rng) {
  const name = state.players.find((p) => p.id === pid).name;
  for (const p of state.players) state.scores[p.id] += p.id === pid ? 0 : 5;
  state.toast = `💥 ${name} 踩中炸弹 ${state.bomb}!${state.spec.penalty || '接受语音惩罚吧'}`;
  state.round++;
  state.history = [];
  if (state.round > (state.spec.rounds ?? 3)) {
    state.phase = 'ended';
    state.ui = { view: 'final', title: '游戏结束', subtitle: state.toast, scores: rank(state) };
    return state;
  }
  state.turnIdx++;
  return startRound(state, rng);
}

export function onAction(state, playerId, action, rng) {
  if (state.phase !== 'playing' || action.type !== 'guess') return null;
  const cur = state.players[state.turnIdx % state.players.length];
  if (cur.id !== playerId) return null;
  const n = Math.floor(Number(action.n));
  if (!(n >= state.low && n <= state.high)) return null;
  if (n === state.bomb) return boom(state, playerId, rng);
  if (n < state.bomb) state.low = n + 1; else state.high = n - 1;
  state.history = [...state.history, { name: cur.name, n }].slice(-6);
  if (state.low === state.high) {
    // 只剩一个数,下一位必踩
    state.turnIdx++;
    const next = state.players[state.turnIdx % state.players.length];
    return boom(state, next.id, rng);
  }
  state.turnIdx++;
  state.timer = TURN_TIME;
  syncUi(state);
  return state;
}

export function onTick(state, rng) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  state.ui.timer = state.timer;
  if (state.timer > 0) return state;
  // 超时:自动替当前玩家猜中间值
  const cur = state.players[state.turnIdx % state.players.length];
  const mid = Math.floor((state.low + state.high) / 2);
  return onAction(state, cur.id, { type: 'guess', n: mid }, rng) || state;
}
