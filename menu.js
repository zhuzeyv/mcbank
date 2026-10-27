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
    _progressCache = { cleared: obj && Array.isArray(obj.cleared) ? obj.cleared : [] };
  } catch (e) {
    _progressCache = { cleared: [] };
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
function unlockNextZone(currentId) {
  const idx = ZONES.findIndex(z => z.id === currentId);
  if (idx < 0) return null;
  const p = loadProgress();
  if (!p.cleared.includes(currentId)) p.cleared.push(currentId);
  saveProgress(p);
  return idx + 1 < ZONES.length ? ZONES[idx + 1].name : null;
}

/* ---------- MC 小人绘制（菜单立绘 + 游戏内共用） ---------- */
function drawMCFigure(g, cx, footY, unit, skin, opt) {
  opt = opt || {};
  const flip = opt.flip ? -1 : 1;
  const alpha = opt.alpha == null ? 1 : opt.alpha;
  const U = unit;

  g.save();
  g.globalAlpha = alpha;
  g.translate(cx, footY);
  g.scale(flip, 1);

  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x * U), Math.round(y * U), Math.ceil(w * U), Math.ceil(h * U));
  };

  const s = skin;

  // 影子
  if (opt.shadow !== false) {
    g.globalAlpha = alpha * 0.3;
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(0, 0, 9 * U, 2.4 * U, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = alpha;
  }

  const swing = opt.swing || 0; // -1..1 手臂摆动
  const bob = opt.bob || 0;

  // 腿
  R(-4, -12 + bob, 3.5, 12, s.leg);
  R(0.5, -12 + bob, 3.5, 12, s.leg);
  // 腿的暗部
  R(-4, -2 + bob, 3.5, 2, s.legDark || s.leg);
  R(0.5, -2 + bob, 3.5, 2, s.legDark || s.leg);

  // 身体
  R(-4, -24 + bob, 8, 12, s.body);
  R(-4, -14 + bob, 8, 2, s.bodyDark || s.body);

  // 手臂
  const armY = -24 + bob + swing * 2;
  R(-8, armY, 4, 12, s.arm);
  R(4, armY, 4, 12, s.arm);
  // 手臂内侧暗边（让手臂和身体分开）
  g.globalAlpha = alpha * 0.22;
  R(-8, armY, 0.9, 12, '#000');
  R(7.1, armY, 0.9, 12, '#000');
  g.globalAlpha = alpha;
  // 手
  R(-8, armY + 9.4, 4, 2.6, s.hand || s.head);
  R(4, armY + 9.4, 4, 2.6, s.hand || s.head);

  // 头
  R(-4, -32 + bob, 8, 8, s.head);
  // 头发（顶部 + 两侧短发，露出脸）
  R(-4, -32 + bob, 8, 3, s.hair || s.head);
  R(-4, -32 + bob, 1.2, 6, s.hair || s.head);
  R(2.8, -32 + bob, 1.2, 6, s.hair || s.head);

  // 眼睛
  R(-3, -28.5 + bob, 1.2, 1.2, s.eye || '#1a1a1a');
  R(1, -28.5 + bob, 1.2, 1.2, s.eye || '#1a1a1a');
  // 嘴
  R(-1, -26.2 + bob, 2, 0.7, s.eye || '#1a1a1a');

  g.restore();
}

