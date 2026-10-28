/* ============================================================
   方块幸存者 · 数据层
   ============================================================ */

/* ---------- 像素图标生成 ---------- */
function pixelIcon(rows, colors) {
  const h = rows.length, w = rows[0].length;
  let rects = '';
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]];
      if (!c) continue;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

const ICON_SRC = {
  sword: {
    rows: [
      '.........WW',
      '........WWD',
      '.......WWD.',
      '......WWD..',
      '.....WWD...',
      '....WWD....',
      '...GWWD....',
      '..GGWD.....',
      '.BGG.......',
      'BB.........',
      'B..........'
    ],
    c: { W: '#e2e2e2', D: '#9a9a9a', G: '#a8813f', B: '#6b4a2a' }
  },
  shield: {
    rows: [
      'WWWWWWWWW..',
      'WEEEEEEEW..',
      'WERRRRREW..',
      'WERRRRREW..',
      'WERRRRREW..',
      'WERRRRREW..',
      '.WERRREW...',
      '.WERRREW...',
      '..WEREW....',
      '...WEW.....',
      '....W......'
    ],
    c: { W: '#b8b8b8', E: '#6b4a2a', R: '#a83a3a' }
  },
  bow: {
    rows: [
      '...BBB.....',
      '..B...S....',
      '.B....S....',
      'B.....S....',
      'B.....S....',
      'B.....S....',
      'B.....S....',
      '.B....S....',
      '..B...S....',
      '...BBB.....',
      '...........'
    ],
    c: { B: '#8a6234', S: '#dedede' }
  },
  dagger: {
    rows: [
      '.......WWW',
      '......WWDW',
      '.....WWDW.',
      '....WWDW..',
      '...WWDW...',
      '..GWWD....',
      '.GGG......',
      'BGG.......',
      'BB........',
      'B.........',
      '..........'
    ],
    c: { W: '#d0d0d0', D: '#8e8e8e', G: '#9a7a3a', B: '#5a3f22' }
  },
  apple: {
    rows: [
      '....LL.....',
      '...LLLL....',
      '..GG.AA....',
      '.....AAA...',
      '....AAAAA..',
      '...AAAAAAA.',
      '...AAAAAAA.',
      '...AAAAAAA.',
      '....AAAAA..',
      '.....AAA...',
      '...........'
    ],
    c: { A: '#f0c04a', L: '#6aa83a', G: '#4a7a28' }
  },
  potion: {
    rows: [
      '.....CC....',
      '.....CC....',
      '....PPPP...',
      '...PLLLLP..',
      '...PLLLLP..',
      '...PLLLLP..',
      '...PLLLLP..',
      '...PLLLLP..',
      '....PPPP...',
      '...........',
      '...........'
    ],
    c: { C: '#a0784a', P: '#cfe0e8', L: '#a05ad8' }
  },
  book: {
    rows: [
      '...........',
      '.BBBBBBBBB.',
      '.BPPPPPPPB.',
      '.BPLLLLLPB.',
      '.BPLMMMLPB.',
      '.BPLLLLLPB.',
      '.BPPPPPPPB.',
      '.BBBBBBBBB.',
      '..WWWWWWW..',
      '...........',
      '...........'
    ],
    c: { B: '#8a3030', P: '#e8e0c8', L: '#7de0ff', M: '#ffffff', W: '#d8d0b0' }
  },
  sapling: {
    rows: [
      '....GG.....',
      '...GGGG....',
      '..GGGGGG...',
      '..GGGGGG...',
      '...GGGG....',
      '....BB.....',
      '....BB.....',
      '....BB.....',
      '...BBBB....',
      '...........',
      '...........'
    ],
    c: { G: '#5aa83a', B: '#6b4a2a' }
  },
  skull: {
    rows: [
      '..WWWWW....',
      '.WWWWWWW...',
      '.WWWWWWW...',
      '.WEEWEEW...',
      '.WWWWWWW...',
      '..WWWWW....',
      '...WEW.....',
      '...........',
      '...........',
      '...........',
      '...........'
    ],
    c: { W: '#e0e0d4', E: '#22201c' }
  },
  fire: {
    rows: [
      '.....R.....',
      '....RRO....',
      '...RROOO...',
      '..RROOOOY..',
      '..ROOOOYY..',
      '.ROOOOYYY..',
      '.ROOOYYYY..',
      '.ROOOYYYY..',
      '..ROOYYY...',
      '...RYYY....',
      '....RR.....'
    ],
    c: { R: '#c83818', O: '#f07820', Y: '#ffd24a' }
  },
  bolt: {
    rows: [
      '....YYY....',
      '...YYY.....',
      '..YYY......',
      '..YYYYYY...',
      '.....YYY...',
      '....YYY....',
      '...YYY.....',
      '..YYY......',
      '.YYY.......',
      '.YY........',
      '...........'
    ],
    c: { Y: '#9ad8ff' }
  },
  snow: {
    rows: [
      '.....W.....',
      '..W..W..W..',
      '...W.W.W...',
      '....WWW....',
      'WWWWWWWWWWW',
      '....WWW....',
      '...W.W.W...',
      '..W..W..W..',
      '.....W.....',
      '...........',
      '...........'
    ],
    c: { W: '#dff0ff' }
  },
  creeper: {
    rows: [
      '..GGGGGGG..',
      '.GGGGGGGGG.',
      '.GEEGGGEEG.',
      '.GEEGGGEEG.',
      '.GGGEEEGGG.',
      '.GGEEEEE GG',
      '.GGEEEEE GG',
      '.GGGEEEGGG.',
      '.GGGGGGGGG.',
      '.GGGGGGGGG.',
      '..GGGGGGG..'
    ],
    c: { G: '#5aa83a', E: '#101410' }
  },
  trident: {
    rows: [
      '..W.W.W....',
      '..W.W.W....',
      '..WWWWW....',
      '...W.W.....',
      '...WWW.....',
      '....W......',
      '....B......',
      '....B......',
      '....B......',
      '....B......',
      '...........'
    ],
    c: { W: '#7de0d0', B: '#6b4a2a' }
  },
  heart: {
    rows: [
      '..RR...RR..',
      '.RRRR.RRRR.',
      'RRRRRRRRRRR',
      'RRRRRRRRRRR',
      'RRRRRRRRRRR',
      '.RRRRRRRRR.',
      '..RRRRRRR..',
      '...RRRRR...',
      '....RRR....',
      '.....R.....',
      '...........'
    ],
    c: { R: '#c8382e' }
  },
  boot: {
    rows: [
      '...........',
      '...BBB.....',
      '...BBB.....',
      '...BBB.....',
      '...BBB.....',
      '...BBBBBB..',
      '...BBBBBBB.',
      '..BBBBBBBB.',
      '..WWWWWWWW.',
      '...........',
      '...........'
    ],
    c: { B: '#5a7a9a', W: '#8a6a3a' }
  },
  fist: {
    rows: [
      '...RRRRR...',
      '..RRRRRRR..',
      '..RRRRRRR..',
      '..RRRRRRR..',
      '..RRRRRRR..',
      '...RRRRR...',
      '....RRR....',
      '....RRR....',
      '...........',
      '...........',
      '...........'
    ],
    c: { R: '#c08a5a' }
  },
  magnet: {
    rows: [
      '..RRR.RRR..',
      '..RWR.RWR..',
      '..RRR.RRR..',
      '..RRR.RRR..',
      '..RRR.RRR..',
      '..RRR.RRR..',
      '..RWR.RWR..',
      '..WWW.WWW..',
      '...........',
      '...........',
      '...........'
    ],
    c: { R: '#c8382e', W: '#e8e8e8' }
  },
  star: {
    rows: [
      '.....Y.....',
      '.....Y.....',
      '....YYY....',
      'YYYYYYYYYYY',
      '.YYYYYYYYY.',
      '..YYYYYYY..',
      '...YYYYY...',
      '..YYYYYYY..',
      '..YY...YY..',
      '.Y.......Y.',
      '...........'
    ],
    c: { Y: '#f0d24a' }
  },
  armor: {
    rows: [
      '..WWW.WWW..',
      '.WWWWWWWWW.',
      '.WWEEWEEWW.',
      '.WWWWWWWWW.',
      '..WWWWWWW..',
      '..WWWWWWW..',
      '..WWWWWWW..',
      '..WWWWWWW..',
      '..WWWWWWW..',
      '...........',
      '...........'
    ],
    c: { W: '#a8b8c8', E: '#3a4a5a' }
  },
  helmetIco: {
    rows: [
      '...HHHHH...',
      '..HHHHHHH..',
      '.HHHHHHHHH.',
      '.HHHHHHHHH.',
      '.HH.DDD.HH.',
      '.HH.DDD.HH.',
      '.HH.....HH.',
      '.HHHHHHHHH.',
      '..HHHHHHH..',
      '...........',
      '...........'
    ],
    c: { H: '#a8b8c8', D: '#3a4a5a' }
  },
  chestIco: {
    rows: [
      '...........',
      '.HH.....HH.',
      'HHHHHHHHHHH',
      'HHHHHHHHHHH',
      'HHHDDDDDDHH',
      'HHHHHHHHHHH',
      '.HHHHHHHHH.',
      '.HHHHHHHHH.',
      '..HHHHHHH..',
      '...........',
      '...........'
    ],
    c: { H: '#a8b8c8', D: '#5a6a7a' }
  },
  legsIco: {
    rows: [
      '..HHHHHHH..',
      '..HHHHHHH..',
      '..HHH.HHH..',
      '..HHH.HHH..',
      '..HHH.HHH..',
      '..HHH.HHH..',
      '..HHH.HHH..',
      '..HHH.HHH..',
      '..HHH.HHH..',
      '...........',
      '...........'
    ],
    c: { H: '#a8b8c8' }
  },
  spiderIco: {
    rows: [
      'B.......B..',
      '.B..B..B...',
      '..BBBBB....',
      '.BBBBBBB...',
      'BBEBBBEBB..',
      '.BBBBBBB...',
      '..BBBBB....',
      '.B..B..B...',
      'B.......B..',
      '...........',
      '...........'
    ],
    c: { B: '#3a3430', E: '#c8302a' }
  },
  slimeIco: {
    rows: [
      '...........',
      '..GGGGGGG..',
      '.GGGGGGGGG.',
      'GGEEGGGEEGG',
      'GGGGGGGGGGG',
      'GGGGGGGGGGG',
      '.GGGGGGGGG.',
      '..GGGGGGG..',
      '...........',
      '...........',
      '...........'
    ],
    c: { G: '#6ab83a', E: '#0e140e' }
  }
};

