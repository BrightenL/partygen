import { baseState, rank } from '../engine.js';

// 投票趣答:spec.prompts = ["谁最可能半夜偷吃零食?", ...] 大家互投,票高者上榜
export const meta = { id: 'vote', name: '投票趣答', minPlayers: 3, maxPlayers: 12 };

const VOTE_TIME = 20;

function startPrompt(state) {
  state.votes = {};
  state.timer = VOTE_TIME;
  state.ui = {
    view: 'vote',
    title: `第 ${state.pIndex + 1}/${state.spec.prompts.length} 题`,
    subtitle: state.spec.prompts[state.pIndex],
    candidates: state.players.map((p) => ({ id: p.id, name: p.name })),
    timer: state.timer,
  };
  return state;
}

export function init(spec, players) {
  const state = baseState(players);
  state.spec = spec;
  state.pIndex = 0;
  return startPrompt(state);
}

function reveal(state) {
  const count = {};
  for (const v of Object.values(state.votes)) count[v] = (count[v] || 0) + 1;
  const results = state.players
    .map((p) => ({ name: p.name, votes: count[p.id] || 0 }))
    .sort((a, b) => b.votes - a.votes);
  const top = results[0];
  for (const [pid, target] of Object.entries(state.votes)) {
    const targetVotes = count[target] || 0;
    if (targetVotes === top.votes) state.scores[pid] += 5; // 投中众意
  }
  state.stage = 'reveal';
  state.timer = 5;
  state.ui = {
    view: 'voteReveal',
    subtitle: state.spec.prompts[state.pIndex],
    results,
    winner: top.name,
    scores: rank(state),
    timer: 5,
  };
  return state;
}

export function onAction(state, playerId, action) {
  if (state.phase !== 'playing' || state.stage === 'reveal') return null;
  if (action.type !== 'vote' || state.votes[playerId] != null) return null;
  state.votes[playerId] = action.target;
  state.ui.votedCount = Object.keys(state.votes).length;
  if (Object.keys(state.votes).length >= state.players.length) return reveal(state);
  return state;
}

export function onTick(state) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  state.ui.timer = state.timer;
  if (state.timer > 0) return state;
  if (state.stage !== 'reveal') return reveal(state);
  state.stage = null;
  state.pIndex++;
  if (state.pIndex >= state.spec.prompts.length) {
    state.phase = 'ended';
    state.ui = { view: 'final', title: '游戏结束', scores: rank(state) };
    return state;
  }
  return startPrompt(state);
}
