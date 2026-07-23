// 实时类游戏渲染器:tetris / suika / shooter / fight
// 约定:渲染器自带 requestAnimationFrame 循环,通过 ctx.onUpdate 接服务器状态、ctx.onRt 接对手高频事件、
// ctx.onDestroy 清理循环;高频上报走 ctx.sendRt,计分事件走 ctx.send。
(function () {
  const R = window.GameRenderers;
  const h = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function loop(ctx, fn) {
    let alive = true, raf = 0;
    const step = () => { if (!alive) return; fn(); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const prevDestroy = ctx.onDestroy;
    ctx.onDestroy = () => { alive = false; cancelAnimationFrame(raf); if (prevDestroy) prevDestroy(); };
  }

  // Retina 适配:物理像素 = 逻辑尺寸 × dpr(上限 2 防低端机过载),绘制仍用逻辑坐标
  // 显示尺寸交给 CSS 的响应式规则(.tetris-board 等),这里只放大后备缓冲区
  function setupHiDPI(canvas, cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    return g;
  }

  function btnRow(defs) {
    const row = h('div', 'ctrl-row');
    for (const [label, opts] of defs) {
      const b = h('button', 'ctrl-btn' + (opts.wide ? ' wide' : ''), label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); opts.down && opts.down(); });
      if (opts.up) ['pointerup', 'pointerleave'].forEach((ev) => b.addEventListener(ev, opts.up));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      row.append(b);
    }
    return row;
  }

  // ============ 方块对战(俄罗斯方块) ============
  const SHAPES = [
    [[1, 1, 1, 1]],                    // I
    [[1, 1], [1, 1]],                  // O
    [[0, 1, 0], [1, 1, 1]],            // T
    [[1, 0, 0], [1, 1, 1]],            // J
    [[0, 0, 1], [1, 1, 1]],            // L
    [[0, 1, 1], [1, 1, 0]],            // S
    [[1, 1, 0], [0, 1, 1]],            // Z
  ];
  const TCOLORS = ['#22d3ee', '#eab308', '#a78bfa', '#3b82f6', '#f97316', '#22c55e', '#ef4565'];
  const W = 10, H = 20;

  R.tetris = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title));
    const wrap = h('div', 'tetris-wrap');
    const canvas = h('canvas', 'tetris-board');
    const side = h('div', 'tetris-side');
    wrap.append(canvas, side);
    root.append(wrap);
    root.append(btnRow([
      ['◀', { down: () => move(-1) }],
      ['🔄', { down: rotate }],
      ['▶', { down: () => move(1) }],
      ['⬇', { down: () => { soft = true; }, up: () => { soft = false; } }],
      ['⏬ 硬降', { down: hardDrop, wide: true }],
    ]));

    const g2d = setupHiDPI(canvas, 300, 600);
    const fx = window.FX?.pool(g2d);
    const rng = mulberry32(ui.seed ^ 0x7e77);
    let board = Array.from({ length: H }, () => Array(W).fill(0));
    let bag = [], cur = null, nx = null, alive = true, soft = false;
    let fallAcc = 0, lastT = performance.now(), garbageApplied = 0, lastThumb = 0;
    const opponents = new Map(); // from -> {board: string, at}

    function draw7bag() {
      if (!bag.length) bag = [0, 1, 2, 3, 4, 5, 6].sort(() => rng() - 0.5);
      return bag.pop();
    }
    function spawn() {
      const t = nx ?? draw7bag();
      nx = draw7bag();
      cur = { t, m: SHAPES[t].map((r) => r.slice()), x: 3, y: 0 };
      if (collide(cur.m, cur.x, cur.y)) {
        alive = false;
        window.sfx?.explode();
        ctx.send({ type: 'dead' });
      }
    }
    function collide(m, x, y) {
      for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        const nxp = x + c, nyp = y + r;
        if (nxp < 0 || nxp >= W || nyp >= H || (nyp >= 0 && board[nyp][nxp])) return true;
      }
      return false;
    }
    function move(dx) { if (alive && cur && !collide(cur.m, cur.x + dx, cur.y)) cur.x += dx; }
    function rotate() {
      if (!alive || !cur) return;
      const m = cur.m[0].map((_, i) => cur.m.map((row) => row[i]).reverse());
      for (const kick of [0, -1, 1, -2, 2]) if (!collide(m, cur.x + kick, cur.y)) { cur.m = m; cur.x += kick; return; }
    }
    function hardDrop() {
      if (!alive || !cur) return;
      while (!collide(cur.m, cur.x, cur.y + 1)) cur.y++;
      lock();
    }
    function lock() {
      for (let r = 0; r < cur.m.length; r++) for (let c = 0; c < cur.m[r].length; c++)
        if (cur.m[r][c] && cur.y + r >= 0) board[cur.y + r][cur.x + c] = cur.t + 1;
      let cleared = 0;
      const clearedYs = [];
      board = board.filter((row, r) => { if (row.every((v) => v)) { cleared++; clearedYs.push(r); return false; } return true; });
      while (board.length < H) board.unshift(Array(W).fill(0));
      if (cleared) {
        window.sfx?.clearLine(cleared);
        for (const r of clearedYs) fx?.burst(150, r * 30 + 15, { n: 10 + cleared * 4, speed: 4, size: 4, colors: TCOLORS });
        if (cleared >= 4) window.FX?.shake(canvas, 1.4);
        ctx.send({ type: 'clear', lines: cleared });
      }
      else window.sfx?.land();
      spawn();
    }
    function applyGarbage(n) {
      for (let i = 0; i < n; i++) {
        board.shift();
        const row = Array(W).fill(8);
        row[Math.floor(rng() * W)] = 0;
        board.push(row);
      }
      window.sfx?.wrong();
      if (cur && collide(cur.m, cur.x, cur.y)) { alive = false; window.sfx?.explode(); ctx.send({ type: 'dead' }); }
    }
    function encodeBoard() {
      let bits = '';
      for (let r = 0; r < H; r += 2) { // 10x10 采样足够缩略图
        let byte = 0;
        for (let c = 0; c < W; c++) byte = byte * 2 + (board[r][c] || board[r + 1][c] ? 1 : 0);
        bits += byte.toString(32).padStart(2, '0');
      }
      return bits;
    }

    spawn();
    ctx.onUpdate = (u, you) => {
      const total = you?.garbage ?? 0;
      if (total > garbageApplied) { applyGarbage(total - garbageApplied); garbageApplied = total; }
      renderSide(u);
    };
    ctx.onRt = (from, data) => { if (data.board) opponents.set(from, { board: data.board, at: Date.now() }); };

    function renderSide(u) {
      side.innerHTML = '';
      for (const [from, o] of opponents) {
        const p = (u || ui).alive || {};
        const name = (lastPlayers().find((x) => x.id === from) || {}).name || '对手';
        const mini = h('canvas', 'tetris-mini');
        mini.width = 60; mini.height = 60;
        const m2 = mini.getContext('2d');
        m2.fillStyle = '#0f0e17'; m2.fillRect(0, 0, 60, 60);
        m2.fillStyle = p[from] === false ? '#555' : '#7f5af0';
        for (let r = 0; r < 10; r++) {
          const byte = parseInt(o.board.slice(r * 2, r * 2 + 2), 32);
          for (let c = 0; c < W; c++) if (byte & (1 << (W - 1 - c))) m2.fillRect(c * 6, r * 6, 5, 5);
        }
        const cell = h('div', 'tetris-opp');
        cell.append(mini, h('div', 'seat-name', name + (p[from] === false ? ' ☠️' : '')));
        side.append(cell);
      }
    }
    function lastPlayers() { return (window.__pgPlayers || []); }

    loop(ctx, () => {
      const now = performance.now();
      const dt = now - lastT; lastT = now;
      if (alive && cur) {
        fallAcc += dt;
        const interval = soft ? 50 : 700;
        if (fallAcc > interval) {
          fallAcc = 0;
          if (!collide(cur.m, cur.x, cur.y + 1)) cur.y++;
          else lock();
        }
      }
      if (now - lastThumb > 600) { lastThumb = now; ctx.sendRt({ board: encodeBoard() }); }
      // 绘制
      g2d.fillStyle = '#0d0c1a'; g2d.fillRect(0, 0, 300, 600);
      // 网格线
      g2d.strokeStyle = 'rgba(255,255,255,.04)'; g2d.lineWidth = 1;
      for (let r = 0; r < H; r++) { g2d.beginPath(); g2d.moveTo(0, r*30); g2d.lineTo(300, r*30); g2d.stroke(); }
      for (let c = 0; c < W; c++) { g2d.beginPath(); g2d.moveTo(c*30, 0); g2d.lineTo(c*30, 600); g2d.stroke(); }
      const cell = 30;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const v = board[r][c];
        if (!v) continue;
        const color = v === 8 ? '#4b5563' : TCOLORS[v - 1];
        g2d.fillStyle = color;
        g2d.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
        // 高光
        g2d.fillStyle = 'rgba(255,255,255,.18)';
        g2d.fillRect(c * cell + 2, r * cell + 2, cell - 4, 5);
      }
      // 幽灵块(落点预览)
      if (alive && cur) {
        let ghostY = cur.y;
        while (!collide(cur.m, cur.x, ghostY + 1)) ghostY++;
        g2d.fillStyle = `${TCOLORS[cur.t]}44`;
        for (let r = 0; r < cur.m.length; r++) for (let c = 0; c < cur.m[r].length; c++)
          if (cur.m[r][c]) g2d.fillRect((cur.x + c) * cell + 1, (ghostY + r) * cell + 1, cell - 2, cell - 2);
        // 当前块
        g2d.fillStyle = TCOLORS[cur.t];
        for (let r = 0; r < cur.m.length; r++) for (let c = 0; c < cur.m[r].length; c++)
          if (cur.m[r][c]) {
            g2d.fillRect((cur.x + c) * cell + 1, (cur.y + r) * cell + 1, cell - 2, cell - 2);
            g2d.fillStyle = 'rgba(255,255,255,.2)';
            g2d.fillRect((cur.x + c) * cell + 2, (cur.y + r) * cell + 2, cell - 4, 5);
            g2d.fillStyle = TCOLORS[cur.t];
          }
      }
      if (!alive) {
        g2d.fillStyle = 'rgba(0,0,0,.72)'; g2d.fillRect(0, 0, 300, 600);
        g2d.fillStyle = '#fff'; g2d.font = 'bold 28px sans-serif'; g2d.textAlign = 'center';
        g2d.fillText('☠️ 已淘汰', 150, 290);
        g2d.font = '14px sans-serif'; g2d.fillStyle = 'rgba(255,255,255,.6)'; g2d.fillText('围观队友中…', 150, 320);
      }
      fx?.step();
    });
  };

  // ============ 合成大西瓜 ============
  R.suika = (ui, ctx, root) => {
    root.append(h('div', 'g-title', `${ui.title} · 点击投放，同款相碰合成升级`));
    const canvas = h('canvas', 'suika-board');
    const CW = 360, CH = 480;
    root.append(canvas);
    // 合成链展示
    const chainBar = h('div', 'g-sub center');
    chainBar.style.cssText = 'font-size:18px;letter-spacing:4px;padding:4px 0;';
    chainBar.textContent = ui.chain.join(' → ');
    root.append(chainBar);

    const g2d = setupHiDPI(canvas, CW, CH);
    const fx = window.FX?.pool(g2d);
    const rng = mulberry32(ui.seed ^ 0x5417);
    const chain = ui.chain;
    const radius = (lv) => 12 + lv * 7;
    const SUIKA_COLORS = ['#ffd166', '#ff8906', '#ef4565', '#a78bfa', '#22d3ee', '#2cb67d'];
    let balls = [], dropX = CW / 2, nextLv = Math.floor(rng() * 3), cooldown = 0, overflowT = 0;

    const px = (e) => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return (t.clientX - r.left) / r.width * CW;
    };
    canvas.addEventListener('pointermove', (e) => { dropX = px(e); });
    canvas.addEventListener('pointerdown', (e) => {
      dropX = px(e);
      if (cooldown > 0) return;
      cooldown = 20;
      const lv = nextLv;
      nextLv = Math.floor(rng() * 3);
      const r = radius(lv);
      window.sfx?.tap();
      balls.push({ x: Math.max(r, Math.min(CW - r, dropX)), y: r + 4, vx: 0, vy: 0, lv });
    });

    function physics() {
      const G = 0.45, REST = 0.25;
      for (const b of balls) {
        b.vy += G; b.x += b.vx; b.y += b.vy;
        const r = radius(b.lv);
        if (b.x < r) { b.x = r; b.vx *= -REST; }
        if (b.x > CW - r) { b.x = CW - r; b.vx *= -REST; }
        if (b.y > CH - r) { b.y = CH - r; b.vy *= -REST; b.vx *= 0.92; }
      }
      // 碰撞 + 合并(两轮迭代够稳定)
      for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], b = balls[j];
          if (a.dead || b.dead) continue;
          const ra = radius(a.lv), rb = radius(b.lv);
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01, min = ra + rb;
          if (d >= min) continue;
          if (a.lv === b.lv && a.lv < chain.length - 1) {
            a.dead = b.dead = true;
            const lv = a.lv + 1;
            balls.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vx: 0, vy: -2, lv });
            window.sfx?.merge(lv);
            fx?.burst((a.x + b.x) / 2, (a.y + b.y) / 2, { n: 8 + lv * 2, speed: 2.5 + lv * 0.3, size: 3, colors: [SUIKA_COLORS[lv % SUIKA_COLORS.length], '#fff'] });
            ctx.send({ type: 'merge', level: lv });
            continue;
          }
          const push = (min - d) / 2, nxv = dx / d, nyv = dy / d;
          a.x -= nxv * push; a.y -= nyv * push;
          b.x += nxv * push; b.y += nyv * push;
          const rel = (a.vx - b.vx) * nxv + (a.vy - b.vy) * nyv;
          if (rel > 0) {
            a.vx -= rel * nxv * 0.9; a.vy -= rel * nyv * 0.9;
            b.vx += rel * nxv * 0.9; b.vy += rel * nyv * 0.9;
          }
        }
        balls = balls.filter((b) => !b.dead);
      }
      // 超线检测:静止球压过顶线 2 秒 → 清空自己场地(重开)
      const overLine = balls.some((b) => b.y - radius(b.lv) < 60 && Math.abs(b.vy) < 1);
      const wasOver = overflowT > 0;
      overflowT = overLine ? overflowT + 1 : 0;
      if (overflowT > 0 && !wasOver) window.sfx?.danger();
      if (overflowT > 120) { balls = []; overflowT = 0; window.sfx?.explode(); window.FX?.shake(canvas, 1.5); }
    }

    loop(ctx, () => {
      if (cooldown > 0) cooldown--;
      physics();
      g2d.fillStyle = '#16142a'; g2d.fillRect(0, 0, CW, CH);
      g2d.strokeStyle = overflowT > 0 ? '#ef4565' : '#3a3760';
      g2d.setLineDash([6, 6]); g2d.beginPath(); g2d.moveTo(0, 60); g2d.lineTo(CW, 60); g2d.stroke(); g2d.setLineDash([]);
      g2d.textAlign = 'center'; g2d.textBaseline = 'middle';
      for (const b of balls) {
        g2d.font = `${radius(b.lv) * 1.7}px sans-serif`;
        g2d.fillText(chain[b.lv], b.x, b.y);
      }
      // 待投放
      g2d.globalAlpha = 0.7;
      g2d.font = `${radius(nextLv) * 1.7}px sans-serif`;
      g2d.fillText(chain[nextLv], dropX, 28);
      g2d.globalAlpha = 1;
      fx?.step();
    });
    ctx.onUpdate = () => {};
  };

  // ============ 竞技场射击 ============
  R.shooter = (ui, ctx, root) => {
    root.append(h('div', 'g-title', `${ui.title} · 左半屏移动，右半屏射击`));
    const canvas = h('canvas', 'arena-board');
    const CW = 400, CH = 400;
    root.append(canvas);
    const feedEl = h('div', 'history');
    root.append(feedEl);

    const g2d = setupHiDPI(canvas, CW, CH);
    const fx = window.FX?.pool(g2d);
    const emojis = ui.theme?.playerEmoji || ['🐱', '🐶', '🦊', '🐸', '🐼', '🐯', '🐰', '🦁'];
    const arenaColor = ui.theme?.arenaColor || '#16213e';
    const myIdx = Math.abs([...ctx.meId].reduce((a, c) => a + c.charCodeAt(0), 0));
    let me = { x: 40 + (myIdx % 5) * 70, y: 40 + (myIdx % 7) * 45, hp: 3, angle: 0 };
    const others = new Map();  // id -> {x,y,angle,tx,ty}
    const bullets = [];        // {x,y,vx,vy,mine,owner}
    const damage = new Map();  // enemyId -> 命中次数
    let joy = null, aim = null, lastFire = 0, lastPos = 0, lastKillSeq = 0, respawnFlash = 0;

    const pt = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width * CW, (e.clientY - r.top) / r.height * CH];
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const [x, y] = pt(e);
      if (x < CW / 2) joy = { ox: x, oy: y, x, y, id: e.pointerId };
      else aim = { x, y, id: e.pointerId };
    });
    canvas.addEventListener('pointermove', (e) => {
      const [x, y] = pt(e);
      if (joy && e.pointerId === joy.id) { joy.x = x; joy.y = y; }
      if (aim && e.pointerId === aim.id) { aim.x = x; aim.y = y; }
    });
    ['pointerup', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, (e) => {
      if (joy && e.pointerId === joy.id) joy = null;
      if (aim && e.pointerId === aim.id) aim = null;
    }));

    ctx.onRt = (from, data) => {
      if (data.p) {
        const o = others.get(from) || { x: data.p[0], y: data.p[1] };
        o.tx = data.p[0]; o.ty = data.p[1]; o.angle = data.p[2] || 0;
        others.set(from, o);
      }
      if (data.fire) bullets.push({ x: data.fire[0], y: data.fire[1], vx: Math.cos(data.fire[2]) * 5, vy: Math.sin(data.fire[2]) * 5, mine: false, owner: from });
    };
    ctx.onUpdate = (u) => {
      feedEl.innerHTML = '';
      (u.feed || []).forEach((f) => feedEl.append(h('span', 'h', f)));
      if (u.lastKill && u.lastKill.seq > lastKillSeq) {
        lastKillSeq = u.lastKill.seq;
        if (u.lastKill.victim === ctx.meId) { // 我被击杀:重生
          me.x = 20 + Math.random() * (CW - 40); me.y = 20 + Math.random() * (CH - 40);
          me.hp = 3; respawnFlash = 30;
        }
      }
    };

    loop(ctx, () => {
      const now = performance.now();
      // 移动
      if (joy) {
        const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
        const d = Math.hypot(dx, dy);
        if (d > 6) {
          const sp = Math.min(3.2, d / 12);
          me.x = Math.max(14, Math.min(CW - 14, me.x + dx / d * sp));
          me.y = Math.max(14, Math.min(CH - 14, me.y + dy / d * sp));
        }
      }
      // 射击(按住右半屏 300ms 一发,朝按点方向)
      if (aim && now - lastFire > 300) {
        lastFire = now;
        const ang = Math.atan2(aim.y - me.y, aim.x - me.x);
        me.angle = ang;
        window.sfx?.shoot();
        bullets.push({ x: me.x, y: me.y, vx: Math.cos(ang) * 5, vy: Math.sin(ang) * 5, mine: true });
        ctx.sendRt({ fire: [me.x, me.y, ang] });
      }
      // 位置上报 10Hz
      if (now - lastPos > 100) { lastPos = now; ctx.sendRt({ p: [Math.round(me.x), Math.round(me.y), +me.angle.toFixed(2)] }); }
      // 子弹推进 + 命中判定(射手权威:3 发击杀)
      for (const b of bullets) {
        b.x += b.vx; b.y += b.vy;
        if (b.mine) {
          for (const [id, o] of others) {
            if (Math.hypot(b.x - o.x, b.y - o.y) < 16) {
              b.gone = true;
              const n = (damage.get(id) || 0) + 1;
              if (n >= 3) {
                damage.set(id, 0);
                window.sfx?.explode();
                fx?.burst(o.x, o.y, { n: 24, speed: 4.5, size: 4 });
                window.FX?.shake(canvas, 1.5);
                ctx.send({ type: 'kill', target: id });
              }
              else { damage.set(id, n); window.sfx?.hit(); fx?.burst(b.x, b.y, { n: 6, speed: 2.5, size: 2.5, colors: ['#ffe066', '#fff'] }); }
            }
          }
        } else if (Math.hypot(b.x - me.x, b.y - me.y) < 16) {
          b.gone = true; me.hp = Math.max(0, me.hp - 1);
          window.sfx?.hit();
          fx?.burst(me.x, me.y, { n: 8, speed: 3, size: 3, colors: ['#ef4565', '#fff'] });
          window.FX?.shake(canvas, 0.8);
        }
      }
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        if (b.gone || b.x < -10 || b.x > CW + 10 || b.y < -10 || b.y > CH + 10) bullets.splice(i, 1);
      }
      // 对手插值
      for (const o of others.values()) {
        if (o.tx != null) { o.x += (o.tx - o.x) * 0.25; o.y += (o.ty - o.y) * 0.25; }
      }
      // 绘制
      g2d.fillStyle = arenaColor; g2d.fillRect(0, 0, CW, CH);
      // 网格
      g2d.strokeStyle = 'rgba(255,255,255,.05)'; g2d.lineWidth = 1;
      for (let i = 40; i < CW; i += 40) {
        g2d.beginPath(); g2d.moveTo(i, 0); g2d.lineTo(i, CH); g2d.stroke();
        g2d.beginPath(); g2d.moveTo(0, i); g2d.lineTo(CW, i); g2d.stroke();
      }
      g2d.textAlign = 'center'; g2d.textBaseline = 'middle';
      // 子弹拖尾
      g2d.fillStyle = '#ffe066';
      for (const b of bullets) {
        g2d.beginPath(); g2d.arc(b.x, b.y, b.mine ? 4 : 3, 0, 7); g2d.fill();
        g2d.globalAlpha = 0.3;
        g2d.beginPath(); g2d.arc(b.x - b.vx * 1.5, b.y - b.vy * 1.5, 2, 0, 7); g2d.fill();
        g2d.globalAlpha = 1;
      }
      // 对手
      let ei = 1;
      for (const [id, o] of others) {
        g2d.font = '26px sans-serif';
        g2d.save(); g2d.translate(o.x, o.y);
        if (o.angle) g2d.rotate(o.angle + Math.PI / 2);
        g2d.fillText(emojis[ei++ % emojis.length], 0, 0);
        g2d.restore();
      }
      // 自己(带血条)
      if (respawnFlash > 0) { g2d.globalAlpha = respawnFlash % 6 < 3 ? 0.4 : 1; respawnFlash--; }
      g2d.font = '28px sans-serif';
      g2d.save(); g2d.translate(me.x, me.y);
      if (me.angle) g2d.rotate(me.angle + Math.PI / 2);
      g2d.fillText(emojis[0], 0, 0);
      g2d.restore();
      g2d.globalAlpha = 1;
      // 血条
      g2d.fillStyle = 'rgba(0,0,0,.5)'; g2d.fillRect(me.x - 16, me.y - 24, 32, 5);
      g2d.fillStyle = me.hp > 1 ? '#2cb67d' : '#ef4565';
      g2d.fillRect(me.x - 16, me.y - 24, Math.max(0, me.hp / 3 * 32), 5);
      // 摇杆
      if (joy) {
        g2d.strokeStyle = 'rgba(255,255,255,.3)'; g2d.lineWidth = 2;
        g2d.beginPath(); g2d.arc(joy.ox, joy.oy, 28, 0, 7); g2d.stroke();
        g2d.fillStyle = 'rgba(255,255,255,.4)';
        g2d.beginPath(); g2d.arc(joy.x, joy.y, 12, 0, 7); g2d.fill();
      }
      fx?.step();
    });
  };

  // ============ 格斗对战 ============
  R.fight = (ui, ctx, root) => {
    const theme = ui.theme || {};
    const fighters = theme.fighters || [];
    root.append(h('div', 'g-title', `${ui.title} · 第 ${ui.round} 场`));
    const hpRow = h('div', 'fight-hp');
    const hpA = h('div', 'hp-side'); const hpB = h('div', 'hp-side right');
    hpRow.append(hpA, hpB);
    root.append(hpRow);
    const canvas = h('canvas', 'fight-stage');
    const CW = 400, CH = 220;
    root.append(canvas);
    const queueEl = h('div', 'g-sub center');
    root.append(queueEl);

    const g2d = setupHiDPI(canvas, CW, CH);
    const fx = window.FX?.pool(g2d);
    let freezeT = 0; // hit-stop:命中瞬间冻结几帧增强打击感
    let A = ui.a, B = ui.b;
    const iAmA = ctx.meId === A.id, iAmB = ctx.meId === B.id, fighting = iAmA || iAmB;
    const myEmoji = (i) => fighters[i % Math.max(1, fighters.length)]?.emoji || ['🥷', '🥋'][i % 2];
    // 本地演员状态:x(0-100), facing(1/-1), pose
    const actors = {
      [A.id]: { x: 25, facing: 1, pose: 'idle', poseT: 0 },
      [B.id]: { x: 75, facing: -1, pose: 'idle', poseT: 0 },
    };
    const meActor = actors[ctx.meId];
    let moveDir = 0, lastRt = 0, lastAtk = 0, blocking = false;
    const oppId = iAmA ? B.id : A.id;

    if (fighting) {
      const moves = theme.moves || {};
      root.append(btnRow([
        ['◀', { down: () => { moveDir = -1; }, up: () => { moveDir = 0; } }],
        ['▶', { down: () => { moveDir = 1; }, up: () => { moveDir = 0; } }],
        [`👊${moves.punch ? ' ' + moves.punch : ''}`, { down: () => attack('punch', 6, 320), wide: true }],
        [`🦵${moves.kick ? ' ' + moves.kick : ''}`, { down: () => attack('kick', 9, 650), wide: true }],
        ['🛡', { down: () => { blocking = true; setPose('block'); }, up: () => { blocking = false; } }],
      ]));
    } else {
      root.append(h('p', 'g-sub center', '⚔️ 观战中,失败者将排到队尾'));
    }

    function setPose(p, ms = 300) {
      meActor.pose = p; meActor.poseT = performance.now() + ms;
      pushRt(true);
    }
    function attack(kind, dmg, cd) {
      const now = performance.now();
      if (blocking || now - lastAtk < cd) return;
      lastAtk = now;
      setPose(kind);
      const opp = actors[oppId];
      if (opp && Math.abs(meActor.x - opp.x) < 14) {
        const real = opp.pose === 'block' ? 2 : dmg;
        if (opp.pose === 'block') window.sfx?.tap();
        else {
          window.sfx?.hit();
          freezeT = 4;
          fx?.burst(opp.x / 100 * CW, CH - 60, { n: 12, speed: 3.5, size: 3, colors: ['#ff8906', '#ffd166', '#fff'] });
        }
        ctx.send({ type: 'hit', dmg: real });
      }
    }
    function pushRt(force) {
      const now = performance.now();
      if (!force && now - lastRt < 66) return;
      lastRt = now;
      ctx.sendRt({ f: [Math.round(meActor.x * 10) / 10, meActor.facing, meActor.pose] });
    }

    ctx.onRt = (from, data) => {
      if (data.f && actors[from]) {
        const a = actors[from];
        a.x = data.f[0]; a.facing = data.f[1]; a.pose = data.f[2] || 'idle';
        a.poseT = performance.now() + 300;
      }
    };
    ctx.onUpdate = (u) => {
      const prevMyHp = iAmA ? A.hp : iAmB ? B.hp : null;
      A = u.a; B = u.b;
      const myHp = iAmA ? A.hp : iAmB ? B.hp : null;
      if (prevMyHp != null && myHp != null && myHp < prevMyHp) {
        window.sfx?.hit();
        window.FX?.flash(canvas);
        window.FX?.shake(canvas, 0.8);
        fx?.burst(meActor.x / 100 * CW, CH - 60, { n: 10, speed: 3, size: 3, colors: ['#ef4565', '#fff'] });
      }
      renderHp();
      queueEl.textContent = u.queue?.length ? `等待挑战:${u.queue.join('、')}` : '';
      // 新一场:重置演员
      if (!actors[A.id] || !actors[B.id]) {
        for (const k of Object.keys(actors)) delete actors[k];
        actors[A.id] = { x: 25, facing: 1, pose: 'idle', poseT: 0 };
        actors[B.id] = { x: 75, facing: -1, pose: 'idle', poseT: 0 };
        ctx.rerender(); // 台上人变了,重建控制区
      }
    };
    function renderHp() {
      hpA.innerHTML = `<div class="hp-name">${A.name}</div><div class="hp-bar"><div class="hp-fill" style="width:${A.hp}%"></div></div>`;
      hpB.innerHTML = `<div class="hp-name">${B.name}</div><div class="hp-bar"><div class="hp-fill" style="width:${B.hp}%"></div></div>`;
    }
    renderHp();
    queueEl.textContent = ui.queue?.length ? `等待挑战:${ui.queue.join('、')}` : '';

    loop(ctx, () => {
      const now = performance.now();
      if (freezeT > 0) { freezeT--; return; } // hit-stop:冻结画面几帧
      if (fighting && moveDir) {
        meActor.x = Math.max(6, Math.min(94, meActor.x + moveDir * 0.9));
        meActor.facing = moveDir;
        if (meActor.pose === 'idle') meActor.pose = 'walk';
        pushRt();
      } else if (fighting && meActor.pose === 'walk') meActor.pose = 'idle';
      for (const a of Object.values(actors)) if (a.poseT && now > a.poseT && a.pose !== 'block') a.pose = 'idle';
      if (fighting && blocking) meActor.pose = 'block';

      // 绘制舞台
      g2d.fillStyle = '#0e0d1c'; g2d.fillRect(0, 0, CW, CH);
      // 地板
      g2d.fillStyle = '#1e1c35'; g2d.fillRect(0, CH - 34, CW, 34);
      g2d.fillStyle = '#2a2742'; g2d.fillRect(0, CH - 36, CW, 3);
      // 背景灯光
      g2d.save();
      g2d.globalAlpha = 0.07;
      g2d.fillStyle = '#7f5af0'; g2d.beginPath(); g2d.arc(CW * 0.25, 0, 120, 0, Math.PI * 2); g2d.fill();
      g2d.fillStyle = '#ff8906'; g2d.beginPath(); g2d.arc(CW * 0.75, 0, 120, 0, Math.PI * 2); g2d.fill();
      g2d.restore();
      g2d.textAlign = 'center'; g2d.textBaseline = 'middle';
      [A, B].forEach((f, i) => {
        const a = actors[f.id]; if (!a) return;
        const x = a.x / 100 * CW, y = CH - 60;
        const lunge = (a.pose === 'punch' ? 10 : a.pose === 'kick' ? 16 : 0) * a.facing;
        // 阴影
        g2d.save(); g2d.globalAlpha = 0.3;
        g2d.fillStyle = '#000';
        g2d.beginPath(); g2d.ellipse(x + lunge, CH - 28, 22, 7, 0, 0, Math.PI * 2); g2d.fill();
        g2d.restore();
        g2d.save();
        g2d.translate(x + lunge, y);
        if (a.facing === -1) g2d.scale(-1, 1);
        // 格斗者发光
        if (a.pose === 'punch' || a.pose === 'kick') {
          g2d.shadowColor = '#ff8906'; g2d.shadowBlur = 18;
        }
        g2d.font = '44px sans-serif';
        g2d.fillText(myEmoji(i), 0, 0);
        g2d.shadowBlur = 0;
        g2d.restore();
        // 招式特效
        g2d.font = '18px sans-serif';
        if (a.pose === 'punch') { g2d.fillText('👊', x + a.facing * 34, y - 6); }
        if (a.pose === 'kick')  { g2d.fillText('🦶', x + a.facing * 38, y + 8); }
        if (a.pose === 'block') { g2d.fillText('🛡️', x + a.facing * 26, y); }
      });
      fx?.step();
    });
  };
})();