/* ---------- 特殊体型怪物 ---------- */
function drawMobFigure(g, cx, footY, unit, skin, kind, opt) {
  opt = opt || {};
  const U = unit;
  g.save();
  g.translate(cx, footY);

  const R = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x * U), Math.round(y * U), Math.ceil(w * U), Math.ceil(h * U));
  };

  if (kind === 'creeper') {
    // 影子
    g.globalAlpha = .3; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(0, 0, 7 * U, 2 * U, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    // 腿（4 条短腿）
    R(-5, -6, 3.5, 6, skin.dark);
    R(-1.5, -6, 3.5, 6, skin.body);
    R(2, -6, 3.5, 6, skin.dark);
    // 身体
    R(-6, -22, 12, 17, skin.body);
    R(-6, -22, 12, 2, skin.dark);
    // 脸
    R(-4, -19, 3, 3, skin.eye);
    R(1, -19, 3, 3, skin.eye);
    R(-1.5, -16, 3, 5, skin.eye);
    R(-3.5, -13, 2, 2, skin.eye);
    R(1.5, -13, 2, 2, skin.eye);
  } else if (kind === 'spider') {
    g.globalAlpha = .3; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(0, 0, 9 * U, 2 * U, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    // 腿
    for (let i = 0; i < 4; i++) {
      const lx = -7 + i * 3.6;
      R(lx, -4, 1.4, 4, skin.dark);
      R(lx - 2, -2, 2, 1.2, skin.dark);
      R(lx + 1.2, -2, 2, 1.2, skin.dark);
    }
    // 身体
    R(-5, -10, 10, 7, skin.body);
    // 头
    R(-3, -14, 6, 5, skin.body);
    R(-3, -14, 6, 1.2, skin.dark);
    // 眼
    R(-2.2, -12.4, 1.4, 1.4, skin.eye);
    R(0.8, -12.4, 1.4, 1.4, skin.eye);
    R(-1.6, -11, 1, 1, skin.eye);
    R(0.6, -11, 1, 1, skin.eye);
  } else if (kind === 'slime') {
    g.globalAlpha = .3; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(0, 0, 9 * U, 2.4 * U, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = .92;
    R(-8, -18, 16, 18, skin.body);
    R(-8, -18, 16, 3, skin.dark);
    R(-8, -4, 16, 4, skin.dark);
    // 内核
    g.globalAlpha = .5;
    R(-3, -13, 6, 7, skin.dark);
    g.globalAlpha = .95;
    // 眼
    R(-4, -15, 2.4, 2.4, skin.eye);
    R(1.6, -15, 2.4, 2.4, skin.eye);
    R(-2.4, -11, 4.8, 1.4, skin.eye);
  } else if (kind === 'blaze') {
    g.globalAlpha = .3; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(0, 0, 7 * U, 2 * U, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    // 棒状身体
    R(-4, -24, 8, 8, skin.body);
    R(-3, -16, 6, 6, skin.dark);
    R(-2, -10, 4, 6, skin.body);
    // 环绕火焰棒
    R(-9, -20, 2, 2, skin.body);
    R(7, -18, 2, 2, skin.body);
    R(-8, -12, 2, 2, skin.dark);
    R(6, -11, 2, 2, skin.dark);
    // 眼
    R(-2.4, -22, 1.6, 1.6, skin.eye);
    R(0.8, -22, 1.6, 1.6, skin.eye);
  } else if (kind === 'dragon') {
    g.globalAlpha = .35; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(0, 0, 15 * U, 3 * U, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    // 翅膀
    R(-18, -26, 8, 10, skin.dark);
    R(10, -26, 8, 10, skin.dark);
    R(-16, -22, 6, 6, skin.body);
    R(10, -22, 6, 6, skin.body);
    // 身体
    R(-7, -22, 14, 16, skin.body);
    R(-7, -22, 14, 2.5, skin.dark);
    // 头
    R(-4, -32, 8, 10, skin.body);
    R(-4, -32, 8, 2, skin.dark);
    // 角
    R(-5, -35, 1.5, 3, skin.dark);
    R(3.5, -35, 1.5, 3, skin.dark);
    // 眼
    R(-2.6, -29, 2, 1.6, skin.eye);
    R(0.6, -29, 2, 1.6, skin.eye);
  } else if (kind === 'warden') {
    g.globalAlpha = .35; g.fillStyle = '#000';
    g.beginPath(); g.ellipse(0, 0, 12 * U, 3 * U, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    // 腿
    R(-7, -10, 5, 10, skin.dark);
    R(2, -10, 5, 10, skin.dark);
    // 身体
    R(-8, -28, 16, 18, skin.body);
    R(-8, -28, 16, 2.5, skin.dark);
    // 手臂（很长）
    R(-13, -27, 5, 20, skin.body);
    R(8, -27, 5, 20, skin.body);
    // 头
    R(-5, -36, 10, 8, skin.body);
    R(-5, -36, 10, 2, skin.dark);
    // 眼睛（发光）
    R(-3.4, -33, 2, 1.6, skin.eye);
    R(1.4, -33, 2, 1.6, skin.eye);
    // 胸口核心
    g.globalAlpha = .8;
    R(-2.5, -23, 5, 5, skin.eye);
    g.globalAlpha = 1;
  } else {
    // 默认人形
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
  swordsman: { head: '#c99e6f', hair: '#3a2a18', body: '#2fa8a8', arm: '#c99e6f', leg: '#3b3b8f', eye: '#1a1a1a', hand: '#c99e6f' },
  knight: { head: '#c99e6f', hair: '#8a8a94', body: '#8a8a94', arm: '#c99e6f', leg: '#5a5a66', eye: '#1a1a1a', hand: '#c99e6f' },
  archer: { head: '#c99e6f', hair: '#4a6b2a', body: '#4a7a3a', arm: '#c99e6f', leg: '#3a5a2a', eye: '#1a1a1a', hand: '#c99e6f' },
  rogue: { head: '#c99e6f', hair: '#1e1a16', body: '#2a2a30', arm: '#2a2a30', leg: '#1a1a20', eye: '#1a1a1a', hand: '#c99e6f' },
  cleric: { head: '#c99e6f', hair: '#e8d8a0', body: '#e8e0d0', arm: '#c99e6f', leg: '#c8b888', eye: '#1a1a1a', hand: '#c99e6f' },
  warlock: { head: '#a88a6a', hair: '#2a1a2a', body: '#4a2a5a', arm: '#a88a6a', leg: '#2a1a3a', eye: '#c8302a', hand: '#a88a6a' },
  mage: { head: '#c99e6f', hair: '#5a2a8a', body: '#3a2a7a', arm: '#c99e6f', leg: '#2a1a5a', eye: '#1a1a1a', hand: '#c99e6f' },
  druid: { head: '#c99e6f', hair: '#3a6a2a', body: '#5a8a3a', arm: '#c99e6f', leg: '#3a5a2a', eye: '#1a1a1a', hand: '#c99e6f' },
  evoker: { head: '#a8a89a', hair: '#3a3a3a', body: '#5a5a6a', arm: '#a8a89a', leg: '#3a3a4a', eye: '#8a5ad0', hand: '#a8a89a' }
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
  box.innerHTML = Array.from({ length: 6 }, () => '<div class="equip-slot"></div>').join('');
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
    html = Object.keys(PASSIVES).map(k => {
      const p = PASSIVES[k];
      return `<div class="dcard">
        <div class="dcard-ic">${ICON[p.icon] || ''}</div>
        <div class="dcard-body">
          <div class="dcard-name">${p.name}</div>
          <div class="dcard-meta">最高 ${p.maxLv} 级</div>
          <div class="dcard-desc">${p.desc}</div>
        </div>
      </div>`;
    }).join('');
  }
  grid.innerHTML = html;
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
      hide('pageChar'); hide('pageData'); hide('pageSoon');

      // 底部出发栏只在角色页有意义
      const isChar = p === 'char';
      document.querySelector('.dock').style.display = isChar ? '' : 'none';
      document.querySelector('.hint').style.display = isChar ? '' : 'none';

      if (isChar) {
        show('pageChar');
      } else if (p === 'codex' || p === 'loot' || p === 'talent') {
        renderDataPage(p);
        show('pageData');
      } else {
        const names = { collection: '收藏', achieve: '成就', reward: '奖励' };
        document.getElementById('soonTitle').textContent = names[p] || '';
        show('pageSoon');
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
  document.getElementById('btnArmory').onclick = () => toast('军械库：击杀首领后可解锁');
  document.getElementById('btnTalent').onclick = () => {
    document.querySelector('.tab[data-page="talent"]').click();
  };

  // 键盘快捷键
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('menu').classList.contains('show')) {
      document.getElementById('btnStart').click();
    }
  });
}

document.addEventListener('DOMContentLoaded', initMenu);
