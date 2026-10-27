/* ============================================================
   方块幸存者 · 菜单层
   ============================================================ */

const STATE = {
  cls: CLASSES[0],
  race: RACES[0],
  zone: ZONES[0],
  diff: 0,
  name: '史蒂夫'
};

/* ---------- 进度存档 ---------- */
const SAVE_KEY = 'mc_survivors_progress_v1';
let _progressCache = null;

function loadProgress() {
  if (_progressCache) return _progressCache;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    _progressCache = {
      cleared: obj && Array.isArray(obj.cleared) ? obj.cleared : [],
      clearedHard: obj && Array.isArray(obj.clearedHard) ? obj.clearedHard : [],
      stats: (obj && obj.stats) || { kills: 0, bestLevel: 0, games: 0 },
      equipment: (obj && obj.equipment) || {},
      armory: (obj && obj.armory) || [],
      gold: (obj && typeof obj.gold === 'number') ? obj.gold : 0,
      talents: (obj && obj.talents) || {}
    };
  } catch (e) {
    _progressCache = { cleared: [], clearedHard: [], stats: { kills: 0, bestLevel: 0, games: 0 }, equipment: {}, armory: [], gold: 0, talents: {} };
  }
  return _progressCache;
}

function saveProgress(p) {
  _progressCache = p;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch (e) {}
}

function isZoneUnlocked(zoneId) {
  const idx = ZONES.findIndex(z => z.id === zoneId);
  if (idx <= 0) return true;
  return loadProgress().cleared.includes(ZONES[idx - 1].id);
}

function isZoneCleared(zoneId) {
  return loadProgress().cleared.includes(zoneId);
}

/* 通关后由游戏层调用：解锁下一区域 */
function unlockNextZone(currentId, diffIdx) {
  const idx = ZONES.findIndex(z => z.id === currentId);
  if (idx < 0) return null;
  const p = loadProgress();
  if (!p.cleared.includes(currentId)) p.cleared.push(currentId);
  if (diffIdx >= 1 && !p.clearedHard.includes(currentId)) p.clearedHard.push(currentId);
  saveProgress(p);
  // 已登录则同步到云端，换设备也能接着玩
  if (typeof SB !== 'undefined' && SB.currentUser && SB.currentUser()) {
    SB.saveCloudProgress(p.cleared, p.clearedHard, p.stats, p.equipment).catch(function () {});
  }
  return idx + 1 < ZONES.length ? ZONES[idx + 1].name : null;
}

/* 每局结束记录统计 */
function recordRun(stats) {
  const p = loadProgress();
  p.stats.kills += stats.kills || 0;
  p.stats.games += 1;
  p.stats.bestLevel = Math.max(p.stats.bestLevel || 0, stats.level || 0);
  saveProgress(p);
  if (typeof SB !== 'undefined' && SB.currentUser && SB.currentUser()) {
    SB.saveCloudProgress(p.cleared, p.clearedHard, p.stats, p.equipment).catch(function () {});
  }
}

/* 成就定义 */
const ACHIEVEMENTS = [
  { id: 'first',  name: '初次幸存',   desc: '通关任意一个区域',        icon: 'sword',  need: p => p.cleared.length >= 1, prog: p => [Math.min(p.cleared.length, 1), 1] },
  { id: 'three',  name: '旅行者',     desc: '通关 3 个不同区域',       icon: 'bow',    need: p => p.cleared.length >= 3, prog: p => [Math.min(p.cleared.length, 3), 3] },
  { id: 'half',   name: '深入主世界', desc: '通关 4 个不同区域',       icon: 'trident',need: p => p.cleared.length >= 4, prog: p => [Math.min(p.cleared.length, 4), 4] },
  { id: 'all',    name: '世界尽头',   desc: '通关全部 8 个区域',       icon: 'star',   need: p => p.cleared.length >= 8, prog: p => [p.cleared.length, 8] },
  { id: 'kill100', name: '屠夫',      desc: '累计击杀 100 只怪物',     icon: 'fist',   need: p => p.stats.kills >= 100, prog: p => [Math.min(p.stats.kills, 100), 100] },
  { id: 'kill1000', name: '尸潮终结者', desc: '累计击杀 1000 只怪物',   icon: 'fire',   need: p => p.stats.kills >= 1000, prog: p => [Math.min(p.stats.kills, 1000), 1000] },
  { id: 'lv10',   name: '渐入佳境',   desc: '单局达到 10 级',          icon: 'heart',  need: p => p.stats.bestLevel >= 10, prog: p => [Math.min(p.stats.bestLevel, 10), 10] },
  { id: 'lv20',   name: '身经百战',   desc: '单局达到 20 级',          icon: 'armor',  need: p => p.stats.bestLevel >= 20, prog: p => [Math.min(p.stats.bestLevel, 20), 20] },
  { id: 'games10', name: '老玩家',    desc: '累计游玩 10 局',          icon: 'magnet', need: p => p.stats.games >= 10, prog: p => [Math.min(p.stats.games, 10), 10] },
  { id: 'hard1',  name: '硬骨头',     desc: '在困难或极限难度通关一次', icon: 'skull', need: p => p.clearedHard.length >= 1, prog: p => [Math.min(p.clearedHard.length, 1), 1] }
];

/* ---------- MC 小人绘制（菜单立绘 + 游戏内共用） ---------- */
function drawMCFigure(g, cx, footY, unit, skin, opt) {
  opt = opt || {};
  const flip = opt.flip ? -1 : 1;
  const alpha = opt.alpha == null ? 1 : opt.alpha;
  const U = unit;
  const OUT = '#1a1424';

  g.save();
  g.globalAlpha = alpha;
  g.translate(cx, footY);
  g.scale(flip, 1);

  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x * U), Math.round(y * U), Math.ceil(w * U), Math.ceil(h * U));
  };
  // 带描边的部件
  const RB = (x, y, w, h, c) => {
    g.fillStyle = OUT;
    g.fillRect(Math.round((x - 0.28) * U), Math.round((y - 0.28) * U),
      Math.ceil((w + 0.56) * U), Math.ceil((h + 0.56) * U));
    R(x, y, w, h, c);
  };

  const s = skin;

  if (opt.shadow !== false) {
    g.globalAlpha = alpha * 0.3;
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(0, 0, 9 * U, 2.4 * U, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = alpha;
  }

  const swing = opt.swing || 0;
  const bob = opt.bob || 0;

  // ---- 腿 ----
  RB(-4, -12 + bob, 3.5, 12, s.leg);
  RB(0.5, -12 + bob, 3.5, 12, s.leg);
  R(-4, -2 + bob, 3.5, 2, s.legDark || '#2a2a3a');
  R(0.5, -2 + bob, 3.5, 2, s.legDark || '#2a2a3a');

  // ---- 身体 ----
  RB(-4, -24 + bob, 8, 12, s.body);
  R(-4, -14.5 + bob, 8, 2, s.bodyDark || s.body);
  // 衣领
  R(-4, -24 + bob, 8, 1, s.bodyLight || s.body);

  // ---- 手臂 ----
  const armY = -24 + bob + swing * 2;
  RB(-8, armY, 4, 12, s.arm);
  RB(4, armY, 4, 12, s.arm);
  R(-8, armY + 9.4, 4, 2.6, s.hand || s.head);
  R(4, armY + 9.4, 4, 2.6, s.hand || s.head);

  // ---- 头 ----
  RB(-4, -32 + bob, 8, 8, s.head);
  // 头发
  R(-4, -32 + bob, 8, 3, s.hair || s.head);
  R(-4, -32 + bob, 1.2, 6, s.hair || s.head);
  R(2.8, -32 + bob, 1.2, 6, s.hair || s.head);
  // 眼睛
  R(-3, -28.5 + bob, 1.2, 1.2, s.eye || '#1a1a1a');
  R(1, -28.5 + bob, 1.2, 1.2, s.eye || '#1a1a1a');
  // 嘴
  R(-1, -26.2 + bob, 2, 0.7, s.eye || '#1a1a1a');

  // ---- 手持武器 ----
  if (s.weapon) drawHeldItem(g, s.weapon, U, armY, bob);

  g.restore();
}

