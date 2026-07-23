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
        const b = h('button', 'opt' + (i === ui.answer ? ' correct' : ' wrong'), o);
        b.disabled = true;
        opts.append(b);
      });
      root.append(opts);
      if (ctx.myChoice != null) {
        ctx.myChoice === ui.answer ? window.sfx?.correct() : window.sfx?.wrong();
      }
    }
    if (ui.explain) root.append(h('p', 'g-sub', ui.explain));
    if (ui.scores) root.append(rankList(ui.scores));
  };

  R.question = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title), h('div', 'g-question', ui.question));
    const opts = h('div', 'options');
    ui.options.forEach((o, i) => {
      const b = h('button', 'opt' + (ctx.myChoice === i ? ' sel' : ''), o);
      b.onclick = () => {
        if (ctx.myChoice != null) return;
        ctx.myChoice = i;
        window.sfx?.tap();
        ctx.send({ type: 'answer', choice: i });
        ctx.rerender();
      };
      if (ctx.myChoice != null) b.disabled = true;
      opts.append(b);
    });
    root.append(opts);
    if (ui.answeredCount) {
      const prog = h('div', 'answer-prog');
      prog.innerHTML = `<span class="g-sub">${ui.answeredCount} 人已作答</span>`;
      root.append(prog);
    }
  };

  R.emoji = (ui, ctx, root) => {
    const emojiEl = h('div', 'big-emoji', ui.emoji);
    emojiEl.style.animation = 'logo-float 2.5s ease-in-out infinite';
    root.append(h('div', 'g-title', ui.title), h('div', 'g-sub', ui.subtitle), emojiEl);
    const hintEl = h('div', 'hint-bar');
    hintEl.innerHTML = `💡 <span style="color:var(--muted)">${ui.hint}</span>`;
    hintEl.style.cssText = 'text-align:center;padding:6px 0 10px;font-size:14px;';
    root.append(hintEl);
    const guessed = ui.guessed || [];
    if (guessed.length) {
      const gl = h('div', 'history');
      guessed.forEach(n => gl.append(h('span', 'h', '✅ ' + n)));
      root.append(gl);
    }
    root.append(chatBox(ui.chat));
    if (!guessed.includes(ctx.meName)) root.append(guessInput(ctx, '输入你的答案…', 'guess'));
    else root.append(h('p', 'g-sub', '🎉 你已猜中，等其他人~'));
  };

  // ---- 谁是卧底 ----
  R.turn = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title), h('div', 'g-sub', ui.subtitle));
    const banner = h('div', 'turn-banner');
    const isMe = ui.actionFor === ctx.meId;
    banner.append(
      h('div', 'g-sub', isMe ? '👉 轮到你描述了！' : '正在描述'),
      h('div', 'who', isMe ? '你' : ui.current)
    );
    if (isMe) banner.style.cssText = 'background:rgba(127,90,240,.12);border-radius:14px;padding:12px;';
    root.append(banner);
    const order = h('div', 'history');
    (ui.order || []).forEach((p) => {
      const chip = h('span', 'h', (p.done ? '✅ ' : p.name === ui.current ? '🎙️ ' : '') + p.name);
      if (p.name === ui.current && !p.done) chip.style.color = 'var(--accent)';
      order.append(chip);
    });
    root.append(order);
    if (isMe) {
      const b = h('button', 'btn btn-primary btn-big', ui.actionLabel || '描述完毕，下一位 →');
      b.onclick = () => ctx.send({ type: 'next' });
      root.append(b);
    }
  };

  R.vote = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title));
    const q = h('div', 'g-question', ui.subtitle);
    q.style.marginBottom = '16px';
    root.append(q);
    const opts = h('div', 'options');
    (ui.candidates || []).forEach((c) => {
      const isMe = c.id === ctx.meId;
      const b = h('button', 'opt' + (ctx.myVote === c.id ? ' sel' : ''), (isMe ? '🚫 ' : '') + c.name);
      if (isMe) { b.disabled = true; b.style.opacity = '.45'; }
      b.onclick = () => {
        if (ctx.myVote != null || isMe) return;
        ctx.myVote = c.id;
        window.sfx?.tap();
        ctx.send({ type: 'vote', target: c.id });
        ctx.rerender();
      };
      if (ctx.myVote != null) b.disabled = true;
      opts.append(b);
    });
    root.append(opts);
    if (ui.votedCount) root.append(h('p', 'g-sub', `🗳️ ${ui.votedCount} 人已投票`));
  };

  R.voteReveal = (ui, ctx, root) => {
    window.sfx?.win();
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
    const header = h('div', 'g-title', isDrawer
      ? `✏️ 你来画！(${ui.wordLen} 个字)`
      : `🎨 ${ui.drawerName} 在画 · 猜猜是什么 (${ui.wordLen} 个字)`);
    root.append(header);
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
      const start = (e) => { e.preventDefault(); cur = { color: ctx.penColor || '#111', w: ctx.penSize || 5, pts: [pos(e)] }; };
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
      // 颜色
      ['#111111', '#ef4565', '#3b82f6', '#2cb67d', '#eab308', '#f97316', '#a78bfa', '#fffffe'].forEach((c) => {
        const b = h('button', 'btn btn-mini draw-color');
        b.style.cssText = `background:${c};width:32px;height:32px;border-radius:50%;padding:0;border:2px solid transparent;`;
        b.onclick = () => {
          ctx.penColor = c;
          tools.querySelectorAll('.draw-color').forEach(x => x.style.borderColor = 'transparent');
          b.style.borderColor = 'var(--primary)';
        };
        tools.append(b);
      });
      // 粗细
      const sizeBtn = h('button', 'btn btn-mini', '粗');
      sizeBtn.onclick = () => { ctx.penSize = ctx.penSize === 5 ? 14 : 5; sizeBtn.textContent = ctx.penSize === 5 ? '粗' : '细'; };
      const clear = h('button', 'btn btn-mini', '🗑️ 清空');
      clear.onclick = () => ctx.send({ type: 'clear' });
      tools.append(sizeBtn, clear);
      root.append(tools);
    } else {
      root.append(chatBox(ui.chat));
      if (!(ui.guessed || []).includes(ctx.meName)) root.append(guessInput(ctx, '你猜是什么？', 'guess'));
      else root.append(h('p', 'g-sub', '🎉 你已猜中，等其他人~'));
    }
  };

  R.roundEnd = (ui, ctx, root) => {
    window.sfx?.win();
    root.append(h('div', 'final-title', ui.title), rankList(ui.scores));
  };

  // ---- 数字炸弹 ----
  R.bomb = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title));
    const urgency = Math.max(0.3, 1 - (ui.high - ui.low) / 100);
    const bombEl = document.createElement('div');
    bombEl.className = 'bomb-emoji';
    bombEl.style.setProperty('--bomb-speed', `${Math.max(0.25, 1 - urgency * 0.7}s`);
    bombEl.textContent = '💣';
    root.append(bombEl);
    const range = h('div', 'bomb-range');
    range.innerHTML = `<span>${ui.low}</span> ~ <span>${ui.high}</span>`;
    root.append(range);
    const hist = h('div', 'history');
    (ui.history || []).forEach((x) => hist.append(h('span', 'h', `${x.name}: ${x.n}`)));
    root.append(hist);
    if (ui.actionFor === ctx.meId) {
      const row = h('div', 'numpad-row');
      const input = h('input', 'input'); input.type = 'number'; input.placeholder = `${ui.low}~${ui.high}`;
      input.style.fontSize = '22px'; input.style.textAlign = 'center';
      const btn = h('button', 'btn btn-primary', '猜!');
      btn.onclick = () => { const n = Number(input.value); if (n) ctx.send({ type: 'guess', n }); };
      row.append(input, btn);
      const banner = h('div', 'turn-banner');
      banner.append(h('div', 'g-sub', '轮到你了'), h('div', 'who', '你'));
      root.append(banner, row);
      setTimeout(() => input.focus(), 80);
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
    pad.style.background = `radial-gradient(circle at 35% 35%, ${ui.shown.hex}cc, ${ui.shown.hex})`;
    pad.style.letterSpacing = '2px';
    pad.onclick = () => {
      window.sfx?.tap();
      pad.style.opacity = .7;
      pad.style.transform = 'scale(.96)';
      ctx.send({ type: 'tap' });
    };
    root.append(pad);
    const feed = h('div', 'history');
    (ui.feed || []).forEach((f) => feed.append(h('span', 'h', `${f.correct ? '✅' : '❌'} ${f.name}`)));
    root.append(feed);
  };

  // ---- 词语接龙 ----
  R.chain = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title), h('div', 'g-sub', ui.subtitle));
    if (ui.last) {
      const word = h('div', 'big-word', ui.last);
      word.style.cssText = 'background:linear-gradient(135deg,var(--primary),var(--accent));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;';
      root.append(word);
    }
    const hist = h('div', 'history');
    (ui.words || []).forEach((w, i) => {
      const chip = h('span', 'h', w);
      if (i === (ui.words.length - 1)) chip.style.color = 'var(--text)';
      hist.append(chip);
    });
    root.append(hist);
    if (ui.actionFor === ctx.meId) {
      const inp = guessInput(ctx, '轮到你接了，快想…', 'word');
      inp.style.marginTop = '8px';
      root.append(inp);
      setTimeout(() => inp.querySelector('input')?.focus(), 80);
    } else {
      const banner = h('div', 'turn-banner');
      banner.append(h('div', 'g-sub', `${ui.aliveCount} 人存活 · 正在思考`), h('div', 'who', ui.current));
      root.append(banner);
    }
  };

  // ---- 真心话转盘 ----
  R.wheel = (ui, ctx, root) => {
    root.append(h('div', 'g-title', ui.title));
    const wheel = h('div', '');
    wheel.style.cssText = 'text-align:center;font-size:56px;padding:8px 0;animation:logo-float 2s ease-in-out infinite;filter:drop-shadow(0 4px 20px rgba(127,90,240,.5));';
    wheel.textContent = '🎡';
    root.append(wheel);
    const banner = h('div', 'turn-banner');
    const isChosen = ui.chosenId === ctx.meId;
    banner.append(
      h('div', 'g-sub', isChosen ? '😱 转盘选中了你！' : '转盘选中了'),
      h('div', 'who', isChosen ? '你' : ui.chosen)
    );
    if (isChosen) banner.style.cssText = 'background:rgba(239,69,101,.1);border-radius:14px;padding:12px;';
    root.append(banner);
    const q = h('div', 'g-question', ui.question);
    q.style.margin = '12px 0 6px';
    root.append(q);
    if (ui.subtitle) root.append(h('p', 'g-sub', ui.subtitle));
    const prog = h('div', 'g-sub');
    prog.style.cssText = 'text-align:center;margin-top:10px;font-size:15px;';
    prog.textContent = `👍 ${ui.approves} / ${ui.need} 人通过`;
    root.append(prog);
    if (!isChosen) {
      const b = h('button', 'btn btn-primary', `通过 TA`);
      b.style.marginTop = '12px';
      b.onclick = () => { b.disabled = true; b.textContent = '已通过 ✓'; ctx.send({ type: 'approve' }); };
      root.append(b);
    } else {
      const tip = h('p', 'g-sub');
      tip.style.cssText = 'text-align:center;margin-top:8px;color:var(--muted);';
      tip.textContent = '等其他人投票放你过关…';
      root.append(tip);
    }
  };

  // ---- 结算 ----
  R.final = (ui, ctx, root) => {
    window.sfx?.win();
    root.append(h('div', 'confetti', '🎉'), h('div', 'final-title', ui.title));
    if (ui.subtitle) root.append(h('p', 'g-sub center', ui.subtitle));
    if (ui.scores) root.append(rankList(ui.scores));
  };

  window.GameRenderers = R;
})();