const ICON = {};
for (const k in ICON_SRC) ICON[k] = pixelIcon(ICON_SRC[k].rows, ICON_SRC[k].c);

function iconHTML(key, cls) {
  if (ICON[key]) return ICON[key];
  return `<span class="glyph ${cls || ''}">${key}</span>`;
}

/* ---------- 职业 ---------- */
const CLASSES = [
  {
    id: 'swordsman', name: '剑士', icon: 'sword',
    desc: '最朴素的活法：一把铁剑，一身皮革，砍到天亮。近战伤害与生命值都很稳。',
    hp: 230, spd: 1.0, dmg: 1.0, armor: 0,
    weapon: 'iron_sword',
    pool: ['iron_sword', 'trident', 'aura', 'heart', 'power', 'haste']
  },
  {
    id: 'knight', name: '骑士', icon: 'shield',
    desc: '铁傀儡般的耐心。护甲让你在尸潮里站得更久，代价是跑得比僵尸慢一点。',
    hp: 300, spd: 0.9, dmg: 0.9, armor: 0.15,
    weapon: 'shield_bash',
    pool: ['shield_bash', 'aura', 'armor', 'heart', 'thorns', 'power']
  },
  {
    id: 'archer', name: '弓箭手', icon: 'bow',
    desc: '骷髅的远亲。站在安全距离把箭一支支送出去，最怕的是苦力怕贴脸。',
    hp: 170, spd: 1.1, dmg: 1.0, armor: 0,
    weapon: 'bow',
    pool: ['bow', 'trident', 'haste', 'magnet', 'crit', 'speed']
  },
  {
    id: 'rogue', name: '盗贼', icon: 'dagger',
    desc: '潜行时你连脚步声都没有。攻速极快，血薄，靠暴击和位移活着。',
    hp: 160, spd: 1.25, dmg: 0.95, armor: 0,
    weapon: 'dagger',
    pool: ['dagger', 'crit', 'speed', 'haste', 'lucky', 'bow']
  },
  {
    id: 'cleric', name: '牧师', icon: 'apple',
    desc: '金苹果与治疗药水。自己回血，也能把光撒到脚下，慢慢熬死一片。',
    hp: 200, spd: 1.0, dmg: 0.95, armor: 0.05,
    weapon: 'holy_light',
    pool: ['holy_light', 'potion', 'heart', 'aura', 'magnet', 'armor']
  },
  {
    id: 'warlock', name: '术士', icon: 'potion',
    desc: '喷溅药水与剧毒。伤害来得慢，但那些绿色数字会替你数完剩下的时间。',
    hp: 180, spd: 1.0, dmg: 1.05, armor: 0,
    weapon: 'poison_flask',
    pool: ['poison_flask', 'wither', 'power', 'lucky', 'magnet', 'heart']
  },
  {
    id: 'mage', name: '法师', icon: 'fire',
    desc: '烈焰弹与引雷。纸糊的血量，换来全职业最高的爆发——别让它们靠近。',
    hp: 150, spd: 1.05, dmg: 1.15, armor: 0,
    weapon: 'fireball',
    pool: ['fireball', 'lightning', 'snowball', 'power', 'haste', 'crit']
  },
  {
    id: 'druid', name: '德鲁伊', icon: 'sapling',
    desc: '藤蔓、苔藓与橡木之心。生命值高，还能召唤狼替你分担一半的仇恨。',
    hp: 210, spd: 1.0, dmg: 1.0, armor: 0.05,
    weapon: 'vines',
    pool: ['vines', 'wolf', 'heart', 'thorns', 'magnet', 'aura']
  },
  {
    id: 'evoker', name: '唤魔者', icon: 'skull',
    desc: '从林地府邸走出来的东西。尖牙与恼鬼，让敌人从地里长出来再被撕碎。',
    hp: 175, spd: 1.0, dmg: 1.1, armor: 0,
    weapon: 'fang',
    pool: ['fang', 'vex', 'creeper_pet', 'power', 'crit', 'lucky']
  }
];

