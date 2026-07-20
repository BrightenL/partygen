// 游戏库测试:record → list → pick 进房 → markPlayed 提升热度;演示模式生成不入库
process.env.PARTYGEN_LIBRARY = '/tmp/pg_test_library.json';
import fs from 'fs';
try { fs.unlinkSync('/tmp/pg_test_library.json'); } catch {}
const library = await import('../server/gen/library.js');

// 演示模式结果不入库
const demoId = library.record('随便', { demo: true, templateId: 'quiz', title: 'x', spec: {} });
if (demoId !== null) throw new Error('demo result should not be recorded');

// AI 结果入库
const out = { templateId: 'quiz', title: '周杰伦歌曲大赛', reason: 'r', spec: { questions: [{ q: 'q', options: ['a', 'b'], answer: 0 }, { q: 'q2', options: ['a', 'b'], answer: 1 }, { q: 'q3', options: ['a', 'b'], answer: 0 }] } };
const id = library.record('周杰伦猜歌', out);
if (!id) throw new Error('record failed');
// 同标题同模板去重
const id2 = library.record('再来一次周杰伦', out);
if (id2 !== id) throw new Error('dedup failed');

const items = library.list();
if (items.length !== 1 || items[0].title !== '周杰伦歌曲大赛' || items[0].plays !== 0) throw new Error('list failed');
if (items[0].spec) throw new Error('list should not contain spec');

const full = library.get(id);
if (!full.spec.questions) throw new Error('get should contain full spec');

library.markPlayed(id);
library.markPlayed(id);
if (library.get(id).plays !== 2) throw new Error('markPlayed failed');

// 落盘 + 重载(通过文件直接校验,import 缓存无法二次加载)
await new Promise((r) => setTimeout(r, 700));
const disk = JSON.parse(fs.readFileSync('/tmp/pg_test_library.json', 'utf8'));
if (disk.length !== 1 || disk[0].plays !== 2) throw new Error('persistence failed');

fs.unlinkSync('/tmp/pg_test_library.json');
console.log('LIBRARY TEST OK 🎉');
process.exit(0);
