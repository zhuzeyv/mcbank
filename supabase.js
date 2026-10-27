/* ============================================================
   赛季排行榜 + 账号系统（Supabase REST 直连，无需 SDK）
   ------------------------------------------------------------
   配置：把 url 和 anonKey 填进去即可启用云端；
        留空则自动使用本地模拟数据（方便先看效果）。
   ============================================================ */
const SB = (function () {

  const CONFIG = {
    url: 'https://vlbdguleovswmchypadd.supabase.co',
    anonKey: 'sb_publishable_OEL6dIn9SIE1efzGPP99qA_qGD2nE_9'
  };

  const AUTH_KEY = 'mc_survivors_session_v1';

  let session = null;   // { access_token, refresh_token, user }

  /* ---------- 赛季 ---------- */
  // 每 30 天一个赛季，基准日 2026-10-01
  const SEASON_BASE = Date.parse('2026-10-01T00:00:00Z');
  const SEASON_MS = 30 * 24 * 3600 * 1000;

  function currentSeason() {
    const n = Math.max(0, Math.floor((Date.now() - SEASON_BASE) / SEASON_MS));
    return {
      id: n + 1,
      name: '第 ' + (n + 1) + ' 赛季',
      start: SEASON_BASE + n * SEASON_MS,
      end: SEASON_BASE + (n + 1) * SEASON_MS
    };
  }

  function seasonCountdown() {
    const s = currentSeason();
    let ms = s.end - Date.now();
    if (ms < 0) ms = 0;
    const d = Math.floor(ms / 86400000);
    const h = Math.floor(ms % 86400000 / 3600000);
    const m = Math.floor(ms % 3600000 / 60000);
    const sec = Math.floor(ms % 60000 / 1000);
    return { d, h, m, s: sec, text: `${d} 天 ${h} 小时 ${m} 分后结束` };
  }

  /* ---------- 基础请求 ---------- */
  // 用 refresh_token 换新的 access_token（Supabase 默认 1 小时过期）
  async function refreshToken() {
    if (!session || !session.refresh_token) return false;
    try {
      const res = await fetch(CONFIG.url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'apikey': CONFIG.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data || !data.access_token) return false;
      saveSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token || session.refresh_token,
        user: session.user
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  function ready() { return !!(CONFIG.url && CONFIG.anonKey); }

  async function api(path, opts, _retried) {
    opts = opts || {};
    const headers = Object.assign({
      'apikey': CONFIG.anonKey,
      'Content-Type': 'application/json'
    }, opts.headers || {});
    // 兼容两种 key：旧版 JWT（eyJ...）和新版 publishable（sb_publishable_...）
    if (session && session.access_token) {
      headers['Authorization'] = 'Bearer ' + session.access_token;
    } else if (CONFIG.anonKey.indexOf('eyJ') === 0) {
      headers['Authorization'] = 'Bearer ' + CONFIG.anonKey;
    }

    // 超时控制：项目在悉尼，跨洋延迟 1.5s 起，移动网络容易卡死
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;

    let res;
    try {
      res = await fetch(CONFIG.url + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body,
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (e && e.name === 'AbortError') {
        throw new Error('连接超时（20 秒无响应），请检查网络后重试');
      }
      throw new Error('网络连接失败，请重试。若持续失败，可能是当前网络访问 supabase 不稳定');
    }
    if (timer) clearTimeout(timer);

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }

    if (!res.ok) {
      let msg = (data && (data.msg || data.error_description || data.message || data.hint)) || ('HTTP ' + res.status);

      // 登录态过期：自动刷新 token 后重试一次（避免用户莫名其妙被踢）
      if (res.status === 401 && !_retried && /jwt expired|token.*expired|invalid.*jwt/i.test(msg)) {
        if (await refreshToken()) return api(path, opts, true);
        saveSession(null);
        throw new Error('登录已过期，请重新登录');
      }
      // 常见错误翻译成人话
      if (/invalid format/i.test(msg)) msg = '名称格式不被接受，请换一个名字试试';
      if (/already registered|already exists/i.test(msg)) msg = '这个名称已被注册，换一个或直接登录';
      if (/Invalid login credentials/i.test(msg)) msg = '名称或密码不对';
      if (/Password should be at least/i.test(msg)) msg = '密码太短，至少 8 位';
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ---------- 账号 ---------- */
  // Supabase 默认要邮箱，这里用 用户名@mcbank.local 伪造
  // 用名字哈希生成邮箱：中文/特殊字符会导致邮箱格式非法，所以不能直接拼名字
  function emailOf(name) {
    let h = 5381;
    for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
    const ascii = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
    return 'u' + h.toString(36) + (ascii ? '.' + ascii : '') + '@example.com';
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) session = JSON.parse(raw);
    } catch (e) { session = null; }
    return session;
  }

  function saveSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s));
      else localStorage.removeItem(AUTH_KEY);
    } catch (e) {}
  }

  function currentUser() {
    return session ? session.user : null;
  }

  async function signUp(name, password) {
    const data = await api('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ email: emailOf(name), password, data: { trainer_name: name } })
    });
    if (!data || !data.access_token) {
      // 项目开启了邮箱验证时不会有 token
      throw new Error('注册成功但需要邮箱验证，请在 Supabase 关闭 Confirm email');
    }
    saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: { id: data.user.id, name }
    });
    await ensureProfile(name);
    return session.user;
  }

  async function signIn(name, password) {
    const data = await api('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: emailOf(name), password })
    });
    if (!data || !data.access_token) throw new Error('登录失败');
    const nm = (data.user && data.user.user_metadata && data.user.user_metadata.trainer_name) || name;
    saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: { id: data.user.id, name: nm }
    });
    return session.user;
  }

  function signOut() { saveSession(null); }

  async function ensureProfile(name) {
    if (!session) return;
    try {
      await api('/rest/v1/profiles', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: session.user.id, trainer_name: name })
      });
    } catch (e) { /* 已存在就忽略 */ }
  }

  /* ---------- 进度云同步 ---------- */
  async function loadCloudProgress() {
    if (!ready() || !session) return null;
    try {
      const rows = await api(
        `/rest/v1/profiles?id=eq.${session.user.id}&select=cleared,cleared_hard,stats,equipment`
      );
      if (Array.isArray(rows) && rows.length) return rows[0];
    } catch (e) {}
    return null;
  }

  async function saveCloudProgress(cleared, clearedHard, stats, equipment) {
    if (!ready() || !session) return false;
    try {
      await api(`/rest/v1/profiles?id=eq.${session.user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          cleared: cleared || [],
          cleared_hard: clearedHard || [],
          stats: stats || {},
          equipment: equipment || {}
        })
      });
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 排行榜 ---------- */
  async function getLeaderboard(seasonId, limit) {
    limit = limit || 100;
    if (!ready()) return mockBoard(seasonId, limit);

    // 多拉一些原始记录，再按玩家去重（每人只留本赛季最高分）
    const raw = await api(
      `/rest/v1/runs?select=user_id,trainer_name,score,kills,level,zone,created_at` +
      `&season=eq.${seasonId}&order=score.desc&limit=${Math.min(1000, limit * 6)}`
    );
    const rows = Array.isArray(raw) ? raw : [];

    const best = new Map();
    for (const r of rows) {
      // 按「名字」去重而不是 user_id：
      // 同一个名字在历史上可能对应多个账号（邮箱生成方式变过），
      // 排行榜展示的是玩家名，所以同名只留最高分。
      const nm = (r.trainer_name || '').trim().toLowerCase();
      const key = nm || ('uid:' + r.user_id);
      const prev = best.get(key);
      if (!prev || (r.score || 0) > (prev.score || 0)) best.set(key, r);
    }
    return Array.from(best.values())
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);
  }

  async function submitRun(run) {
    if (!ready()) return { local: true };
    if (!session) throw new Error('未登录，成绩只保存在本地');
    return api('/rest/v1/runs', {
      method: 'POST',
      body: JSON.stringify(Object.assign({}, run, { user_id: session.user.id }))
    });
  }

  /* ---------- 未配置时的模拟数据 ---------- */
  const MOCK_NAMES = [
    '方块猎人', 'Steve_2026', '红石匠', '末影旅人', '苦力怕克星', '钻石剑客',
    '南瓜头', '苔石', '熔岩行者', '橡木心', '三叉戟', '铁砧',
    'Notch', 'Jeb', '地牢猎人', '守夜人', '深暗回声', '虚空漫步者',
    '基岩之下', '附魔师', '雪原孤狼', '海晶守卫', '紫颂果', '潜影贝',
    '下界合金', '鞘翅飞行', '信标之光', '命令方块', '结构空位', '重生锚'
  ];

  function mockBoard(seasonId, limit) {
    const seed = seasonId * 7919;
    const out = [];
    for (let i = 0; i < Math.min(limit, MOCK_NAMES.length); i++) {
      const base = 52000 - i * 1730 - ((seed + i * 337) % 900);
      out.push({
        trainer_name: MOCK_NAMES[(i + seed) % MOCK_NAMES.length],
        score: Math.max(1200, base),
        kills: Math.round(base / 12),
        level: 20 - Math.floor(i / 3),
        zone: 'plains',
        mock: true
      });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  loadSession();

  return {
    CONFIG, ready, currentSeason, seasonCountdown,
    currentUser, signUp, signIn, signOut,
    loadCloudProgress, saveCloudProgress,
    getLeaderboard, submitRun,
    isMock: () => !ready()
  };
})();

window.SB = SB;