/* ---------- 种族 ---------- */
const RACES = [
  {
    id: 'human', name: '人类',
    perks: [
      ['适应力', '每升 5 级额外获得 1 点最大生命'],
      ['勤奋', '经验获取 +10%'],
      ['外交', '金币与掉落 +20%']
    ],
    bonus: { hp: 0, spd: 1.0, xp: 1.1, dmg: 1.0 }
  },
  {
    id: 'villager', name: '村民',
    perks: [
      ['交易', '开局额外获得一次免费升级'],
      ['胆小', '移动速度 +8%，但受到的伤害 +5%'],
      ['农务', '拾取范围 +30%']
    ],
    bonus: { hp: -10, spd: 1.08, xp: 1.0, dmg: 1.0, dmgTaken: 1.05 }
  },
  {
    id: 'piglin', name: '猪灵',
    perks: [
      ['好斗', '攻击力 +12%'],
      ['固执', '生命值 +25'],
      ['贪婪', '击杀时有几率额外掉落经验']
    ],
    bonus: { hp: 25, spd: 1.0, xp: 1.0, dmg: 1.12 }
  },
  {
    id: 'enderman', name: '末影族',
    perks: [
      ['瞬身', '移动速度 +12%'],
      ['脆弱', '生命值 -30'],
      ['虚空亲和', '受到伤害时有几率闪避']
    ],
    bonus: { hp: -30, spd: 1.12, xp: 1.0, dmg: 1.0, dodge: 0.12 }
  }
];

