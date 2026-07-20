// 语音信令测试:两客户端加入 → A 开语音 → B 收到成员语音状态 → A 向 B 转发 rtc 信令
import WebSocket from 'ws';
const BASE = 'http://localhost:3199';
const { code } = await (await fetch(`${BASE}/api/rooms`, { method: 'POST' })).json();
function client(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:3199/ws');
    const inbox = [];
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', code, name })));
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      inbox.push(m);
      if (m.type === 'joined') resolve({ ws, inbox, id: m.playerId });
    });
  });
}
const a = await client('A');
const b = await client('B');
a.ws.send(JSON.stringify({ type: 'voice', on: true, mic: true }));
await new Promise((r) => setTimeout(r, 200));
const mem = b.inbox.filter((m) => m.type === 'members').pop();
const av = mem.members.find((m) => m.id === a.id);
if (!av.voice || !av.mic) throw new Error('voice state not broadcast');
console.log('voice state broadcast OK');
a.ws.send(JSON.stringify({ type: 'rtc', to: b.id, data: { sdp: { type: 'offer', sdp: 'x' } } }));
await new Promise((r) => setTimeout(r, 200));
const rtc = b.inbox.find((m) => m.type === 'rtc');
if (!rtc || rtc.from !== a.id || rtc.data.sdp.type !== 'offer') throw new Error('rtc relay failed');
console.log('rtc signal relay OK');
// 闭麦状态
a.ws.send(JSON.stringify({ type: 'voice', on: true, mic: false }));
await new Promise((r) => setTimeout(r, 200));
const mem2 = b.inbox.filter((m) => m.type === 'members').pop();
if (mem2.members.find((m) => m.id === a.id).mic !== false) throw new Error('mute state failed');
console.log('mute state OK');
console.log('VOICE TEST OK 🎉');
process.exit(0);
