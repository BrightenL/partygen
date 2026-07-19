// 生成管线:自然语言 → { templateId, title, spec }
// 有 ANTHROPIC_AUTH_TOKEN/ANTHROPIC_API_KEY 时调用 Claude;否则回退到内置示例库(演示模式)。
import { GAMES, TEMPLATE_DOCS } from '../registry.js';
import { FALLBACK_SPECS } from './fallback.js';

const API_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
const BASE_URL = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const MODEL = process.env.PARTYGEN_MODEL || 'claude-sonnet-5';

const SYSTEM = `你是一个语音房派对游戏设计师。用户用自然语言描述想玩的游戏,你从模板库中选择最匹配的模板,并生成高质量的游戏内容。
${TEMPLATE_DOCS}
要求:
- 只输出一个 JSON 对象,不要任何其他文字:{ "templateId": "...", "title": "游戏标题(有趣、贴合用户想法)", "reason": "一句话说明为何选这个模板", "spec": {...} }
- 内容要贴合用户描述的主题、有趣、适合语音房多人氛围,避免敏感/成人/宗教内容
- 题目类内容确保答案准确;卧底词对要相近但有区分度`;

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in response');
  return JSON.parse(m[0]);
}

export function validateSpec(templateId, spec) {
  const g = GAMES[templateId];
  if (!g) return `未知模板 ${templateId}`;
  const need = {
    quiz: () => Array.isArray(spec.questions) && spec.questions.length >= 3 &&
      spec.questions.every((q) => q.q && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer < q.options.length),
    undercover: () => Array.isArray(spec.wordPairs) && spec.wordPairs.length >= 1 && spec.wordPairs.every((p) => p.civilian && p.undercover),
    draw: () => Array.isArray(spec.words) && spec.words.length >= 4,
    bomb: () => true,
    vote: () => Array.isArray(spec.prompts) && spec.prompts.length >= 3,
    react: () => true,
    chain: () => !!spec.category || !!spec.title,
    emoji: () => Array.isArray(spec.items) && spec.items.length >= 3 && spec.items.every((i) => i.emoji && i.answer),
    wheel: () => Array.isArray(spec.questions) && spec.questions.length >= 3,
  }[templateId];
  return need && need() ? null : `spec 不满足 ${templateId} 模板要求`;
}

async function callClaude(messages) {
  const res = await fetch(`${BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system: SYSTEM, messages }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.content.map((b) => b.text || '').join('');
}

// 关键词匹配的演示模式回退
function fallbackGenerate(idea) {
  const rules = [
    [/卧底|伪装|间谍|spy/i, 'undercover'],
    [/画|draw/i, 'draw'],
    [/炸弹|数字|惩罚|喝酒/i, 'bomb'],
    [/谁最|投票|评选/i, 'vote'],
    [/反应|手速|快/i, 'react'],
    [/接龙|成语/i, 'chain'],
    [/表情|emoji|猜.*(电影|歌|词)/i, 'emoji'],
    [/真心话|转盘|才艺/i, 'wheel'],
  ];
  let templateId = 'quiz';
  for (const [re, id] of rules) if (re.test(idea)) { templateId = id; break; }
  const fb = FALLBACK_SPECS[templateId];
  return { templateId, title: fb.title, reason: '演示模式(未配置 API key,使用内置内容)', spec: fb.spec, demo: true };
}

export async function generateGame(idea) {
  if (!API_KEY) return fallbackGenerate(idea);
  const messages = [{ role: 'user', content: `用户想玩的游戏:${idea}` }];
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await callClaude(messages);
      const out = extractJson(text);
      const err = validateSpec(out.templateId, out.spec || {});
      if (err) {
        messages.push({ role: 'assistant', content: text });
        messages.push({ role: 'user', content: `校验失败:${err}。请修正后重新只输出 JSON。` });
        lastErr = err;
        continue;
      }
      return { templateId: out.templateId, title: out.title || GAMES[out.templateId].meta.name, reason: out.reason || '', spec: out.spec };
    } catch (e) {
      lastErr = e.message;
      messages.length = 1; // 网络/解析错误则干净重试
    }
  }
  const fb = fallbackGenerate(idea);
  fb.reason = `生成失败(${lastErr}),已回退到内置内容`;
  return fb;
}
