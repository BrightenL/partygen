import { baseState, rank } from '../engine.js';

// 词语接龙:spec.category 主题(如"成语""水果"),轮流输入,服务端只查重+计时,判定靠玩家投票质疑(语音场景简化:不质疑即通过)
export const meta = { id: 'chain', name: '词语接龙', minPlayers: 2, maxPlayers: 10 };

const TURN_TIME = 20;

function syncUi(state) {
  const cur = state.players.filter((p) => !state.out.includes(p.id))[state.turnIdx];
  state.ui = {
    view: 'chain',
    title: state.spec.title || '词语接龙',
    subtitle: state.spec.rule || `主题:${state.spec.category}。接不上或超时出局!`,
    current: cur.name,
    actionFor: cur.id,
    last: state.words[state.words.length - 1] || state.spec.startWord || null,
    words: state.words.slice(-8),
    timer: state.timer,
    aliveCount: state.players.length - state.out.length,
  };
}

export function init(spec, players) {
  const state = baseState(players);
  state.spec = spec;
  state.words = [];
  state.out = [];
  state.turnIdx = 0;
  state.timer = TURN_TIME;
  syncUi(state);
  return state;
}

function eliminate(state, pid) {
  state.out.push(pid);
  const name = state.players.find((p) => p.id === pid).name;
  state.toast = `${name} 出局!`;
  const alive = state.players.filter((p) => !state.out.includes(p.id));
  if (alive.length <= 1) {
    if (alive[0]) state.scores[alive[0].id] += 20;
    state.phase = 'ended';
    state.ui = {
      view: 'final',
      title: alive[0] ? `🏆 ${alive[0].name} 获胜!` : '游戏结束',
      scores: rank(state),
      words: state.words,
    };
    return state;
  }
  state.turnIdx = state.turnIdx % alive.length;
  state.timer = TURN_TIME;
  syncUi(state);
  return state;
}

export function onAction(state, playerId, action) {
  if (state.phase !== 'playing' || action.type !== 'word') return null;
  const alive = state.players.filter((p) => !state.out.includes(p.id));
  const cur = alive[state.turnIdx];
  if (cur.id !== playerId) return null;
  const w = String(action.word || '').trim().slice(0, 20);
  if (!w || state.words.includes(w)) return null;
  const last = state.words[state.words.length - 1] || state.spec.startWord;
  // 接龙规则:首字须等于上一词尾字(spec.strict=false 时不校验,交给语音裁判)
  if (state.spec.strict !== false && last && w[0] !== last[last.length - 1]) return null;
  state.words.push(w);
  state.scores[playerId] += 5;
  // 词数达到上限则按积分结算,避免"人人都接得上"的无限局
  if (state.words.length >= (state.spec.maxWords ?? 30)) {
    state.phase = 'ended';
    state.ui = { view: 'final', title: '接龙达到上限,按积分结算!', scores: rank(state), words: state.words };
    return state;
  }
  state.turnIdx = (state.turnIdx + 1) % alive.length;
  state.timer = TURN_TIME;
  syncUi(state);
  return state;
}

export function onTick(state) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  state.ui.timer = state.timer;
  if (state.timer > 0) return state;
  const alive = state.players.filter((p) => !state.out.includes(p.id));
  return eliminate(state, alive[state.turnIdx].id);
}
