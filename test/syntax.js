// 前端 JS 语法冒烟检查：public/js/*.js 逐个 node --check
// 防止再次出现"语法错误提交导致全部游戏渲染失败"的事故
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'js');
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
let failed = 0;

for (const f of files) {
  const p = join(dir, f);
  try {
    execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
    console.log(`✓ syntax ok: public/js/${f}`);
  } catch (e) {
    failed++;
    console.error(`✗ syntax error: public/js/${f}\n${e.stderr?.toString() || e.message}`);
  }
}

if (failed) {
  console.error(`\n${failed} 个文件语法检查失败`);
  process.exit(1);
}
console.log(`\n全部 ${files.length} 个前端 JS 语法检查通过`);
