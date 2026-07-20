// 热门游戏库:AI 生成成功的游戏沉淀于此,可被任何房间一键复用(不再消耗生成调用)。
// 持久化为单个 JSON 文件;写入防抖,进程退出前尽力落盘。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.PARTYGEN_LIBRARY || path.join(__dirname, '../../data/library.json');

let items = []; // { id, idea, templateId, title, reason, spec, plays, createdAt }
let saveTimer = null;

try {
  items = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!Array.isArray(items)) items = [];
} catch { items = []; }

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(items, null, 1));
    } catch (e) { console.error('library save failed:', e.message); }
  }, 500);
}

process.on('exit', () => {
  clearTimeout(saveTimer);
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(items, null, 1)); } catch {}
});

// AI 生成成功后调用;同标题同模板视为同一游戏,不重复入库
export function record(idea, out) {
  if (out.demo) return null;
  let it = items.find((i) => i.templateId === out.templateId && i.title === out.title);
  if (!it) {
    it = {
      id: Math.random().toString(36).slice(2, 10),
      idea: String(idea).slice(0, 100),
      templateId: out.templateId, title: out.title, reason: out.reason || '',
      spec: out.spec, plays: 0, createdAt: Date.now(),
    };
    items.unshift(it);
    if (items.length > 200) items.length = 200; // 上限,淘汰最旧的冷门项
    save();
  }
  return it.id;
}

export function get(id) {
  return items.find((i) => i.id === id) || null;
}

export function markPlayed(id) {
  const it = get(id);
  if (it) { it.plays++; save(); }
}

// 按热度(开局数)+ 新鲜度排序的摘要列表(不含 spec,减小响应)
export function list(limit = 12) {
  return [...items]
    .sort((a, b) => (b.plays - a.plays) || (b.createdAt - a.createdAt))
    .slice(0, limit)
    .map(({ id, idea, templateId, title, plays }) => ({ id, idea, templateId, title, plays }));
}
