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
      clearedNightmare: obj && Array.isArray(obj.clearedNightmare) ? obj.clearedNightmare : [],
      stats: (obj && obj.stats) || { kills: 0, bestLevel: 0, games: 0 },
      equipment: (obj && obj.equipment) || {},
      armory: (obj && obj.armory) || [],
      gold: (obj && typeof obj.gold === 'number') ? obj.gold : 0,
      talents: (obj && obj.talents) || {},
      shopUntil: (obj && obj.shopUntil) || 0,
      sealedSeason: (obj && obj.sealedSeason) || 0,
      badges: (obj && obj.badges) || []
    };
  } catch (e) {
    _progressCache = { cleared: [], clearedHard: [], clearedNightmare: [], stats: { kills: 0, bestLevel: 0, games: 0 }, equipment: {}, armory: [], gold: 0, talents: {}, shopUntil: 0, sealedSeason: 0, badges: [] };
  }
  return _progressCache;
}

/* 品质体系 5 档 → 20 档的兼容迁移（每次保存都跑一遍，幂等） */
function migrateProgress(p) {
  try {
    const QMAP = [3, 6, 9, 12, 14];   // 旧 0..4 → 扎实 / 精良 / 稀有 / 史诗 / 传说
    const fix = function (it) {
      if (!it || typeof it.quality !== 'number' || it.qv >= 2) return;
      if (it.quality <= 4) it.quality = QMAP[it.quality] != null ? QMAP[it.quality] : it.quality;
      it.qv = 2;
    };
    const eq = p.equipment || {};
    Object.keys(eq).forEach(function (k) { fix(eq[k]); });
    (p.armory || []).forEach(fix);
    (p.shop || []).forEach(function (g) { if (g && g.item) fix(g.item); });
  } catch (e) {}
}

function saveProgress(p) {
  migrateProgress(p);
  _progressCache = p;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch (e) {}
}

/* 难度解锁：普通 → 困难（需普通全通）→ 极限（需困难全通） */
const NORMAL_ZONE_COUNT = ZONES.filter(function (z) { return !z.endless; }).length;

function isDiffUnlocked(diff) {
  const prog = loadProgress();
  if (diff === 0) return true;
  if (diff === 1) return (prog.cleared || []).length >= NORMAL_ZONE_COUNT;
  if (diff === 2) return (prog.clearedHard || []).length >= NORMAL_ZONE_COUNT;
  return false;
}

function diffProgressText(diff) {
  const prog = loadProgress();
  if (diff === 1) return '需通关全部普通区域（' + (prog.cleared || []).length + '/' + NORMAL_ZONE_COUNT + '）';
  if (diff === 2) return '需通关全部困难区域（' + (prog.clearedHard || []).length + '/' + NORMAL_ZONE_COUNT + '）';
  return '';
}

/* 区域解锁：同一难度内按顺序，且该难度本身要已解锁 */
function isZoneUnlocked(zoneId, diff) {
  if (diff == null) diff = (typeof STATE !== 'undefined' && STATE) ? STATE.diff : 0;
  if (!isDiffUnlocked(diff)) return false;

  const prog = loadProgress();
  const idx = ZONES.findIndex(z => z.id === zoneId);
  if (idx < 0) return false;
  // 无尽深渊：通关全部普通区域后解锁
  if (ZONES[idx].endless) return (prog.cleared || []).length >= NORMAL_ZONE_COUNT;
  if (idx === 0) return true;

  const list = diff === 0 ? (prog.cleared || [])
             : diff === 1 ? (prog.clearedHard || [])
             : (prog.clearedNightmare || []);
  return list.indexOf(ZONES[idx - 1].id) >= 0;
}

function isZoneCleared(zoneId) {
  return loadProgress().cleared.includes(zoneId);
}