/* ---------- 区域 ---------- */
const ZONES = [
  {
    id: 'plains', name: '平原', lv: '1 - 3', boss: '僵尸王',
    desc: '开阔的草方块与零星橡木。僵尸和骷髅在夕阳下慢慢游荡，最适合练手。',
    theme: { g1: '#5d8a3c', g2: '#4e7832', g3: '#6b9a46', dirt: '#7a5b3a', fog: 'rgba(120,150,90,.05)' },
    mobs: ['zombie', 'skeleton'],
    hpMul: 1.0, spawnMul: 1.0, time: 120
  },
  {
    id: 'forest', name: '森林', lv: '3 - 6', boss: '骷髅领主',
    desc: '密不透光的树冠下，箭矢从每一道缝隙里飞来。蜘蛛在树上织网。',
    theme: { g1: '#3f6b2e', g2: '#33582a', g3: '#4a7a36', dirt: '#6b4f32', fog: 'rgba(60,110,60,.07)' },
    mobs: ['zombie', 'skeleton', 'spider'],
    hpMul: 1.25, spawnMul: 1.1, time: 130
  },
  {
    id: 'desert', name: '沙漠', lv: '6 - 9', boss: '尸壳法老',
    desc: '沙子底下埋着不该醒来的东西。白天晒，晚上冷，尸壳不需要呼吸。',
    theme: { g1: '#c8b070', g2: '#b8a060', g3: '#d8c080', dirt: '#a88a50', fog: 'rgba(200,170,110,.06)' },
    mobs: ['husk', 'skeleton', 'creeper'],
    hpMul: 1.5, spawnMul: 1.2, time: 140
  },
  {
    id: 'caves', name: '洞穴', lv: '9 - 12', boss: '蜘蛛母巢',
    desc: '火把只照亮三步远。头顶有东西在爬，你听见八条腿的声音。',
    theme: { g1: '#4a4640', g2: '#3a3630', g3: '#57524a', dirt: '#2e2a24', fog: 'rgba(20,20,20,.18)' },
    mobs: ['spider', 'zombie', 'creeper'],
    hpMul: 1.85, spawnMul: 1.3, time: 150
  },
  {
    id: 'swamp', name: '沼泽', lv: '12 - 15', boss: '史莱姆巨兽',
    desc: '水是温的，雾是甜的。史莱姆从泥里分裂出来，越砍越多。',
    theme: { g1: '#465a3a', g2: '#3a4a30', g3: '#526840', dirt: '#3a3a28', fog: 'rgba(80,100,60,.1)' },
    mobs: ['slime', 'spider', 'witch'],
    hpMul: 2.2, spawnMul: 1.4, time: 160
  },
  {
    id: 'nether', name: '下界', lv: '15 - 18', boss: '烈焰人领主',
    desc: '空气烫得能点着眉毛。恶魂的哭声从远处飘来，脚下是熔岩海。',
    theme: { g1: '#7a2a20', g2: '#5e1e18', g3: '#8a3428', dirt: '#3e1410', fog: 'rgba(180,60,30,.09)' },
    mobs: ['blaze', 'zombie', 'wither_skeleton'],
    hpMul: 2.7, spawnMul: 1.55, time: 170
  },
  {
    id: 'end', name: '末地', lv: '18 - 22', boss: '末影龙',
    desc: '虚空在脚下张开。末影人不会主动攻击——直到你抬头看它们。',
    theme: { g1: '#2a2438', g2: '#1e1a2a', g3: '#332c44', dirt: '#14101e', fog: 'rgba(120,80,200,.07)' },
    mobs: ['enderman', 'blaze', 'skeleton'],
    hpMul: 3.3, spawnMul: 1.7, time: 180
  },
  {
    id: 'deepdark', name: '深暗之域', lv: '22 - 30', boss: '监守者',
    desc: '不要出声。这里的方块会听见你的脚步，然后一切都结束了。',
    theme: { g1: '#1c2a2c', g2: '#141e20', g3: '#263638', dirt: '#0e1618', fog: 'rgba(40,120,120,.09)' },
    mobs: ['warden_spawn', 'enderman', 'wither_skeleton'],
    hpMul: 4.0, spawnMul: 1.85, time: 190
  }
];

