// 方块对战(俄罗斯方块):每人客户端本地 60fps 模拟自己的棋盘(同种子=同方块序列,公平),
// 服务端只裁决计分/存活/垃圾行分配;棋盘缩略图走 rt 通道中继给对手展示。
import { baseState, rank } from '../engine.js';

export const meta = { id: 'tetris', name: '方块对战', minPlayers: 1, maxPlayers: 8 };

const LINE_SCORE = [0, 10, 30, 60, 100];

function buildUi(state) {
  state.ui = {
    view: 'tetris',
    title: state.spec.title || '方块对战',
    timer: state.timer,
    seed: state.seed,
    alive: state.alive,
    lines: state.lines,
  };
  for (const p of state.players) state.privateUi[p.id] = { garbage: state.garbage[p.id] };
}

export function init(spec, players, rng) {
  const state = baseState(players);
  state.spec = spec;
  state.timer = Math.min(300, Math.max(60, spec.duration ?? 120));
  state.seed = rng.int(2 ** 31);
  state.alive = {}; state.lines = {}; state.garbage = {};
  for (const p of players) { state.alive[p.id] = true; state.lines[p.id] = 0; state.garbage[p.id] = 0; }
  buildUi(state);
  return state;
}

function endGame(state) {
  state.phase = 'ended';
  const alive = state.players.filter((p) => state.alive[p.id]);
  if (alive.length === 1 && state.players.length > 1) state.scores[alive[0].id] += 50; // 存活加成
  state.ui = { view: 'final', title: '游戏结束', scores: rank(state) };
}

export function onAction(state, playerId, action, rng) {
  if (state.phase !== 'playing' || !(playerId in state.scores) || !state.alive[playerId]) return null;

  if (action.type === 'clear') {
    const n = Math.min(4, Math.max(1, action.lines | 0));
    state.lines[playerId] += n;
    state.scores[playerId] += LINE_SCORE[n];
    // 消 2+ 行:给随机一名存活对手塞 n-1 行垃圾
    if (n >= 2) {
      const targets = state.players.filter((p) => p.id !== playerId && state.alive[p.id]);
      if (targets.length) {
        const t = rng.pick(targets);
        state.garbage[t.id] += n - 1;
        const name = state.players.find((p) => p.id === playerId).name;
        state.toast = `${name} 消了 ${n} 行,${t.name} 吃到 ${n - 1} 行垃圾!`;
      }
    }
    buildUi(state);
    return state;
  }

  if (action.type === 'dead') {
    state.alive[playerId] = false;
    const aliveCount = state.players.filter((p) => state.alive[p.id]).length;
    if (aliveCount <= (state.players.length > 1 ? 1 : 0)) { endGame(state); return state; }
    buildUi(state);
    return state;
  }
  return null;
}

export function onTick(state) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  if (state.timer <= 0) { endGame(state); return state; }
  buildUi(state);
  return state;
}

// 棋盘缩略图中继(高频,不进状态)
export function onRt(state, playerId, data) {
  if (!(playerId in state.scores)) return null;
  if (typeof data.board === 'string' && data.board.length <= 220) return { data: { board: data.board } };
  return null;
}
