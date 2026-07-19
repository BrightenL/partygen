import { baseState, rank } from '../engine.js';

// 谁是卧底:spec.wordPairs = [{civilian, undercover}]
// 流程:发词 → 轮流描述(纯语音,客户端只显示轮到谁) → 投票 → 出局判定 → 循环
export const meta = { id: 'undercover', name: '谁是卧底', minPlayers: 3, maxPlayers: 10 };

const DESCRIBE_TIME = 20;
const VOTE_TIME = 25;

function alive(state) {
  return state.players.filter((p) => !state.out.includes(p.id));
}

function setDescribe(state) {
  state.stage = 'describe';
  state.turnIdx = 0;
  state.timer = DESCRIBE_TIME;
  syncDescribeUi(state);
  return state;
}

function syncDescribeUi(state) {
  const a = alive(state);
  const cur = a[state.turnIdx];
  state.ui = {
    view: 'turn',
    title: `第 ${state.round} 轮 · 描述阶段`,
    subtitle: '轮到的玩家用语音描述自己的词,不能说出词本身',
    current: cur.name,
    order: a.map((p) => ({ name: p.name, done: a.indexOf(p) < state.turnIdx })),
    timer: state.timer,
    actionFor: cur.id,
    actionLabel: '说完了,下一位',
  };
}

function setVote(state) {
  state.stage = 'vote';
  state.timer = VOTE_TIME;
  state.votes = {};
  const a = alive(state);
  state.ui = {
    view: 'vote',
    title: `第 ${state.round} 轮 · 投票`,
    subtitle: '投出你认为的卧底',
    candidates: a.map((p) => ({ id: p.id, name: p.name })),
    timer: state.timer,
  };
  return state;
}

export function init(spec, players, rng) {
  const state = baseState(players);
  state.spec = spec;
  const pair = rng.pick(spec.wordPairs);
  const shuffled = rng.shuffle(players.map((p) => p.id));
  state.undercoverId = shuffled[0];
  state.out = [];
  for (const p of players) {
    state.privateUi[p.id] = {
      word: p.id === state.undercoverId ? pair.undercover : pair.civilian,
      hint: '这是你的词,别念出来!',
    };
  }
  return setDescribe(state);
}

function tallyVotes(state, rng) {
  const count = {};
  for (const v of Object.values(state.votes)) count[v] = (count[v] || 0) + 1;
  const a = alive(state);
  let max = -1, outId = null, tie = false;
  for (const p of a) {
    const c = count[p.id] || 0;
    if (c > max) { max = c; outId = p.id; tie = false; }
    else if (c === max) tie = true;
  }
  if (tie || outId == null) outId = rng.pick(a).id; // 平票随机(确定性 rng)
  state.out.push(outId);
  const outName = state.players.find((p) => p.id === outId).name;
  const wasUndercover = outId === state.undercoverId;

  if (wasUndercover) {
    state.phase = 'ended';
    for (const p of state.players) if (p.id !== state.undercoverId && !state.out.includes(p.id)) state.scores[p.id] += 10;
    state.ui = {
      view: 'final', title: '平民胜利!',
      subtitle: `${outName} 就是卧底`, scores: rank(state),
    };
  } else if (alive(state).length <= 2) {
    state.phase = 'ended';
    state.scores[state.undercoverId] += 20;
    const uName = state.players.find((p) => p.id === state.undercoverId).name;
    state.ui = {
      view: 'final', title: '卧底胜利!',
      subtitle: `卧底是 ${uName},潜伏到了最后`, scores: rank(state),
    };
  } else {
    state.round++;
    state.toast = `${outName} 被投出局,TA 不是卧底`;
    return setDescribe(state);
  }
  return state;
}

export function onAction(state, playerId, action, rng) {
  if (state.phase !== 'playing') return null;
  if (state.stage === 'describe' && action.type === 'next') {
    const a = alive(state);
    if (a[state.turnIdx].id !== playerId) return null;
    state.turnIdx++;
    if (state.turnIdx >= a.length) return setVote(state);
    state.timer = DESCRIBE_TIME;
    syncDescribeUi(state);
    return state;
  }
  if (state.stage === 'vote' && action.type === 'vote') {
    if (state.out.includes(playerId) || state.votes[playerId] != null) return null;
    state.votes[playerId] = action.target;
    state.ui.votedCount = Object.keys(state.votes).length;
    if (Object.keys(state.votes).length >= alive(state).length) return tallyVotes(state, rng);
    return state;
  }
  return null;
}

export function onTick(state, rng) {
  if (state.phase !== 'playing') return null;
  state.timer--;
  state.ui.timer = state.timer;
  if (state.timer > 0) return state;
  // 超时自动推进(掉线保护)
  if (state.stage === 'describe') {
    const a = alive(state);
    state.turnIdx++;
    if (state.turnIdx >= a.length) return setVote(state);
    state.timer = DESCRIBE_TIME;
    syncDescribeUi(state);
    return state;
  }
  return tallyVotes(state, rng);
}
