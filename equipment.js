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

  // 品质：20 档，id 越大越好；weight 是掉落权重（合计约 100）
  const QUALITY = [
    { id: 0,  name: '残次', color: '#6b6b6b', dark: '#3a3a3a', mul: 0.70, weight: 5.00, affix: 1 },
    { id: 1,  name: '粗糙', color: '#8a8a8a', dark: '#4e4e4e', mul: 0.80, weight: 5.00, affix: 1 },
    { id: 2,  name: '普通', color: '#a0a0a0', dark: '#5c5c5c', mul: 0.90, weight: 5.00, affix: 1 },
    { id: 3,  name: '扎实', color: '#b0a890', dark: '#6a6458', mul: 1.00, weight: 5.00, affix: 1 },
    { id: 4,  name: '优良', color: '#7ec850', dark: '#3f7a28', mul: 1.10, weight: 5.00, affix: 2 },
    { id: 5,  name: '考究', color: '#4aa85a', dark: '#23602e', mul: 1.20, weight: 5.00, affix: 2 },
    { id: 6,  name: '精良', color: '#3aa8ff', dark: '#1f5fa8', mul: 1.35, weight: 6.25, affix: 2 },
    { id: 7,  name: '匠心', color: '#5a8aff', dark: '#2a4fa8', mul: 1.50, weight: 6.25, affix: 2 },
    { id: 8,  name: '卓越', color: '#7a5aff', dark: '#4a2fa8', mul: 1.65, weight: 6.25, affix: 3 },
    { id: 9,  name: '稀有', color: '#a05aff', dark: '#5f2fa8', mul: 1.80, weight: 6.25, affix: 3 },
    { id: 10, name: '罕见', color: '#c05aff', dark: '#7a2fa8', mul: 1.95, weight: 6.25, affix: 3 },
    { id: 11, name: '瑰宝', color: '#e05aff', dark: '#962fa8', mul: 2.10, weight: 6.25, affix: 3 },
    { id: 12, name: '史诗', color: '#ff5ac0', dark: '#a82a72', mul: 2.30, weight: 6.25, affix: 3 },
    { id: 13, name: '超凡', color: '#ff5a8a', dark: '#a82a48', mul: 2.50, weight: 6.25, affix: 4 },
    { id: 14, name: '传说', color: '#ffc93c', dark: '#c89410', mul: 2.80, weight: 3.33, affix: 4 },
    { id: 15, name: '不朽', color: '#ffb020', dark: '#b87800', mul: 3.10, weight: 3.33, affix: 4 },
    { id: 16, name: '神话', color: '#ff8a20', dark: '#b05a00', mul: 3.40, weight: 3.33, affix: 4 },
    { id: 17, name: '逆天', color: '#ff5a30', dark: '#a83410', mul: 3.70, weight: 3.33, affix: 4 },
    { id: 18, name: '寰宇', color: '#ff3a3a', dark: '#a81a1a', mul: 4.00, weight: 3.33, affix: 4 },
    { id: 19, name: '根源', color: '#ff1a6a', dark: '#a80a3a', mul: 4.50, weight: 3.33, affix: 4 }
  ];

  const STATS = [
    { id: 'hp',     name: '生命', base: 24,    pct: false },
    { id: 'dmg',    name: '伤害', base: 0.055, pct: true },
    { id: 'speed',  name: '移速', base: 0.035, pct: true },
    { id: 'haste',  name: '攻速', base: 0.045, pct: true },
    { id: 'crit',   name: '暴击', base: 0.035, pct: true },
    { id: 'armor',  name: '减伤', base: 0.030, pct: true },
    { id: 'pickup', name: '拾取', base: 0.120, pct: true },
    { id: 'lifesteal', name: '吸血', base: 0.016, pct: true },
    { id: 'regen',     name: '回复', base: 1.20,  pct: false }
  ];

  const TOTAL_WEIGHT = QUALITY.reduce(function (a, q) { return a + q.weight; }, 0);

  // 按权重抽品质；luck（怪物等级）会额外往上抬几档
  /* ---------- 装备名称与介绍（MC 风格） ---------- */
  const NAME_PARTS = {
    low: {
      pre: ['生锈的', '破旧的', '粗糙的', '普通的', '结实的', '磨损的'],
      suf: ['护甲', '战具', '器物', '残片']
    },
    mid: {
      pre: ['精工', '银月', '苍狼', '铁誓', '疾风', '赤岩', '霜纹'],
      suf: ['战甲', '护符', '遗物', '徽记', '之刃']
    },
    high: {
      pre: ['贪婪之主', '虚空', '星陨', '深渊', '龙魂', '碎星', '永夜', '破晓', '噬魂', '寂灭', '万象'],
      suf: ['契约', '誓约', '遗物', '残响', '印记', '王座', '之证']
    }
  };

  // 按品质给介绍文案
  const FLAVOR = [
    ['铁匠铺的边角料', '勉强能挡一下'],                      // 0-3
    ['出自老练工匠之手', '磨损得恰到好处'],                  // 4-7
    ['远古战场的遗物', '还残留着微弱的魔力'],                // 8-11
    ['神级领域锻造师作品', '它的重量让人安心'],              // 12-15
    ['超越凡俗的造物', '凡人难以驾驭', '名字被刻在石碑上']    // 16-19
  ];

  function flavorTier(qid) {
    if (qid <= 3) return 0;
    if (qid <= 7) return 1;
    if (qid <= 11) return 2;
    if (qid <= 15) return 3;
    return 4;
  }

  function makeName(qid) {
    const pool = qid <= 5 ? NAME_PARTS.low : (qid <= 11 ? NAME_PARTS.mid : NAME_PARTS.high);
    const pre = pool.pre[Math.floor(Math.random() * pool.pre.length)];
    const suf = pool.suf[Math.floor(Math.random() * pool.suf.length)];
    return pre + suf;
  }

  function makeFlavor(qid) {
    const arr = FLAVOR[flavorTier(qid)].slice();
    // 打乱后取 1~2 条
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr.slice(0, 1 + Math.floor(Math.random() * Math.min(2, arr.length)));
  }

  function rollQuality(luck) {
    let r = Math.random() * TOTAL_WEIGHT;
    let pick = QUALITY[0];
    for (const q of QUALITY) {
      r -= q.weight;
      if (r <= 0) { pick = q; break; }
    }
    // 等级加成：luck 越高，越容易往上跳
    const L = luck || 0;
    if (L > 0 && Math.random() * 100 < L * 2.2) {
      const up = 1 + Math.floor(Math.random() * 3);
      pick = QUALITY[Math.min(QUALITY.length - 1, pick.id + up)];
    }
    return pick;
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
      affixes: affixes,
      name: makeName(q.id),
      flavor: makeFlavor(q.id),
      born: Date.now()
    };
  }

  function desc(a) {
    if (a.pct) return '+' + Math.round(a.v * 100) + '% ' + a.name;
    return '+' + Math.round(a.v) + ' ' + a.name;
  }

  function qualityOf(qid) {
    return QUALITY[Math.max(0, Math.min(QUALITY.length - 1, qid | 0))];
  }

  // 把一套装备的属性汇总成一个加成对象
  function totalBonus(equipped) {
    const b = { hp: 0, dmg: 0, speed: 0, haste: 0, crit: 0, armor: 0, pickup: 0, lifesteal: 0, regen: 0 };
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
    return Math.round(s * (1 + it.quality * 0.045));
  }

  return { SLOTS, SLOT_NAME, SLOT_ICON, QUALITY, STATS, make, desc, qualityOf, totalBonus, score,
           makeName, makeFlavor, flavorTier };
})();

window.EQUIP = EQUIP;
