// 多人冒烟测试:对全部 9 个模板,模拟 4 个玩家跑完整局,校验状态推进与结束
import { GAMES } from '../server/registry.js';
import { makeRng } from '../server/engine.js';
import { FALLBACK_SPECS } from '../server/gen/fallback.js';
import { validateSpec } from '../server/gen/generate.js';

const players = [
  { id: 'p1', name: '小明' }, { id: 'p2', name: '小红' },
  { id: 'p3', name: '阿强' }, { id: 'p4', name: 'Momo' },
];

// 每个模板的随机行为策略:模拟玩家在当前 ui 下可能的操作
function randomActions(templateId, state, rng) {
  const acts = [];
  const ui = state.ui || {};
  switch (templateId) {
    case 'quiz':
      if (ui.view === 'question') for (const p of players) acts.push([p.id, { type: 'answer', choice: rng.int(ui.options.length) }]);
      break;
    case 'undercover':
      if (ui.view === 'turn' && ui.actionFor) acts.push([ui.actionFor, { type: 'next' }]);
      if (ui.view === 'vote') for (const p of players) acts.push([p.id, { type: 'vote', target: rng.pick(ui.candidates).id }]);
      break;
    case 'draw': {
      const drawer = ui.drawerId;
      if (ui.view === 'draw') {
        acts.push([drawer, { type: 'stroke', stroke: { color: '#111', w: 5, pts: [[10, 10], [50, 50]] } }]);
        for (const p of players) if (p.id !== drawer) {
          // 30% 概率猜中(从 privateUi 拿词模拟"聪明玩家")
          const word = state.word;
          acts.push([p.id, { type: 'guess', text: rng.next() < 0.3 ? word : '瞎猜' + rng.int(100) }]);
        }
      }
      break;
    }
    case 'bomb':
      if (ui.actionFor) acts.push([ui.actionFor, { type: 'guess', n: ui.low + rng.int(Math.max(1, ui.high - ui.low + 1)) }]);
      break;
    case 'vote':
      if (ui.view === 'vote') for (const p of players) acts.push([p.id, { type: 'vote', target: rng.pick(ui.candidates).id }]);
      break;
    case 'react':
      for (const p of players) if (rng.next() < 0.5) acts.push([p.id, { type: 'tap' }]);
      break;
    case 'chain':
      if (ui.actionFor) {
        const last = ui.last || '';
        const tail = last[last.length - 1] || '一';
        acts.push([ui.actionFor, { type: 'word', word: tail + '字词' + rng.int(1000) }]);
      }
      break;
    case 'emoji':
      if (ui.view === 'emoji') for (const p of players) {
        const item = state.spec.items[state.iIndex];
        acts.push([p.id, { type: 'guess', text: rng.next() < 0.4 ? item.answer : '不知道' }]);
      }
      break;
    case 'wheel':
      if (ui.view === 'wheel') for (const p of players) acts.push([p.id, { type: 'approve' }]);
      break;
  }
  return acts;
}

let failed = 0;
for (const [id, g] of Object.entries(GAMES)) {
  const fb = FALLBACK_SPECS[id];
  const specErr = validateSpec(id, fb.spec);
  if (specErr) { console.error(`❌ ${id}: 内置 spec 校验失败 — ${specErr}`); failed++; continue; }

  const rng = makeRng(42);
  let state;
  try {
    state = g.init(fb.spec, players, rng);
  } catch (e) { console.error(`❌ ${id}: init 抛错 — ${e.message}`); failed++; continue; }

  let ticks = 0, actionsApplied = 0;
  const MAX_TICKS = 3000; // 上限:任何模板都应在此前自然结束(超时兜底也算)
  try {
    while (state.phase !== 'ended' && ticks < MAX_TICKS) {
      // 每个 tick 前随机施加玩家操作
      for (const [pid, action] of randomActions(id, state, rng)) {
        if (state.phase === 'ended') break;
        const next = g.onAction(state, pid, action, rng);
        if (next) { state = next; actionsApplied++; }
      }
      if (state.phase === 'ended') break;
      const next = g.onTick(state, rng);
      if (next) state = next;
      ticks++;
      if (!state.ui) throw new Error('ui 为空');
      JSON.stringify(state); // 必须可序列化(要广播)
    }
  } catch (e) {
    console.error(`❌ ${id}: 运行时抛错 (tick ${ticks}) — ${e.stack}`);
    failed++; continue;
  }

  if (state.phase !== 'ended') {
    console.error(`❌ ${id}: ${MAX_TICKS} tick 内未结束(疑似死锁)`);
    failed++; continue;
  }
  console.log(`✅ ${id.padEnd(10)} 完整跑通 — ${ticks} ticks, ${actionsApplied} actions, 终局: ${state.ui.title}`);
}

// 掉线场景:所有玩家不操作,纯靠超时推进也必须能结束
for (const [id, g] of Object.entries(GAMES)) {
  const rng = makeRng(7);
  let state = g.init(FALLBACK_SPECS[id].spec, players, rng);
  let ticks = 0;
  while (state.phase !== 'ended' && ticks < 5000) {
    const next = g.onTick(state, rng);
    if (next) state = next;
    ticks++;
  }
  if (state.phase !== 'ended') { console.error(`❌ ${id}: 全员挂机时死锁`); failed++; }
  else console.log(`✅ ${id.padEnd(10)} 全员挂机超时保护 OK (${ticks} ticks)`);
}

if (failed) { console.error(`\n${failed} 项失败`); process.exit(1); }
console.log('\n全部模板冒烟测试通过 🎉');
