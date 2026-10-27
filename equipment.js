/* ============================================================
   装备系统
   ------------------------------------------------------------
   6 个部位，每件带 1~3 条随机词条，5 档品质。
   装备永久保存（localStorage + Supabase profiles.equipment）。
   ============================================================ */
const EQUIP = (function () {

  const SLOTS = ['helmet', 'chest', 'legs', 'boots', 'weapon', 'trinket'];
  const SLOT_NAME = {
    helmet: '头盔', chest: '胸甲', legs: '护腿',
    boots: '靴子', weapon: '武器', trinket: '饰品'
  };
  const SLOT_ICON = {
    helmet: 'helmetIco', chest: 'chestIco', legs: 'legsIco',
    boots: 'boot', weapon: 'sword', trinket: 'star'
  };

  // 品质：id 越大越好
  const QUALITY = [
    { id: 0, name: '普通', color: '#9a9aa8', dark: '#5a5a68', mul: 1.00, affix: 1 },
    { id: 1, name: '精良', color: '#4ade80', dark: '#237a35', mul: 1.35, affix: 2 },
    { id: 2, name: '稀有', color: '#3aa8ff', dark: '#1f5fa8', mul: 1.75, affix: 2 },
    { id: 3, name: '史诗', color: '#c45cf0', dark: '#6a35a8', mul: 2.30, affix: 3 },
    { id: 4, name: '传说', color: '#ffc93c', dark: '#c89410', mul: 3.00, affix: 3 }
  ];

  const STATS = [
    { id: 'hp',     name: '生命', base: 24,    pct: false },
    { id: 'dmg',    name: '伤害', base: 0.055, pct: true },
    { id: 'speed',  name: '移速', base: 0.035, pct: true },
    { id: 'haste',  name: '攻速', base: 0.045, pct: true },
    { id: 'crit',   name: '暴击', base: 0.035, pct: true },
    { id: 'armor',  name: '减伤', base: 0.030, pct: true },
    { id: 'pickup', name: '拾取', base: 0.120, pct: true }
  ];

  function rollQuality(luck) {
    const r = Math.random() * 100 - (luck || 0);
    if (r < 2) return QUALITY[4];
    if (r < 10) return QUALITY[3];
    if (r < 30) return QUALITY[2];
    if (r < 62) return QUALITY[1];
    return QUALITY[0];
  }

  // level：怪物强度，越高越容易出好货
  function make(level, minQuality) {
    const slot = SLOTS[Math.floor(Math.random() * SLOTS.length)];
    let q = rollQuality((level || 0) * 0.6);
    // 品质保底（商城用：保证不会出垃圾）
    if (typeof minQuality === 'number' && q.id < minQuality) q = QUALITY[minQuality];
    const pool = STATS.slice();
    const affixes = [];
    for (let i = 0; i < q.affix && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const st = pool.splice(idx, 1)[0];
      const v = st.base * q.mul * (0.8 + Math.random() * 0.5);
      affixes.push({ id: st.id, name: st.name, v: v, pct: st.pct });
    }
    return {
      id: 'e' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      slot: slot,
      quality: q.id,
      affixes: affixes
    };
  }

  function desc(a) {
    if (a.pct) return '+' + Math.round(a.v * 100) + '% ' + a.name;
    return '+' + Math.round(a.v) + ' ' + a.name;
  }

  function qualityOf(qid) {
    return QUALITY[Math.max(0, Math.min(4, qid | 0))];
  }

  // 把一套装备的属性汇总成一个加成对象
  function totalBonus(equipped) {
    const b = { hp: 0, dmg: 0, speed: 0, haste: 0, crit: 0, armor: 0, pickup: 0 };
    if (!equipped) return b;
    for (const slot of SLOTS) {
      const it = equipped[slot];
      if (!it || !it.affixes) continue;
      for (const a of it.affixes) {
        if (b[a.id] != null) b[a.id] += a.v;
      }
    }
    return b;
  }

  // 战力评分（用于比较好坏）
  function score(it) {
    if (!it || !it.affixes) return 0;
    let s = 0;
    for (const a of it.affixes) {
      s += a.pct ? a.v * 100 : a.v * 0.6;
    }
    return Math.round(s * (1 + it.quality * 0.15));
  }

  return { SLOTS, SLOT_NAME, SLOT_ICON, QUALITY, STATS, make, desc, qualityOf, totalBonus, score };
})();

window.EQUIP = EQUIP;