/* 手持物品（画在右手位置 x≈7） */
function drawHeldItem(g, type, U, armY, bob) {
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x * U), Math.round(y * U), Math.ceil(w * U), Math.ceil(h * U));
  };
  const y0 = armY + bob;
  if (type === 'sword') {
    R(7.0, y0 - 5, 1.6, 10, '#e8e8e8');
    R(7.0, y0 - 5, 0.7, 10, '#ffffff');
    R(6.4, y0 + 4.2, 3.2, 1.5, '#c8a040');
    R(7.3, y0 + 5.7, 1.2, 3.2, '#6b4a2a');
  } else if (type === 'bow') {
    R(7.2, y0 + 1, 1.3, 9, '#8a6234');
    R(8.4, y0 + 0.4, 0.8, 10.2, '#e8e8e8');
    R(7.2, y0 + 0.2, 2.0, 1.2, '#8a6234');
    R(7.2, y0 + 9.8, 2.0, 1.2, '#8a6234');
  } else if (type === 'staff') {
    R(7.4, y0 - 7, 1.4, 18, '#6b4a2a');
    R(6.6, y0 - 9.5, 3.0, 3.0, '#9b5de5');
    R(7.2, y0 - 8.9, 1.8, 1.8, '#d8b0ff');
  } else if (type === 'dagger') {
    R(7.5, y0 + 2, 1.2, 6, '#d8d8d8');
    R(7.2, y0 + 7.6, 1.8, 2.0, '#9a7a3a');
  } else if (type === 'shield') {
    R(6.8, y0 + 1.5, 4.0, 6.0, '#a83a3a');
    R(6.8, y0 + 1.5, 4.0, 1.4, '#b8b8b8');
    R(7.8, y0 + 3.2, 2.0, 2.4, '#e8c040');
  } else if (type === 'apple') {
    R(7.0, y0 + 5.0, 3.0, 3.0, '#f0c04a');
    R(7.0, y0 + 5.0, 1.0, 1.0, '#fff0a0');
    R(8.0, y0 + 3.6, 1.0, 1.6, '#5aa83a');
  } else if (type === 'potion') {
    R(7.2, y0 + 4.6, 2.8, 4.2, '#a05ad8');
    R(7.2, y0 + 4.6, 1.0, 4.2, '#c890ff');
    R(7.7, y0 + 2.8, 1.8, 1.8, '#a0784a');
  } else if (type === 'sapling') {
    R(7.6, y0 + 1.5, 1.2, 9, '#6b4a2a');
    R(6.2, y0 - 1.0, 4.4, 3.2, '#5aa83a');
    R(7.0, y0 - 2.0, 2.8, 1.6, '#78c850');
  } else if (type === 'skull') {
    R(6.8, y0 + 3.4, 3.4, 3.4, '#e8e8dc');
    R(7.4, y0 + 4.4, 0.9, 0.9, '#1a1424');
    R(8.6, y0 + 4.4, 0.9, 0.9, '#1a1424');
    R(7.6, y0 + 6.2, 1.8, 0.7, '#1a1424');
  }
}

/* ---------- 特殊体型怪物 ---------- */
function drawMobFigure(g, cx, footY, unit, skin, kind, opt) {
  opt = opt || {};
  const U = unit;
  const OUT = '#1a1424';
  g.save();
  g.translate(cx, footY);

  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x * U), Math.round(y * U), Math.ceil(w * U), Math.ceil(h * U));
  };
  const RB = (x, y, w, h, c) => {
    g.fillStyle = OUT;
    g.fillRect(Math.round((x - 0.26) * U), Math.round((y - 0.26) * U),
      Math.ceil((w + 0.52) * U), Math.ceil((h + 0.52) * U));
    R(x, y, w, h, c);
  };
  const shadow = (rx, ry) => {
    g.globalAlpha = .3; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(0, 0, rx * U, ry * U, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  };

  if (kind === 'creeper') {
    shadow(7, 2);
    RB(-5.5, -6, 3.4, 6, skin.dark);
    RB(-1.7, -6, 3.4, 6, skin.body);
    RB(2.1, -6, 3.4, 6, skin.dark);
    RB(-6, -22, 12, 16.5, skin.body);
    R(-6, -22, 12, 2.2, skin.dark);
    R(-6, -8.5, 12, 2, skin.dark);
    // 经典苦力怕脸
    R(-4, -19, 3, 3, skin.eye);
    R(1, -19, 3, 3, skin.eye);
    R(-1.5, -16, 3, 5, skin.eye);
    R(-3.6, -13.5, 2.2, 2.4, skin.eye);
    R(1.4, -13.5, 2.2, 2.4, skin.eye);

  } else if (kind === 'spider') {
    shadow(9, 2);
    for (let i = 0; i < 4; i++) {
      const lx = -7 + i * 3.6;
      RB(lx, -4.5, 1.4, 4.5, skin.dark);
      R(lx - 2.2, -2.4, 2.2, 1.3, skin.dark);
      R(lx + 1.3, -2.4, 2.2, 1.3, skin.dark);
    }
    RB(-5, -10, 10, 6.5, skin.body);
    RB(-3, -14.5, 6, 5, skin.body);
    R(-3, -14.5, 6, 1.2, skin.dark);
    R(-2.2, -12.6, 1.5, 1.5, skin.eye);
    R(0.7, -12.6, 1.5, 1.5, skin.eye);
    R(-1.5, -11, 1, 1, skin.eye);
    R(0.5, -11, 1, 1, skin.eye);

  } else if (kind === 'slime') {
    shadow(9, 2.4);
    g.globalAlpha = .94;
    RB(-8, -18, 16, 18, skin.body);
    R(-8, -18, 16, 3, skin.dark);
    R(-8, -4, 16, 4, skin.dark);
    g.globalAlpha = .45;
    R(-3, -13, 6, 7, skin.dark);
    g.globalAlpha = .96;
    R(-4.2, -15, 2.6, 2.6, skin.eye);
    R(1.6, -15, 2.6, 2.6, skin.eye);
    R(-2.4, -10.6, 4.8, 1.5, skin.eye);
    g.globalAlpha = 1;

  } else if (kind === 'blaze') {
    shadow(7, 2);
    RB(-4, -24, 8, 8, skin.body);
    RB(-3, -16, 6, 6, skin.dark);
    RB(-2, -10, 4, 6, skin.body);
    R(-9, -20, 2, 2, skin.body);
    R(7, -18, 2, 2, skin.body);
    R(-8, -12, 2, 2, skin.dark);
    R(6, -11, 2, 2, skin.dark);
    R(-2.4, -22, 1.8, 1.8, skin.eye);
    R(0.6, -22, 1.8, 1.8, skin.eye);

  } else if (kind === 'dragon') {
    shadow(15, 3);
    RB(-18, -26, 8, 10, skin.dark);
    RB(10, -26, 8, 10, skin.dark);
    R(-16, -22, 6, 6, skin.body);
    R(10, -22, 6, 6, skin.body);
    RB(-7, -22, 14, 16, skin.body);
    R(-7, -22, 14, 2.5, skin.dark);
    RB(-4, -32, 8, 10, skin.body);
    R(-4, -32, 8, 2, skin.dark);
    R(-5, -35, 1.6, 3, skin.dark);
    R(3.4, -35, 1.6, 3, skin.dark);
    R(-2.6, -29, 2, 1.6, skin.eye);
    R(0.6, -29, 2, 1.6, skin.eye);

  } else if (kind === 'warden') {
    shadow(12, 3);
    RB(-7, -10, 5, 10, skin.dark);
    RB(2, -10, 5, 10, skin.dark);
    RB(-8, -28, 16, 18, skin.body);
    R(-8, -28, 16, 2.5, skin.dark);
    RB(-13, -27, 5, 20, skin.body);
    RB(8, -27, 5, 20, skin.body);
    RB(-5, -36, 10, 8, skin.body);
    R(-5, -36, 10, 2, skin.dark);
    R(-3.4, -33, 2.2, 1.8, skin.eye);
    R(1.2, -33, 2.2, 1.8, skin.eye);
    g.globalAlpha = .85;
    R(-2.5, -23, 5, 5, skin.eye);
    g.globalAlpha = 1;

  } else if (kind === 'wolf') {
    // 四足狼：和骷髅完全不同的剪影
    shadow(9, 2);
    RB(-7, -7, 3, 7, skin.dark);
    RB(-2.5, -7, 3, 7, skin.dark);
    RB(2.5, -7, 3, 7, skin.dark);
    RB(7, -7, 3, 7, skin.dark);
    RB(-8, -14, 15.5, 7.5, skin.body);
    RB(5, -17, 6, 5, skin.body);
    RB(7, -21, 8, 7, skin.head);
    R(7.5, -23.6, 2.2, 3, skin.hair);
    R(11.6, -23.6, 2.2, 3, skin.hair);
    R(11.4, -18.4, 1.7, 1.7, skin.eye);
    R(13.6, -18.4, 1.7, 1.7, skin.eye);
    R(14.6, -16.8, 1.8, 1.3, '#2a2a2a');
    RB(-10, -16, 3, 7, skin.dark);

  } else if (kind === 'vex') {
    // 恼鬼：小个子 + 一对翅膀，飘着
    shadow(6, 1.5);
    RB(-10, -19, 6.5, 5, skin.dark);
    RB(4, -19, 6.5, 5, skin.dark);
    RB(-3.5, -15, 7, 9, skin.body);
    RB(-3, -21, 6, 6.5, skin.head);
    R(-1.8, -19, 1.5, 1.5, skin.eye);
    R(0.9, -19, 1.5, 1.5, skin.eye);
    RB(-6.2, -14, 2.6, 5, skin.body);
    RB(3.8, -14, 2.6, 5, skin.body);

  } else {
    drawMCFigure(g, 0, 0, unit, skin, opt);
  }

  g.restore();
}

