// PartyGen 视觉特效工具 — canvas 粒子池 + DOM 彩带/飘字/屏震/闪白
window.FX = (() => {
  // ---- Canvas 粒子池:画进游戏自己的 2d context,在游戏 loop 末尾调 step() ----
  function pool(g2d) {
    const parts = []; // {x,y,vx,vy,life,maxLife,size,color}
    return {
      burst(x, y, { n = 12, colors = ['#ffd166', '#ff8906', '#ef4565'], speed = 3.5, life = 30, gravity = 0.12, size = 3 } = {}) {
        const cap = Math.min(n, 40);
        for (let i = 0; i < cap; i++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = speed * (0.4 + Math.random() * 0.6);
          parts.push({
            x, y,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1,
            life, maxLife: life,
            size: size * (0.6 + Math.random() * 0.8),
            color: colors[Math.floor(Math.random() * colors.length)],
            gravity,
          });
        }
        // 粒子总量上限,防低端机卡顿
        if (parts.length > 200) parts.splice(0, parts.length - 200);
      },
      step() {
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.vy += p.gravity; p.x += p.vx; p.y += p.vy;
          if (--p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
          g2d.globalAlpha = p.life / p.maxLife;
          g2d.fillStyle = p.color;
          g2d.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        g2d.globalAlpha = 1;
      },
    };
  }

  // ---- DOM 彩带:绝对定位小矩形从容器顶部飘落 ----
  function confetti(container = document.body, { n = 60, duration = 2600 } = {}) {
    const cap = Math.min(n, 80);
    const box = document.createElement('div');
    box.className = 'fx-confetti';
    for (let i = 0; i < cap; i++) {
      const p = document.createElement('i');
      p.className = 'fx-confetti-piece';
      const hue = Math.floor(Math.random() * 360);
      const dur = duration * (0.7 + Math.random() * 0.6);
      p.style.cssText = `left:${Math.random() * 100}%;background:hsl(${hue},85%,62%);` +
        `animation-duration:${dur}ms;animation-delay:${Math.random() * 400}ms;` +
        `--cx:${(Math.random() - 0.5) * 120}px;--cr:${(Math.random() - 0.5) * 900}deg;`;
      box.append(p);
    }
    container.append(box);
    setTimeout(() => box.remove(), duration * 1.4 + 500);
  }

  // ---- 飘字(页面坐标),复用 app.css 的 .float-score ----
  function floatScore(x, y, text) {
    const el = document.createElement('div');
    el.className = 'float-score';
    el.textContent = text;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    el.style.transform = 'translateX(-50%)';
    document.body.append(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 1500); // 兜底
  }

  // ---- 屏震 ----
  function shake(el, strength = 1) {
    if (!el) return;
    el.style.setProperty('--shake-s', strength);
    el.classList.remove('fx-shake');
    void el.offsetWidth; // 重启动画
    el.classList.add('fx-shake');
    el.addEventListener('animationend', () => el.classList.remove('fx-shake'), { once: true });
  }

  // ---- 受击闪白 ----
  function flash(el) {
    if (!el) return;
    el.classList.remove('fx-flash');
    void el.offsetWidth;
    el.classList.add('fx-flash');
    el.addEventListener('animationend', () => el.classList.remove('fx-flash'), { once: true });
  }

  return { pool, confetti, floatScore, shake, flash };
})();
