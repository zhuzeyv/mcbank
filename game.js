/* ============================================================
   方块幸存者 · 游戏引擎
   ============================================================ */

const Game = (function () {

  let cv, ctx, W = 0, H = 0, DPR = 1;
  let pattern = null;
  let lastTs = 0;
  let hudTick = 0;

  let S = null; // 运行时状态

  const TAU = Math.PI * 2;

  /* ---------- 等距投影（2:1） ---------- */
  const ISO = 0.85;      // 水平系数
  const ISO_Y = 0.425;   // 垂直系数（ISO 的一半 → 2:1）
  let SCR_CX = 0, SCR_CY = 0;   // 当前帧屏幕中心（含抖动）

  // 世界坐标 → 屏幕坐标
  function w2s(wx, wy) {
    const rx = wx - S.cam.x, ry = wy - S.cam.y;
    return {
      x: SCR_CX + (rx - ry) * ISO,
      y: SCR_CY + (rx + ry) * ISO_Y
    };
  }

  // 等距小方块（顶面菱形 + 左右侧面），用于石头/树桩等装饰
  function drawIsoBlock(g, x, y, w, h, top, left, right) {
    const hw = w / 2, hh = w / 4;
    g.fillStyle = top;
    g.beginPath();
    g.moveTo(x, y - hh); g.lineTo(x + hw, y); g.lineTo(x, y + hh); g.lineTo(x - hw, y);
    g.closePath(); g.fill();

    g.fillStyle = left;
    g.beginPath();
    g.moveTo(x - hw, y); g.lineTo(x, y + hh); g.lineTo(x, y + hh + h); g.lineTo(x - hw, y + h);
    g.closePath(); g.fill();

    g.fillStyle = right;
    g.beginPath();
    g.moveTo(x + hw, y); g.lineTo(x, y + hh); g.lineTo(x, y + hh + h); g.lineTo(x + hw, y + h);
    g.closePath(); g.fill();
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

  /* ==================== 地面纹理 ==================== */
  function makeGroundTile(theme) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = theme.g1;
    g.fillRect(0, 0, 64, 64);

    // 16x16 像素级颗粒（MC 草方块的低对比噪点）
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const r = Math.random();
        if (r < 0.62) {
          g.fillStyle = r < 0.3 ? theme.g2 : theme.g3;
          g.globalAlpha = 0.22 + Math.random() * 0.4;
          g.fillRect(x * 4, y * 4, 4, 4);
        }
      }
    }
    // 零星深色泥土
    g.globalAlpha = 0.42;
    for (let i = 0; i < 5; i++) {
      g.fillStyle = theme.dirt;
      g.fillRect(rndi(0, 15) * 4, rndi(0, 15) * 4, 4, 4);
    }
    g.globalAlpha = 1;
    return c;
  }

  /* ==================== 状态初始化 ==================== */
  function createState(cfg) {
    const cls = cfg.cls, race = cfg.race, zone = cfg.zone, diff = DIFFS[cfg.diff];
    const zoneIdx = ZONES.indexOf(zone);

    const p = {
      x: 0, y: 0, r: 14,
      hp: 0, maxHp: 0,
      speed: 172 * cls.spd * race.bonus.spd,
      dmgMul: cls.dmg * race.bonus.dmg,
      atkSpeedMul: 1,
      critChance: 0.05,
      critMul: 2,
      armor: cls.armor,
      pickup: 78,
      xpMul: race.bonus.xp,
      dodge: race.bonus.dodge || 0,
      facing: 1,
      hurtCd: 0,
      anim: 0,
      swing: 0,
      weapons: [],
      invuln: 0
    };
    p.maxHp = Math.round((cls.hp + (race.bonus.hp || 0)) * 1.25);

    // ---- 装备加成 ----
    let eb = { hp: 0, dmg: 0, speed: 0, haste: 0, crit: 0, armor: 0, pickup: 0 };
    try {
      if (typeof EQUIP !== 'undefined' && typeof loadProgress === 'function') {
        eb = EQUIP.totalBonus(loadProgress().equipment);
      }
    } catch (e) {}
    p.maxHp += Math.round(eb.hp || 0);
    p.dmgMul *= (1 + (eb.dmg || 0));
    p.speed *= (1 + (eb.speed || 0));
    p.atkSpeedMul *= (1 + (eb.haste || 0));
    p.critChance += (eb.crit || 0);
    p.armor = Math.min(0.75, p.armor + (eb.armor || 0));
    p.pickup *= (1 + (eb.pickup || 0));

    p.hp = p.maxHp;

    // 初始武器
    addWeapon(p, cls.weapon);

    return {
      cfg, cls, race, zone, diff, zoneIdx,
      running: true, paused: false, over: false,
      time: 0,
      player: p,
      enemies: [], projectiles: [], orbs: [], particles: [], texts: [],
      effects: [], minions: [], hazards: [], chests: [],
      cam: { x: 0, y: 0 },
      keys: {},
      kills: 0,
      level: 1, xp: 0, xpNext: 6,
      pendingLevels: 0,
      spawnTimer: 0,
      waveTimer: 0,
      waveCount: 0,
      boss: null,
      bossSpawned: false,
      bossGrace: 0,
      eliteTimer: 10,
      shake: 0,
      hurtFlash: 0,
      theme: zone.theme,
      skin: SKIN_BY_CLASS[cls.id] || SKIN_BY_CLASS.swordsman
    };
  }

  function addWeapon(p, id) {
    const ex = p.weapons.find(w => w.id === id);
    if (ex) { if (ex.lv < WEAPONS[id].maxLv) ex.lv++; return ex; }
    const w = { id, lv: 1, timer: rnd(0, 0.3) };
    p.weapons.push(w);
    return w;
  }

  /* ==================== 武器数值 ==================== */
  function wStat(id, lv) {
    const w = WEAPONS[id];
    const k = lv - 1;
    return {
      dmg: w.dmg * (1 + 0.26 * k),
      cd: w.cd * Math.pow(0.96, k),
      range: (w.range || 60) * (1 + 0.055 * k),
      count: (w.count || 1) + Math.floor(k / 3),
      pierce: (w.pierce || 0) + Math.floor(k / 2),
      splash: (w.splash || 0) * (1 + 0.12 * k),
      speed: w.speed || 500
    };
  }

  /* ==================== 伤害 ==================== */
  function rollDamage(base) {
    const p = S.player;
    let dmg = base * p.dmgMul;
    let crit = Math.random() < p.critChance;
    if (crit) dmg *= p.critMul;
    return { dmg, crit };
  }

  function hurtEnemy(e, base, opts) {
    if (e.dead) return;
    const { dmg, crit } = rollDamage(base);
    e.hp -= dmg;
    e.hitFlash = 0.1;
    e.kx = (e.kx || 0) + (opts && opts.kx ? opts.kx : 0);

    addText(e.x + rnd(-15, 15), e.y - e.size * 0.55 - rnd(0, 10), Math.round(dmg),
      crit ? '#ffd24a' : '#f0ece0', crit ? 19 : 14);

    if (opts && opts.slow) e.slowT = Math.max(e.slowT || 0, 1.2);

    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;

    const p = S.player;
    S.kills++;

    // 经验球
    const n = e.isBoss ? 14 : 1;
    for (let i = 0; i < n; i++) {
      S.orbs.push({
        x: e.x + rnd(-12, 12), y: e.y + rnd(-12, 12),
        vx: rnd(-40, 40), vy: rnd(-40, 40),
        value: e.xp / n, r: e.isBoss ? 6 : 4,
        t: 0
      });
    }

    // 方块碎片
    const col = e.isBoss ? '#d8b45c' : (e.skin.body || '#8a8a8a');
    burst(e.x, e.y - e.size * 0.4, e.isBoss ? 46 : 12, [col, e.skin.dark || col, '#ffffff']);

    if (e.isBoss) {
      S.shake = 22;
      S.boss = null;
      // BOSS 必掉两个宝箱
      for (let i = 0; i < 2; i++) {
        S.chests.push({ x: e.x + rnd(-40, 40), y: e.y + rnd(-40, 40), t: 0 });
      }
      win();
      return;
    }

    // 精英怪 30% 掉宝箱
    if (e.elite && Math.random() < 0.3) {
      S.chests.push({ x: e.x, y: e.y, t: 0 });
    }

    // 史莱姆分裂
    // 只有大史莱姆分裂，子代不再分裂（否则无限刷经验）
    if (e.split && !e.splitDone && !e.isChild) {
      e.splitDone = true;
      for (let i = 0; i < 2; i++) {
        const child = makeEnemy('slime', e.x + rnd(-20, 20), e.y + rnd(-20, 20), 0.55);
        if (child) { child.split = false; child.isChild = true; S.enemies.push(child); }
      }
    }
  }

  /* ==================== 粒子 / 飘字 / 特效 ==================== */
  function burst(x, y, n, colors) {
    if (S.particles.length > 320) n = Math.min(n, 8);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), sp = rnd(40, 200);
      S.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: rnd(0.4, 0.9), max: 0.9,
        size: rnd(2, 5),
        color: pick(colors),
        rot: rnd(0, TAU), vrot: rnd(-8, 8)
      });
    }
  }

  function addText(x, y, txt, color, size) {
    if (S.texts.length > 60) S.texts.shift();
    S.texts.push({ x, y, txt, color, size: size || 14, life: 0.75, vy: -46 });
  }

  function addEffect(type, x, y, r, color, dur) {
    S.effects.push({ type, x, y, r, color, life: dur || 0.35, max: dur || 0.35 });
  }

  /* ==================== 输入 ==================== */
  // 触屏摇杆状态
  const stick = { dx: 0, dy: 0, active: false, id: null, cx: 0, cy: 0, maxR: 46 };

  // 触屏检测：不依赖 CSS 媒体查询（QQ/微信内置浏览器对 pointer/hover 报告不可靠）
  // 判定：主指针粗糙（手机/平板），或「有触摸能力 + 窄屏」。
  // 桌面 Chrome 的 'ontouchstart' in window 恒为 true，所以不能只看它。
  function detectTouch() {
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const hasTouch = (navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
    const small = window.innerWidth <= 900;
    const on = coarse || (hasTouch && small);
    document.body.classList.toggle('is-touch', on);
    return on;
  }

  function resetStickPos() {
    const el = document.getElementById('joystick');
    if (!el) return;
    el.style.left = '';
    el.style.top = '';
    el.style.bottom = '';
  }

  // 把摇杆挪到手指按下的位置（动态摇杆，任意位置都能拖）
  function placeStick(x, y) {
    const el = document.getElementById('joystick');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const size = r.width || 124;
    el.style.left = (x - size / 2) + 'px';
    el.style.top = (y - size / 2) + 'px';
    el.style.bottom = 'auto';
  }

  function resetStick() {
    stick.dx = 0; stick.dy = 0; stick.active = false; stick.id = null;
    const knob = document.getElementById('stickKnob');
    const joy = document.getElementById('joystick');
    if (knob) knob.style.transform = 'translate(0px,0px)';
    if (joy) joy.classList.remove('active');
    resetStickPos();
  }

  function bindJoystick() {
    const el = document.getElementById('joystick');
    const knob = document.getElementById('stickKnob');
    if (!el || !knob) return;

    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px,${dy}px)`; };

    const move = t => {
      let dx = t.clientX - stick.cx;
      let dy = t.clientY - stick.cy;
      const d = Math.hypot(dx, dy);
      if (d > stick.maxR) { dx = dx / d * stick.maxR; dy = dy / d * stick.maxR; }
      setKnob(dx, dy);
      const nx = dx / stick.maxR, ny = dy / stick.maxR;
      const dead = 0.16;
      stick.dx = Math.abs(nx) < dead ? 0 : nx;
      stick.dy = Math.abs(ny) < dead ? 0 : ny;
    };

    // 从某个屏幕坐标开始拖（center 为空则用元素中心）
    const begin = (t, dynamic) => {
      if (dynamic) {
        placeStick(t.clientX, t.clientY);
        stick.cx = t.clientX;
        stick.cy = t.clientY;
        const r = el.getBoundingClientRect();
        stick.maxR = (r.width || 124) * 0.38;
      } else {
        const r = el.getBoundingClientRect();
        stick.cx = r.left + r.width / 2;
        stick.cy = r.top + r.height / 2;
        stick.maxR = r.width * 0.38;
      }
      stick.id = t.identifier;
      stick.active = true;
      el.classList.add('active');
      move(t);
    };

    const canPlay = () => S && S.running && !S.paused && !S.over && S.pendingLevels === 0;

    el.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!canPlay() || stick.active) return;
      begin(e.changedTouches[0], false);
    }, { passive: false });

    el.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!stick.active) return;
      for (const t of e.changedTouches) {
        if (t.identifier === stick.id) move(t);
      }
    }, { passive: false });

    const stop = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === stick.id) resetStick();
      }
    };
    el.addEventListener('touchend', stop);
    el.addEventListener('touchcancel', stop);

    // 兜底：在画布任意位置按下也能拖（防止摇杆元素被遮挡或不可见）
    const cvs = document.getElementById('cv');
    if (cvs) {
      cvs.addEventListener('touchstart', e => {
        if (!canPlay() || stick.active) return;
        begin(e.changedTouches[0], true);
        e.preventDefault();
      }, { passive: false });

      cvs.addEventListener('touchmove', e => {
        if (!stick.active) return;
        for (const t of e.changedTouches) {
          if (t.identifier === stick.id) move(t);
        }
        e.preventDefault();
      }, { passive: false });

      cvs.addEventListener('touchend', stop);
      cvs.addEventListener('touchcancel', stop);
    }
  }

  function bindInput() {
    window.addEventListener('keydown', e => {
      if (!S) return;
      const k = e.key.toLowerCase();
      S.keys[k] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();

      if (k === ' ' && !S.over) togglePause();
      if (S.paused && k === 'escape') togglePause();

      if (S.pendingLevels > 0 && ['1', '2', '3'].includes(k)) {
        const idx = parseInt(k) - 1;
        const cards = document.querySelectorAll('#cards .card');
        if (cards[idx]) cards[idx].click();
      }
    });
    window.addEventListener('keyup', e => {
      if (S) S.keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener('blur', () => { if (S) S.keys = {}; });
  }

  function togglePause() {
    if (!S || S.over || S.pendingLevels > 0) return;
    S.paused = !S.paused;
    document.getElementById('pausePanel').classList.toggle('hidden', !S.paused);
  }

  /* ==================== 更新 ==================== */
  function update(dt) {
    const p = S.player;
    S.time += dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 60);
    if (S.hurtFlash > 0) S.hurtFlash = Math.max(0, S.hurtFlash - dt * 3);

    // ---- 玩家移动 ----
    let mx = 0, my = 0;
    const k = S.keys;
    if (k['a'] || k['arrowleft']) mx -= 1;
    if (k['d'] || k['arrowright']) mx += 1;
    if (k['w'] || k['arrowup']) my -= 1;
    if (k['s'] || k['arrowdown']) my += 1;

    // 触屏摇杆优先
    if (stick.active && (stick.dx || stick.dy)) {
      mx = stick.dx;
      my = stick.dy;
    }

    if (mx || my) {
      const len = Math.hypot(mx, my);
      const sxDir = mx / len, syDir = my / len;
      // 屏幕方向 → 世界方向。
      // 关键：等距投影把垂直方向压缩了 ISO_Y/ISO（一半），
      // 如果只做逆变换再归一化，按「上/下」的屏幕速度只有「左/右」的一半。
      // 这里直接解出「屏幕位移长度恒为 1」的世界方向，八个方向速度一致。
      const wx = (sxDir / ISO + syDir / ISO_Y) / 2;
      const wy = (syDir / ISO_Y - sxDir / ISO) / 2;
      p.x += wx * p.speed * dt;
      p.y += wy * p.speed * dt;
      p.anim += dt;
      if (sxDir !== 0) p.facing = sxDir > 0 ? 1 : -1;
    } else {
      p.anim += dt * 0.35;
    }

    if (p.swing > 0) p.swing = Math.max(0, p.swing - dt * 6);
    if (p.hurtCd > 0) p.hurtCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;

    // ---- 摄像机（等距：玩家恒在屏幕中心）----
    S.cam.x = p.x;
    S.cam.y = p.y;

    // ---- 武器 ----
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      if (!def || def.type === 'thorns') continue; // 被动/荆棘不主动开火
      w.timer -= dt * p.atkSpeedMul;
      if (w.timer <= 0) {
        const st = wStat(w.id, w.lv);
        const fired = fireWeapon(w.id, st);
        w.timer = fired ? st.cd : 0.1;
      }
    }

    // ---- 生成敌人 ----
    if (!S.over) {
      if (S.bossGrace > 0) S.bossGrace -= dt;
      S.spawnTimer -= dt;
      if (S.spawnTimer <= 0 && S.bossGrace <= 0) {
        // 等级越高刷得越快（等级是玩家变强的直接体现，怪必须跟上）
        const lvFactor = 1 + S.level * 0.024;
        const rate = Math.max(0.12,
          (1.12 - Math.min(0.62, S.time * 0.0042)) / (S.diff.spawn * lvFactor));
        const bossSlow = (S.boss && !S.boss.dead) ? 1.8 : 1;
        S.spawnTimer = rate * bossSlow;
        const cap = Math.min(190, 100 + S.level * 5);
        if (S.enemies.length < cap) {
          spawnEnemy();
          if (S.level >= 8 && Math.random() < 0.25) spawnEnemy();   // 高等级偶尔成群
        }
      }

      // 每 18 秒一波冲击
      S.waveTimer += dt;
      if (S.waveTimer >= 20) {
        S.waveTimer = 0;
        S.waveCount++;
        const n = 5 + Math.round(S.waveCount * 1.5) + Math.floor(S.level * 0.45);
        const capW = Math.min(190, 100 + S.level * 5);
        for (let i = 0; i < n; i++) {
          if (S.enemies.length >= capW) break;
          spawnEnemy(true);
        }
      }

      // 精英怪：每 22 秒一只（比普通强、比 BOSS 弱）
      S.eliteTimer -= dt;
      if (S.eliteTimer <= 0) {
        S.eliteTimer = 22;
        if (S.enemies.length < 150) spawnElite();
      }

      // BOSS
      if (!S.bossSpawned && S.time >= S.zone.time) {
        spawnBoss();
      }
    }

    // ---- 敌人 ----
    for (let i = S.enemies.length - 1; i >= 0; i--) {
      const e = S.enemies[i];
      if (e.dead) { S.enemies.splice(i, 1); continue; }
      updateEnemy(e, dt);
    }

    // ---- 玩家投射物 ----
    for (let i = S.projectiles.length - 1; i >= 0; i--) {
      const pr = S.projectiles[i];
      if (!updateProjectile(pr, dt)) S.projectiles.splice(i, 1);
    }

    // ---- 经验球 ----
    for (let i = S.orbs.length - 1; i >= 0; i--) {
      const o = S.orbs[i];
      o.t += dt;
      const d = Math.hypot(p.x - o.x, p.y - o.y);
      if (d < p.pickup) {
        const sp = 260 + (1 - d / p.pickup) * 420;
        const ang = Math.atan2(p.y - o.y, p.x - o.x);
        o.vx += Math.cos(ang) * sp * dt * 8;
        o.vy += Math.sin(ang) * sp * dt * 8;
      }
      o.vx *= 0.94; o.vy *= 0.94;
      o.x += o.vx * dt; o.y += o.vy * dt;

      if (d < 22) {
        gainXp(o.value);
        S.orbs.splice(i, 1);
      }
    }

    // ---- 宝箱 ----
    for (let i = S.chests.length - 1; i >= 0; i--) {
      const c = S.chests[i];
      c.t += dt;
      if (dist2(p.x, p.y, c.x, c.y) < 52 * 52) {
        S.chests.splice(i, 1);
        openChest(c);
        break;
      }
    }

    // ---- 随从 ----
    for (let i = S.minions.length - 1; i >= 0; i--) {
      const m = S.minions[i];
      m.t -= dt;
      if (m.t <= 0) { S.minions.splice(i, 1); continue; }
      updateMinion(m, dt);
    }

    // ---- 粒子 ----
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const pt = S.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) { S.particles.splice(i, 1); continue; }
      pt.vy += 520 * dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.rot += pt.vrot * dt;
      pt.vx *= 0.985;
    }

    // ---- 飘字 ----
    for (let i = S.texts.length - 1; i >= 0; i--) {
      const t = S.texts[i];
      t.life -= dt;
      if (t.life <= 0) { S.texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= 0.92;
    }

    // ---- 特效 ----
    for (let i = S.effects.length - 1; i >= 0; i--) {
      const fx = S.effects[i];
      fx.life -= dt;
      if (fx.life <= 0) S.effects.splice(i, 1);
    }

    // ---- 地面危险区 ----
    for (let i = S.hazards.length - 1; i >= 0; i--) {
      const hz = S.hazards[i];
      hz.life -= dt;
      hz.tick -= dt;
      if (hz.tick <= 0) {
        hz.tick = 0.4;
        if (hz.owner === 'player') {
          // 玩家自己的毒云：只烧敌人，绝不伤自己
          for (const e of S.enemies) {
            if (e.dead) continue;
            const rr = hz.r + e.size * 0.4;
            if (dist2(e.x, e.y, hz.x, hz.y) < rr * rr) hurtEnemy(e, hz.dmg);
          }
        } else {
          // BOSS 的陨石区：伤玩家
          if (dist2(p.x, p.y, hz.x, hz.y) < (hz.r + p.r) * (hz.r + p.r)) {
            damagePlayer(hz.dmg);
          }
        }
      }
      if (hz.life <= 0) S.hazards.splice(i, 1);
    }

    // ---- 升级 ----
    if (S.pendingLevels > 0 && !S.paused) showLevelUp();
  }

  /* ==================== 敌人更新 ==================== */
  function updateEnemy(e, dt) {
    const p = S.player;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.atkCd > 0) e.atkCd -= dt;

    const spd = e.spd * (e.slowT > 0 ? 0.45 : 1);

    if (e.isBoss) { updateBoss(e, dt, spd); return; }

    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;

    // 击退
    if (e.kx && Math.abs(e.kx) > 1) {
      e.x += (dx / d) * e.kx * dt * -1;
      e.y += (dy / d) * e.kx * dt * -1;
      e.kx *= 0.86;
    }

    if (e.ranged) {
      // 保持距离
      const ideal = 220;
      if (d > ideal + 30) {
        e.x += (dx / d) * spd * dt;
        e.y += (dy / d) * spd * dt;
      } else if (d < ideal - 40) {
        e.x -= (dx / d) * spd * dt;
        e.y -= (dy / d) * spd * dt;
      }
      if (e.atkCd <= 0 && d < 420) {
        e.atkCd = 2.2;
        shootAtPlayer(e, 240, e.dmg * 0.8);
      }
    } else if (e.explode) {
      if (d > 34) {
        e.x += (dx / d) * spd * dt;
        e.y += (dy / d) * spd * dt;
      } else {
        e.fuse = (e.fuse || 0.6) - dt;
        if (e.fuse <= 0) {
          explodeEnemy(e);
          return;
        }
      }
    } else if (e.teleport && d > 200 && Math.random() < dt * 0.4) {
      const a = rnd(0, TAU);
      e.x = p.x + Math.cos(a) * 90;
      e.y = p.y + Math.sin(a) * 90;
      burst(e.x, e.y, 8, ['#8a4ad0', '#c060e0']);
    } else {
      e.x += (dx / d) * spd * dt;
      e.y += (dy / d) * spd * dt;
    }

    // 接触伤害
    if (d < e.size * 0.42 + p.r && e.atkCd <= 0) {
      e.atkCd = 0.85;
      damagePlayer(e.dmg);
      if (S.player.weapons.some(w => w.id === 'thorns')) {
        const tw = S.player.weapons.find(w => w.id === 'thorns');
        const st = wStat('thorns', tw.lv);
        hurtEnemy(e, st.dmg);
      }
    }

    // 史莱姆分裂
    if (e.hp <= 0 && e.split && !e.splitDone && !e.isChild) {
      e.splitDone = true;
      for (let i = 0; i < 2; i++) {
        const child = makeEnemy('slime', e.x + rnd(-18, 18), e.y + rnd(-18, 18), 0.55);
        if (child) { child.split = false; child.isChild = true; S.enemies.push(child); }
      }
    }
  }

  function explodeEnemy(e) {
    const p = S.player;
    const r = 62;
    if (dist2(p.x, p.y, e.x, e.y) < (r + p.r) * (r + p.r)) damagePlayer(e.dmg);
    addEffect('boom', e.x, e.y, r, '#e8a020', 0.4);
    burst(e.x, e.y, 16, ['#5aa83a', '#3f7a28', '#e8e8e8']);
    S.shake = Math.max(S.shake, 6);
    e.dead = true;
    S.kills++;
  }

  function shootAtPlayer(e, speed, dmg, count, spread) {
    const p = S.player;
    count = count || 1;
    spread = spread || 0;
    const base = Math.atan2(p.y - e.y, p.x - e.x);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * spread;
      S.projectiles.push({
        x: e.x, y: e.y - e.size * 0.5,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: 6, dmg, life: 2.6, enemy: true,
        color: e.skin.eye || '#c8302a', pierce: 0, hit: []
      });
    }
  }

  /* ==================== 宝箱 ==================== */
  function openChest(c) {
    const p = S.player;
    addEffect('ring', c.x, c.y, 70, '#ffd85c', 0.5);
    burst(c.x, c.y, 16, ['#ffd85c', '#ffe9a0', '#ffffff']);

    // 45% 白嫖一次升级，55% 出装备
    if (Math.random() < 0.45) {
      S.pendingLevels++;
      addText(p.x, p.y - 60, '免费升级!', '#ffd85c', 17);
      return;
    }

    const it = EQUIP.make(S.level * 0.6 + S.zoneIdx * 2.5);
    const better = grantEquipment(it);
    showChestItem(it, better);
  }

  function grantEquipment(it) {
    try {
      if (typeof loadProgress !== 'function' || typeof saveProgress !== 'function') return false;
      const prog = loadProgress();
      prog.equipment = prog.equipment || {};
      const cur = prog.equipment[it.slot];
      const better = !cur || EQUIP.score(it) > EQUIP.score(cur);
      if (better) {
        prog.equipment[it.slot] = it;
        saveProgress(prog);
        if (typeof SB !== 'undefined' && SB.currentUser && SB.currentUser()) {
          SB.saveCloudProgress(prog.cleared, prog.clearedHard, prog.stats, prog.equipment)
            .catch(function () {});
        }
      }
      return better;
    } catch (e) { return false; }
  }

  function showChestItem(it, isNew) {
    const panel = document.getElementById('chestPanel');
    const body = document.getElementById('chestBody');
    if (!panel || !body) return;
    const q = EQUIP.qualityOf(it.quality);
    body.innerHTML =
      '<div class="chest-item" style="border-color:' + q.color + ';box-shadow:0 6px 0 ' + q.dark + ', 0 12px 32px rgba(0,0,0,.5)">' +
        '<div class="ci-name" style="color:' + q.color + '">' + q.name + ' · ' + EQUIP.SLOT_NAME[it.slot] + '</div>' +
        '<div class="ci-affixes">' +
          it.affixes.map(function (a) { return '<div>' + EQUIP.desc(a) + '</div>'; }).join('') +
        '</div>' +
        '<div style="margin-top:9px;font-size:10.5px;font-weight:700;color:' + (isNew ? '#237a35' : '#8a3030') + '">' +
          (isNew ? '已装备（优于当前）' : '未装备（不如当前这件）') +
        '</div>' +
      '</div>';
    panel.classList.remove('hidden');
    S.paused = true;
    panel.onclick = function () {
      panel.classList.add('hidden');
      S.paused = false;
      panel.onclick = null;
    };
  }

  /* ==================== 精英怪 ==================== */
  function spawnElite() {
    const p = S.player;
    const kind = pick(S.zone.mobs);
    const a = rnd(0, TAU);
    const d = rnd(520, 680);
    const e = makeEnemy(kind, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1);
    if (!e) return;
    e.elite = true;
    e.maxHp = e.hp = e.hp * 3.2;
    e.dmg *= 1.4;
    e.size *= 1.28;
    e.xp *= 5;
    e.spd *= 0.92;
    e.name = '精英 · ' + (MOBS[kind] ? MOBS[kind].name : '');
    S.enemies.push(e);
    addEffect('ring', e.x, e.y, 60, '#ffc93c', 0.5);
  }

  /* ==================== BOSS ==================== */
  function spawnBoss() {
    S.bossSpawned = true;
    const bd = BOSSES[S.zone.id];
    const p = S.player;
    const a = rnd(0, TAU);
    const e = {
      x: p.x + Math.cos(a) * 520,
      y: p.y + Math.sin(a) * 520,
      size: bd.size,
      kind: bd.kind,
      skin: bd.skin,
      isBoss: true,
      name: bd.name,
      hp: 46 * bd.hpMul * (1 + S.zoneIdx * 0.35) * S.diff.hp,
      maxHp: 0,
      spd: bd.spd,
      dmg: bd.dmg * S.diff.dmg,
      xp: bd.xp,
      skills: bd.skills,
      atkCd: 1.5, skillCd: 2.5,
      hitFlash: 0, slowT: 0, kx: 0,
      chargeT: 0, chargeVx: 0, chargeVy: 0,
      ranged: !!bd.ranged
    };
    e.maxHp = e.hp;
    S.enemies.push(e);
    S.boss = e;
    S.shake = 14;
    addEffect('bossRing', e.x, e.y, 160, '#e8a020', 0.9);

    // 登场清场：干掉玩家 420 半径内的小怪，并给 3 秒喘息
    for (let i = S.enemies.length - 1; i >= 0; i--) {
      const m = S.enemies[i];
      if (m.isBoss || m.dead) continue;
      if (dist2(m.x, m.y, p.x, p.y) < 420 * 420) {
        m.dead = true;
        burst(m.x, m.y, 6, [m.skin.body || '#888', '#ffffff']);
      }
    }
    S.bossGrace = 3.0;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.18);
    addText(p.x, p.y - 50, '+回血', '#8de05a', 15);
    document.getElementById('bossBar').classList.remove('hidden');
    document.getElementById('bossName').textContent = bd.name;
  }

  function updateBoss(e, dt, spd) {
    const p = S.player;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;

    if (e.chargeT > 0) {
      e.chargeT -= dt;
      e.x += e.chargeVx * dt;
      e.y += e.chargeVy * dt;
      burst(e.x, e.y - 10, 2, ['#d8b45c', '#8a6f36']);
      if (d < e.size * 0.5 + p.r) damagePlayer(e.dmg * 1.2);
      return;
    }

    // 移动
    if (d > 80) {
      e.x += (dx / d) * spd * dt;
      e.y += (dy / d) * spd * dt;
    }

    // 接触
    if (e.atkCd <= 0 && d < e.size * 0.45 + p.r) {
      e.atkCd = 1.1;
      damagePlayer(e.dmg);
    }
    if (e.atkCd > 0) e.atkCd -= dt;

    // 技能
    e.skillCd -= dt;
    if (e.skillCd <= 0) {
      e.skillCd = rnd(3.0, 4.2);
      const sk = pick(e.skills);
      useBossSkill(e, sk, dx, dy, d);
    }
  }

  function useBossSkill(e, sk, dx, dy, d) {
    const p = S.player;
    if (sk === 'summon') {
      const kind = pick(S.zone.mobs);
      for (let i = 0; i < 6; i++) {
        const a = rnd(0, TAU);
        const m = makeEnemy(kind, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, 1);
        if (m) S.enemies.push(m);
      }
      addEffect('ring', e.x, e.y, 100, '#8a5ad0', 0.5);
    } else if (sk === 'charge') {
      const a = Math.atan2(dy, dx);
      e.chargeT = 0.55;
      e.chargeVx = Math.cos(a) * 620;
      e.chargeVy = Math.sin(a) * 620;
      addEffect('ring', e.x, e.y, 70, '#e8a020', 0.4);
    } else if (sk === 'volley') {
      shootAtPlayer(e, 260, e.dmg * 0.6, 7, 0.22);
    } else if (sk === 'quake') {
      const r = 260;
      addEffect('ring', e.x, e.y, r, '#c88040', 0.6);
      if (d < r) damagePlayer(e.dmg * 0.8);
      S.shake = Math.max(S.shake, 10);
    } else if (sk === 'meteor') {
      for (let i = 0; i < 5; i++) {
        const a = rnd(0, TAU), rr = rnd(40, 220);
        const tx = p.x + Math.cos(a) * rr, ty = p.y + Math.sin(a) * rr;
        S.hazards.push({ x: tx, y: ty, r: 54, dmg: e.dmg * 0.7, life: 1.6, tick: 1.0, color: '#f07820' });
        addEffect('meteor', tx, ty, 54, '#f07820', 1.0);
      }
    } else if (sk === 'sonic') {
      const a = Math.atan2(dy, dx);
      S.projectiles.push({
        x: e.x, y: e.y - e.size * 0.4,
        vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
        r: 22, dmg: e.dmg * 1.3, life: 1.6, enemy: true,
        color: '#40e0d0', pierce: 99, hit: [], big: true
      });
      S.shake = Math.max(S.shake, 8);
    }
  }

  /* ==================== 敌人创建 ==================== */
  function makeEnemy(kind, x, y, scale) {
    const base = MOBS[kind];
    if (!base) return null;
    scale = scale || 1;
    const tScale = 1 + S.time / 165;
    const hp = base.hp * S.zone.hpMul * S.diff.hp * tScale * scale;
    return {
      x, y,
      size: base.size * (scale < 1 ? 0.72 : 1),
      kind: base.kind,
      skin: base.skin,
      hp, maxHp: hp,
      spd: base.spd,
      dmg: base.dmg * S.diff.dmg,
      xp: base.xp,
      ranged: !!base.ranged,
      explode: !!base.explode,
      teleport: !!base.teleport,
      split: !!base.split,
      atkCd: rnd(0, 1),
      hitFlash: 0, slowT: 0, kx: 0,
      fuse: 0.6
    };
  }

  function spawnEnemy(ring) {
    const p = S.player;
    const mobs = S.zone.mobs;
    const prog = clamp(S.time / S.zone.time, 0, 1);
    let pool;
    if (prog < 0.3) pool = [mobs[0]];
    else if (prog < 0.65) pool = mobs.slice(0, Math.min(2, mobs.length));
    else pool = mobs;

    const kind = pick(pool);
    const a = rnd(0, TAU);
    const d = ring ? rnd(340, 520) : rnd(470, 650);
    const e = makeEnemy(kind, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1);
    if (e) S.enemies.push(e);
  }

  /* ==================== 玩家受伤 ==================== */
  function damagePlayer(raw) {
    const p = S.player;
    if (p.invuln > 0 || S.over) return;
    if (p.dodge > 0 && Math.random() < p.dodge) {
      addText(p.x, p.y - 40, '闪避', '#8de05a', 13);
      return;
    }
    const dmg = Math.max(1, raw * (1 - p.armor) * (S.race.bonus.dmgTaken || 1));
    p.hp -= dmg;
    p.invuln = 0.5;
    S.hurtFlash = 1;
    S.shake = Math.max(S.shake, 5);
    addText(p.x, p.y - 44, '-' + Math.round(dmg), '#e85040', 15);

    if (p.hp <= 0) {
      p.hp = 0;
      lose();
    }
  }

  /* ==================== 经验 / 升级 ==================== */
  function gainXp(v) {
    const p = S.player;
    S.xp += v * p.xpMul;
    while (S.xp >= S.xpNext) {
      S.xp -= S.xpNext;
      S.level++;
      S.xpNext = Math.floor(7 * Math.pow(1.29, S.level - 1));
      S.pendingLevels++;
      // 人类种族：每 5 级 +1 最大生命
      if (S.race.id === 'human' && S.level % 5 === 0) {
        p.maxHp += 1;
        p.hp = Math.min(p.maxHp, p.hp + 1);
      }
    }
  }

  /* ==================== 武器开火 ==================== */
  function nearestEnemy(x, y, range) {
    let best = null, bd = range * range;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const d = dist2(x, y, e.x, e.y - e.size * 0.4);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function fireWeapon(id, st) {
    const p = S.player;
    const w = WEAPONS[id];
    const type = w.type;

    if (type === 'aura') {
      const r = st.range;
      let hitAny = false;
      for (const e of S.enemies) {
        if (e.dead) continue;
        if (dist2(p.x, p.y, e.x, e.y) < (r + e.size * 0.4) * (r + e.size * 0.4)) {
          hurtEnemy(e, st.dmg);
          hitAny = true;
        }
      }
      if (w.heal) {
        p.hp = Math.min(p.maxHp, p.hp + w.heal * (1 + (st.dmg / w.dmg - 1) * 0.5));
      }
      addEffect('aura', p.x, p.y, r, id === 'holy_light' ? '#f0d24a' : '#8de05a', 0.42);
      return true;
    }

    if (type === 'melee') {
      const r = st.range;
      const cands = [];
      for (const e of S.enemies) {
        if (e.dead) continue;
        if (dist2(p.x, p.y, e.x, e.y) < (r + e.size * 0.4) * (r + e.size * 0.4)) cands.push(e);
      }
      if (!cands.length) return false;

      const ang = Math.atan2(cands[0].y - p.y, cands[0].x - p.x);
      p.facing = Math.cos(ang) > 0 ? 1 : -1;
      p.swing = 1;

      let targets = cands;
      if (w.single) targets = [cands[0]];
      for (const e of targets) {
        hurtEnemy(e, st.dmg, { kx: w.knock ? -w.knock : 0 });
        if (w.knock) {
          const a = Math.atan2(e.y - p.y, e.x - p.x);
          e.x += Math.cos(a) * 10;
          e.y += Math.sin(a) * 10;
        }
      }
      addEffect('slash', p.x, p.y, r, id === 'dagger' ? '#e8f0ff' : '#f0e0b0', 0.22);
      return true;
    }

    if (type === 'projectile') {
      const t = nearestEnemy(p.x, p.y, st.range);
      if (!t) return false;
      const base = Math.atan2(t.y - t.size * 0.4 - (p.y - 18), t.x - p.x);
      p.facing = Math.cos(base) > 0 ? 1 : -1;
      p.swing = 1;

      const cnt = st.count || 1;
      for (let i = 0; i < cnt; i++) {
        const a = base + (i - (cnt - 1) / 2) * 0.12;
        S.projectiles.push({
          x: p.x + Math.cos(a) * 16, y: p.y - 18 + Math.sin(a) * 16,
          vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed,
          r: id === 'fireball' ? 9 : 5,
          dmg: st.dmg, life: st.range / st.speed + 0.3,
          color: id === 'fireball' ? '#f07820' : id === 'poison_flask' ? '#8ad04a' : id === 'wither' ? '#4a3a5a' : '#e8e8e8',
          pierce: st.pierce, hit: [],
          splash: st.splash, slow: w.slow, poison: w.poison,
          trail: id === 'fireball' ? 'fire' : null
        });
      }
      return true;
    }

    if (type === 'strike') {
      const cands = S.enemies.filter(e => !e.dead && dist2(p.x, p.y, e.x, e.y) < st.range * st.range);
      if (!cands.length) return false;
      cands.sort((a, b) => dist2(p.x, p.y, a.x, a.y) - dist2(p.x, p.y, b.x, b.y));
      const n = Math.min(st.count, cands.length);
      for (let i = 0; i < n; i++) {
        const t = cands[i];
        addEffect(id === 'lightning' ? 'bolt' : 'fang', t.x, t.y, st.splash, id === 'lightning' ? '#9ad8ff' : '#d8d0c0', 0.34);
        for (const e of S.enemies) {
          if (e.dead) continue;
          if (dist2(t.x, t.y, e.x, e.y) < (st.splash + e.size * 0.3) * (st.splash + e.size * 0.3)) {
            hurtEnemy(e, st.dmg);
          }
        }
      }
      return true;
    }

    if (type === 'boomerang') {
      const t = nearestEnemy(p.x, p.y, st.range);
      if (!t) return false;
      const base = Math.atan2(t.y - p.y, t.x - p.x);
      p.facing = Math.cos(base) > 0 ? 1 : -1;
      S.projectiles.push({
        x: p.x, y: p.y - 18,
        vx: Math.cos(base) * st.speed, vy: Math.sin(base) * st.speed,
        r: 12, dmg: st.dmg, life: 1.6,
        color: '#7de0d0', pierce: 99, hit: [], boomerang: true,
        originX: p.x, originY: p.y, returnT: 0, speed: st.speed
      });
      return true;
    }

    if (type === 'minion') {
      const max = 1 + Math.floor((id === 'wolf' ? 2 : 1) * (1 + (st.dmg / w.dmg - 1) * 0.4));
      if (S.minions.length >= max) return false;
      S.minions.push({
        kind: id, x: p.x + rnd(-24, 24), y: p.y + rnd(-24, 24),
        dmg: st.dmg, t: 12, atkCd: 0, r: 12,
        skin: id === 'creeper_pet' ? { body: '#5aa83a', dark: '#3f7a28', eye: '#0e140e' }
          : id === 'wolf' ? { head: '#c8c8c8', hair: '#e0e0e0', body: '#d8d8d8', arm: '#c8c8c8', leg: '#c8c8c8', eye: '#1a1a1a' }
            : { head: '#c8c8d8', hair: '#9a9ab0', body: '#a8a8c0', arm: '#c8c8d8', leg: '#8a8aa0', eye: '#c060e0' },
        mvKind: id === 'creeper_pet' ? 'creeper' : (id === 'wolf' ? 'wolf' : 'vex'),
        splash: st.splash
      });
      return true;
    }

    return false;
  }

  function updateMinion(m, dt) {
    const p = S.player;
    if (m.atkCd > 0) m.atkCd -= dt;

    let tgt = null, bd = 340 * 340;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const d = dist2(m.x, m.y, e.x, e.y);
      if (d < bd) { bd = d; tgt = e; }
    }

    if (tgt) {
      const dx = tgt.x - m.x, dy = tgt.y - m.y;
      const d = Math.hypot(dx, dy) || 1;
      const stop = m.kind === 'creeper_pet' ? 30 : 34;
      if (d > stop) {
        m.x += (dx / d) * 210 * dt;
        m.y += (dy / d) * 210 * dt;
      }
      if (m.atkCd <= 0) {
        m.atkCd = 0.55;
        if (m.kind === 'creeper_pet') {
          const r = m.splash || 78;
          for (const e of S.enemies) {
            if (e.dead) continue;
            if (dist2(m.x, m.y, e.x, e.y) < r * r) hurtEnemy(e, m.dmg);
          }
          addEffect('boom', m.x, m.y, r, '#e8a020', 0.4);
          burst(m.x, m.y, 14, ['#5aa83a', '#3f7a28']);
          // 自爆后重生到玩家身边继续作战（不是直接消失，否则看起来像"召不出来"）
          m.x = p.x + rnd(-34, 34);
          m.y = p.y + rnd(-34, 34);
          m.t = 10;
          m.atkCd = 2.6;
        } else {
          hurtEnemy(tgt, m.dmg);
        }
      }
    } else {
      const dx = p.x - m.x, dy = p.y - m.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 60) {
        m.x += (dx / d) * 200 * dt;
        m.y += (dy / d) * 200 * dt;
      }
    }
  }

  /* ==================== 投射物 ==================== */
  function updateProjectile(pr, dt) {
    pr.life -= dt;
    if (pr.life <= 0) {
      if (pr.splash) splashAt(pr);
      return false;
    }

    if (pr.boomerang) {
      pr.returnT += dt;
      if (pr.returnT > 0.5) {
        const p = S.player;
        const dx = p.x - pr.x, dy = p.y - pr.y;
        const d = Math.hypot(dx, dy) || 1;
        pr.vx = (dx / d) * pr.speed * 1.2;
        pr.vy = (dy / d) * pr.speed * 1.2;
        if (d < 26) return false;
      }
    }

    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;

    if (pr.trail === 'fire' && Math.random() < 0.7) {
      S.particles.push({
        x: pr.x, y: pr.y, vx: rnd(-30, 30), vy: rnd(-40, 10),
        life: 0.3, max: 0.3, size: rnd(3, 6), color: pick(['#f07820', '#ffd24a', '#c83818']),
        rot: 0, vrot: 4
      });
    }

    if (pr.enemy) {
      const p = S.player;
      if (dist2(p.x, p.y - 18, pr.x, pr.y) < (pr.r + p.r) * (pr.r + p.r)) {
        damagePlayer(pr.dmg);
        if (pr.splash) splashAt(pr);
        return false;
      }
      return true;
    }

    for (const e of S.enemies) {
      if (e.dead || pr.hit.includes(e)) continue;
      const rr = pr.r + e.size * 0.42;
      if (dist2(pr.x, pr.y, e.x, e.y - e.size * 0.35) < rr * rr) {
        pr.hit.push(e);
        hurtEnemy(e, pr.dmg, { slow: pr.slow });
        if (pr.splash) {
          splashAt(pr);
          return false;
        }
        if (pr.pierce > 0) pr.pierce--;
        else return false;
      }
    }
    return true;
  }

  function splashAt(pr) {
    const r = pr.splash || 60;
    for (const e of S.enemies) {
      if (e.dead) continue;
      if (dist2(pr.x, pr.y, e.x, e.y) < r * r) hurtEnemy(e, pr.dmg * 0.75);
    }
    addEffect('boom', pr.x, pr.y, r, pr.color, 0.4);
    burst(pr.x, pr.y, 10, [pr.color, '#ffffff']);
    if (pr.poison) {
      S.hazards.push({ x: pr.x, y: pr.y, r: r * 0.85, dmg: pr.dmg * 0.28, life: 2.6, tick: 0.45, color: '#8ad04a', owner: 'player' });
    }
  }

  /* ==================== 升级面板 ==================== */
  function buildChoices() {
    const p = S.player;
    const out = [];
    const ownedIds = p.weapons.map(w => w.id);

    // 1. 已有武器升级
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      if (!def) continue; // 被动单独处理
      if (w.lv >= def.maxLv) continue;
      const st0 = wStat(w.id, w.lv), st1 = wStat(w.id, w.lv + 1);
      out.push({
        kind: 'weapon', id: w.id, lv: w.lv + 1, weight: 1.0,
        name: def.name, icon: def.icon,
        desc: upgradeText(w.id, st0, st1),
        isNew: false
      });
    }

    // 2. 新武器（职业池优先）
    const poolAll = Array.from(new Set(S.cls.pool.concat(Object.keys(WEAPONS))));
    const weaponCount = p.weapons.filter(x => WEAPONS[x.id]).length;
    for (const id of poolAll) {
      const def = WEAPONS[id];
      if (!def) continue;              // 职业池里混有被动 id，跳过
      if (ownedIds.includes(id)) continue;
      if (weaponCount >= 6) continue;
      const inPool = S.cls.pool.includes(id);
      out.push({
        kind: 'weapon', id, lv: 1, weight: inPool ? 0.75 : 0.35,
        name: def.name, icon: def.icon,
        desc: def.desc,
        isNew: true
      });
    }

    // 3. 被动
    for (const id in PASSIVES) {
      const def = PASSIVES[id];
      const cur = p.weapons.find(w => w.id === id);
      const lv = cur ? cur.lv : 0;
      if (lv >= def.maxLv) continue;
      out.push({
        kind: 'passive', id, lv: lv + 1, weight: 0.9,
        name: def.name, icon: def.icon,
        desc: def.desc,
        isNew: lv === 0
      });
    }

    // 加权抽 3 个
    const picked = [];
    const pool = out.slice();
    while (picked.length < 3 && pool.length) {
      let total = 0;
      for (const c of pool) total += c.weight;
      let r = Math.random() * total;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i].weight;
        if (r <= 0) { idx = i; break; }
        idx = i;
      }
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  function upgradeText(id, a, b) {
    const w = WEAPONS[id];
    const parts = [];
    const dp = Math.round((b.dmg / a.dmg - 1) * 100);
    if (dp > 0) parts.push(`伤害 +${dp}%`);
    const cp = Math.round((1 - b.cd / a.cd) * 100);
    if (cp > 0) parts.push(`攻速 +${cp}%`);
    if (b.count > a.count) parts.push(`弹数 +${b.count - a.count}`);
    if (b.pierce > a.pierce) parts.push(`穿透 +${b.pierce - a.pierce}`);
    if (b.splash > a.splash * 1.05) parts.push(`范围 +${Math.round((b.splash / a.splash - 1) * 100)}%`);
    if (w.type === 'melee' || w.type === 'aura') parts.push(`范围 +${Math.round((b.range / a.range - 1) * 100)}%`);
    return parts.length ? parts.join(' · ') : '全面强化';
  }

  function showLevelUp() {
    if (document.getElementById('levelup').classList.contains('hidden') === false) return;

    const choices = buildChoices();
    const box = document.getElementById('cards');
    box.innerHTML = choices.map((c, i) => `
      <div class="card" data-i="${i}">
        <div class="card-key">${i + 1}</div>
        <div class="card-ic">${ICON[c.icon] || ''}</div>
        <div class="card-name">${c.name}</div>
        <div class="card-lv ${c.isNew ? 'new' : ''}">${c.isNew ? '新获得' : 'Lv.' + c.lv}</div>
        <div class="card-desc">${c.desc}</div>
      </div>
    `).join('');

    box.querySelectorAll('.card').forEach(el => {
      el.onclick = () => applyChoice(choices[parseInt(el.dataset.i)]);
    });

    document.getElementById('levelup').classList.remove('hidden');
  }

  function applyChoice(c) {
    const p = S.player;
    if (c.kind === 'weapon') {
      if (c.isNew) addWeapon(p, c.id);
      else {
        const w = p.weapons.find(x => x.id === c.id);
        if (w) w.lv = Math.min(WEAPONS[c.id].maxLv, w.lv + 1);
      }
    } else {
      // 被动
      const w = p.weapons.find(x => x.id === c.id);
      if (w) w.lv = Math.min(PASSIVES[c.id].maxLv, w.lv + 1);
      else p.weapons.push({ id: c.id, lv: 1, timer: 0 });
      applyPassive(c.id);
    }

    S.pendingLevels--;
    document.getElementById('levelup').classList.add('hidden');
    document.getElementById('cards').innerHTML = '';
    updateSlots();

    if (S.pendingLevels > 0) {
      setTimeout(showLevelUp, 60);
    }
  }

  function applyPassive(id) {
    const p = S.player;
    if (id === 'heart') { p.maxHp += 22; p.hp += 22; }
    else if (id === 'speed') p.speed *= 1.08;
    else if (id === 'power') p.dmgMul *= 1.09;
    else if (id === 'haste') p.atkSpeedMul *= 1.08;
    else if (id === 'magnet') p.pickup *= 1.30;
    else if (id === 'crit') { p.critChance += 0.05; p.critMul += 0.12; }
    else if (id === 'armor') p.armor = Math.min(0.7, p.armor + 0.06);
    else if (id === 'lucky') p.xpMul *= 1.12;
  }

  /* ==================== 渲染 ==================== */
  function render() {
    if (!S) return;
    const g = ctx;
    g.save();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);

    let shx = 0, shy = 0;
    if (S.shake > 0) {
      shx = rnd(-S.shake, S.shake) * 0.5;
      shy = rnd(-S.shake, S.shake) * 0.5;
    }
    SCR_CX = W / 2 + shx;
    SCR_CY = H / 2 + shy;

    g.fillStyle = S.theme.g2;
    g.fillRect(0, 0, W, H);

    // ---- 等距地面（对纹理做斜切变换）----
    g.save();
    g.translate(SCR_CX, SCR_CY);
    g.transform(ISO, ISO_Y, -ISO, ISO_Y, 0, 0);
    g.translate(-S.cam.x, -S.cam.y);
    if (pattern) {
      g.fillStyle = pattern;
      const R = 1800;
      g.fillRect(S.cam.x - R, S.cam.y - R, R * 2, R * 2);
    }
    // 等距网格（很淡，只为立体感）
    {
      const GS = 200, R2 = 1500;
      g.globalAlpha = 0.06;
      g.strokeStyle = '#0a1a08';
      g.lineWidth = 2.5;
      g.beginPath();
      const gx0 = Math.floor((S.cam.x - R2) / GS) * GS;
      for (let x = gx0; x <= S.cam.x + R2; x += GS) {
        g.moveTo(x, S.cam.y - R2);
        g.lineTo(x, S.cam.y + R2);
      }
      const gy0 = Math.floor((S.cam.y - R2) / GS) * GS;
      for (let y = gy0; y <= S.cam.y + R2; y += GS) {
        g.moveTo(S.cam.x - R2, y);
        g.lineTo(S.cam.x + R2, y);
      }
      g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();

    drawDecor(g);

    // ---- 危险区 ----
    for (const hz of S.hazards) {
      const sp = w2s(hz.x, hz.y);
      const rx = hz.r * 1.3, ry = hz.r * 0.65;
      g.globalAlpha = 0.3 * Math.min(1, hz.life);
      g.fillStyle = hz.color;
      g.beginPath(); g.ellipse(sp.x, sp.y, rx, ry, 0, 0, TAU); g.fill();
      g.globalAlpha = 0.7;
      g.strokeStyle = hz.color; g.lineWidth = 2;
      g.beginPath(); g.ellipse(sp.x, sp.y, rx, ry, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }

    // ---- 经验球（按经验值分档，颜色区分稀有度）----
    for (const o of S.orbs) {
      const sp = w2s(o.x, o.y);
      const tier = o.value >= 5 ? 2 : (o.value >= 3 ? 1 : 0);
      const col = ['#5fd838', '#3aa8ff', '#c45cf0'][tier];
      const hi = ['#c8ff9a', '#a8e0ff', '#f0c0ff'][tier];
      const sz = [4, 5.5, 7][tier];
      const pulse = 1 + Math.sin(o.t * 7 + o.x * 0.05) * 0.18;

      // 外层光晕（比草地亮很多，不会糊在一起）
      g.globalAlpha = 0.32;
      g.fillStyle = col;
      g.beginPath(); g.arc(sp.x, sp.y - 6, sz * 2.6 * pulse, 0, TAU); g.fill();
      // 深色描边
      g.globalAlpha = 0.9;
      g.fillStyle = '#12240a';
      g.fillRect(sp.x - sz - 1.5, sp.y - sz - 6 - 1.5, sz * 2 + 3, sz * 2 + 3);
      // 主体
      g.globalAlpha = 1;
      g.fillStyle = col;
      g.fillRect(sp.x - sz, sp.y - sz - 6, sz * 2, sz * 2);
      // 高光
      g.fillStyle = hi;
      g.fillRect(sp.x - sz * 0.45, sp.y - sz * 0.45 - 6, sz * 0.9, sz * 0.9);
      // 大经验球加个外圈，一眼看出值钱
      if (tier > 0) {
        g.globalAlpha = 0.75;
        g.strokeStyle = hi;
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(sp.x, sp.y - 6, sz * 1.7 * pulse, 0, TAU); g.stroke();
        g.globalAlpha = 1;
      }
    }

    // ---- 宝箱 ----
    for (const c of S.chests) {
      const sp = w2s(c.x, c.y);
      const bob = Math.sin(S.time * 3 + c.x * 0.05) * 2;
      // 光柱
      g.globalAlpha = 0.18 + Math.sin(S.time * 4) * 0.06;
      g.fillStyle = '#ffd85c';
      g.beginPath();
      g.moveTo(sp.x - 16, sp.y);
      g.lineTo(sp.x - 7, sp.y - 76);
      g.lineTo(sp.x + 7, sp.y - 76);
      g.lineTo(sp.x + 16, sp.y);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
      // 箱子
      drawIsoBlock(g, sp.x, sp.y - 16 + bob, 36, 15, '#e8b028', '#9a6a10', '#c08a18');
      // 锁扣
      g.fillStyle = '#ffe9a0';
      g.fillRect(sp.x - 4, sp.y - 27 + bob, 8, 7);
      g.fillStyle = '#8a5a10';
      g.fillRect(sp.x - 1.5, sp.y - 24 + bob, 3, 4);
    }

    // ---- 按深度排序（远 → 近）----
    const p = S.player;
    const walkBob = Math.sin(p.anim * 11) * 0.55;
    const swing = p.swing > 0 ? Math.sin(p.swing * Math.PI) : 0;

    const drawList = [];
    for (const e of S.enemies) if (!e.dead) drawList.push({ t: 0, o: e, d: e.x + e.y });
    for (const m of S.minions) drawList.push({ t: 1, o: m, d: m.x + m.y });
    drawList.push({ t: 2, o: p, d: p.x + p.y });
    drawList.sort((a, b) => a.d - b.d);

    for (const it of drawList) {
      if (it.t === 0) drawEnemy(g, it.o);
      else if (it.t === 1) drawMinion(g, it.o);
      else drawPlayer(g, p, walkBob, swing);
    }

    // ---- 特效 ----
    for (const fx of S.effects) {
      const t = 1 - fx.life / fx.max;
      const sp = w2s(fx.x, fx.y);
      g.save();
      if (fx.type === 'slash') {
        g.globalAlpha = (1 - t) * 0.8;
        g.strokeStyle = fx.color;
        g.lineWidth = 5 * (1 - t) + 1.5;
        g.beginPath();
        g.arc(sp.x, sp.y - 22, fx.r * (0.6 + t * 0.5), -Math.PI * 0.85, Math.PI * 0.15);
        g.stroke();
      } else if (fx.type === 'aura') {
        g.globalAlpha = (1 - t) * 0.55;
        g.strokeStyle = fx.color;
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(sp.x, sp.y, fx.r * (0.8 + t * 0.25) * 1.25, fx.r * (0.8 + t * 0.25) * 0.62, 0, 0, TAU);
        g.stroke();
        g.globalAlpha = (1 - t) * 0.1;
        g.fillStyle = fx.color;
        g.beginPath();
        g.ellipse(sp.x, sp.y, fx.r * 1.25, fx.r * 0.62, 0, 0, TAU);
        g.fill();
      } else if (fx.type === 'boom' || fx.type === 'ring' || fx.type === 'bossRing') {
        g.globalAlpha = (1 - t) * 0.85;
        g.strokeStyle = fx.color;
        g.lineWidth = 4 * (1 - t) + 1.5;
        const rr = fx.r * (0.3 + t * 0.9);
        g.beginPath();
        g.ellipse(sp.x, sp.y, rr * 1.25, rr * 0.62, 0, 0, TAU);
        g.stroke();
      } else if (fx.type === 'bolt') {
        g.globalAlpha = 1 - t;
        g.strokeStyle = '#9ad8ff';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(sp.x, sp.y - 220);
        let yy = sp.y - 220;
        while (yy < sp.y) {
          yy += 26;
          g.lineTo(sp.x + rnd(-11, 11), Math.min(yy, sp.y));
        }
        g.stroke();
        g.globalAlpha = (1 - t) * 0.35;
        g.fillStyle = '#9ad8ff';
        g.beginPath(); g.ellipse(sp.x, sp.y, fx.r * 1.2, fx.r * 0.6, 0, 0, TAU); g.fill();
      } else if (fx.type === 'fang') {
        g.globalAlpha = 1 - t;
        g.fillStyle = '#e8e0d0';
        for (let i = 0; i < 5; i++) {
          const fx2 = sp.x + (i - 2) * 15;
          g.beginPath();
          g.moveTo(fx2 - 5, sp.y);
          g.lineTo(fx2, sp.y - 28 - Math.sin(t * Math.PI) * 9);
          g.lineTo(fx2 + 5, sp.y);
          g.fill();
        }
      } else if (fx.type === 'meteor') {
        g.globalAlpha = (1 - t) * 0.75;
        g.strokeStyle = fx.color;
        g.lineWidth = 2;
        g.beginPath(); g.ellipse(sp.x, sp.y, fx.r * 1.25, fx.r * 0.62, 0, 0, TAU); g.stroke();
        g.globalAlpha = (1 - t) * 0.18;
        g.fillStyle = fx.color;
        g.beginPath(); g.ellipse(sp.x, sp.y, fx.r * 1.25, fx.r * 0.62, 0, 0, TAU); g.fill();
      }
      g.restore();
    }

    // ---- 投射物 ----
    for (const pr of S.projectiles) {
      const sp = w2s(pr.x, pr.y);
      g.save();
      if (pr.big) {
        g.globalAlpha = 0.4;
        g.fillStyle = pr.color;
        g.beginPath(); g.arc(sp.x, sp.y, pr.r * 1.8, 0, TAU); g.fill();
        g.globalAlpha = 1;
      }
      g.fillStyle = pr.color;
      g.beginPath(); g.arc(sp.x, sp.y, pr.r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.beginPath(); g.arc(sp.x - pr.r * 0.25, sp.y - pr.r * 0.3, pr.r * 0.4, 0, TAU); g.fill();
      g.restore();
    }

    // ---- 粒子 ----
    for (const pt of S.particles) {
      const sp = w2s(pt.x, pt.y);
      g.globalAlpha = Math.min(1, pt.life / 0.3);
      g.fillStyle = pt.color;
      g.save();
      g.translate(sp.x, sp.y);
      g.rotate(pt.rot);
      g.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size);
      g.restore();
    }
    g.globalAlpha = 1;

    // ---- 飘字 ----
    for (const t of S.texts) {
      const sp = w2s(t.x, t.y);
      g.globalAlpha = Math.min(1, t.life / 0.35);
      g.font = '700 ' + t.size + 'px "Courier New", monospace';
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,.8)';
      g.strokeText(t.txt, sp.x, sp.y - 34);
      g.fillStyle = t.color;
      g.fillText(t.txt, sp.x, sp.y - 34);
    }
    g.globalAlpha = 1;

    // ---- 暗角 ----
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.7, 'rgba(0,0,0,.16)');
    vg.addColorStop(1, 'rgba(0,0,0,.58)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    if (S.hurtFlash > 0) {
      const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(180,30,20,0)');
      grd.addColorStop(1, 'rgba(180,30,20,' + (0.5 * S.hurtFlash) + ')');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }

    g.restore();

    hudTick += 1;
    if (hudTick % 3 === 0) updateHud();
  }

  /* ---------- 实体绘制 ---------- */
  function drawEnemy(g, e) {
    const sp = w2s(e.x, e.y);
    const baseH = KIND_H[e.kind] || 32;
    const unit = (e.size / baseH) * 1.15;

    // 精英怪：脚下金色光环 + 呼吸光，一眼能认出来
    if (e.elite) {
      const pu = 0.55 + Math.sin(S.time * 5) * 0.18;
      g.globalAlpha = 0.28 * pu;
      g.fillStyle = '#ffc93c';
      g.beginPath();
      g.ellipse(sp.x, sp.y, e.size * 0.62, e.size * 0.31, 0, 0, TAU);
      g.fill();
      g.globalAlpha = 0.85;
      g.strokeStyle = '#ffe9a0';
      g.lineWidth = 2.5;
      g.beginPath();
      g.ellipse(sp.x, sp.y, e.size * 0.62, e.size * 0.31, 0, 0, TAU);
      g.stroke();
      g.globalAlpha = 1;
    }

    g.save();
    if (e.hitFlash > 0) g.globalAlpha = 0.85;
    drawMobFigure(g, sp.x, sp.y, unit, e.skin, e.kind, {
      flip: (S.player.x - e.x) < 0,
      bob: Math.sin(S.time * 9 + e.x * 0.08) * 0.5
    });

    if (e.hitFlash > 0) {
      g.save();
      g.globalAlpha = Math.min(0.55, e.hitFlash * 5);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(sp.x, sp.y - e.size * 0.45, e.size * 0.5, 0, TAU);
      g.fill();
      g.restore();
    }
    g.restore();

    if (!e.isBoss && e.hp < e.maxHp) {
      const bw = e.size * 0.8;
      g.fillStyle = 'rgba(0,0,0,.72)';
      g.fillRect(sp.x - bw / 2, sp.y - e.size - 10, bw, e.elite ? 5 : 4);
      g.fillStyle = e.elite ? '#ffc93c' : '#e0453c';
      g.fillRect(sp.x - bw / 2, sp.y - e.size - 10, bw * (e.hp / e.maxHp), e.elite ? 5 : 4);
    }
    if (e.elite) {
      g.save();
      g.font = '700 10px "Courier New", monospace';
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,.85)';
      g.strokeText(e.name, sp.x, sp.y - e.size - 16);
      g.fillStyle = '#ffd85c';
      g.fillText(e.name, sp.x, sp.y - e.size - 16);
      g.restore();
    }
    if (e.isBoss) {
      g.save();
      g.globalAlpha = 0.95;
      g.font = '700 13px "Courier New", monospace';
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,.8)';
      g.strokeText(e.name, sp.x, sp.y - e.size - 18);
      g.fillStyle = '#ffd85c';
      g.fillText(e.name, sp.x, sp.y - e.size - 18);
      g.restore();
    }
  }

  function drawMinion(g, m) {
    const sp = w2s(m.x, m.y);
    const baseH = KIND_H[m.mvKind] || 32;
    drawMobFigure(g, sp.x, sp.y, 30 / baseH, m.skin, m.mvKind);
    if (m.t < 3) {
      g.globalAlpha = 0.5 + Math.sin(S.time * 12) * 0.3;
      g.fillStyle = '#8de05a';
      g.fillRect(sp.x - 12, sp.y + 4, 24 * (m.t / 3), 2);
      g.globalAlpha = 1;
    }
  }

  function drawPlayer(g, p, walkBob, swing) {
    const sp = w2s(p.x, p.y);

    g.save();
    g.globalAlpha = 0.3 + Math.sin(S.time * 3) * 0.07;
    g.fillStyle = '#ffd85c';
    g.beginPath(); g.ellipse(sp.x, sp.y, 30, 15, 0, 0, TAU); g.fill();
    g.globalAlpha = 0.6;
    g.strokeStyle = '#ffe9a8';
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(sp.x, sp.y, 30, 15, 0, 0, TAU); g.stroke();
    g.restore();

    if (p.invuln > 0) {
      g.globalAlpha = p.invuln * 1.4;
      g.strokeStyle = '#ffd85c';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(sp.x, sp.y - 20, 24, 26, 0, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }

    drawMCFigure(g, sp.x, sp.y, 52 / 32, S.skin, {
      flip: p.facing < 0,
      swing: swing * 1.4,
      bob: walkBob
    });
  }

  const KIND_H = { humanoid: 32, creeper: 22, spider: 14, slime: 18, blaze: 24, dragon: 35, warden: 36, wolf: 24, vex: 21 };

  /* ---------- 地面装饰 ---------- */
  function drawDecor(g) {
    // ---- 大块明暗斑（低频噪声，模拟地形起伏）----
    const BLOB = 320;
    const BR = 1500;
    const bx0 = Math.floor((S.cam.x - BR) / BLOB);
    const bx1 = Math.floor((S.cam.x + BR) / BLOB);
    const by0 = Math.floor((S.cam.y - BR) / BLOB);
    const by1 = Math.floor((S.cam.y + BR) / BLOB);
    for (let cy = by0; cy <= by1; cy++) {
      for (let cx = bx0; cx <= bx1; cx++) {
        const h = hash2(cx + 811, cy + 977);
        if (h > 0.45) continue;
        const wx = cx * BLOB + (h * 733 % 220);
        const wy = cy * BLOB + (h * 541 % 220);
        const sp = w2s(wx, wy);
        if (sp.x < -400 || sp.x > W + 400 || sp.y < -300 || sp.y > H + 300) continue;
        const r = 150 + h * 260;
        g.globalAlpha = 0.05 + h * 0.055;
        g.fillStyle = h > 0.22 ? '#24401a' : '#8cc45a';
        g.beginPath();
        g.ellipse(sp.x, sp.y, r * 1.35, r * 0.68, 0, 0, TAU);
        g.fill();
      }
    }
    g.globalAlpha = 1;

    // ---- 小装饰 ----
    const cell = 150;
    const R = 1300;
    const x0 = Math.floor((S.cam.x - R) / cell);
    const x1 = Math.floor((S.cam.x + R) / cell);
    const y0 = Math.floor((S.cam.y - R) / cell);
    const y1 = Math.floor((S.cam.y + R) / cell);

    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const h = hash2(cx, cy);
        if (h > 0.34) continue;
        const wx = cx * cell + (h * 997 % 100) + 20;
        const wy = cy * cell + (h * 613 % 100) + 20;
        const sp = w2s(wx, wy);
        if (sp.x < -60 || sp.x > W + 60 || sp.y < -90 || sp.y > H + 60) continue;

        const type = Math.floor(h * 100) % 3;
        if (type === 0) {
          // 草丛
          g.globalAlpha = 0.72;
          g.fillStyle = S.theme.g3;
          for (let i = 0; i < 3; i++) {
            g.fillRect(sp.x + i * 4 - 4, sp.y - 12 - (i % 2) * 5, 3, 12 + (i % 2) * 5);
          }
          g.globalAlpha = 1;
        } else if (type === 1) {
          // 石块：等距小方块
          const sz = 12 + (h * 40) % 8;
          drawIsoBlock(g, sp.x, sp.y - 5, sz * 1.7, sz * 0.75, '#a0a094', '#6e6e64', '#86867a');
        } else {
          // 小花
          g.globalAlpha = 0.9;
          g.fillStyle = S.theme.g3;
          g.fillRect(sp.x, sp.y - 10, 2, 10);
          g.fillStyle = h > 0.2 ? '#f0d24a' : '#e05a5a';
          g.fillRect(sp.x - 3, sp.y - 16, 8, 7);
          g.globalAlpha = 1;
        }
      }
    }
  }

  function hash2(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ==================== HUD ==================== */
  function updateHud() {
    const p = S.player;
    const hpPct = clamp(p.hp / p.maxHp, 0, 1);
    const hpFill = document.getElementById('hpFill');
    hpFill.style.width = (hpPct * 100) + '%';
    document.getElementById('hpText').textContent = `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`;

    document.getElementById('xpFill').style.width = clamp(S.xp / S.xpNext, 0, 1) * 100 + '%';
    document.getElementById('lvNum').textContent = S.level;

    const t = Math.floor(S.time);
    document.getElementById('timer').textContent =
      String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
    document.getElementById('killNum').textContent = S.kills;

    if (S.boss && !S.boss.dead) {
      document.getElementById('bossFill').style.width = clamp(S.boss.hp / S.boss.maxHp, 0, 1) * 100 + '%';
    }
  }

  function updateSlots() {
    const p = S.player;
    const box = document.getElementById('slotBar');
    box.innerHTML = p.weapons.map(w => {
      const def = WEAPONS[w.id] || PASSIVES[w.id];
      const ic = ICON[def.icon] || '';
      return `<div class="slot" title="${def.name}">${ic}<span class="lv">${w.lv}</span></div>`;
    }).join('');
  }

  /* ==================== 流程 ==================== */
  function start(cfg) {
    cv = document.getElementById('cv');
    ctx = cv.getContext('2d');
    resize();

    S = createState(cfg);
    // 村民：开局多一次免费升级
    if (cfg.race.id === 'villager') S.pendingLevels = 1;

    // 地面纹理
    const tile = makeGroundTile(S.theme);
    pattern = ctx.createPattern(tile, 'repeat');

    document.getElementById('menu').classList.remove('show');
    document.getElementById('game').classList.add('show');
    document.getElementById('levelup').classList.add('hidden');
    document.getElementById('result').classList.add('hidden');
    document.getElementById('pausePanel').classList.add('hidden');
    document.getElementById('bossBar').classList.add('hidden');

    updateHud();
    updateSlots();
    hudTick = 0;
    lastTs = performance.now();
    resetStick();

    // 竖屏提示（触屏设备）
    const hint = document.getElementById('rotateHint');
    if (hint) {
      hint.classList.remove('on');
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (coarse && window.innerHeight > window.innerWidth) {
        hint.classList.add('on');
        setTimeout(() => hint.classList.remove('on'), 2800);
      }
    }

    if (!bindInput._done) { bindInput(); bindInput._done = true; }
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.floor(W * DPR);
    cv.height = Math.floor(H * DPR);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function win() {
    if (S.over) return;
    S.over = true;
    S.running = false;
    // 解锁下一区域
    S.unlockedName = (typeof unlockNextZone === 'function') ? unlockNextZone(S.zone.id, S.cfg.diff) : null;
    setTimeout(() => showResult(true), 700);
  }

  function lose() {
    if (S.over) return;
    S.over = true;
    S.running = false;
    S.shake = 20;
    setTimeout(() => showResult(false), 600);
  }

  function showResult(isWin) {
    document.getElementById('bossBar').classList.add('hidden');
    // 记录本局统计（成就/收藏用）
    if (typeof recordRun === 'function') {
      recordRun({ kills: S.kills, level: S.level });
    }
    // 上传赛季成绩（仅登录用户）
    try {
      if (typeof SB !== 'undefined' && SB.currentUser && SB.currentUser()) {
        const score = S.kills * 10 + S.level * 50 + (isWin ? 500 : 0);
        SB.submitRun({
          trainer_name: SB.currentUser().name,
          score: score, kills: S.kills, level: S.level,
          zone: S.zone.id, season: SB.currentSeason().id
        }).catch(function () {});
      }
    } catch (e) {}
    const t = Math.floor(S.time);
    document.getElementById('resTitle').textContent = isWin ? '首 领 已 陨 落' : '你 倒 下 了';
    document.getElementById('resTitle').className = 'res-title' + (isWin ? '' : ' dead');
    document.getElementById('resSub').textContent = isWin
      ? (S.unlockedName ? `已解锁新区域：${S.unlockedName}` : `${S.zone.name}的夜晚终于安静下来`)
      : `${S.zone.name}多了一具新的尸体`;
    document.getElementById('resStats').innerHTML = `
      <div class="res-stat"><span>存活时间</span><b>${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}</b></div>
      <div class="res-stat"><span>击杀</span><b>${S.kills}</b></div>
      <div class="res-stat"><span>等级</span><b>${S.level}</b></div>
    `;
    document.getElementById('result').classList.remove('hidden');
  }

  function toMenu() {
    S = null;
    resetStick();
    document.getElementById('game').classList.remove('show');
    document.getElementById('menu').classList.add('show');
    document.getElementById('result').classList.add('hidden');
    document.getElementById('pausePanel').classList.add('hidden');
    document.getElementById('levelup').classList.add('hidden');
    // 刷新区域列表：通关后新解锁的区域必须立刻可见
    try {
      if (typeof renderZones === 'function') {
        if (typeof STATE !== 'undefined') {
          // 自动选中刚解锁的下一个区域
          const idx = ZONES.findIndex(z => z.id === STATE.zone.id);
          if (idx >= 0 && idx + 1 < ZONES.length && typeof isZoneUnlocked === 'function'
              && isZoneUnlocked(ZONES[idx + 1].id)) {
            STATE.zone = ZONES[idx + 1];
          }
        }
        renderZones();
        if (typeof updateStartButton === 'function') updateStartButton();
      }
    } catch (e) {}
  }

  /* ==================== 主循环 ==================== */
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!S) return;
    // 时间差保护：异常/倒退时按一帧处理，绝不出现负 dt（否则时间倒流、永不刷怪）
    let dt = (ts - lastTs) / 1000;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;
    lastTs = ts;

    if (S.running && !S.paused && S.pendingLevels === 0) update(dt);

    // 有待处理的升级 -> 弹面板（暂停世界）
    if (S.running && !S.over && !S.paused && S.pendingLevels > 0) showLevelUp();

    if (S.paused || S.pendingLevels > 0) {
      // 暂停时仍更新粒子，让画面不死
      for (let i = S.particles.length - 1; i >= 0; i--) {
        const pt = S.particles[i];
        pt.life -= dt * 0.2;
        if (pt.life <= 0) S.particles.splice(i, 1);
      }
    }
    render();
  }

  /* ==================== 按钮绑定 ==================== */
  function init() {
    detectTouch();
    document.getElementById('btnRetry').onclick = () => {
      if (!S) return;
      const cfg = S.cfg;
      document.getElementById('result').classList.add('hidden');
      start(cfg);
    };
    document.getElementById('btnBack').onclick = toMenu;
    document.getElementById('btnResume').onclick = () => togglePause();
    document.getElementById('btnQuit').onclick = toMenu;
    document.getElementById('btnPauseMobile').onclick = () => togglePause();
    bindJoystick();
    window.addEventListener('resize', () => { if (cv) resize(); detectTouch(); });
    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    start, toMenu,
    debug: () => S,
    spawnBoss: () => spawnBoss(),
    debugHurtBoss: d => { if (S && S.boss) hurtEnemy(S.boss, d); }
  };

})();

window.Game = Game;
