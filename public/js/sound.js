// PartyGen 音效系统 — Web Audio API 合成，无需音频文件
window.sfx = (() => {
  let ctx = null;
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
  };
})();
