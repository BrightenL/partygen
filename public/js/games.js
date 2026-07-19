// 各游戏视图渲染器:输入 (ui, ctx) → DOM。ctx: { me, send(action), el(...)  }
// send(action) 会发 { type:'action', action } 给服务端
(function () {
  const h = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  function rankList(scores) {
    const wrap = h('div', 'rank');
    const max = Math.max(1, ...scores.map((s) => s.score));
    scores.forEach((s, i) => {
      const item = h('div', 'rank-item');
      item.append(h('div', 'pos', `${i + 1}`), h('div', 'nm', s.name));
      const bw = h('div', 'bar-wrap');
      const bar = h('div', 'bar');
      bar.style.width = `${Math.max(4, (s.score / max) * 100)}%`;
      bw.append(bar);
      item.append(bw, h('div', 'pts', `${s.score}`));
      wrap.append(item);
    });
    return wrap;
  }

  function chatBox(chat) {
    const c = h('div', 'chat');
    (chat || []).forEach((m) => {
      const line = h('div', m.correct ? 'correct' : '');
      line.append(h('span', 'c-name', m.name + ':'), document.createTextNode(m.text));
      c.append(line);
    });
    return c;
  }

  function guessInput(ctx, placeholder, actionType) {
    const row = h('div', 'numpad-row');
    const input = h('input', 'input');
    input.placeholder = placeholder;
    input.maxLength = 30;
    const btn = h('button', 'btn btn-primary', '发送');
    const go = () => {
      const text = input.value.trim();
      if (!text) return;
      ctx.send({ type: actionType, text, word: text });
      input.value = '';
    };
    btn.onclick = go;
    input.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    row.append(input, btn);
    return row;
  }

  const R = {};

  // ---- quiz / emoji 共用的 reveal ----
  R.reveal = (ui, ctx, root) => {
    root.append(h('div', 'g-question', ui.question));
    if (ui.options) {
      const opts = h('div', 'options');
      ui.options.forEach((o, i) => {
        const b = h('button', 'opt' + (i === ui.answer ? ' correct' : ''), o);
        b.disabled = true;
        opts.append(b);
      });
      root.append(opts);
    }
    if (ui.explain) root.append(h('p', 'g-sub', ui.explain));
    if (ui.scores) root.append(rankList(ui.scores));
  };

  R.question = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title), h('div', 'g-question', ui.question));
    const opts = h('div', 'options');
    ui.options.forEach((o, i) => {
      const b = h('button', 'opt' + (ctx.myChoice === i ? ' sel' : ''), o);
      b.onclick = () => { ctx.myChoice = i; ctx.send({ type: 'answer', choice: i }); ctx.rerender(); };
      if (ctx.myChoice != null) b.disabled = true;
      opts.append(b);
    });
    root.append(opts);
    if (ui.answeredCount) root.append(h('p', 'g-sub', `${ui.answeredCount} 人已作答`));
  };

  R.emoji = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title), h('div', 'g-sub', ui.subtitle),
      h('div', 'big-emoji', ui.emoji), h('div', 'g-sub', `提示:${ui.hint}`));
    root.append(chatBox(ui.chat));
    if (!(ui.guessed || []).includes(ctx.meName)) root.append(guessInput(ctx, '输入你的答案…', 'guess'));
    else root.append(h('p', 'g-sub', '你已猜中,等其他人~'));
  };

  // ---- 谁是卧底 ----
  R.turn = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title), h('div', 'g-sub', ui.subtitle));
    const banner = h('div', 'turn-banner');
    banner.append(h('div', 'g-sub', '正在描述'), h('div', 'who', ui.current));
    root.append(banner);
    const order = h('div', 'history');
    (ui.order || []).forEach((p) => order.append(h('span', 'h', (p.done ? '✅ ' : '') + p.name)));
    root.append(order);
    if (ui.actionFor === ctx.meId) {
      const b = h('button', 'btn btn-primary btn-big', ui.actionLabel || '下一位');
      b.onclick = () => ctx.send({ type: 'next' });
      root.append(b);
    }
  };

  R.vote = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title), h('div', 'g-question', ui.subtitle));
    const opts = h('div', 'options');
    (ui.candidates || []).forEach((c) => {
      const b = h('button', 'opt' + (ctx.myVote === c.id ? ' sel' : ''), c.name);
      if (c.id === ctx.meId) b.disabled = true;
      b.onclick = () => { ctx.myVote = c.id; ctx.send({ type: 'vote', target: c.id }); ctx.rerender(); };
      if (ctx.myVote != null) b.disabled = true;
      opts.append(b);
    });
    root.append(opts);
    if (ui.votedCount) root.append(h('p', 'g-sub', `${ui.votedCount} 人已投票`));
  };

  R.voteReveal = (ui, ctx, root) => {
    root.append(h('div', 'g-question', ui.subtitle), h('div', 'confetti', '🏆'),
      h('div', 'final-title', ui.winner));
    const wrap = h('div', 'rank');
    const max = Math.max(1, ...ui.results.map((r) => r.votes));
    ui.results.forEach((r) => {
      const item = h('div', 'rank-item');
      item.append(h('div', 'nm', r.name));
      const bw = h('div', 'bar-wrap'); const bar = h('div', 'bar');
      bar.style.width = `${Math.max(4, (r.votes / max) * 100)}%`; bw.append(bar);
      item.append(bw, h('div', 'pts', `${r.votes}票`));
      wrap.append(item);
    });
    root.append(wrap);
  };

  // ---- 你画我猜 ----
  R.draw = (ui, ctx, root) => {
    const isDrawer = ui.drawerId === ctx.meId;
    root.append(h('div', 'g-title', `${ui.title} · ${ui.drawerName} 在画 (${ui.wordLen} 个字)`));
    const canvas = h('canvas', 'board');
    canvas.width = 800; canvas.height = 560;
    root.append(canvas);
    const g2d = canvas.getContext('2d');
    g2d.fillStyle = '#fffffe'; g2d.fillRect(0, 0, 800, 560);
    g2d.lineCap = 'round'; g2d.lineJoin = 'round';
    const drawStroke = (s) => {
      if (!s || s.pts.length < 2) return;
      g2d.strokeStyle = s.color || '#111'; g2d.lineWidth = s.w || 5;
      g2d.beginPath(); g2d.moveTo(s.pts[0][0], s.pts[0][1]);
      for (const [x, y] of s.pts.slice(1)) g2d.lineTo(x, y);
      g2d.stroke();
    };
    (ctx.strokes || []).forEach(drawStroke);
    ctx.onStroke = (s) => drawStroke(s);
    ctx.onClear = () => { g2d.fillStyle = '#fffffe'; g2d.fillRect(0, 0, 800, 560); };

    if (isDrawer) {
      let cur = null;
      const pos = (e) => {
        const r = canvas.getBoundingClientRect();
        const t = e.touches ? e.touches[0] : e;
        return [Math.round((t.clientX - r.left) / r.width * 800), Math.round((t.clientY - r.top) / r.height * 560)];
      };
      const start = (e) => { e.preventDefault(); cur = { color: ctx.penColor || '#111', w: 5, pts: [pos(e)] }; };
      const move = (e) => {
        if (!cur) return; e.preventDefault();
        cur.pts.push(pos(e));
        if (cur.pts.length % 4 === 0) drawStroke({ ...cur, pts: cur.pts.slice(-5) });
      };
      const end = () => {
        if (!cur || cur.pts.length < 2) { cur = null; return; }
        ctx.send({ type: 'stroke', stroke: cur }); cur = null;
      };
      canvas.addEventListener('touchstart', start); canvas.addEventListener('touchmove', move);
      canvas.addEventListener('touchend', end);
      canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move);
      canvas.addEventListener('mouseup', end);
      const tools = h('div', 'draw-tools');
      ['#111111', '#ef4565', '#3b82f6', '#2cb67d', '#eab308'].forEach((c) => {
        const b = h('button', 'btn btn-mini'); b.style.background = c; b.style.width = '36px';
        b.onclick = () => { ctx.penColor = c; };
        tools.append(b);
      });
      const clear = h('button', 'btn btn-mini', '清空');
      clear.onclick = () => ctx.send({ type: 'clear' });
      tools.append(clear);
      root.append(tools);
    } else {
      root.append(chatBox(ui.chat));
      if (!(ui.guessed || []).includes(ctx.meName)) root.append(guessInput(ctx, '你猜是什么?', 'guess'));
      else root.append(h('p', 'g-sub', '你已猜中 🎉'));
    }
  };

  R.roundEnd = (ui, ctx, root) => {
    root.append(h('div', 'final-title', ui.title), rankList(ui.scores));
  };

  // ---- 数字炸弹 ----
  R.bomb = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title));
    const range = h('div', 'bomb-range');
    range.append(document.createTextNode('💣 '), h('span', '', `${ui.low} ~ ${ui.high}`));
    root.append(range);
    const hist = h('div', 'history');
    (ui.history || []).forEach((x) => hist.append(h('span', 'h', `${x.name}: ${x.n}`)));
    root.append(hist);
    if (ui.actionFor === ctx.meId) {
      const row = h('div', 'numpad-row');
      const input = h('input', 'input'); input.type = 'number'; input.placeholder = `${ui.low}~${ui.high}`;
      const btn = h('button', 'btn btn-primary', '猜!');
      btn.onclick = () => { const n = Number(input.value); if (n) ctx.send({ type: 'guess', n }); };
      row.append(input, btn);
      root.append(h('div', 'turn-banner'), row);
    } else {
      const banner = h('div', 'turn-banner');
      banner.append(h('div', 'g-sub', '正在抉择'), h('div', 'who', ui.current));
      root.append(banner);
    }
  };

  // ---- 快速反应 ----
  R.react = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title), h('div', 'react-instr', ui.instruction));
    const pad = h('div', 'react-pad', ui.shown.name);
    pad.style.background = ui.shown.hex;
    pad.onclick = () => { ctx.send({ type: 'tap' }); pad.style.opacity = .6; };
    root.append(pad);
    const feed = h('div', 'history');
    (ui.feed || []).forEach((f) => feed.append(h('span', 'h', `${f.correct ? '✅' : '❌'} ${f.name}`)));
    root.append(feed);
  };

  // ---- 词语接龙 ----
  R.chain = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title), h('div', 'g-sub', ui.subtitle));
    if (ui.last) root.append(h('div', 'big-word', ui.last));
    const hist = h('div', 'history');
    (ui.words || []).forEach((w) => hist.append(h('span', 'h', w)));
    root.append(hist);
    if (ui.actionFor === ctx.meId) root.append(guessInput(ctx, '轮到你接了…', 'word'));
    else {
      const banner = h('div', 'turn-banner');
      banner.append(h('div', 'g-sub', `${ui.aliveCount} 人存活 · 正在思考`), h('div', 'who', ui.current));
      root.append(banner);
    }
  };

  // ---- 真心话转盘 ----
  R.wheel = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title), h('div', 'confetti', '🎡'));
    const banner = h('div', 'turn-banner');
    banner.append(h('div', 'g-sub', '转盘选中了'), h('div', 'who', ui.chosen));
    root.append(banner, h('div', 'g-question', ui.question), h('p', 'g-sub', ui.subtitle));
    if (ui.chosenId !== ctx.meId) {
      const b = h('button', 'btn btn-primary', `👍 通过 (${ui.approves}/${ui.need})`);
      b.onclick = () => ctx.send({ type: 'approve' });
      root.append(b);
    } else {
      root.append(h('p', 'g-sub', `其他人满意就会放你过关 (${ui.approves}/${ui.need})`));
    }
  };

  // ---- 结算 ----
  R.final = (ui, ctx, root) => {
    root.append(h('div', 'confetti', '🎉'), h('div', 'final-title', ui.title));
    if (ui.subtitle) root.append(h('p', 'g-sub center', ui.subtitle));
    if (ui.scores) root.append(rankList(ui.scores));
  };

  window.GameRenderers = R;
})();