/* ---------- 立绘 ---------- */
function renderPortrait() {
  const cv = document.getElementById('portrait');
  if (!cv) return;
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);

  const skin = SKIN_BY_CLASS[STATE.cls.id] || SKIN_BY_CLASS.swordsman;
  const unit = 5.8;
  drawMCFigure(g, W / 2, H - 16, unit, skin, { shadow: true });
}

const SKIN_BY_CLASS = {
  swordsman: { head:'#d2a578', hair:'#3a2a18', body:'#2fa8a8', bodyDark:'#1f7a7a', bodyLight:'#5fd0d0', arm:'#d2a578', leg:'#3b3b8f', legDark:'#2a2a68', eye:'#1a1a1a', hand:'#d2a578', weapon:'sword' },
  knight:    { head:'#d2a578', hair:'#9a9aa8', body:'#8a8a94', bodyDark:'#63636e', bodyLight:'#b4b4c0', arm:'#d2a578', leg:'#5a5a66', legDark:'#3e3e48', eye:'#1a1a1a', hand:'#d2a578', weapon:'shield' },
  archer:    { head:'#d2a578', hair:'#4a6b2a', body:'#4a7a3a', bodyDark:'#2f5a24', bodyLight:'#6ea858', arm:'#d2a578', leg:'#3a5a2a', legDark:'#27401c', eye:'#1a1a1a', hand:'#d2a578', weapon:'bow' },
  rogue:     { head:'#d2a578', hair:'#1e1a16', body:'#2a2a30', bodyDark:'#16161a', bodyLight:'#4a4a56', arm:'#2a2a30', leg:'#1a1a20', legDark:'#0e0e14', eye:'#1a1a1a', hand:'#d2a578', weapon:'dagger' },
  cleric:    { head:'#d2a578', hair:'#e8d8a0', body:'#e8e0d0', bodyDark:'#c0b8a4', bodyLight:'#ffffff', arm:'#d2a578', leg:'#c8b888', legDark:'#a09068', eye:'#1a1a1a', hand:'#d2a578', weapon:'apple' },
  warlock:   { head:'#b89478', hair:'#2a1a2a', body:'#4a2a5a', bodyDark:'#301a3c', bodyLight:'#704890', arm:'#b89478', leg:'#2a1a3a', legDark:'#180e26', eye:'#e04040', hand:'#b89478', weapon:'potion' },
  mage:      { head:'#d2a578', hair:'#5a2a8a', body:'#3a2a7a', bodyDark:'#261a56', bodyLight:'#6050b0', arm:'#d2a578', leg:'#2a1a5a', legDark:'#1a0e3c', eye:'#1a1a1a', hand:'#d2a578', weapon:'staff' },
  druid:     { head:'#d2a578', hair:'#3a6a2a', body:'#5a8a3a', bodyDark:'#3e6424', bodyLight:'#84b860', arm:'#d2a578', leg:'#3a5a2a', legDark:'#27401c', eye:'#1a1a1a', hand:'#d2a578', weapon:'sapling' },
  evoker:    { head:'#b0b0a2', hair:'#3a3a3a', body:'#5a5a6a', bodyDark:'#3e3e4a', bodyLight:'#82829a', arm:'#b0b0a2', leg:'#3a3a4a', legDark:'#26262e', eye:'#a06ae0', hand:'#b0b0a2', weapon:'skull' }
};

/* ---------- 渲染：职业格 ---------- */
function renderClassGrid() {
  const box = document.getElementById('classGrid');
  box.innerHTML = CLASSES.map(c => `
    <button class="cls-cell${c.id === STATE.cls.id ? ' on' : ''}" data-id="${c.id}" title="${c.name}">
      ${ICON[c.icon]}
    </button>
  `).join('');
  box.querySelectorAll('.cls-cell').forEach(el => {
    el.onclick = () => {
      STATE.cls = CLASSES.find(c => c.id === el.dataset.id);
      renderClassGrid();
      renderClassInfo();
      renderPortrait();
      document.getElementById('metaClass').textContent = STATE.cls.name;
    };
  });
}

function renderClassInfo() {
  const c = STATE.cls;
  document.getElementById('clsName').textContent = c.name;
  document.getElementById('clsDesc').textContent = c.desc;
  document.getElementById('clsHp').textContent = c.hp;
  document.getElementById('clsWeapon').textContent = WEAPONS[c.weapon].name;
  document.getElementById('clsZones').textContent = `1 / ${ZONES.length}`;

  const pool = document.getElementById('clsPool');
  pool.innerHTML = c.pool.map(id => {
    const w = WEAPONS[id];
    const p = PASSIVES[id];
    const ic = w ? w.icon : (p ? p.icon : 'star');
    const nm = w ? w.name : (p ? p.name : id);
    return `<div class="pool-item" title="${nm}">${ICON[ic] || ''}</div>`;
  }).join('');
}

/* ---------- 渲染：种族 ---------- */
function renderRaces() {
  const box = document.getElementById('raceRow');
  box.innerHTML = RACES.map(r => `
    <button class="race-btn${r.id === STATE.race.id ? ' on' : ''}" data-id="${r.id}">${r.name}</button>
  `).join('');
  box.querySelectorAll('.race-btn').forEach(el => {
    el.onclick = () => {
      STATE.race = RACES.find(r => r.id === el.dataset.id);
      renderRaces();
      renderRaceTalent();
      document.getElementById('metaRace').textContent = STATE.race.name;
    };
  });
}

function renderRaceTalent() {
  document.getElementById('raceName').textContent = STATE.race.name;
  document.getElementById('racePerks').innerHTML = STATE.race.perks
    .map(p => `<li><b>${p[0]}</b>：${p[1]}</li>`).join('');
}