/* 通关后由游戏层调用：解锁下一区域 */
function unlockNextZone(currentId, diffIdx) {
  const idx = ZONES.findIndex(z => z.id === currentId);
  if (idx < 0) return null;
  const p = loadProgress();
  const d = diffIdx || 0;
  const key = d === 0 ? 'cleared' : (d === 1 ? 'clearedHard' : 'clearedNightmare');
  p[key] = p[key] || [];
  if (p[key].indexOf(currentId) < 0) p[key].push(currentId);
  // 兼容老逻辑：困难通关也算普通通过
  if (d >= 1 && p.cleared.indexOf(currentId) < 0) p.cleared.push(currentId);
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
/* ---------- 精细像素小人（16×24） ---------- */
// H=头发 S=皮肤 E=眼睛 M=嘴 B=衣服 G=扣子 L=裤子 D=靴子
const BODY_PX = [
  '................',
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '....HHHHHHHH....',
  '....HSSSSSSH....',
  '....SSSSSSSS....',
  '....SEESSEES....',
  '....SSSSSSSS....',
  '....SSSMMSSS....',
  '.....SSSSSS.....',
  '......SSSS......',
  '....BBBBBBBB....',
  '...BBBBBBBBBB...',
  '...BBBGGBBBBB...',
  '...BBBBBBBBBB...',
  '...BBBBBBBBBB...',
  '....BBBBBBBB....',
  '....LLLLLLLL....',
  '....LLL..LLL....',
  '....LLL..LLL....',
  '....LLL..LLL....',
  '....LLL..LLL....',
  '....LLL..LLL....',
  '...DDDD..DDDD...'
];

const BODY_W = 16, BODY_H = 24;
const _bodyCache = {};

function bodyPixelColor(ch, skin) {
  switch (ch) {
    case 'H': return skin.hair || '#3a2a18';
    case 'S': return skin.head || '#d2a578';
    case 'E': return skin.eye || '#1a1a1a';
    case 'M': return skin.mouth || '#9a5545';
    case 'B': return skin.body || '#2fa8a8';
    case 'G': return skin.bodyLight || '#ffd85c';
    case 'L': return skin.leg || '#3b3b8f';
    case 'D': return skin.legDark || '#2a2a3a';
    default: return null;
  }
}

/* 把身体预渲染成一张小 canvas 缓存起来（不然每帧画 300+ 个方块会卡死） */
function getBodyCanvas(skin, key) {
  if (_bodyCache[key]) return _bodyCache[key];
  const c = document.createElement('canvas');
  c.width = BODY_W;
  c.height = BODY_H;
  const g2 = c.getContext('2d');
  for (let y = 0; y < BODY_H; y++) {
    const row = BODY_PX[y];
    for (let x = 0; x < BODY_W; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const col = bodyPixelColor(ch, skin);
      if (!col) continue;
      g2.fillStyle = col;
      g2.fillRect(x, y, 1, 1);
    }
  }
  // 描边：先在底层画一圈放大的深色，再盖上正常身体（只露出 1px 边缘）
  const out = document.createElement('canvas');
  out.width = BODY_W + 2;
  out.height = BODY_H + 2;
  const g3 = out.getContext('2d');
  g3.fillStyle = '#1a1424';
  for (let y = 0; y < BODY_H; y++) {
    for (let x = 0; x < BODY_W; x++) {
      if (BODY_PX[y][x] === '.') continue;
      g3.fillRect(x, y, 3, 3);
    }
  }
  g3.drawImage(c, 1, 1);
  _bodyCache[key] = out;
  return out;
}

function drawMCFigure(g, cx, footY, unit, skin, opt) {
  opt = opt || {};
  const flip = opt.flip ? -1 : 1;
  const alpha = opt.alpha == null ? 1 : opt.alpha;
  const U = unit * (32 / BODY_H);   // 保持和旧模型一样的身高
  const key = (skin.body || '') + '|' + (skin.hair || '') + '|' + (skin.head || '');

  g.save();
  g.globalAlpha = alpha;
  g.translate(cx, footY);
  g.scale(flip, 1);

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
  const bodyY = Math.round((bob - BODY_H - 1) * U);

  // 手臂（画在身体后面，可摆动）
  const armY = -18 * U + bob * U + swing * 2 * U;
  g.fillStyle = skin.arm || skin.head || '#d2a578';
  g.fillRect(Math.round(-8.5 * U), Math.round(armY), Math.ceil(2.2 * U), Math.ceil(9 * U));
  g.fillRect(Math.round(6.3 * U), Math.round(armY), Math.ceil(2.2 * U), Math.ceil(9 * U));
  // 袖口
  g.fillStyle = skin.body || '#2fa8a8';
  g.fillRect(Math.round(-8.5 * U), Math.round(armY), Math.ceil(2.2 * U), Math.ceil(3 * U));
  g.fillRect(Math.round(6.3 * U), Math.round(armY), Math.ceil(2.2 * U), Math.ceil(3 * U));

  // 身体（预渲染位图）
  const img = getBodyCanvas(skin, key);
  g.imageSmoothingEnabled = false;
  g.drawImage(img, Math.round(-(BODY_W / 2 + 1) * U), bodyY,
    Math.ceil(img.width * U), Math.ceil(img.height * U));

  // 武器
  if (skin.weapon) drawHeldItem(g, skin.weapon, U, armY / U, 0);

  g.restore();
}

/* ---------- 武器贴图 ---------- */
const WEAPON_KEYS = ['sword', 'shield', 'bow', 'dagger', 'apple', 'potion', 'staff', 'sapling', 'skull'];
const WEAPON_IMGS = {};
WEAPON_KEYS.forEach(function (k) {
  const im = new Image();
  im.onload = function () {
    if (typeof renderPortrait === 'function') { try { renderPortrait(); } catch (e) {} }
  };
  im.src = 'assets/weapons/' + k + '.png';
  WEAPON_IMGS[k] = im;
});

/* 手持物品：优先用贴图，加载失败才退回代码绘制 */

function drawHeldItem(g, type, U, armY, bob) {
  const y0 = armY + (bob || 0);
  const img = WEAPON_IMGS[type];
  if (img && img.complete && img.naturalWidth > 0) {
    const size = 9 * U;
    g.save();
    g.imageSmoothingEnabled = false;
    g.drawImage(img, Math.round(5.6 * U), Math.round((y0 - 0.5) * U), size, size);
    g.restore();
    return;
  }
  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x * U), Math.round(y * U), Math.ceil(w * U), Math.ceil(h * U));
  };
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
    return '<div class="equip-slot filled" data-eid="' + it.id + '" ' +
      'style="border-color:' + q.color + ';box-shadow:0 3px 0 ' + q.dark + '" ' +
      'title="' + q.name + ' · ' + slotName + '：' + tips + '">' +
      '<div class="es-ic">' + (ICON[EQUIP.SLOT_ICON[slot]] || '') + '</div>' +
      '<div class="es-q" style="background:' + q.color + '">' + q.name + '</div>' +
      '</div>';
  }).join('');

  // 点已装备的槽位 → 看属性 / 卸下
  box.querySelectorAll('.equip-slot.filled').forEach(function (el) {
    el.onclick = function () { openItemDetail(el.dataset.eid); };
  });

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
        '<span class="ai-name" style="color:' + q.color + '">' +
          (it.name || (q.name + EQUIP.SLOT_NAME[it.slot])) + '</span>' +
        '<span class="ai-affixes">' + q.name + ' · ' + EQUIP.SLOT_NAME[it.slot] + ' · ' +
          it.affixes.map(function (a) { return EQUIP.desc(a); }).join(' · ') + '</span>' +
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
  if (typeof SFX !== 'undefined') SFX.buy();
  toast('卖出 ' + EQUIP.SLOT_NAME[it.slot] + ' +' + price + ' 金币');
  return true;
}

