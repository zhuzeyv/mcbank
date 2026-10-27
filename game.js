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
        if (r < 0.55) {
          g.fillStyle = r < 0.28 ? theme.g2 : theme.g3;
          g.globalAlpha = 0.09 + Math.random() * 0.2;
          g.fillRect(x * 4, y * 4, 4, 4);
        }
      }
    }
    // 零星深色泥土
    g.globalAlpha = 0.3;
    for (let i = 0; i < 4; i++) {
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
    p.maxHp = cls.hp + (race.bonus.hp || 0);
    p.hp = p.maxHp;

    // 初始武器
    addWeapon(p, cls.weapon);

    return {
      cfg, cls, race, zone, diff, zoneIdx,
      running: true, paused: false, over: false,
      time: 0,
      player: p,
      enemies: [], projectiles: [], orbs: [], particles: [], texts: [],
      effects: [], minions: [], hazards: [],
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
      dmg: w.dmg * (1 + 0.38 * k),
      cd: w.cd * Math.pow(0.935, k),
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
      win();
      return;
    }

    // 史莱姆分裂
    if (e.split && !e.splitDone) {
      e.splitDone = true;
      for (let i = 0; i < 2; i++) {
        const child = makeEnemy('slime', e.x + rnd(-20, 20), e.y + rnd(-20, 20), 0.55);
        if (child) S.enemies.push(child);
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
  function detectTouch() {
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const hasTouch = (navigator.maxTouchPoints > 0)
      || ('ontouchstart' in window)
      || coarse;
    if (hasTouch) document.body.classList.add('is-touch');
    return hasTouch;
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
      mx /= len; my /= len;
      p.x += mx * p.speed * dt;
      p.y += my * p.speed * dt;
      p.anim += dt;
      if (mx !== 0) p.facing = mx > 0 ? 1 : -1;
    } else {
      p.anim += dt * 0.35;
    }

    if (p.swing > 0) p.swing = Math.max(0, p.swing - dt * 6);
    if (p.hurtCd > 0) p.hurtCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;

    // ---- 摄像机 ----
    S.cam.x = p.x - W / 2;
    S.cam.y = p.y - H / 2;

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
      S.spawnTimer -= dt;
      if (S.spawnTimer <= 0) {
        const rate = Math.max(0.16, (0.92 - Math.min(0.66, S.time * 0.0042)) / S.diff.spawn);
        S.spawnTimer = rate;
        if (S.enemies.length < 110) spawnEnemy();
      }

      // 每 25 秒一波冲击
      S.waveTimer += dt;
      if (S.waveTimer >= 25) {
        S.waveTimer = 0;
        S.waveCount++;
        const n = 5 + S.waveCount * 2;
        for (let i = 0; i < n; i++) spawnEnemy(true);
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
        if (dist2(p.x, p.y, hz.x, hz.y) < (hz.r + p.r) * (hz.r + p.r)) {
          damagePlayer(hz.dmg);
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
    if (e.hp <= 0 && e.split && !e.splitDone) {
      e.splitDone = true;
      for (let i = 0; i < 2; i++) {
        const child = makeEnemy('slime', e.x + rnd(-18, 18), e.y + rnd(-18, 18), 0.55);
        if (child) S.enemies.push(child);
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
      hp: 90 * bd.hpMul * (1 + S.zoneIdx * 0.35) * S.diff.hp,
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
    const tScale = 1 + S.time / 150;
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
    const d = ring ? rnd(420, 620) : rnd(600, 780);
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
    p.invuln = 0.32;
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
      S.xpNext = Math.floor(6 * Math.pow(1.26, S.level - 1));
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
        mvKind: id === 'creeper_pet' ? 'creeper' : 'humanoid',
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
          m.t = 0;
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
      S.hazards.push({ x: pr.x, y: pr.y, r: r * 0.85, dmg: pr.dmg * 0.28, life: 2.6, tick: 0.45, color: '#8ad04a' });
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
    else if (id === 'speed') p.speed *= 1.09;
    else if (id === 'power') p.dmgMul *= 1.12;
    else if (id === 'haste') p.atkSpeedMul *= 1.10;
    else if (id === 'magnet') p.pickup *= 1.30;
    else if (id === 'crit') { p.critChance += 0.06; p.critMul += 0.15; }
    else if (id === 'armor') p.armor = Math.min(0.75, p.armor + 0.07);
    else if (id === 'lucky') p.xpMul *= 1.12;
  }

  /* ==================== 渲染 ==================== */
  function render() {
    if (!S) return;
    const g = ctx;
    g.save();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);

    let sx = 0, sy = 0;
    if (S.shake > 0) {
      sx = rnd(-S.shake, S.shake) * 0.5;
      sy = rnd(-S.shake, S.shake) * 0.5;
    }

    // 背景
    g.fillStyle = S.theme.g2;
    g.fillRect(0, 0, W, H);

    g.save();
    g.translate(-S.cam.x + sx, -S.cam.y + sy);

    // 地面
    if (pattern) {
      g.fillStyle = pattern;
      g.fillRect(S.cam.x - 70, S.cam.y - 70, W + 140, H + 140);
    }

    // 装饰
    drawDecor(g);

    // 危险区
    for (const hz of S.hazards) {
      g.globalAlpha = 0.28 * Math.min(1, hz.life);
      g.fillStyle = hz.color;
      g.beginPath();
      g.arc(hz.x, hz.y, hz.r, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = hz.color;
      g.globalAlpha = 0.6;
      g.lineWidth = 2;
      g.stroke();
      g.globalAlpha = 1;
    }

    // 经验球
    for (const o of S.orbs) {
      const pulse = 1 + Math.sin(o.t * 8) * 0.15;
      g.globalAlpha = 0.25;
      g.fillStyle = '#8de05a';
      g.beginPath();
      g.arc(o.x, o.y, o.r * 2.6 * pulse, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#b8f070';
      g.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
      g.fillStyle = '#e8ffc0';
      g.fillRect(o.x - o.r * 0.4, o.y - o.r * 0.4, o.r * 0.8, o.r * 0.8);
    }

    // 敌人
    const sorted = S.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of sorted) {
      if (e.dead) continue;
      const baseH = KIND_H[e.kind] || 32;
      const unit = e.size / baseH;

      g.save();
      if (e.hitFlash > 0) {
        g.globalAlpha = 0.85;
      }
      drawMobFigure(g, e.x, e.y, unit, e.skin, e.kind, {
        flip: (S.player.x - e.x) < 0,
        bob: Math.sin(S.time * 9 + e.x * 0.08) * 0.5
      });

      // 受击白闪
      if (e.hitFlash > 0) {
        g.save();
        g.globalAlpha = Math.min(0.55, e.hitFlash * 5);
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(e.x, e.y - e.size * 0.45, e.size * 0.5, 0, TAU);
        g.fill();
        g.restore();
      }
      g.restore();

      // 血条（非满血时）
      if (!e.isBoss && e.hp < e.maxHp) {
        const bw = e.size * 0.8;
        g.fillStyle = 'rgba(0,0,0,.65)';
        g.fillRect(e.x - bw / 2, e.y - e.size - 8, bw, 3.5);
        g.fillStyle = '#c8382e';
        g.fillRect(e.x - bw / 2, e.y - e.size - 8, bw * (e.hp / e.maxHp), 3.5);
      }
      if (e.isBoss) {
        g.save();
        g.globalAlpha = 0.9;
        g.font = '600 13px Georgia, serif';
        g.textAlign = 'center';
        g.fillStyle = '#e8c877';
        g.fillText(e.name, e.x, e.y - e.size - 16);
        g.restore();
      }
    }

    // 随从
    for (const m of S.minions) {
      const baseH = KIND_H[m.mvKind] || 32;
      drawMobFigure(g, m.x, m.y, 30 / baseH, m.skin, m.mvKind);
      if (m.t < 3) {
        g.globalAlpha = 0.5 + Math.sin(S.time * 12) * 0.3;
        g.fillStyle = '#8de05a';
        g.fillRect(m.x - 12, m.y + 4, 24 * (m.t / 3), 2);
        g.globalAlpha = 1;
      }
    }

    // 玩家
    const p = S.player;
    const walkBob = Math.sin(p.anim * 11) * 0.55;
    const swing = p.swing > 0 ? Math.sin(p.swing * Math.PI) : 0;

    // 玩家光环
    if (p.invuln > 0) {
      g.globalAlpha = p.invuln * 1.4;
      g.strokeStyle = '#f0d24a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y - 18, 26, 0, TAU);
      g.stroke();
      g.globalAlpha = 1;
    }

    // 玩家脚下光环（尸潮里一眼找到自己）
    g.save();
    g.globalAlpha = 0.3 + Math.sin(S.time * 3) * 0.06;
    g.fillStyle = '#f0d24a';
    g.beginPath();
    g.ellipse(p.x, p.y + 1, 27, 9.5, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 0.5;
    g.strokeStyle = '#f7e6a8';
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(p.x, p.y + 1, 27, 9.5, 0, 0, TAU);
    g.stroke();
    g.restore();

    drawMCFigure(g, p.x, p.y, 46 / 32, S.skin, {
      flip: p.facing < 0,
      swing: swing * 1.4,
      bob: walkBob
    });

    // 特效
    for (const fx of S.effects) {
      const t = 1 - fx.life / fx.max;
      g.save();
      if (fx.type === 'slash') {
        g.globalAlpha = (1 - t) * 0.75;
        g.strokeStyle = fx.color;
        g.lineWidth = 5 * (1 - t) + 1;
        g.beginPath();
        g.arc(fx.x, fx.y - 18, fx.r * (0.6 + t * 0.5), -Math.PI * 0.85, Math.PI * 0.15);
        g.stroke();
      } else if (fx.type === 'aura') {
        g.globalAlpha = (1 - t) * 0.5;
        g.strokeStyle = fx.color;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(fx.x, fx.y - 14, fx.r * (0.8 + t * 0.25), 0, TAU);
        g.stroke();
        g.globalAlpha = (1 - t) * 0.08;
        g.fillStyle = fx.color;
        g.beginPath();
        g.arc(fx.x, fx.y - 14, fx.r, 0, TAU);
        g.fill();
      } else if (fx.type === 'boom' || fx.type === 'ring' || fx.type === 'bossRing') {
        g.globalAlpha = (1 - t) * 0.8;
        g.strokeStyle = fx.color;
        g.lineWidth = 4 * (1 - t) + 1;
        g.beginPath();
        g.arc(fx.x, fx.y - 14, fx.r * (0.3 + t * 0.9), 0, TAU);
        g.stroke();
      } else if (fx.type === 'bolt') {
        g.globalAlpha = 1 - t;
        g.strokeStyle = '#9ad8ff';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(fx.x, fx.y - 200);
        let yy = fx.y - 200;
        while (yy < fx.y) {
          yy += 26;
          g.lineTo(fx.x + rnd(-11, 11), Math.min(yy, fx.y));
        }
        g.stroke();
        g.globalAlpha = (1 - t) * 0.35;
        g.fillStyle = '#9ad8ff';
        g.beginPath();
        g.arc(fx.x, fx.y, fx.r, 0, TAU);
        g.fill();
      } else if (fx.type === 'fang') {
        g.globalAlpha = 1 - t;
        g.fillStyle = '#e8e0d0';
        for (let i = 0; i < 5; i++) {
          const fx2 = fx.x + (i - 2) * 16;
          g.beginPath();
          g.moveTo(fx2 - 5, fx.y);
          g.lineTo(fx2, fx.y - 26 - Math.sin(t * Math.PI) * 8);
          g.lineTo(fx2 + 5, fx.y);
          g.fill();
        }
      } else if (fx.type === 'meteor') {
        g.globalAlpha = (1 - t) * 0.7;
        g.strokeStyle = fx.color;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(fx.x, fx.y, fx.r, 0, TAU);
        g.stroke();
        g.globalAlpha = (1 - t) * 0.16;
        g.fillStyle = fx.color;
        g.fill();
      }
      g.restore();
    }

    // 投射物
    for (const pr of S.projectiles) {
      g.save();
      if (pr.big) {
        g.globalAlpha = 0.4;
        g.fillStyle = pr.color;
        g.beginPath();
        g.arc(pr.x, pr.y, pr.r * 1.8, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
      }
      g.fillStyle = pr.color;
      g.beginPath();
      g.arc(pr.x, pr.y, pr.r, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.65)';
      g.beginPath();
      g.arc(pr.x - pr.r * 0.25, pr.y - pr.r * 0.25, pr.r * 0.4, 0, TAU);
      g.fill();
      g.restore();
    }

    // 粒子
    for (const pt of S.particles) {
      const a = Math.min(1, pt.life / 0.3);
      g.globalAlpha = a;
      g.fillStyle = pt.color;
      g.save();
      g.translate(pt.x, pt.y);
      g.rotate(pt.rot);
      g.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size);
      g.restore();
    }
    g.globalAlpha = 1;

    // 飘字
    for (const t of S.texts) {
      const a = Math.min(1, t.life / 0.35);
      g.globalAlpha = a;
      g.font = `700 ${t.size}px Georgia, "Songti SC", serif`;
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,.75)';
      g.strokeText(t.txt, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.txt, t.x, t.y);
    }
    g.globalAlpha = 1;

    g.restore();

    // 暗角
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.7, 'rgba(0,0,0,.18)');
    vg.addColorStop(1, 'rgba(0,0,0,.62)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    // 受伤红边
    if (S.hurtFlash > 0) {
      const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(180,30,20,0)');
      grd.addColorStop(1, `rgba(180,30,20,${0.5 * S.hurtFlash})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }

    g.restore();

    // HUD
    hudTick += 1;
    if (hudTick % 3 === 0) updateHud();
  }

  const KIND_H = { humanoid: 32, creeper: 22, spider: 14, slime: 18, blaze: 24, dragon: 35, warden: 36 };

  /* ---------- 地面装饰 ---------- */
  function drawDecor(g) {
    const cell = 140;
    const x0 = Math.floor((S.cam.x - 100) / cell);
    const x1 = Math.floor((S.cam.x + W + 100) / cell);
    const y0 = Math.floor((S.cam.y - 100) / cell);
    const y1 = Math.floor((S.cam.y + H + 100) / cell);

    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const h = hash2(cx, cy);
        if (h > 0.34) continue;
        const px = cx * cell + (h * 997 % 100) + 20;
        const py = cy * cell + (h * 613 % 100) + 20;
        const type = Math.floor(h * 100) % 3;
        if (type === 0) {
          // 草丛
          g.globalAlpha = 0.7;
          g.fillStyle = S.theme.g3;
          for (let i = 0; i < 3; i++) {
            g.fillRect(px + i * 5 - 5, py - 12 - (i % 2) * 5, 4, 14 + (i % 2) * 5);
          }
        } else if (type === 1) {
          // 石块
          g.globalAlpha = 0.8;
          g.fillStyle = '#8a8a80';
          g.fillRect(px, py, 15, 11);
          g.fillStyle = '#6a6a62';
          g.fillRect(px, py + 8, 15, 4);
          g.fillStyle = '#a0a098';
          g.fillRect(px + 2, py + 2, 5, 3);
        } else {
          // 小花
          g.globalAlpha = 0.85;
          g.fillStyle = S.theme.g3;
          g.fillRect(px + 2, py - 9, 3, 11);
          g.fillStyle = h > 0.25 ? '#e8d050' : '#d85858';
          g.fillRect(px - 2, py - 15, 10, 7);
          g.fillStyle = h > 0.25 ? '#fff0a0' : '#f08080';
          g.fillRect(px + 1, py - 13, 4, 3);
        }
        g.globalAlpha = 1;
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
    S.unlockedName = (typeof unlockNextZone === 'function') ? unlockNextZone(S.zone.id) : null;
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
    window.addEventListener('resize', () => { if (cv) resize(); });
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