/* ---------- 渲染：装备槽 ---------- */
function renderEquip() {
  const box = document.getElementById('equipSlots');
  if (!box) return;
  const eq = (loadProgress().equipment) || {};
  box.innerHTML = EQUIP.SLOTS.map(function (slot) {
    const it = eq[slot];
    const slotName = EQUIP.SLOT_NAME[slot];
    if (!it) {
      return '<div class="equip-slot" title="' + slotName + '（空）">' +
        '<span class="es-name">' + slotName + '</span></div>';
    }
    const q = EQUIP.qualityOf(it.quality);
    const tips = it.affixes.map(function (a) { return EQUIP.desc(a); }).join(' / ');
    return '<div class="equip-slot filled" ' +
      'style="border-color:' + q.color + ';box-shadow:0 3px 0 ' + q.dark + '" ' +
      'title="' + q.name + ' · ' + slotName + '：' + tips + '">' +
      '<div class="es-ic">' + (ICON[EQUIP.SLOT_ICON[slot]] || '') + '</div>' +
      '<div class="es-q" style="background:' + q.color + '">' + q.name + '</div>' +
      '</div>';
  }).join('');

  // 称号（自动穿戴最优）+ 装备提示
  try {
    const tt = (typeof bestTitle === 'function') ? bestTitle() : null;
    const tEl = document.getElementById('metaTitle');
    const dEl = document.getElementById('titleDot');
    if (tEl) {
      tEl.textContent = tt ? tt.name : '无称号';
      tEl.style.color = tt ? '#237a35' : '#8a6f36';
      if (dEl) dEl.style.display = tt ? '' : 'none';
    }
    const hEl = document.getElementById('equipHint');
    if (hEl) {
      const n = Object.keys(eq).length;
      const parts = [];
      if (n) parts.push('已穿戴 ' + n + ' 件');
      if (tt) parts.push('称号 ' + tt.name + '（' + tt.text + '）');
      hEl.textContent = parts.length ? parts.join(' · ') : '尚未穿戴装备。击败精英或首领开启宝箱可获得。';
    }
  } catch (e) {}
}

/* ---------- 经济 ---------- */
function sellPrice(it) {
  return Math.round(EQUIP.score(it) * 2.5 + (it.quality || 0) * 15 + 10);
}

function addGold(n) {
  const prog = loadProgress();
  prog.gold = Math.max(0, (prog.gold || 0) + n);
  saveProgress(prog);
  if (typeof SB !== 'undefined' && SB.currentUser && SB.currentUser()) {
    SB.saveCloudProgress(prog.cleared, prog.clearedHard, prog.stats, prog.equipment, prog.armory, prog.gold, prog.talents)
      .catch(function () {});
  }
  refreshGold();
  return prog.gold;
}

function refreshGold() {
  const g = loadProgress().gold || 0;
  const el = document.getElementById('goldNum');
  if (el) el.textContent = g.toLocaleString();
}

/* ---------- 军械库 ---------- */
function openArmory() {
  renderArmory();
  refreshGold();
  document.getElementById('armoryModal').classList.remove('hidden');
}

function closeArmory() {
  document.getElementById('armoryModal').classList.add('hidden');
}

function renderArmory() {
  const list = document.getElementById('armoryList');
  if (!list) return;
  const prog = loadProgress();
  const armory = prog.armory || [];
  const eq = prog.equipment || {};

  if (!armory.length) {
    list.innerHTML = '<div class="armory-empty">军械库还是空的。<br>击败精英怪或首领开启宝箱，就有机会获得装备。</div>';
    return;
  }

  const sorted = armory.slice().sort((a, b) => EQUIP.score(b) - EQUIP.score(a));
  list.innerHTML = sorted.map(function (it) {
    const q = EQUIP.qualityOf(it.quality);
    const worn = eq[it.slot] && eq[it.slot].id === it.id;
    return '<div class="armory-item' + (worn ? ' worn' : '') + '" data-id="' + it.id + '"' +
      ' style="border-color:' + q.color + ';box-shadow:0 3px 0 ' + q.dark + '">' +
      '<span class="ai-slot" style="background:' + q.color + '">' + EQUIP.SLOT_NAME[it.slot] + '</span>' +
      '<span class="ai-main">' +
        '<span class="ai-name" style="color:' + q.color + '">' + q.name + ' · ' + EQUIP.SLOT_NAME[it.slot] + '</span>' +
        '<span class="ai-affixes">' + it.affixes.map(function (a) { return EQUIP.desc(a); }).join(' · ') + '</span>' +
      '</span>' +
      '<span class="ai-score">' + EQUIP.score(it) + '</span>' +
      '<span class="ai-sell" data-sell="' + it.id + '">卖 ' + sellPrice(it) + '</span>' +
      (worn ? '<span class="ai-worn">已装备</span>' : '') +
      '</div>';
  }).join('');

  list.querySelectorAll('.armory-item').forEach(function (el) {
    el.onclick = function () { openItemDetail(el.dataset.id); };
  });
  list.querySelectorAll('[data-sell]').forEach(function (el) {
    el.onclick = function (ev) {
      ev.stopPropagation();
      sellItem(el.dataset.sell);
    };
  });
}

function sellItem(id) {
  const prog = loadProgress();
  const idx = (prog.armory || []).findIndex(function (x) { return x.id === id; });
  if (idx < 0) return false;
  const it = prog.armory[idx];
  const worn = prog.equipment && prog.equipment[it.slot] && prog.equipment[it.slot].id === id;
  if (worn) { toast('已穿戴的装备不能卖，先换一件'); return false; }

  const price = sellPrice(it);
  prog.armory.splice(idx, 1);
  prog.gold = (prog.gold || 0) + price;
  saveProgress(prog);
  if (typeof SB !== 'undefined' && SB.currentUser && SB.currentUser()) {
    SB.saveCloudProgress(prog.cleared, prog.clearedHard, prog.stats, prog.equipment, prog.armory, prog.gold, prog.talents)
      .catch(function () {});
  }
  renderArmory();
  refreshGold();
  toast('卖出 ' + EQUIP.SLOT_NAME[it.slot] + ' +' + price + ' 金币');
  return true;
}

/* ---------- 装备详情 ---------- */
let detailId = null;

function openItemDetail(id) {
  const prog = loadProgress();
  const it = (prog.armory || []).find(function (x) { return x.id === id; });
  if (!it) return;
  detailId = id;

  const q = EQUIP.qualityOf(it.quality);
  const cur = (prog.equipment || {})[it.slot];
  const worn = cur && cur.id === it.id;
  const myScore = EQUIP.score(it);
  const curScore = cur ? EQUIP.score(cur) : 0;

  let cmp = '空槽，可以直接穿';
  if (worn) cmp = '正在穿戴';
  else if (cur) cmp = myScore > curScore ? '比当前强 ' + (myScore - curScore) : '比当前弱 ' + (curScore - myScore);

  document.getElementById('itemTitle').textContent = q.name + ' · ' + EQUIP.SLOT_NAME[it.slot];
  document.getElementById('itemBody').innerHTML =
    '<div class="item-detail" style="border-color:' + q.color + ';box-shadow:0 5px 0 ' + q.dark + '">' +
      '<div class="id-icon">' + (ICON[EQUIP.SLOT_ICON[it.slot]] || '') + '</div>' +
      '<div class="id-head">' +
        '<span class="id-name" style="color:' + q.color + '">' + q.name + '</span>' +
        '<span class="id-slot">' + EQUIP.SLOT_NAME[it.slot] + '</span>' +
      '</div>' +
      '<div class="id-affixes">' +
        it.affixes.map(function (a) { return '<div class="id-affix">' + EQUIP.desc(a) + '</div>'; }).join('') +
      '</div>' +
      '<div class="id-foot">' +
        '<span>战力 <b>' + myScore + '</b></span>' +
        '<span class="id-cmp">' + cmp + '</span>' +
      '</div>' +
    '</div>';

  const wearBtn = document.getElementById('btnItemWear');
  wearBtn.textContent = worn ? '已穿戴' : '穿戴';
  wearBtn.disabled = worn;
  document.getElementById('btnItemSell').textContent = '卖出 ' + sellPrice(it);

  document.getElementById('itemModal').classList.remove('hidden');
}