/* ---------- 武器 ---------- */
const WEAPONS = {
  iron_sword: {
    name: '铁剑', icon: 'sword', type: 'melee', maxLv: 8,
    desc: '向前方横扫，命中扇形内所有敌人。',
    cd: 0.62, dmg: 22, range: 78, arc: 2.0
  },
  shield_bash: {
    name: '盾击', icon: 'shield', type: 'melee', maxLv: 8,
    desc: '举盾前冲，撞击范围内的敌人并短暂击退。',
    cd: 0.85, dmg: 27, range: 86, arc: 2.6, knock: 190
  },
  dagger: {
    name: '匕首', icon: 'dagger', type: 'melee', maxLv: 8,
    desc: '极快的短刺，只打前方一个目标，但几乎不停手。',
    cd: 0.24, dmg: 11, range: 62, arc: 1.2, single: true
  },
  bow: {
    name: '弓', icon: 'bow', type: 'projectile', maxLv: 8,
    desc: '朝最近的敌人射出箭矢，穿透一个目标。',
    cd: 0.78, dmg: 13, speed: 620, range: 460, pierce: 1
  },
  fireball: {
    name: '烈焰弹', icon: 'fire', type: 'projectile', maxLv: 8,
    desc: '火球飞行后爆炸，造成范围伤害并点燃地面。',
    cd: 1.15, dmg: 26, speed: 400, range: 420, splash: 62
  },
  snowball: {
    name: '雪球', icon: 'snow', type: 'projectile', maxLv: 8,
    desc: '三连发雪球，命中减速。等级越高弹数越多。',
    cd: 0.85, dmg: 9, speed: 560, range: 400, count: 3, slow: 0.45
  },
  lightning: {
    name: '引雷', icon: 'bolt', type: 'strike', maxLv: 8,
    desc: '在随机敌人头顶降下闪电，造成小范围伤害。',
    cd: 1.5, dmg: 34, range: 340, count: 1, splash: 52
  },
  trident: {
    name: '三叉戟', icon: 'trident', type: 'boomerang', maxLv: 8,
    desc: '掷出三叉戟，飞行途中持续伤害，然后返回手中。',
    cd: 1.1, dmg: 16, speed: 480, range: 320
  },
  poison_flask: {
    name: '喷溅药水', icon: 'potion', type: 'projectile', maxLv: 8,
    desc: '掷出药水瓶，落地形成毒云，持续伤害范围内敌人。',
    cd: 1.3, dmg: 7, speed: 380, range: 360, splash: 70, poison: true
  },
  holy_light: {
    name: '圣光', icon: 'apple', type: 'aura', maxLv: 8,
    desc: '脚下常驻光环，持续灼烧靠近的敌人，并缓慢治疗你。',
    cd: 0.5, dmg: 5, range: 88, heal: 1
  },
  aura: {
    name: '经验修补', icon: 'star', type: 'aura', maxLv: 8,
    desc: '吸收周围经验，转化为范围伤害光环。',
    cd: 0.45, dmg: 4, range: 78
  },
  thorns: {
    name: '荆棘', icon: 'armor', type: 'thorns', maxLv: 8,
    desc: '被近身攻击时反弹伤害。',
    cd: 0.3, dmg: 12, range: 90
  },
  vines: {
    name: '藤蔓', icon: 'sapling', type: 'aura', maxLv: 8,
    desc: '地面长出藤蔓，持续缠绕并伤害周围敌人。',
    cd: 0.55, dmg: 7, range: 96
  },
  fang: {
    name: '尖牙', icon: 'skull', type: 'strike', maxLv: 8,
    desc: '地面窜出一排尖牙，沿直线撕咬敌人。',
    cd: 1.2, dmg: 30, range: 300, count: 1, splash: 46, line: true
  },
  wither: {
    name: '凋零', icon: 'potion', type: 'projectile', maxLv: 8,
    desc: '发射凋零头颅，命中后留下持续伤害的凋零区域。',
    cd: 1.4, dmg: 22, speed: 340, range: 420, splash: 66, poison: true
  },
  creeper_pet: {
    name: '苦力怕', icon: 'creeper', type: 'minion', maxLv: 8,
    desc: '召唤一只苦力怕跟随你，靠近敌人后自爆。',
    cd: 3.2, dmg: 40, range: 300, splash: 78
  },
  vex: {
    name: '恼鬼', icon: 'skull', type: 'minion', maxLv: 8,
    desc: '召唤恼鬼穿墙追击敌人，持续攻击。',
    cd: 3.6, dmg: 12, range: 320
  },
  wolf: {
    name: '狼', icon: 'fist', type: 'minion', maxLv: 8,
    desc: '召唤忠诚的狼，撕咬靠近的敌人并吸引仇恨。',
    cd: 4.0, dmg: 15, range: 320
  }
};

