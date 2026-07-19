import { baseState, rank } from '../engine.js';

// 真心话大转盘:spec.questions = ["最尴尬的经历?", ...] 转盘选人,用语音回答,全员点"过关"
export const meta = { id: 'wheel', name: '真心话转盘', minPlayers: 2, maxPlayers: 12 };

const ANSWER_TIME = 45;

function spin(state, rng) {
  state.chosen = rng.pick(state.players).id;
  const q = state.spec.questions[state.qIndex % state.spec.questions.length];
  state.approves = [];
  state.timer = ANSWER_TIME;
  state.stage = 'answer';
  const name = state.players.find((p) => p.id === state.chosen).name;
  state.ui = {
    view: 'wheel',
    title: `第 ${state.qIndex + 1}/${state.spec.rounds ?? 6} 转`,
    chosen: name,
    chosenId: state.chosen,
    question: q,
    subtitle: `${name} 用语音回答!其他人觉得 OK 就点通过`,
    timer: state.timer,
    approves: 0,
    need: Math.max(1, Math.ceil((state.players.length - 1) / 2)),
  };
  return state;
}

export function init(spec, players, rng) {
  const state = baseState(players);
  state.spec = spec;
  state.qIndex = 0;
  return spin(state, rng);
}

function nextRound(state, rng, passed) {
  const name = state.players.find((p) => p.id === state.chosen).name;
  if (passed) { state.scores[state.chosen] += 10; state.toast = `${name} 过关!+10`; }
  else state.toast = `${name} 没能过关…`;
  state.qIndex++;
  if (state.qIndex >= (state.spec.rounds ?? 6)) {
    state.phase = 'ended';
    state.ui = { view: 'final', title: '游戏结束', scores: rank(state) };
    return state;
  }
  return spin(state, rng);
}

export function onAction(state, playerId, action, rng) {
  if (state.phase !== 'playing' || action.type !== 'approve') return null;
  if (playerId === state.chosen || state.approves.includes(playerId)) return null;
  state.approves.push(playerId);
  state.ui.approves = state.approves.length;
  if (state.approves.length >= state.ui.need) return nextRound(state, rng, true);
  return state;
}

export function onTick(state, rng) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  state.ui.timer = state.timer;
  if (state.timer > 0) return state;
  return nextRound(state, rng, state.approves.length >= state.ui.need);
}
