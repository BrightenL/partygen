import * as quiz from './games/quiz.js';
import * as undercover from './games/undercover.js';
import * as draw from './games/draw.js';
import * as bomb from './games/bomb.js';
import * as vote from './games/vote.js';
import * as react from './games/react.js';
import * as chain from './games/chain.js';
import * as emoji from './games/emoji.js';
import * as wheel from './games/wheel.js';
import * as tetris from './games/tetris.js';
import * as suika from './games/suika.js';
import * as shooter from './games/shooter.js';
import * as fight from './games/fight.js';

export const GAMES = { quiz, undercover, draw, bomb, vote, react, chain, emoji, wheel, tetris, suika, shooter, fight };

// 生成管线用的模板说明书:LLM 只需产出 templateId + spec
export const TEMPLATE_DOCS = `
可用游戏模板(templateId → spec 结构):

1. quiz 抢答问答 — 适合:知识问答、主题测验、"考考大家"
   spec: { "questions": [{ "q": "题目", "options": ["A","B","C","D"], "answer": 0, "explain": "可选解析" }] }  // 5-8题

2. undercover 谁是卧底 — 适合:找卧底、伪装、社交推理
   spec: { "wordPairs": [{ "civilian": "平民词", "undercover": "卧底词" }] }  // 5对相近词

3. draw 你画我猜 — 适合:画画、猜词
   spec: { "words": ["词1", ...], "rounds": 4 }  // 10-15个适合画的词

4. bomb 数字炸弹 — 适合:惩罚游戏、随机选人、酒桌类
   spec: { "rounds": 3, "penalty": "惩罚描述,如:学猫叫三声" }

5. vote 投票趣答 — 适合:互相评价、"谁最可能XX"、破冰
   spec: { "prompts": ["谁最可能半夜偷吃零食?", ...] }  // 6-8个问题

6. react 快速反应 — 适合:手速、反应力比拼
   spec: { "rounds": 10 }

7. chain 词语接龙 — 适合:成语接龙、词汇游戏
   spec: { "category": "主题", "title": "标题", "rule": "规则一句话", "startWord": "起始词", "strict": true }
   // strict: 是否强制首尾字相接(非接龙类词汇游戏设为 false)

8. emoji 表情猜词 — 适合:猜电影/歌名/成语,看emoji猜答案
   spec: { "theme": "主题", "items": [{ "emoji": "🐟🍚", "answer": "鱼香肉丝", "hint": "可选提示" }] }  // 6-8题

9. wheel 真心话转盘 — 适合:真心话、才艺展示、语音互动惩罚
   spec: { "rounds": 6, "questions": ["问题1", ...] }  // 语音回答的开放问题

10. tetris 方块对战(俄罗斯方块) — 适合:俄罗斯方块、消除类竞技
   spec: { "title": "标题", "duration": 120 }  // 秒,60-300;消2+行给对手发垃圾行

11. suika 合成大西瓜 — 适合:合成/消除休闲赛,可换主题合成链
   spec: { "title": "标题", "duration": 120, "chain": ["🍒","🍓","🍇","🍊","🍎","🍐","🍑","🍍","🍈","🍉"] }
   // chain: 6-11 个 emoji 从小到大的合成链,可按用户主题定制(如全是动物/甜品)

12. shooter 竞技场射击 — 适合:射击、FPS、吃鸡类想法(顶视角竞技场实现)
   spec: { "title": "标题", "duration": 120, "theme": { "playerEmoji": ["🐱","🐶","🦊","🐸","🐼","🐯","🐰","🦁"], "arenaColor": "#1a2436" } }

13. fight 格斗对战(拳皇式1v1擂台) — 适合:格斗、拳皇、街霸类想法;两人对打其余观战,胜者守擂
   spec: { "title": "标题", "rounds": 6, "roundSec": 60, "theme": { "fighters": [{ "emoji": "🐲", "name": "青龙" }, ...8个], "moves": { "punch": "拳招式名", "kick": "腿招式名", "block": "防御名" } } }
`;
