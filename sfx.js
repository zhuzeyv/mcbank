/* ============================================================
   音效系统（Web Audio 合成，无需音频文件）
   ============================================================ */
const SFX = (function () {

  let ctx = null;
  let master = null;
  let enabled = true;
  let lastHit = 0;

  const KEY = 'mc_survivors_sfx_v1';

  try {
    const raw = localStorage.getItem(KEY);
    if (raw === '0') enabled = false;
  } catch (e) {}

  // 浏览器要求用户交互后才能出声，第一次点击/触摸时初始化
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || !enabled) return;
    try {
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }

  function noise(dur, vol) {
    if (!ctx || !enabled) return;
    try {
      const t0 = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = vol || 0.08;
      src.connect(g);
      g.connect(master);
      src.start(t0);
    } catch (e) {}
  }

  return {
    init,
    isOn: () => enabled,
    toggle() {
      enabled = !enabled;
      try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) {}
      if (enabled) { init(); tone(660, 0.08, 'square', 0.12); }
      return enabled;
    },

    /* 挥砍：短促的“嗖” */
    swing() { noise(0.05, 0.04); },
    /* 命中：低频撞击（节流，避免密集刷屏） */
    hit() {
      const now = Date.now();
      if (now - lastHit < 55) return;
      lastHit = now;
      tone(180, 0.05, 'square', 0.05, 120);
    },
    /* 击杀：清脆上扬 */
    kill() { tone(520, 0.09, 'square', 0.06, 780); },
    /* 受伤：低沉下坠 */
    hurt() { tone(160, 0.18, 'sawtooth', 0.09, 70); },
    /* 升级：三连音 */
    levelup() {
      tone(523, 0.1, 'square', 0.09);
      setTimeout(() => tone(659, 0.1, 'square', 0.09), 85);
      setTimeout(() => tone(784, 0.16, 'square', 0.1), 170);
    },
    /* 开宝箱：叮咚 */
    chest() {
      tone(880, 0.08, 'triangle', 0.1);
      setTimeout(() => tone(1174, 0.14, 'triangle', 0.09), 75);
    },
    /* BOSS 登场：低沉轰鸣 */
    boss() {
      tone(90, 0.5, 'sawtooth', 0.12, 60);
      noise(0.4, 0.06);
    },
    /* 按钮点击 */
    click() { tone(620, 0.04, 'square', 0.06); },
    /* 购买/获得 */
    buy() {
      tone(740, 0.07, 'square', 0.08);
      setTimeout(() => tone(988, 0.12, 'square', 0.08), 65);
    }
  };
})();

window.SFX = SFX;
