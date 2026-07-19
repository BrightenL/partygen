import { baseState, rank } from '../engine.js';

// 你画我猜:spec.words = ["苹果", ...]  画家在 canvas 画,其他人打字猜
export const meta = { id: 'draw', name: '你画我猜', minPlayers: 2, maxPlayers: 10 };

const ROUND_TIME = 60;

function startRound(state, rng) {
  const drawer = state.players[state.drawerIdx % state.players.length];
  state.word = rng.pick(state.spec.words.filter((w) => !state.usedWords.includes(w))
    .concat(state.spec.words)); // 词用尽时允许重复
  state.usedWords.push(state.word);
  state.timer = ROUND_TIME;
  state.guessed = [];
  state.strokes = [];
  state.privateUi = { [drawer.id]: { word: state.word, hint: '你来画!别把字写出来' } };
  state.ui = {
    view: 'draw',
    title: `第 ${state.round}/${state.spec.rounds ?? state.players.length} 轮`,
    drawerId: drawer.id,
    drawerName: drawer.name,
    wordLen: state.word.length,
    timer: state.timer,
    guessed: [],
    chat: [],
  };
  return state;
}

function endRound(state, reveal) {
  state.ui = {
    view: 'roundEnd',
    title: reveal ? `答案是「${state.word}」` : `全员猜中!答案是「${state.word}」`,
    scores: rank(state),
    timer: 4,
  };
  state.stage = 'between';
  state.timer = 4;
  state.privateUi = {};
  return state;
}

export function init(spec, players, rng) {
  const state = baseState(players);
  state.spec = spec;
  state.drawerIdx = 0;
  state.usedWords = [];
  state.stage = 'drawing';
  return startRound(state, rng);
}

export function onAction(state, playerId, action) {
  if (state.phase !== 'playing') return null;
  const drawer = state.players[state.drawerIdx % state.players.length];
  if (action.type === 'stroke' && playerId === drawer.id && state.stage === 'drawing') {
    // 笔画广播:points 数组已在服务端限流,直接透传
    state.strokes.push(action.stroke);
    if (state.strokes.length > 500) state.strokes.shift();
    state.ui.lastStroke = action.stroke;
    return state;
  }
  if (action.type === 'clear' && playerId === drawer.id) {
    state.strokes = [];
    state.ui.clear = (state.ui.clear || 0) + 1;
    return state;
  }
  if (action.type === 'guess' && state.stage === 'drawing') {
    if (playerId === drawer.id || state.guessed.includes(playerId)) return null;
    const name = state.players.find((p) => p.id === playerId).name;
    const text = String(action.text || '').slice(0, 30);
    if (text.trim() === state.word) {
      state.guessed.push(playerId);
      state.scores[playerId] += Math.max(10 - (state.guessed.length - 1) * 2, 4);
      state.scores[drawer.id] += 3;
      state.ui.guessed = state.guessed.map((id) => state.players.find((p) => p.id === id).name);
      state.ui.chat = [...(state.ui.chat || []), { name, text: '猜中了! 🎉', correct: true }].slice(-8);
      if (state.guessed.length >= state.players.length - 1) return endRound(state, false);
    } else {
      state.ui.chat = [...(state.ui.chat || []), { name, text }].slice(-8);
    }
    return state;
  }
  return null;
}

export function onTick(state, rng) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  state.ui.timer = state.timer;
  if (state.timer > 0) return state;
  if (state.stage === 'drawing') return endRound(state, true);
  // between → 下一轮或结束
  state.round++;
  state.drawerIdx++;
  const total = state.spec.rounds ?? state.players.length;
  if (state.round > total) {
    state.phase = 'ended';
    state.ui = { view: 'final', title: '游戏结束', scores: rank(state) };
    return state;
  }
  state.stage = 'drawing';
  return startRound(state, rng);
}
