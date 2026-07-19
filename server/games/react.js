import { baseState, rank } from '../engine.js';

// 快速反应:屏幕出现目标色/词时抢拍,拍错扣分。spec.theme 决定文案,spec.rounds 轮数
export const meta = { id: 'react', name: '快速反应', minPlayers: 1, maxPlayers: 12 };

const COLORS = [
  { key: 'red', name: '红色', hex: '#ef4444' },
  { key: 'blue', name: '蓝色', hex: '#3b82f6' },
  { key: 'green', name: '绿色', hex: '#22c55e' },
  { key: 'yellow', name: '黄色', hex: '#eab308' },
];

function startRound(state, rng) {
  state.target = rng.pick(COLORS);
  state.shown = rng.pick(COLORS);
  // 60% 概率展示的就是目标(需要拍),否则不能拍
  if (rng.next() < 0.6) state.shown = state.target;
  state.hit = {};
  state.timer = 3;
  state.stage = 'show';
  state.ui = {
    view: 'react',
    title: `第 ${state.round}/${state.spec.rounds ?? 10} 轮`,
    instruction: `看到「${state.target.name}」就拍!`,
    shown: state.shown,
    match: state.shown.key === state.target.key,
    timer: state.timer,
    seq: state.round, // 客户端用于重置动画
  };
  return state;
}

export function init(spec, players, rng) {
  const state = baseState(players);
  state.spec = spec;
  return startRound(state, rng);
}

export function onAction(state, playerId, action) {
  if (state.phase !== 'playing' || state.stage !== 'show') return null;
  if (action.type !== 'tap' || state.hit[playerId] != null) return null;
  const correct = state.shown.key === state.target.key;
  state.hit[playerId] = correct;
  state.scores[playerId] += correct ? Math.max(8 - Object.keys(state.hit).length + 1, 3) : -5;
  const name = state.players.find((p) => p.id === playerId).name;
  state.ui.feed = [...(state.ui.feed || []), { name, correct }].slice(-6);
  return state;
}

export function onTick(state, rng) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  state.ui.timer = state.timer;
  if (state.timer > 0) return state;
  state.round++;
  if (state.round > (state.spec.rounds ?? 10)) {
    state.phase = 'ended';
    state.ui = { view: 'final', title: '游戏结束', scores: rank(state) };
    return state;
  }
  return startRound(state, rng);
}