function closeItemDetail() {
  document.getElementById('itemModal').classList.add('hidden');
  detailId = null;
}

function wearItem(id) {
  const prog = loadProgress();
  const it = (prog.armory || []).find(function (x) { return x.id === id; });
  if (!it) return;
  prog.equipment = prog.equipment || {};
  prog.equipment[it.slot] = it;
  saveProgress(prog);
  if (typeof SB !== 'undefined' && SB.currentUser && SB.currentUser()) {
    SB.saveCloudProgress(prog.cleared, prog.clearedHard, prog.stats, prog.equipment, prog.armory)
      .catch(function () {});
  }
  renderArmory();
  renderEquip();
  toast('已装备 ' + EQUIP.SLOT_NAME[it.slot]);
}

/* ---------- 商城 ---------- */
function shopPrice(it) {
  return Math.round(sellPrice(it) * 3.2);
}

function rollShop(force) {
  const prog = loadProgress();
  prog.shop = prog.shop || [];
  if (force) prog.shop = [];
  while (prog.shop.length < 3) {
    const it = EQUIP.make(12);   // 商城货固定用较高等级，品质不会太差
    prog.shop.push({ item: it, price: shopPrice(it) });
  }
  saveProgress(prog);
  return prog.shop;
}

function openShop() {
  closeArmory();
  renderShop();
  document.getElementById('shopModal').classList.remove('hidden');
}

function closeShop() {
  document.getElementById('shopModal').classList.add('hidden');
}

function renderShop() {
  const list = document.getElementById('shopList');
  if (!list) return;
  const prog = loadProgress();
  const goods = prog.shop && prog.shop.length ? prog.shop : rollShop(true);
  const gold = prog.gold || 0;

  const gEl = document.getElementById('shopGold');
  if (gEl) gEl.textContent = gold.toLocaleString();

  list.innerHTML = goods.map(function (g, i) {
    const it = g.item;
    const q = EQUIP.qualityOf(it.quality);
    const poor = gold < g.price;
    return '<div class="shop-item" style="border-color:' + q.color + ';box-shadow:0 3px 0 ' + q.dark + '">' +
      '<span class="ai-slot" style="background:' + q.color + '">' + EQUIP.SLOT_NAME[it.slot] + '</span>' +
      '<span class="si-main">' +
        '<span class="ai-name" style="color:' + q.color + '">' + q.name + ' · ' + EQUIP.SLOT_NAME[it.slot] + '</span>' +
        '<span class="ai-affixes">' + it.affixes.map(function (a) { return EQUIP.desc(a); }).join(' · ') + '</span>' +
      '</span>' +
      '<span class="shop-buy' + (poor ? ' poor' : '') + '" data-buy="' + i + '">' + g.price + '</span>' +
      '</div>';
  }).join('');

  list.querySelectorAll('[data-buy]').forEach(function (el) {
    el.onclick = function () { buyItem(parseInt(el.dataset.buy, 10)); };
  });
}

function buyItem(idx) {
  const prog = loadProgress();
  const g = (prog.shop || [])[idx];
  if (!g) return;
  if ((prog.gold || 0) < g.price) { toast('金币不够，先卖点旧装备'); return; }

  prog.gold -= g.price;
  prog.armory = prog.armory || [];
  prog.armory.unshift(g.item);
  if (prog.armory.length > 60) prog.armory.length = 60;
  prog.shop.splice(idx, 1);
  saveProgress(prog);
  rollShop();     // 自动补货
  if (typeof SB !== 'undefined' && SB.currentUser && SB.currentUser()) {
    SB.saveCloudProgress(prog.cleared, prog.clearedHard, prog.stats, prog.equipment, prog.armory, prog.gold, prog.talents)
      .catch(function () {});
  }
  renderShop();
  refreshGold();
  toast('买到了 ' + EQUIP.SLOT_NAME[g.item.slot] + '（已放进军械库）');
}

/* ---------- 渲染：区域 ---------- */
function renderZones() {
  const box = document.getElementById('zoneList');
  box.innerHTML = ZONES.map(z => {
    const unlocked = isZoneUnlocked(z.id);
    const cleared = isZoneCleared(z.id);
    const cls = ['zone-item'];
    if (z.id === STATE.zone.id && unlocked) cls.push('on');
    if (!unlocked) cls.push('locked');
    return `
    <button class="${cls.join(' ')}" data-id="${z.id}" ${unlocked ? '' : 'data-locked="1"'}>
      <div class="zi-head">
        <span class="zi-name">${z.name}${cleared ? '<em class="zi-clear">已通关</em>' : ''}</span>
        <span class="zi-tag">${unlocked ? 'Lv.' + z.lv : '未解锁'}</span>
      </div>
      <div class="zi-desc">${unlocked ? z.desc : '先通关「' + ZONES[ZONES.indexOf(z) - 1].name + '」'}</div>
      <div class="zi-boss">首领：<b>${unlocked ? z.boss : '???'}</b></div>
    </button>`;
  }).join('');

  box.querySelectorAll('.zone-item').forEach(el => {
    el.onclick = () => {
      const z = ZONES.find(x => x.id === el.dataset.id);
      if (el.dataset.locked) {
        const i = ZONES.indexOf(z);
        toast('需要先通关「' + ZONES[i - 1].name + '」');
        return;
      }
      STATE.zone = z;
      renderZones();
      updateStartButton();
    };
  });
}

/* ---------- 底栏 ---------- */
function updateStartButton() {
  const z = STATE.zone;
  const t = Math.floor(z.time);
  const mm = String(Math.floor(t / 60)).padStart(2, '0');
  const ss = String(t % 60).padStart(2, '0');
  document.getElementById('startTitle').textContent = `进入${z.name}`;
  document.getElementById('startSub').textContent = `${z.boss}将于 ${mm}:${ss} 现身`;
  document.getElementById('diffVal').textContent = DIFFS[STATE.diff].name;
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 1800);
}

