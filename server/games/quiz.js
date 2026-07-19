import { baseState, rank } from '../engine.js';

// 抢答问答:spec.questions = [{q, options:[4], answer:0..3, explain?}]
export const meta = { id: 'quiz', name: '抢答问答', minPlayers: 1, maxPlayers: 12 };

const QUESTION_TIME = 15;

function startQuestion(state) {
  const q = state.spec.questions[state.qIndex];
  state.timer = QUESTION_TIME;
  state.answered = {};
  state.reveal = false;
  state.ui = {
    view: 'question',
    title: `第 ${state.qIndex + 1}/${state.spec.questions.length} 题`,
    question: q.q,
    options: q.options,
    timer: state.timer,
  };
  return state;
}

export function init(spec, players) {
  const state = baseState(players);
  state.spec = spec;
  state.qIndex = 0;
  return startQuestion(state);
}

function finishQuestion(state) {
  const q = state.spec.questions[state.qIndex];
  state.reveal = true;
  // 按答对顺序计分:先答对得分高
  const correct = Object.entries(state.answered)
    .filter(([, a]) => a.choice === q.answer)
    .sort((x, y) => x[1].order - y[1].order);
  correct.forEach(([pid], i) => {
    state.scores[pid] += Math.max(10 - i * 2, 4);
  });
  state.ui = {
    view: 'reveal',
    question: q.q,
    options: q.options,
    answer: q.answer,
    explain: q.explain || null,
    scores: rank(state),
    timer: 4,
  };
  state.timer = 4;
  return state;
}

export function onAction(state, playerId, action) {
  if (state.phase !== 'playing' || state.reveal) return null;
  if (action.type !== 'answer') return null;
  if (state.answered[playerId] != null) return null;
  state.answered[playerId] = { choice: action.choice, order: Object.keys(state.answered).length };
  state.ui.answeredCount = Object.keys(state.answered).length;
  if (Object.keys(state.answered).length >= state.players.length) return finishQuestion(state);
  return state;
}

export function onTick(state) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  if (!state.reveal) {
    state.ui.timer = state.timer;
    if (state.timer <= 0) return finishQuestion(state);
    return state;
  }
  if (state.timer <= 0) {
    state.qIndex++;
    if (state.qIndex >= state.spec.questions.length) {
      state.phase = 'ended';
      state.ui = { view: 'final', title: '游戏结束', scores: rank(state) };
      return state;
    }
    return startQuestion(state);
  }
  return state;
}