/* ---------- 装备详情 ---------- */
let detailId = null;

function openItemDetail(id) {
  const prog = loadProgress();
  let it = (prog.armory || []).find(function (x) { return x.id === id; });
  if (!it) {
    // 可能在装备栏里但不在军械库（老存档）
    const eq0 = prog.equipment || {};
    for (const k in eq0) {
      if (eq0[k] && eq0[k].id === id) { it = eq0[k]; break; }
    }
  }
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

  const dispName = it.name || (q.name + EQUIP.SLOT_NAME[it.slot]);
  document.getElementById('itemTitle').textContent = dispName;

  // 锻造日期
  let bornTxt = '';
  if (it.born) {
    const d = new Date(it.born);
    bornTxt = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  document.getElementById('itemBody').innerHTML =
    '<div class="item-detail" style="border-color:' + q.color + ';box-shadow:0 5px 0 ' + q.dark + '">' +
      '<div class="id-icon">' + (ICON[EQUIP.SLOT_ICON[it.slot]] || '') + '</div>' +
      '<div class="id-head">' +
        '<span class="id-name" style="color:' + q.color + '">' + dispName + '</span>' +
      '</div>' +
      '<div class="id-sub">' + q.name + ' · ' + EQUIP.SLOT_NAME[it.slot] + '</div>' +
      '<div class="id-affixes">' +
        it.affixes.map(function (a) { return '<div class="id-affix">' + EQUIP.desc(a) + '</div>'; }).join('') +
      '</div>' +
      '<div class="id-foot">' +
        '<span>战力 <b>' + myScore + '</b></span>' +
        '<span class="id-cmp">' + cmp + '</span>' +
      '</div>' +
      '<div class="id-flavor">' +
        (it.flavor || []).map(function (f) { return '<span>「' + f + '」</span>'; }).join('') +
        (bornTxt ? '<span class="id-born">锻造于 ' + bornTxt + '</span>' : '') +
      '</div>' +
    '</div>';

  const wearBtn = document.getElementById('btnItemWear');
  wearBtn.textContent = worn ? '卸下' : '穿戴';
  wearBtn.disabled = false;
  wearBtn.classList.toggle('ghost', worn);
  document.getElementById('btnItemSell').textContent = '卖出 ' + sellPrice(it);
  document.getElementById('btnItemSell').style.display = worn ? 'none' : '';

  document.getElementById('itemModal').classList.remove('hidden');
}

function closeItemDetail() {
  document.getElementById('itemModal').classList.add('hidden');
  detailId = null;
}

function unequipItem(slot) {
  const prog = loadProgress();
  if (!prog.equipment || !prog.equipment[slot]) return false;
  delete prog.equipment[slot];
  saveProgress(prog);
  if (typeof SB !== 'undefined' && SB.currentUser && SB.currentUser()) {
    SB.saveCloudProgress(prog.cleared, prog.clearedHard, prog.stats, prog.equipment,
      prog.armory, prog.gold, prog.talents).catch(function () {});
  }
  renderEquip();
  renderArmory();
  if (typeof SFX !== 'undefined') SFX.click();
  toast('已卸下 ' + EQUIP.SLOT_NAME[slot]);
  return true;
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
  // 按品质分档定价：越极品越贵，避免玩家刷几局就能买一身
  const base = sellPrice(it);
  const q = it.quality || 0;
  let mul;
  if (q >= 14) mul = 12;        // 传说 / 不朽 / 神话 / 逆天 / 寰宇 / 根源
  else if (q >= 12) mul = 9;    // 史诗 / 超凡
  else if (q >= 9) mul = 6;     // 稀有 / 罕见 / 瑰宝
  else mul = 4;                 // 精良及以下
  return Math.round(base * mul);
}

const SHOP_TTL = 4 * 3600 * 1000;   // 4 小时刷新一次
// 三格分别是：史诗 / 稀有 / 精良 —— 商城只卖好东西
const SHOP_GRADES = [14, 12, 9];   // 传说 / 史诗 / 稀有（20 档体系）

function rollShop(force) {
  const prog = loadProgress();
  const now = Date.now();
  const expired = !prog.shopUntil || now > prog.shopUntil;

  if (force || expired || !prog.shop || prog.shop.length < 3) {
    prog.shop = [];
    prog.shopUntil = now + SHOP_TTL;
    for (const g of SHOP_GRADES) {
      const it = EQUIP.make(24, g);
      prog.shop.push({ item: it, price: shopPrice(it) });
    }
    saveProgress(prog);
  }
  return prog.shop;
}

function shopTimeLeft() {
  const prog = loadProgress();
  if (!prog.shopUntil) return '';
  const ms = prog.shopUntil - Date.now();
  if (ms <= 0) return '即将刷新';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms % 3600000 / 60000);
  return h > 0 ? (h + ' 小时 ' + m + ' 分后刷新') : (m + ' 分钟后刷新');
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
  const tEl = document.getElementById('shopTimer');
  if (tEl) tEl.textContent = shopTimeLeft();

  list.innerHTML = goods.map(function (g, i) {
    const it = g.item;
    const q = EQUIP.qualityOf(it.quality);
    const poor = gold < g.price;
    return '<div class="shop-item" style="border-color:' + q.color + ';box-shadow:0 3px 0 ' + q.dark + '">' +
      '<span class="ai-slot" style="background:' + q.color + '">' + EQUIP.SLOT_NAME[it.slot] + '</span>' +
      '<span class="si-main">' +
        '<span class="ai-name" style="color:' + q.color + '">' +
          (it.name || (q.name + EQUIP.SLOT_NAME[it.slot])) + '</span>' +
        '<span class="ai-affixes">' + q.name + ' · ' + EQUIP.SLOT_NAME[it.slot] + ' · ' +
          it.affixes.map(function (a) { return EQUIP.desc(a); }).join(' · ') + '</span>' +
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
  if (typeof SFX !== 'undefined') SFX.buy();
  toast('买到了 ' + EQUIP.SLOT_NAME[g.item.slot] + '（已放进军械库）');
}

/* ---------- 渲染：区域 ---------- */
function renderZones() {
  const box = document.getElementById('zoneList');
  box.innerHTML = ZONES.map(z => {
    const unlocked = isZoneUnlocked(z.id, STATE.diff);
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

/* 刷新大厅「天赋」按钮上的点数 */
function refreshTalentCount() {
  const el = document.getElementById('talentCount');
  if (!el) return;
  const prog = loadProgress();
  const t = prog.talents || {};
  let used = 0;
  TALENTS.forEach(function (x) { used += Math.max(0, Math.min(5, t[x.id] || 0)); });
  const total = TALENTS.length * 5;
  el.textContent = used + ' / ' + total + ' 点';
  el.style.color = used >= total ? '#ffd85c' : '';
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
  refreshTalentCount();
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
    const badges = prog.badges || [];
    const badgeHtml = badges.length
      ? '<div class="dcard done" style="grid-column:1/-1">' +
          '<div class="dcard-ic">' + (ICON.star || '') + '</div>' +
          '<div class="dcard-body">' +
            '<div class="dcard-name">赛季徽章</div>' +
            '<div class="dcard-meta">' + badges.map(function (b) {
              return '第' + b.season + '赛季 第' + b.rank + '名 · ' + b.reward;
            }).join(' ／ ') + '</div>' +
          '</div>' +
        '</div>'
      : '';
    grid.innerHTML = badgeHtml + ZONES.map(z => {
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
       <div class="rr-title" style="display:flex;align-items:center">赛季奖励<span class="rank-reward-link" id="rankRewardLink">说明</span></div>
       <div class="rr-tiers">
         ${RANK_TIERS.map(t => `<div class="rr-tier ${t.cls}"><b>${t.range}</b><span>${t.reward}</span></div>`).join('')}
       </div>
     </div>`;

  const link = document.getElementById('rankRewardLink');
  if (link) link.onclick = openSeasonModal;

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
          <div class="rk-meta">${r.level || 0} 级 · ${r.kills || 0} 击杀${r.gameId ? ' · <b style="color:#237a35">ID: ' + r.gameId + '</b>' : ''}</div>
        </div>
        <div class="rk-score">${fmtScore(r.score)}</div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div class="rank-loading">读取失败：${e.message || e}</div>`;
  }
}

/* ---------- 属性面板 ---------- */
function renderStats(title, sections) {
  document.getElementById('statsTitle').textContent = title;
  const list = document.getElementById('statsList');
  let html = '';
  sections.forEach(function (sec) {
    if (sec.title) html += '<div class="stats-sec">' + sec.title + '</div>';
    (sec.rows || []).forEach(function (r) {
      html += '<div class="stats-row' + (r.hl ? ' hl' : '') + '">' +
        '<span class="sk">' + r.k + '</span>' +
        '<span class="sv">' + r.v + '</span></div>';
    });
  });
  list.innerHTML = html;
  document.getElementById('statsModal').classList.remove('hidden');
}

function closeStats() {
  document.getElementById('statsModal').classList.add('hidden');
}

/* 大厅：显示加成汇总（装备 / 称号 / 天赋） */
function openMenuStats() {
  const prog = loadProgress();
  const eq = prog.equipment || {};
  const eb = EQUIP.totalBonus(eq);

  const fmt = function (v, isPct, unit) {
    if (isPct) return '+' + (v * 100).toFixed(1) + '%';
    return '+' + Math.round(v) + (unit || '');
  };

  const eqRows = [];
  const STAT_ORDER = ['hp', 'dmg', 'speed', 'haste', 'crit', 'armor', 'pickup', 'lifesteal', 'regen'];
  const STAT_LABEL = {
    hp: ['生命', false, ''], dmg: ['伤害', true], speed: ['移速', true],
    haste: ['攻速', true], crit: ['暴击', true], armor: ['减伤', true],
    pickup: ['拾取', true], lifesteal: ['吸血', true], regen: ['每秒回复', false, '']
  };
  STAT_ORDER.forEach(function (k) {
    const v = eb[k] || 0;
    if (!v) return;
    const meta = STAT_LABEL[k];
    eqRows.push({ k: meta[0], v: fmt(v, meta[1], meta[2]), hl: true });
  });
  if (!eqRows.length) eqRows.push({ k: '尚未穿戴装备', v: '—' });

  // 称号
  const t = (typeof bestTitle === 'function') ? bestTitle() : null;
  const titleRows = t
    ? [{ k: t.name, v: t.text, hl: true }]
    : [{ k: '无称号', v: '通关区域后获得' }];

  // 天赋
  const talRows = [];
  TALENTS.forEach(function (tt) {
    const lv = talentLevel(tt.id);
    if (!lv) return;
    talRows.push({ k: tt.name + ' ' + lv + ' 级', v: tt.unit + ' × ' + lv });
  });
  if (!talRows.length) talRows.push({ k: '还没点天赋', v: '去「天赋」页用金币升级' });

  const n = Object.keys(eq).length;
  renderStats('当前属性加成', [
    { title: '装备（已穿 ' + n + ' 件）', rows: eqRows },
    { title: '称号', rows: titleRows },
    { title: '永久天赋', rows: talRows },
    { title: '说明', rows: [{ k: '以上加成', v: '开局时自动生效' }] }
  ]);
}

/* 暂停：显示本局实时数值 */
function openPauseStats() {
  const S = (typeof Game !== 'undefined' && Game.debug) ? Game.debug() : null;
  if (!S || !S.player) { toast('还没开局'); return; }
  const p = S.player;
  const pct = function (v) { return ((v || 0) * 100).toFixed(1) + '%'; };
  const num = function (v) { return Math.round(v || 0).toLocaleString(); };

  renderStats('本局属性', [
    {
      title: '基础',
      rows: [
        { k: '生命', v: Math.round(p.hp) + ' / ' + Math.round(p.maxHp), hl: true },
        { k: '等级', v: S.level + ' 级' },
        { k: '存活', v: Math.floor(S.time / 60) + ':' + String(Math.floor(S.time % 60)).padStart(2, '0') }
      ]
    },
    {
      title: '输出',
      rows: [
        { k: '伤害倍率', v: '×' + p.dmgMul.toFixed(2), hl: true },
        { k: '攻击速度', v: '×' + (p.atkSpeedMul || 1).toFixed(2) },
        { k: '暴击率', v: pct(p.critChance) },
        { k: '暴击伤害', v: '×' + (p.critMul || 2).toFixed(2) }
      ]
    },
    {
      title: '生存',
      rows: [
        { k: '减伤', v: pct(p.armor) },
        { k: '吸血', v: pct(p.lifesteal), hl: (p.lifesteal || 0) > 0 },
        { k: '吸血上限', v: (p.maxHp * 0.008 * (S.zone.endless ? 0.4 : 1)).toFixed(1) + ' / 秒' },
        { k: '每秒回复', v: (p.regen || 0).toFixed(1) }
      ]
    },
    {
      title: '其他',
      rows: [
        { k: '移动速度', v: num(p.speed) },
        { k: '拾取范围', v: num(p.pickup) },
        { k: '击杀 / 场上', v: S.kills + ' / ' + S.enemies.length }
      ]
    }
  ]);
}

/* ---------- 赛季奖励说明 ---------- */
function openSeasonModal() {
  const season = SB.currentSeason();
  const cd = SB.seasonCountdown();
  document.getElementById('shSeason').textContent = season.name;
  document.getElementById('shCd').textContent = cd.text;

  const TIER_DETAIL = [
    { range: '第 1 名',    reward: '金色徽章 + 专属称号', cls: 't1' },
    { range: '2 - 3 名',   reward: '银色徽章',           cls: 't2' },
    { range: '4 - 10 名',  reward: '铜色徽章',           cls: 't3' },
    { range: '11 - 25 名', reward: '赛季头像框',         cls: '' },
    { range: '26 - 50 名', reward: '限定称号',           cls: '' },
    { range: '51 - 100 名', reward: '纪念徽章',          cls: '' }
  ];
  document.getElementById('seasonTiers').innerHTML = TIER_DETAIL.map(function (t) {
    return '<div class="st-item ' + t.cls + '"><b>' + t.range + '</b><span>' + t.reward + '</span></div>';
  }).join('');

  document.getElementById('seasonModal').classList.remove('hidden');
}

function closeSeasonModal() {
  document.getElementById('seasonModal').classList.add('hidden');
}

/* 查我在当前赛季的排名（用于结算界面显示） */
async function fetchMyRank() {
  try {
    if (typeof SB === 'undefined' || !SB.currentUser()) return null;
    const season = SB.currentSeason();
    const rows = await SB.getLeaderboard(season.id, 100);
    const me = SB.currentUser().name;
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i].trainer_name || '').trim() === me) {
        return { rank: i + 1, total: rows.length, score: rows[i].score };
      }
    }
    return { rank: 0, total: rows.length, score: 0 };
  } catch (e) { return null; }
}

/* 按名次给奖励名 */
function rewardForRank(rank) {
  if (!rank) return '';
  if (rank === 1) return '金色徽章 + 专属称号';
  if (rank <= 3) return '银色徽章';
  if (rank <= 10) return '铜色徽章';
  if (rank <= 25) return '赛季头像框';
  if (rank <= 50) return '限定称号';
  if (rank <= 100) return '纪念徽章';
  return '';
}

/* ---------- 赛季自动结算 ---------- */
/* 每次打开游戏检查：如果跨赛季了，结算上赛季并把游戏内奖励发到账号 */
async function checkSeasonSettle() {
  // 不额外做防重入：sealedSeason 判断本身就能保证只结算一次
  if (typeof SB === 'undefined' || !SB.currentUser()) return;

  const prog = loadProgress();
  const cur = SB.currentSeason().id;
  const sealed = prog.sealedSeason;

  // 第一次玩：记下当前赛季，不结算
  if (!sealed) {
    prog.sealedSeason = cur;
    prog.badges = prog.badges || [];
    saveProgress(prog);
    return;
  }
  if (cur <= sealed) return;   // 还没跨赛季

  // 跨赛季了：结算 sealed 赛季
  try {
    const rows = await SB.getLeaderboard(sealed, 100);
    const me = SB.currentUser().name;
    let rank = 0;
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i].trainer_name || '').trim() === me) { rank = i + 1; break; }
    }

    prog.sealedSeason = cur;
    prog.badges = prog.badges || [];
    if (rank > 0 && rank <= 100) {
      const reward = rewardForRank(rank);
      prog.badges.push({ season: sealed, rank: rank, reward: reward, at: Date.now() });
      saveProgress(prog);
      if (typeof SFX !== 'undefined') SFX.buy();
      toast('第 ' + sealed + ' 赛季结算：第 ' + rank + ' 名 · ' + reward);
    } else {
      saveProgress(prog);
    }
  } catch (e) {
    // 网络失败，下次打开再试
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
    const gid = (typeof SB !== 'undefined' && SB.currentGameId) ? SB.currentGameId() : '';
    nameEl.textContent = u.name;
    subEl.textContent = gid ? ('游戏ID：' + gid) : '点此绑定游戏 ID';
    subEl.style.color = gid ? '#237a35' : '#a82522';
    subEl.style.cursor = 'pointer';
    subEl.style.textDecoration = 'underline';
    subEl.onclick = function (ev) { ev.stopPropagation(); openGameIdModal(); };
    avatarEl.textContent = (u.name || '?').slice(0, 1);
    btn.textContent = '退出登录';
    btn.onclick = () => { SB.signOut(); refreshAccountBar(); toast('已退出登录'); };
  } else {
    subEl.style.cursor = 'default';
    subEl.style.textDecoration = 'none';
    subEl.style.color = '';
    subEl.onclick = null;
    nameEl.textContent = '游客';
    subEl.textContent = '进度仅保存在本机';
    avatarEl.textContent = '?';
    btn.textContent = '保存到账号';
    btn.onclick = () => openAccountModal('signup');
  }
}