/* ---------- 数据页 ---------- */
function renderDataPage(page) {
  const grid = document.getElementById('dataGrid');
  const title = document.getElementById('dataTitle');
  let html = '';

  if (page === 'codex') {
    title.textContent = '图鉴';
    html = Object.keys(MOBS).map(k => {
      const m = MOBS[k];
      return `<div class="dcard">
        <div class="dcard-ic">${mobGlyph(m)}</div>
        <div class="dcard-body">
          <div class="dcard-name">${m.name}</div>
          <div class="dcard-meta">生命 ${m.hp} · 速度 ${m.spd} · 伤害 ${m.dmg}</div>
          <div class="dcard-desc">${mobTrait(m)}</div>
        </div>
      </div>`;
    }).join('');
  } else if (page === 'loot') {
    title.textContent = '掉落表';
    html = Object.keys(WEAPONS).map(k => {
      const w = WEAPONS[k];
      return `<div class="dcard">
        <div class="dcard-ic">${ICON[w.icon] || ''}</div>
        <div class="dcard-body">
          <div class="dcard-name">${w.name}</div>
          <div class="dcard-meta">最高 ${w.maxLv} 级 · 冷却 ${w.cd}s</div>
          <div class="dcard-desc">${w.desc}</div>
        </div>
      </div>`;
    }).join('');
  } else if (page === 'talent') {
    title.textContent = '天赋';
    const prog = loadProgress();
    const gold = prog.gold || 0;
    html =
      '<div class="dcard" style="grid-column:1/-1;background:var(--ink);border-color:var(--ink)">' +
        '<div class="dcard-body" style="text-align:center">' +
          '<div class="dcard-name" style="color:var(--yellow)">永久天赋 · 金币升级</div>' +
          '<div class="dcard-meta" style="color:#9fb08c">当前金币 ' + gold.toLocaleString() + ' · 每项最高 5 级 · 每局生效</div>' +
        '</div>' +
      '</div>' +
      TALENTS.map(function (t) {
        const lv = talentLevel(t.id);
        const maxed = lv >= 5;
        const price = maxed ? 0 : TALENT_COST[lv];
        const poor = !maxed && gold < price;
        const cur = lv ? t.unit.replace('+', '+') + ' × ' + lv : '未学习';
        return '<div class="dcard talent-card">' +
          '<div class="dcard-ic">' + (ICON[t.icon] || '') + '</div>' +
          '<div class="dcard-body">' +
            '<div class="dcard-name">' + t.name +
              '<span class="talent-lv">' + lv + ' / 5</span></div>' +
            '<div class="dcard-meta">' + t.unit + ' / 级' + (lv ? ' · 当前 ' + cur : '') + '</div>' +
            '<div class="talent-dots">' +
              [0,1,2,3,4].map(function (i) {
                return '<i class="' + (i < lv ? 'on' : '') + '"></i>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<button class="talent-buy' + (poor ? ' poor' : '') + (maxed ? ' maxed' : '') + '"' +
            ' data-talent="' + t.id + '">' +
            (maxed ? '满级' : price) +
          '</button>' +
        '</div>';
      }).join('');
  }
  grid.innerHTML = html;

  grid.querySelectorAll('[data-talent]').forEach(function (el) {
    el.onclick = function () { buyTalent(el.dataset.talent); };
  });
}

/* ---------- 永久天赋（金币升级） ---------- */
const TALENT_COST = [150, 300, 600, 1200, 2400];

const TALENTS = [
  { id:'power', name:'力量', icon:'sword',  per:{ dmg:0.04 },    unit:'+4% 伤害' },
  { id:'haste', name:'急速', icon:'fire',   per:{ haste:0.03 },  unit:'+3% 攻速' },
  { id:'vigor', name:'体魄', icon:'heart',  per:{ hp:25 },       unit:'+25 生命' },
  { id:'guard', name:'守护', icon:'armor',  per:{ armor:0.02 },  unit:'+2% 减伤' },
  { id:'edge',  name:'锐利', icon:'fist',   per:{ crit:0.02 },   unit:'+2% 暴击' },
  { id:'swift', name:'疾行', icon:'boot',   per:{ speed:0.02 },  unit:'+2% 移速' },
  { id:'greed', name:'贪婪', icon:'magnet', per:{ pickup:0.08 }, unit:'+8% 拾取' }
];

function talentLevel(id) {
  const t = loadProgress().talents || {};
  return Math.max(0, Math.min(5, t[id] || 0));
}

/* 天赋总加成 */
function talentBonus() {
  const b = { hp:0, dmg:0, haste:0, armor:0, crit:0, speed:0, pickup:0 };
  for (const t of TALENTS) {
    const lv = talentLevel(t.id);
    if (!lv) continue;
    for (const k in t.per) b[k] = (b[k] || 0) + t.per[k] * lv;
  }
  return b;
}

function buyTalent(id) {
  const prog = loadProgress();
  prog.talents = prog.talents || {};
  const t = TALENTS.find(function (x) { return x.id === id; });
  if (!t) return;
  const lv = Math.max(0, Math.min(5, prog.talents[id] || 0));
  if (lv >= 5) { toast('已经满级了'); return; }
  const price = TALENT_COST[lv];
  if ((prog.gold || 0) < price) { toast('金币不够，先卖点旧装备'); return; }

  prog.gold -= price;
  prog.talents[id] = lv + 1;
  saveProgress(prog);
  if (typeof SB !== 'undefined' && SB.currentUser && SB.currentUser()) {
    SB.saveCloudProgress(prog.cleared, prog.clearedHard, prog.stats, prog.equipment, prog.armory, prog.gold, prog.talents)
      .catch(function () {});
  }
  renderDataPage('talent');
  toast(t.name + ' 升到 ' + (lv + 1) + ' 级');
}

/* ---------- 收藏 / 成就 / 奖励 ---------- */
// 通关称号：自动穿戴评分最高的一个
const TITLES = [
  { zone:'plains', name:'草原旅人',   desc:'第一次活着走出平原',        stat:{hp:30},            text:'+30 生命',          score:30 },
  { zone:'forest', name:'林间猎手',   desc:'在森林里没被箭射穿',        stat:{dmg:0.05},         text:'+5% 伤害',          score:25 },
  { zone:'desert', name:'沙海行者',   desc:'熬过了沙漠的夜',            stat:{speed:0.05},       text:'+5% 移速',          score:22 },
  { zone:'caves',  name:'洞窟探客',   desc:'听见了八条腿的声音还活着',   stat:{crit:0.04},        text:'+4% 暴击',          score:28 },
  { zone:'swamp',  name:'沼泽之主',   desc:'踩着泥活到了最后',          stat:{armor:0.05},       text:'+5% 减伤',          score:26 },
  { zone:'nether', name:'下界幸存者', desc:'没被烤熟',                  stat:{dmg:0.08},         text:'+8% 伤害',          score:35 },
  { zone:'end',    name:'末地归人',   desc:'从虚空边上回来了',          stat:{haste:0.07},       text:'+7% 攻速',          score:32 },
  { zone:'deep',   name:'深暗回声',   desc:'监守者记住了你的名字',       stat:{hp:80,dmg:0.05},   text:'+80 生命 · +5% 伤害', score:45 }
];

/* 已拥有的称号里评分最高的那个（自动穿戴） */
function bestTitle() {
  const cleared = loadProgress().cleared || [];
  let best = null;
  for (const t of TITLES) {
    if (cleared.indexOf(t.zone) < 0) continue;
    if (!best || t.score > best.score) best = t;
  }
  return best;
}

function renderExtraPage(page) {
  const grid = document.getElementById('dataGrid');
  const title = document.getElementById('dataTitle');
  const prog = loadProgress();

  if (page === 'collection') {
    title.textContent = '收藏';
    grid.innerHTML = ZONES.map(z => {
      const cleared = prog.cleared.includes(z.id);
      return `<div class="dcard ${cleared ? 'done' : 'locked'}">
        <div class="dcard-ic">${cleared ? ICON.skull : '<span class="glyph">?</span>'}</div>
        <div class="dcard-body">
          <div class="dcard-name">${cleared ? z.name : '？？？'}</div>
          <div class="dcard-meta">${cleared ? '首领 · ' + z.boss : '未通关'}</div>
          <div class="dcard-desc">${cleared ? z.desc : '通关后收录进图鉴'}</div>
        </div>
      </div>`;
    }).join('');

  } else if (page === 'achieve') {
    title.textContent = '成就';
    const doneCount = ACHIEVEMENTS.filter(a => a.need(prog)).length;
    grid.innerHTML =
      `<div class="dcard" style="grid-column:1/-1;background:var(--ink);border-color:var(--ink)">
        <div class="dcard-body" style="text-align:center">
          <div class="dcard-name" style="color:var(--yellow)">已达成 ${doneCount} / ${ACHIEVEMENTS.length}</div>
          <div class="dcard-meta" style="color:#9fb08c">累计击杀 ${prog.stats.kills} · 游玩 ${prog.stats.games} 局 · 最高 ${prog.stats.bestLevel} 级</div>
        </div>
      </div>` +
      ACHIEVEMENTS.map(a => {
        const done = a.need(prog);
        const pr = a.prog(prog);
        return `<div class="dcard ${done ? 'done' : 'locked'}">
          <div class="dcard-ic">${ICON[a.icon] || ''}</div>
          <div class="dcard-body">
            <div class="dcard-name">${a.name}</div>
            <div class="dcard-meta">${a.desc}</div>
            <div class="dcard-desc">进度 ${pr[0]} / ${pr[1]}${done ? ' · 已达成' : ''}</div>
          </div>
        </div>`;
      }).join('');

  } else if (page === 'reward') {
    title.textContent = '奖励';
    grid.innerHTML =
      `<div class="dcard" style="grid-column:1/-1;background:var(--ink);border-color:var(--ink)">
        <div class="dcard-body" style="text-align:center">
          <div class="dcard-name" style="color:var(--yellow)">通关称号</div>
          <div class="dcard-meta" style="color:#9fb08c">每通关一个区域，获得一个称号</div>
        </div>
      </div>` +
      (function () {
        const cur = bestTitle();
        return TITLES.map(function (r) {
          const z = ZONES.find(function (x) { return x.id === r.zone; });
          const got = prog.cleared.indexOf(r.zone) >= 0;
          const wearing = cur && cur.zone === r.zone;
          return '<div class="dcard ' + (got ? 'done' : 'locked') + '">' +
            '<div class="dcard-ic">' + (got ? ICON.star : '<span class="glyph">?</span>') + '</div>' +
            '<div class="dcard-body">' +
              '<div class="dcard-name">' + (got ? r.name : '未获得') +
                (wearing ? ' <span style="color:#237a35;font-size:10px">· 佩戴中</span>' : '') + '</div>' +
              '<div class="dcard-meta">' + (z ? z.name : '') + (got ? ' · ' + r.text : '') + '</div>' +
              '<div class="dcard-desc">' + (got ? r.desc : '通关「' + (z ? z.name : '') + '」后获得') + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      })();
  }
}

/* ---------- 赛季排行榜 ---------- */
const RANK_TIERS = [
  { range: '第 1 名',   reward: '金色徽章 + 专属称号', cls: 't1' },
  { range: '2 - 3 名',  reward: '银色徽章',           cls: 't2' },
  { range: '4 - 10 名', reward: '铜色徽章',           cls: 't3' },
  { range: '11 - 25 名', reward: '赛季头像框',        cls: 't4' },
  { range: '26 - 50 名', reward: '限定称号',          cls: 't5' },
  { range: '51 - 100 名', reward: '纪念徽章',         cls: 't6' }
];

function fmtScore(n) {
  n = Math.max(0, Math.round(n || 0));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

async function renderRank() {
  const wrap = document.getElementById('rankWrap');
  if (!wrap) return;
  const season = SB.currentSeason();
  const cd = SB.seasonCountdown();

  wrap.innerHTML =
    `<div class="rank-head">
       <div class="rank-season">🏆 ${season.name}</div>
       <div class="rank-cd" id="rankCd">${cd.text}</div>
     </div>
     <div class="rank-toolbar">
       <span class="rank-mode on">按积分</span>
       <span class="rank-hint">${SB.isMock() ? '本地演示数据（未连接数据库）' : '实时数据'}</span>
     </div>
     <div class="rank-list" id="rankList"><div class="rank-loading">加载中…</div></div>
     <div class="rank-reward">
       <div class="rr-title">赛季奖励</div>
       <div class="rr-tiers">
         ${RANK_TIERS.map(t => `<div class="rr-tier ${t.cls}"><b>${t.range}</b><span>${t.reward}</span></div>`).join('')}
       </div>
     </div>`;

  const list = document.getElementById('rankList');
  try {
    const rows = await SB.getLeaderboard(season.id, 100);
    if (!rows.length) {
      list.innerHTML = '<div class="rank-loading">本赛季还没有人上榜，去拿第一个吧</div>';
      return;
    }
    const me = SB.currentUser();
    list.innerHTML = rows.map((r, i) => {
      const rank = i + 1;
      const cls = rank === 1 ? 'r1' : rank === 2 ? 'r2' : rank === 3 ? 'r3' : '';
      const isMe = me && r.trainer_name === me.name;
      return `<div class="rank-row ${cls}${isMe ? ' me' : ''}">
        <div class="rk-no">${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</div>
        <div class="rk-av">${(r.trainer_name || '?').slice(0, 1)}</div>
        <div class="rk-main">
          <div class="rk-name">${r.trainer_name || '匿名'}</div>
          <div class="rk-meta">${r.level || 0} 级 · ${r.kills || 0} 击杀</div>
        </div>
        <div class="rk-score">${fmtScore(r.score)}</div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div class="rank-loading">读取失败：${e.message || e}</div>`;
  }
}

/* ---------- 账号 ---------- */
let accMode = 'signup';

/* 登录/注册后：把本地进度和云端进度合并（取并集），再上传回去 */
async function syncProgressAfterAuth() {
  if (typeof SB === 'undefined' || !SB.currentUser()) return;
  const cloud = await SB.loadCloudProgress();
  const local = loadProgress();

  const union = (a, b) => Array.from(new Set([].concat(a || [], b || [])));

  const merged = {
    cleared: union(local.cleared, cloud && cloud.cleared),
    clearedHard: union(local.clearedHard, cloud && cloud.cleared_hard),
    stats: {
      kills: Math.max(local.stats.kills || 0, (cloud && cloud.stats && cloud.stats.kills) || 0),
      bestLevel: Math.max(local.stats.bestLevel || 0, (cloud && cloud.stats && cloud.stats.bestLevel) || 0),
      games: Math.max(local.stats.games || 0, (cloud && cloud.stats && cloud.stats.games) || 0)
    }
  };

  // 装备也合并：同部位取战力更高的
  const cloudEq = (cloud && cloud.equipment) || {};
  const localEq = local.equipment || {};
  merged.equipment = {};
  for (const slot of EQUIP.SLOTS) {
    const a = localEq[slot], b = cloudEq[slot];
    if (!a) { if (b) merged.equipment[slot] = b; continue; }
    if (!b) { merged.equipment[slot] = a; continue; }
    merged.equipment[slot] = EQUIP.score(a) >= EQUIP.score(b) ? a : b;
  }

  // 军械库合并：按 id 去重，保留最新 60 件
  const seen = {};
  merged.armory = [];
  [].concat(local.armory || [], cloud && cloud.armory || []).forEach(function (it) {
    if (!it || !it.id || seen[it.id]) return;
    seen[it.id] = 1;
    merged.armory.push(it);
  });
  merged.armory.sort(function (a, b) { return EQUIP.score(b) - EQUIP.score(a); });
  if (merged.armory.length > 60) merged.armory.length = 60;

  // 金币取两边较大的（避免换设备后变少）
  merged.gold = Math.max(local.gold || 0, (cloud && cloud.gold) || 0);

  // 天赋等级取两边较高的
  merged.talents = {};
  const lt = local.talents || {}, ct = (cloud && cloud.talents) || {};
  TALENTS.forEach(function (t) {
    merged.talents[t.id] = Math.max(lt[t.id] || 0, ct[t.id] || 0);
  });

  saveProgress(merged);
  await SB.saveCloudProgress(merged.cleared, merged.clearedHard, merged.stats, merged.equipment, merged.armory, merged.gold, merged.talents);
  if (typeof renderEquip === 'function') renderEquip();

  if (typeof renderZones === 'function') renderZones();
  if (typeof updateStartButton === 'function') updateStartButton();
}

function refreshAccountBar() {
  const u = (typeof SB !== 'undefined') ? SB.currentUser() : null;
  const nameEl = document.getElementById('accName');
  const subEl = document.getElementById('accSub');
  const avatarEl = document.getElementById('accAvatar');
  const btn = document.getElementById('btnAccount');
  if (!nameEl) return;
  if (u) {
    nameEl.textContent = u.name;
    subEl.textContent = '已绑定 · 成绩会上榜';
    avatarEl.textContent = (u.name || '?').slice(0, 1);
    btn.textContent = '退出登录';
    btn.onclick = () => { SB.signOut(); refreshAccountBar(); toast('已退出登录'); };
  } else {
    nameEl.textContent = '游客';
    subEl.textContent = '进度仅保存在本机';
    avatarEl.textContent = '?';
    btn.textContent = '保存到账号';
    btn.onclick = () => openAccountModal('signup');
  }
}

function openAccountModal(mode) {
  accMode = mode || 'signup';
  const modal = document.getElementById('accountModal');
  const title = document.getElementById('modalTitle');
  const tip = document.getElementById('modalTip');
  const pass2 = document.getElementById('accPass2Input');
  const submit = document.getElementById('btnAccSubmit');
  const swText = document.getElementById('accSwitchText');
  const swBtn = document.getElementById('btnAccSwitch');
  document.getElementById('accErr').textContent = '';

  if (accMode === 'signup') {
    title.textContent = '保存到账号';
    tip.textContent = '你将会保留全部游客进度。';
    pass2.style.display = '';
    submit.textContent = '创建账号';
    swText.textContent = '已有账号？';
    swBtn.textContent = '去登录';
  } else {
    title.textContent = '登录账号';
    tip.textContent = '输入你的训练家名称和密码。';
    pass2.style.display = 'none';
    submit.textContent = '登录';
    swText.textContent = '还没有账号？';
    swBtn.textContent = '去注册';
  }
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('accNameInput').focus(), 60);
}

function closeAccountModal() {
  document.getElementById('accountModal').classList.add('hidden');
}

async function submitAccount() {
  const errEl = document.getElementById('accErr');
  const name = document.getElementById('accNameInput').value.trim();
  const p1 = document.getElementById('accPassInput').value;
  const p2 = document.getElementById('accPass2Input').value;
  errEl.textContent = '';

  if (name.length < 2) { errEl.textContent = '名称至少 2 个字符'; return; }
  if (p1.length < 8) { errEl.textContent = '密码至少 8 个字符'; return; }
  if (accMode === 'signup' && p1 !== p2) { errEl.textContent = '两次输入的密码不一致'; return; }
  if (typeof SB === 'undefined') { errEl.textContent = '账号模块未加载'; return; }

  const btn = document.getElementById('btnAccSubmit');
  btn.disabled = true;
  btn.textContent = accMode === 'signup' ? '创建中…' : '登录中…';
  try {
    if (accMode === 'signup') await SB.signUp(name, p1);
    else await SB.signIn(name, p1);
    closeAccountModal();
    refreshAccountBar();
    toast(accMode === 'signup' ? '账号已创建' : '登录成功');
    syncProgressAfterAuth();   // 合并云端进度（换设备能接着玩）
  } catch (e) {
    errEl.textContent = e.message || '操作失败';
  } finally {
    btn.disabled = false;
    btn.textContent = accMode === 'signup' ? '创建账号' : '登录';
  }
}

function mobGlyph(m) {
  const k = m.kind;
  if (k === 'creeper') return ICON.creeper;
  if (k === 'slime') return ICON.slimeIco;
  if (k === 'spider') return ICON.spiderIco;
  if (k === 'blaze') return ICON.fire;
  return ICON.skull;
}

function mobTrait(m) {
  const t = [];
  if (m.ranged) t.push('远程投掷');
  if (m.explode) t.push('贴身后自爆');
  if (m.teleport) t.push('会瞬移到你身边');
  if (m.split) t.push('死亡后分裂');
  return t.length ? t.join('，') + '。' : '成群出现，靠数量取胜。';
}

/* ---------- 页签切换 ---------- */
function bindTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(t => {
    t.onclick = () => {
      tabs.forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      const p = t.dataset.page;
      const show = id => { document.getElementById(id).hidden = false; };
      const hide = id => { document.getElementById(id).hidden = true; };
      hide('pageChar'); hide('pageData'); hide('pageSoon'); hide('pageRank');

      // 底部出发栏只在角色页有意义
      const isChar = p === 'char';
      document.querySelector('.dock').style.display = isChar ? '' : 'none';
      document.querySelector('.hint').style.display = isChar ? '' : 'none';

      if (isChar) {
        show('pageChar');
      } else if (p === 'rank') {
        show('pageRank');
        renderRank();
      } else if (p === 'codex' || p === 'loot' || p === 'talent') {
        renderDataPage(p);
        show('pageData');
      } else {
        renderExtraPage(p);
        show('pageData');
      }
    };
  });
}

/* ---------- 初始化 ---------- */
function initMenu() {
  renderClassGrid();
  renderClassInfo();
  renderRaces();
  renderRaceTalent();
  renderEquip();
  renderZones();
  updateStartButton();
  renderPortrait();
  bindTabs();

  const nameInput = document.getElementById('charName');
  nameInput.oninput = () => { STATE.name = nameInput.value.trim() || '史蒂夫'; };

  document.getElementById('btnRandom').onclick = () => {
    const n = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
    nameInput.value = n;
    STATE.name = n;
  };

  document.getElementById('btnDiff').onclick = () => {
    STATE.diff = (STATE.diff + 1) % DIFFS.length;
    updateStartButton();
    toast(DIFFS[STATE.diff].name);
  };

  document.getElementById('btnStart').onclick = () => {
    // 存档异常时兜底：锁定区域退回平原
    if (!isZoneUnlocked(STATE.zone.id)) {
      STATE.zone = ZONES[0];
      renderZones();
      updateStartButton();
    }
    Game.start({
      cls: STATE.cls,
      race: STATE.race,
      zone: STATE.zone,
      diff: STATE.diff,
      name: STATE.name
    });
  };

  document.getElementById('btnCoop').onclick = () => toast('本地单人模式，多人还在挖矿中');
  document.getElementById('btnArmory').onclick = openArmory;
  document.getElementById('btnArmoryClose').onclick = closeArmory;
  document.getElementById('btnGoShop').onclick = openShop;
  document.getElementById('btnItemClose').onclick = closeItemDetail;
  document.getElementById('itemModal').onclick = e => {
    if (e.target.id === 'itemModal') closeItemDetail();
  };
  document.getElementById('btnItemWear').onclick = () => {
    if (!detailId) return;
    wearItem(detailId);
    closeItemDetail();
  };
  document.getElementById('btnItemSell').onclick = () => {
    if (!detailId) return;
    if (sellItem(detailId)) closeItemDetail();
  };
  document.getElementById('btnShopClose').onclick = closeShop;
  document.getElementById('shopModal').onclick = e => {
    if (e.target.id === 'shopModal') closeShop();
  };
  document.getElementById('armoryModal').onclick = e => {
    if (e.target.id === 'armoryModal') closeArmory();
  };
  document.getElementById('btnTalent').onclick = () => {
    document.querySelector('.tab[data-page="talent"]').click();
  };

  // 账号栏与弹窗
  refreshAccountBar();
  document.getElementById('btnAccCancel').onclick = closeAccountModal;
  document.getElementById('btnAccSubmit').onclick = submitAccount;
  document.getElementById('btnAccSwitch').onclick = () => {
    openAccountModal(accMode === 'signup' ? 'signin' : 'signup');
  };
  document.getElementById('accountModal').onclick = e => {
    if (e.target.id === 'accountModal') closeAccountModal();
  };

  // 键盘快捷键
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;

    // 账号弹窗打开时，回车 = 提交表单，绝不能顺手把游戏开了
    const modal = document.getElementById('accountModal');
    if (modal && !modal.classList.contains('hidden')) {
      const t = e.target;
      if (t && (t.id === 'accNameInput' || t.id === 'accPassInput' || t.id === 'accPass2Input')) {
        e.preventDefault();
        const btn = document.getElementById('btnAccSubmit');
        if (btn && !btn.disabled) submitAccount();
      }
      return;
    }

    if (document.getElementById('menu').classList.contains('show')) {
      document.getElementById('btnStart').click();
    }
  });
}

document.addEventListener('DOMContentLoaded', initMenu);
