// 实时通道测试:tetris 开局 → 垃圾行私发 → rt 缩略图中继;shooter 击杀限速
import WebSocket from 'ws';
const BASE = 'http://localhost:3199';

async function setupRoom(idea, n) {
  const { code } = await (await fetch(`${BASE}/api/rooms`, { method: 'POST' })).json();
  const clients = [];
  for (let i = 0; i < n; i++) {
    const c = await new Promise((resolve) => {
      const ws = new WebSocket('ws://localhost:3199/ws');
      const inbox = [];
      ws.on('open', () => ws.send(JSON.stringify({ type: 'join', code, name: 'P' + i })));
      ws.on('message', (d) => {
        const m = JSON.parse(d);
        inbox.push(m);
        if (m.type === 'joined') resolve({ ws, inbox, id: m.playerId });
      });
    });
    clients.push(c);
  }
  await fetch(`${BASE}/api/rooms/${code}/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idea }),
  });
  await new Promise((r) => setTimeout(r, 300));
  clients[0].ws.send(JSON.stringify({ type: 'start' }));
  await new Promise((r) => setTimeout(r, 300));
  return clients;
}

// --- tetris ---
{
  const [host, p2] = await setupRoom('来玩俄罗斯方块', 2);
  const g = host.inbox.filter((m) => m.type === 'game').pop();
  if (g.game.templateId !== 'tetris') throw new Error('tetris routing failed: ' + g.game.templateId);
  if (typeof g.game.ui.seed !== 'number') throw new Error('no shared seed');

  // host 消 3 行 → p2 私有 garbage 应变为 2
  host.ws.send(JSON.stringify({ type: 'action', action: { type: 'clear', lines: 3 } }));
  await new Promise((r) => setTimeout(r, 300));
  const s2 = p2.inbox.filter((m) => m.type === 'game').pop();
  if ((s2.you?.garbage ?? 0) !== 2) throw new Error('garbage not delivered: ' + JSON.stringify(s2.you));
  console.log('tetris: seed shared + garbage lines OK');

  // rt 缩略图:host 发 board,p2 能收到,host 自己收不到
  host.ws.send(JSON.stringify({ type: 'rt', data: { board: 'ab'.repeat(10) } }));
  await new Promise((r) => setTimeout(r, 200));
  const rt2 = p2.inbox.find((m) => m.type === 'rt');
  if (!rt2 || rt2.from !== host.id || !rt2.data.board) throw new Error('rt relay failed');
  if (host.inbox.find((m) => m.type === 'rt')) throw new Error('rt echoed to sender');
  console.log('tetris: rt board relay OK');
  host.ws.close(); p2.ws.close();
}

// --- shooter 击杀限速 ---
{
  const [host, p2] = await setupRoom('fps大乱斗', 2);
  const g = host.inbox.filter((m) => m.type === 'game').pop();
  if (g.game.templateId !== 'shooter') throw new Error('shooter routing failed: ' + g.game.templateId);
  // 同一 tick 连报 3 次击杀,只应记 1 次
  for (let i = 0; i < 3; i++) host.ws.send(JSON.stringify({ type: 'action', action: { type: 'kill', target: p2.id } }));
  await new Promise((r) => setTimeout(r, 300));
  const s = host.inbox.filter((m) => m.type === 'game').pop();
  const myScore = s.game.scores[host.id];
  if (myScore !== 10) throw new Error(`kill rate-limit failed: score=${myScore}`);
  // 自杀与打不存在的人应被忽略
  host.ws.send(JSON.stringify({ type: 'action', action: { type: 'kill', target: host.id } }));
  host.ws.send(JSON.stringify({ type: 'action', action: { type: 'kill', target: 'ghost' } }));
  await new Promise((r) => setTimeout(r, 200));
  const s3 = host.inbox.filter((m) => m.type === 'game').pop();
  if (s3.game.scores[host.id] !== 10) throw new Error('invalid kill accepted');
  console.log('shooter: kill rate-limit + validation OK');
  host.ws.close(); p2.ws.close();
}

// --- fight 伤害限速 + 观战者不能打 ---
{
  const clients = await setupRoom('拳皇对战', 3);
  const g = clients[0].inbox.filter((m) => m.type === 'game').pop();
  if (g.game.templateId !== 'fight') throw new Error('fight routing failed: ' + g.game.templateId);
  const duel = [g.game.ui.a.id, g.game.ui.b.id];
  const spectator = clients.find((c) => !duel.includes(c.id));
  const fighter = clients.find((c) => c.id === duel[0]);
  // 观战者打人无效
  spectator.ws.send(JSON.stringify({ type: 'action', action: { type: 'hit', dmg: 99 } }));
  // 台上选手同 tick 疯狂点击,只记 2 次
  for (let i = 0; i < 6; i++) fighter.ws.send(JSON.stringify({ type: 'action', action: { type: 'hit', dmg: 10 } }));
  await new Promise((r) => setTimeout(r, 300));
  const s = clients[0].inbox.filter((m) => m.type === 'game').pop();
  const oppHp = s.game.ui.a.id === fighter.id ? s.game.ui.b.hp : s.game.ui.a.hp;
  if (oppHp !== 80) throw new Error(`hit rate-limit failed: hp=${oppHp}`);
  console.log('fight: spectator blocked + hit rate-limit OK');
  clients.forEach((c) => c.ws.close());
}

console.log('RT TEST OK 🎉');
process.exit(0);
