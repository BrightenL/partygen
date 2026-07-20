// 合成大西瓜:每人本地物理模拟(重力+圆形碰撞+同级合并),限时积分赛。
// AI 生成主题合成链(emoji 从小到大),服务端只记分与排名;缩略状态走 rt 中继。
import { baseState, rank } from '../engine.js';

export const meta = { id: 'suika', name: '合成大西瓜', minPlayers: 1, maxPlayers: 8 };

const DEFAULT_CHAIN = ['🍒', '🍓', '🍇', '🍊', '🍎', '🍐', '🍑', '🍍', '🍈', '🍉'];

function buildUi(state) {
  state.ui = {
    view: 'suika',
    title: state.spec.title || '合成大西瓜',
    timer: state.timer,
    seed: state.seed,
    chain: state.chain,
    best: state.best, // playerId -> 达到的最高级
  };
}

export function init(spec, players, rng) {
  const state = baseState(players);
  state.spec = spec;
  const chain = Array.isArray(spec.chain) && spec.chain.length >= 6 ? spec.chain.slice(0, 11) : DEFAULT_CHAIN;
  state.chain = chain;
  state.timer = Math.min(300, Math.max(60, spec.duration ?? 120));
  state.seed = rng.int(2 ** 31);
  state.best = {};
  for (const p of players) state.best[p.id] = 0;
  buildUi(state);
  return state;
}

export function onAction(state, playerId, action) {
  if (state.phase !== 'playing' || !(playerId in state.scores)) return null;
  // 客户端上报一次合并:level 为合并后的等级(1 起),得分 = 等级平方
  if (action.type === 'merge') {
    const lv = Math.min(state.chain.length - 1, Math.max(1, action.level | 0));
    state.scores[playerId] += lv * lv;
    if (lv > state.best[playerId]) {
      state.best[playerId] = lv;
      if (lv >= state.chain.length - 1) {
        const name = state.players.find((p) => p.id === playerId).name;
        state.toast = `🎉 ${name} 合成了终极 ${state.chain[lv]}!`;
      }
    }
    buildUi(state);
    return state;
  }
  return null;
}

export function onTick(state) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  if (state.timer <= 0) {
    state.phase = 'ended';
    state.ui = { view: 'final', title: '游戏结束', scores: rank(state) };
    return state;
  }
  buildUi(state);
  return state;
}