/* ---------- 绑定游戏 ID ---------- */
function openGameIdModal() {
  if (typeof SB === 'undefined' || !SB.currentUser()) {
    toast('请先登录账号');
    return;
  }
  const inp = document.getElementById('gameIdInput');
  inp.value = (SB.currentGameId && SB.currentGameId()) || '';
  document.getElementById('gameIdErr').textContent = '';
  document.getElementById('gameIdModal').classList.remove('hidden');
  setTimeout(function () { inp.focus(); }, 60);
}

function closeGameIdModal() {
  document.getElementById('gameIdModal').classList.add('hidden');
}

async function saveGameId() {
  const errEl = document.getElementById('gameIdErr');
  const val = document.getElementById('gameIdInput').value.trim();
  errEl.textContent = '';

  if (val && !/^[A-Za-z0-9_]{3,16}$/.test(val)) {
    errEl.textContent = '游戏 ID 只能包含字母、数字、下划线，长度 3-16';
    return;
  }

  const btn = document.getElementById('btnGameIdSave');
  btn.disabled = true;
  btn.textContent = '保存中…';
  try {
    await SB.bindGameId(val);
    closeGameIdModal();
    refreshAccountBar();
    toast(val ? ('已绑定游戏 ID：' + val) : '已解绑游戏 ID');
  } catch (e) {
    errEl.textContent = e.message || '保存失败';
  } finally {
    btn.disabled = false;
    btn.textContent = '保存';
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
    const next = (STATE.diff + 1) % DIFFS.length;
    if (!isDiffUnlocked(next)) {
      toast(DIFFS[next].name + ' 未解锁 · ' + diffProgressText(next));
      return;
    }
    STATE.diff = next;
    updateStartButton();
    renderZones();
    toast(DIFFS[STATE.diff].name);
  };

  document.getElementById('btnStart').onclick = () => {
    // 存档异常时兜底：锁定区域退回平原
    if (!isZoneUnlocked(STATE.zone.id, STATE.diff)) {
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
    const prog = loadProgress();
    const eqNow = prog.equipment || {};
    let wornSlot = null;
    for (const k in eqNow) {
      if (eqNow[k] && eqNow[k].id === detailId) { wornSlot = k; break; }
    }
    if (wornSlot) unequipItem(wornSlot);
    else wearItem(detailId);
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

  // 预热 Supabase 连接：提前握手，第一次登录不用等 DNS + TLS
  if (typeof SB !== 'undefined' && SB.warmup) SB.warmup();

  // 音效：首次交互时初始化 AudioContext（浏览器策略要求）
  document.addEventListener('pointerdown', function () {
    if (typeof SFX !== 'undefined') SFX.init();
  }, { once: true });

  // 音效开关
  (function () {
    const btn = document.getElementById('btnSfx');
    if (!btn) return;
    const sync = () => {
      const on = (typeof SFX === 'undefined') ? false : SFX.isOn();
      btn.textContent = on ? '🔊' : '🔇';
      btn.classList.toggle('off', !on);
    };
    sync();
    btn.onclick = function (ev) {
      ev.stopPropagation();
      if (typeof SFX === 'undefined') return;
      SFX.toggle();
      sync();
    };
  })();

  // 全局按钮点击音
  document.addEventListener('click', function (ev) {
    const t = ev.target;
    if (t && t.closest && t.closest('button') && typeof SFX !== 'undefined' && SFX.isOn()) {
      if (t.id !== 'btnSfx') SFX.click();
    }
  });

  // 账号栏与弹窗
  refreshAccountBar();
  refreshTalentCount();

  // 赛季自动结算（跨赛季才触发，延迟执行不阻塞界面）
  setTimeout(function () {
    if (typeof checkSeasonSettle === 'function') checkSeasonSettle();
  }, 1500);
  document.getElementById('btnAccCancel').onclick = closeAccountModal;
  document.getElementById('btnGameIdCancel').onclick = closeGameIdModal;
  document.getElementById('btnStatsClose').onclick = closeStats;
  document.getElementById('statsModal').onclick = e => {
    if (e.target.id === 'statsModal') closeStats();
  };
  document.getElementById('btnMenuStats').onclick = openMenuStats;
  document.getElementById('btnSeasonClose').onclick = closeSeasonModal;
  document.getElementById('seasonModal').onclick = e => {
    if (e.target.id === 'seasonModal') closeSeasonModal();
  };
  document.getElementById('btnGameIdSave').onclick = saveGameId;
  document.getElementById('gameIdModal').onclick = e => {
    if (e.target.id === 'gameIdModal') closeGameIdModal();
  };
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
