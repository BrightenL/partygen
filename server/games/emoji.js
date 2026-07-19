import { baseState, rank } from '../engine.js';

// 表情猜词:spec.items = [{emoji, answer, hint?}]  全员抢答打字
export const meta = { id: 'emoji', name: '表情猜词', minPlayers: 1, maxPlayers: 12 };

const ROUND_TIME = 25;

function startRound(state) {
  const item = state.spec.items[state.iIndex];
  state.timer = ROUND_TIME;
  state.guessed = [];
  state.ui = {
    view: 'emoji',
    title: `第 ${state.iIndex + 1}/${state.spec.items.length} 题`,
    subtitle: state.spec.theme ? `主题:${state.spec.theme}` : '看表情,猜答案!',
    emoji: item.emoji,
    hint: item.hint || `${item.answer.length} 个字`,
    timer: state.timer,
    chat: [],
    guessed: [],
  };
  return state;
}

export function init(spec, players) {
  const state = baseState(players);
  state.spec = spec;
  state.iIndex = 0;
  state.stage = 'guessing';
  return startRound(state);
}

function endRound(state) {
  const item = state.spec.items[state.iIndex];
  state.stage = 'between';
  state.timer = 4;
  state.ui = {
    view: 'reveal',
    question: item.emoji,
    explain: `答案:${item.answer}`,
    scores: rank(state),
    timer: 4,
  };
  return state;
}

export function onAction(state, playerId, action) {
  if (state.phase !== 'playing' || state.stage !== 'guessing') return null;
  if (action.type !== 'guess' || state.guessed.includes(playerId)) return null;
  const item = state.spec.items[state.iIndex];
  const name = state.players.find((p) => p.id === playerId).name;
  const text = String(action.text || '').trim().slice(0, 30);
  if (text === item.answer) {
    state.guessed.push(playerId);
    state.scores[playerId] += Math.max(10 - (state.guessed.length - 1) * 2, 4);
    state.ui.guessed = state.guessed.map((id) => state.players.find((p) => p.id === id).name);
    state.ui.chat = [...(state.ui.chat || []), { name, text: '猜中了! 🎉', correct: true }].slice(-8);
    if (state.guessed.length >= state.players.length) return endRound(state);
  } else {
    state.ui.chat = [...(state.ui.chat || []), { name, text }].slice(-8);
  }
  return state;
}

export function onTick(state) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  state.ui.timer = state.timer;
  if (state.timer > 0) return state;
  if (state.stage === 'guessing') return endRound(state);
  state.iIndex++;
  if (state.iIndex >= state.spec.items.length) {
    state.phase = 'ended';
    state.ui = { view: 'final', title: '游戏结束', scores: rank(state) };
    return state;
  }
  state.stage = 'guessing';
  return startRound(state);
}
