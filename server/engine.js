// 确定性游戏引擎:所有游戏模板实现同一接口,服务端为状态权威,客户端只渲染。
// 模板接口:
//   meta: { id, name, minPlayers, maxPlayers }
//   init(spec, players, rng) -> state          // spec 来自生成管线,players: [{id,name}]
//   onAction(state, playerId, action, rng) -> state | null   // 纯函数式变更,返回新状态
//   onTick(state, rng) -> state | null         // 每秒调用,处理回合计时/超时跳过
// state 中约定字段: phase ('lobby'|'playing'|'ended'), scores {playerId: n},
//   ui (客户端渲染用的视图描述), privateUi {playerId: view} (仅发给对应玩家,如卧底词)

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

export function baseState(players) {
  const scores = {};
  for (const p of players) scores[p.id] = 0;
  return {
    phase: 'playing',
    players: players.map((p) => ({ id: p.id, name: p.name })),
    scores,
    round: 1,
    ui: null,
    privateUi: {},
    toast: null, // 一次性提示,广播后清除
  };
}

export function rank(state) {
  return state.players
    .map((p) => ({ ...p, score: state.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