/* ---------- 被动 ---------- */
const PASSIVES = {
  heart: { name: '生命上限', icon: 'heart', maxLv: 5, desc: '最大生命 +22，并立即治疗等量生命。' },
  speed: { name: '迅捷', icon: 'boot', maxLv: 5, desc: '移动速度 +9%。' },
  power: { name: '力量', icon: 'fist', maxLv: 5, desc: '所有伤害 +12%。' },
  haste: { name: '急迫', icon: 'star', maxLv: 5, desc: '攻击速度 +10%。' },
  magnet: { name: '磁力', icon: 'magnet', maxLv: 5, desc: '经验拾取范围 +30%。' },
  crit: { name: '暴击', icon: 'bolt', maxLv: 5, desc: '暴击率 +6%，暴击伤害 +15%。' },
  armor: { name: '护甲', icon: 'armor', maxLv: 5, desc: '受到伤害 -7%。' },
  lucky: { name: '幸运', icon: 'star', maxLv: 5, desc: '经验获取 +12%，掉落概率提升。' }
};

/* ---------- 怪物 ---------- */
const MOBS = {
  zombie: {
    name: '僵尸', hp: 26, spd: 74, dmg: 9, xp: 2, size: 42, kind: 'humanoid',
    skin: { head: '#4a7a3a', hair: '#2f5222', body: '#3a6a8a', arm: '#4a7a3a', leg: '#2a3a5a', eye: '#1a2a12' }
  },
  skeleton: {
    name: '骷髅', hp: 20, spd: 78, dmg: 7, xp: 3, size: 42, kind: 'humanoid', ranged: true,
    skin: { head: '#d8d8cc', hair: '#c0c0b4', body: '#c8c8bc', arm: '#d8d8cc', leg: '#c0c0b4', eye: '#101010' }
  },
  husk: {
    name: '尸壳', hp: 42, spd: 66, dmg: 11, xp: 4, size: 44, kind: 'humanoid',
    skin: { head: '#9a8a62', hair: '#7a6a48', body: '#b0a078', arm: '#9a8a62', leg: '#8a7a58', eye: '#2a2418' }
  },
  creeper: {
    name: '苦力怕', hp: 24, spd: 96, dmg: 26, xp: 4, size: 40, kind: 'creeper', explode: true,
    skin: { body: '#5aa83a', dark: '#3f7a28', eye: '#0e140e' }
  },
  spider: {
    name: '蜘蛛', hp: 18, spd: 120, dmg: 6, xp: 3, size: 38, kind: 'spider',
    skin: { body: '#2a2420', dark: '#1a1614', eye: '#c8302a' }
  },
  slime: {
    name: '史莱姆', hp: 34, spd: 64, dmg: 8, xp: 3, size: 45, kind: 'slime', split: true,
    skin: { body: '#6ab83a', dark: '#4a8a26', eye: '#0e140e' }
  },
  witch: {
    name: '女巫', hp: 30, spd: 74, dmg: 9, xp: 5, size: 42, kind: 'humanoid', ranged: true,
    skin: { head: '#8a9a6a', hair: '#2a2a2a', body: '#5a3a6a', arm: '#8a9a6a', leg: '#3a2a4a', eye: '#c8302a' }
  },
  blaze: {
    name: '烈焰人', hp: 34, spd: 66, dmg: 8, xp: 6, size: 42, kind: 'blaze', ranged: true,
    atkCd: 3.4, shootRange: 310,   // 射得慢、射得近，给玩家留出躲避空间
    skin: { body: '#e8a020', dark: '#c07010', eye: '#fff0a0' }
  },
  wither_skeleton: {
    name: '凋灵骷髅', hp: 46, spd: 86, dmg: 14, xp: 6, size: 44, kind: 'humanoid',
    skin: { head: '#2a2a2a', hair: '#1a1a1a', body: '#333333', arm: '#2a2a2a', leg: '#242424', eye: '#c8a050' }
  },
  enderman: {
    name: '末影人', hp: 52, spd: 98, dmg: 16, xp: 7, size: 52, kind: 'humanoid', teleport: true,
    skin: { head: '#14121c', hair: '#0a0810', body: '#14121c', arm: '#14121c', leg: '#0e0c14', eye: '#c060e0' }
  },
  warden_spawn: {
    name: '幽匿蠕行', hp: 64, spd: 90, dmg: 18, xp: 8, size: 50, kind: 'humanoid',
    skin: { head: '#1c3438', hair: '#12242a', body: '#20383c', arm: '#1c3438', leg: '#16282c', eye: '#40d0c0' }
  }
};

