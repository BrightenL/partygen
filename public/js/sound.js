// PartyGen 音效系统 — Web Audio API 合成，无需音频文件
window.sfx = (() => {
  let ctx = null;
  let noiseBuf = null;
  const get = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };
  function tone(freq, type, start, dur, g0, g1, ac) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(g0, start);
    g.gain.exponentialRampToValueAtTime(Math.max(g1, 0.001), start + dur);
    o.start(start); o.stop(start + dur + 0.01);
  }
  // 白噪声 → 滤波 → 增益：打击/爆炸类音色的基础
  function noise(ac, start, dur, { type = 'lowpass', freq = 1000, freqEnd, q = 1, g0 = 0.3 } = {}) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, start);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), start + dur);
    g.gain.setValueAtTime(g0, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start(start); src.stop(start + dur + 0.02);
  }
  // 振荡器频率滑音：激光/下坠类音色
  function sweep(ac, start, dur, f0, f1, type = 'sawtooth', g0 = 0.2) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), start + dur);
    g.gain.setValueAtTime(g0, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(start); o.stop(start + dur + 0.01);
  }
  function play(fn) {
    try { const ac = get(); if (ac.state === 'suspended') ac.resume(); fn(ac); } catch {}
  }
  return {
    tap()       { play(ac => tone(600, 'sine', ac.currentTime, 0.04, 0.18, 0.001, ac)); },
    correct()   { play(ac => { const t = ac.currentTime; [[523,0],[659,.08],[784,.16]].forEach(([f,d]) => tone(f,'sine',t+d,.18,.3,.001,ac)); }); },
    wrong()     { play(ac => { const t = ac.currentTime; tone(220,'sawtooth',t,.12,.25,.001,ac); tone(180,'sawtooth',t+.1,.15,.2,.001,ac); }); },
    countdown() { play(ac => tone(1046, 'square', ac.currentTime, 0.06, 0.22, 0.001, ac)); },
    pop()       { play(ac => { const t = ac.currentTime; tone(800,'sine',t,.05,.15,.001,ac); tone(1200,'sine',t+.04,.08,.12,.001,ac); }); },
    win()       { play(ac => { const t = ac.currentTime; [[523,0],[659,.1],[784,.2],[1046,.32]].forEach(([f,d]) => tone(f,'sine',t+d,.22,.35,.001,ac)); }); },
    start()     { play(ac => { const t = ac.currentTime; [[392,0],[523,.12],[659,.24],[784,.36]].forEach(([f,d]) => tone(f,'triangle',t+d,.2,.28,.001,ac)); }); },
    // ---- 实时游戏音效 ----
    hit()       { play(ac => { const t = ac.currentTime; noise(ac, t, 0.06, { type: 'bandpass', freq: 1200, q: 2, g0: 0.35 }); tone(80, 'square', t, 0.05, 0.25, 0.001, ac); }); },
    explode()   { play(ac => { const t = ac.currentTime; noise(ac, t, 0.35, { type: 'lowpass', freq: 2000, freqEnd: 100, g0: 0.45 }); tone(60, 'sine', t, 0.3, 0.4, 0.001, ac); }); },
    clearLine(n){ play(ac => { const t = ac.currentTime; const k = Math.min(n || 1, 4); for (let i = 0; i < k; i++) tone(660 + i * 220, 'sine', t + i * 0.05, 0.12, 0.25, 0.001, ac); if (k >= 4) noise(ac, t + 0.2, 0.15, { type: 'highpass', freq: 3000, g0: 0.2 }); }); },
    merge(lv)   { play(ac => { const t = ac.currentTime; const f = 440 * Math.pow(2, (lv || 0) / 8); tone(f, 'sine', t, 0.08, 0.25, 0.001, ac); tone(f * 1.5, 'sine', t + 0.05, 0.1, 0.18, 0.001, ac); }); },
    shoot()     { play(ac => sweep(ac, ac.currentTime, 0.06, 900, 300, 'sawtooth', 0.12)); },
    land()      { play(ac => noise(ac, ac.currentTime, 0.04, { type: 'lowpass', freq: 400, g0: 0.3 })); },
    danger()    { play(ac => { const t = ac.currentTime; tone(150, 'sawtooth', t, 0.15, 0.2, 0.001, ac); tone(110, 'sawtooth', t + 0.16, 0.18, 0.2, 0.001, ac); }); },
  };
})();
