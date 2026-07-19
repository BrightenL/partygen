// 端到端:HTTP 建房 → 3 个 WS 客户端加入 → 生成(演示模式) → 房主开始 → 收到 game 状态
import WebSocket from 'ws';
const BASE = 'http://localhost:3199';
const { code } = await (await fetch(`${BASE}/api/rooms`, { method: 'POST' })).json();
console.log('room', code);

function client(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:3199/ws');
    const events = [];
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', code, name })));
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      events.push(m.type);
      if (m.type === 'joined') resolve({ ws, events, id: m.playerId, isHost: m.isHost });
    });
  });
}

const host = await client('房主');
const g1 = await client('客A');
const g2 = await client('客B');

const gen = await (await fetch(`${BASE}/api/rooms/${code}/generate`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ idea: '来一局美食主题的谁是卧底' }),
})).json();
console.log('generate:', JSON.stringify(gen));
await new Promise((r) => setTimeout(r, 300));

host.ws.send(JSON.stringify({ type: 'start' }));
const gameState = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('no game state within 3s')), 3000);
  g1.ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.type === 'game') { clearTimeout(t); resolve(m); }
  });
});
console.log('game started:', gameState.game.templateId, '-', gameState.game.title, '| view:', gameState.game.ui.view);
console.log('guest private word:', gameState.you?.word ?? '(none yet)');
if (gameState.game.templateId !== 'undercover') throw new Error('keyword routing failed');
console.log('E2E OK 🎉');
process.exit(0);