/* ---------- 首领 ---------- */
const BOSSES = {
  plains: {
    name: '僵尸王', hpMul: 30, spd: 46, dmg: 18, size: 118, xp: 220, kind: 'humanoid',
    skin: { head: '#3f6a30', hair: '#d8b45c', body: '#2a4a6a', arm: '#3f6a30', leg: '#1e2a44', eye: '#f0d040' },
    skills: ['summon', 'charge']
  },
  forest: {
    name: '骷髅领主', hpMul: 30, spd: 58, dmg: 17, size: 114, xp: 260, kind: 'humanoid', ranged: true,
    skin: { head: '#e8e8dc', hair: '#c8a850', body: '#d0d0c4', arm: '#e8e8dc', leg: '#b8b8ac', eye: '#c8302a' },
    skills: ['volley', 'summon']
  },
  desert: {
    name: '尸壳法老', hpMul: 32, spd: 50, dmg: 21, size: 120, xp: 300, kind: 'humanoid',
    skin: { head: '#c8b070', hair: '#e8c040', body: '#d8c890', arm: '#c8b070', leg: '#a89860', eye: '#3a2a10' },
    skills: ['summon', 'quake']
  },
  caves: {
    name: '蜘蛛母巢', hpMul: 34, spd: 88, dmg: 18, size: 124, xp: 340, kind: 'spider',
    skin: { body: '#241e1a', dark: '#140e0c', eye: '#e04030' },
    skills: ['summon', 'charge']
  },
  swamp: {
    name: '史莱姆巨兽', hpMul: 38, spd: 40, dmg: 22, size: 136, xp: 380, kind: 'slime',
    skin: { body: '#5aa834', dark: '#3a7a20', eye: '#0e140e' },
    skills: ['quake', 'summon']
  },
  nether: {
    name: '烈焰人领主', hpMul: 40, spd: 54, dmg: 24, size: 124, xp: 420, kind: 'blaze', ranged: true,
    skin: { body: '#f0a820', dark: '#c07010', eye: '#fff8c0' },
    skills: ['volley', 'meteor']
  },
  end: {
    name: '末影龙', hpMul: 46, spd: 78, dmg: 28, size: 150, xp: 520, kind: 'dragon',
    skin: { body: '#1a1626', dark: '#0e0a18', eye: '#d060f0' },
    skills: ['meteor', 'charge', 'volley']
  },
  deepdark: {
    name: '监守者', hpMul: 54, spd: 64, dmg: 34, size: 142, xp: 640, kind: 'warden',
    skin: { body: '#1c3438', dark: '#0e1e22', eye: '#40e0d0' },
    skills: ['sonic', 'quake', 'charge']
  }
};

/* ---------- 难度 ---------- */
const DIFFS = [
  { name: '普通难度', hp: 1.0, dmg: 1.0, spawn: 1.0, xp: 1.0 },
  { name: '困难难度', hp: 1.5, dmg: 1.35, spawn: 1.3, xp: 1.15 },
  { name: '极限难度', hp: 2.2, dmg: 1.8, spawn: 1.6, xp: 1.35 }
];

/* ---------- 名字池 ---------- */
const NAME_POOL = [
  '史蒂夫', '艾利克斯', '赫罗布赖恩', 'Notch', '杰布', '地牢猎人',
  '铁砧', '钻石剑', '红石匠', '苔石', '末影旅人', '南瓜头',
  '守夜人', '熔岩行者', '橡木心', '三叉戟'
];
