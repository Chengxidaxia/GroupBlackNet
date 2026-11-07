// ============================================================
// status/api/status.js — 服务状态数据（只读，独立项目）
// ------------------------------------------------------------
// 数据来源：CF Worker `status-probe` 每 2 分钟探测一次，
//           写进 Upstash Redis 的单个键 bn:status:v1。
//           本函数只负责读出来给页面用，绝不写。
//
// 两条取数路径（自动选择，无需开关）：
//   1) 本项目配了 UPSTASH_REDIS_REST_URL/_TOKEN → 直连 Upstash（首选，最独立）
//   2) 没配 → 回退到主站只读接口 https://grp.blacknet.cc.cd/api/status
//      好处：新项目刚建就能出数据，不必再复制一遍密钥；
//      想彻底断开与主站的依赖，去 Vercel 项目里补两个环境变量即可。
//
// 响应：
//   { ok:true, source:'upstash'|'upstream', updated, seq, intervalSec, services[], hist[], days{} }
//   { ok:false, reason:'no-data' | 'read-failed', ... }
//
// 缓存 30 秒：探测本身 2 分钟一次，压住 Upstash 的读取次数。
// ============================================================

const KEY = 'bn:status:v1';
const UPSTREAM = process.env.STATUS_UPSTREAM || 'https://grp.blacknet.cc.cd/api/status';
const TIMEOUT_MS = 8000;

function makeKV(env) {
  const base = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || env.KV_URL || '';
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN
    || env.KV_REST_API_READ_ONLY_TOKEN || '';
  if (!base || !token) return null;
  const get = async (k) => {
    const r = await fetch(base, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(['get', k]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const j = await r.json().catch(() => ({}));
    if (j && j.error) throw new Error(j.error);
    return j ? j.result : null;
  };
  let host = '';
  try { host = new URL(base).host; } catch (e) { host = ''; }
  return { get, host };
}

function send(res, status, obj, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(obj));
}

// 主站同源接口：拿到的结构与直连 Upstash 完全一致，只把 source 标清楚
async function fromUpstream() {
  const r = await fetch(UPSTREAM + '?t=' + Date.now(), {
    headers: { 'X-Status-Proxy': 'status.blacknet.cc.cd' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error('upstream HTTP ' + r.status);
  const doc = await r.json();
  if (!doc || doc.ok !== true) return doc || { ok: false, reason: 'no-data' };
  return Object.assign(doc, { servedBy: 'upstream' });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.end();
  }
  if (req.method !== 'GET') return send(res, 405, { ok: false, reason: 'method-not-allowed' });

  const kv = makeKV(process.env);

  // ---- 路径 1：直连 Upstash ----
  if (kv) {
    try {
      const raw = await kv.get(KEY);
      if (!raw) {
        return send(res, 200, {
          ok: false,
          reason: 'no-data',
          hint: '还没有探测数据：确认 status-probe Worker 已部署、cron 已触发、密钥与被读的是同一个 Upstash 库',
          kvHost: kv.host,
          time: new Date().toISOString(),
        }, 's-maxage=10, stale-while-revalidate=30');
      }
      const doc = JSON.parse(raw);
      return send(res, 200, Object.assign({ ok: true, source: 'upstash', kvHost: kv.host }, doc),
        'public, s-maxage=30, stale-while-revalidate=120');
    } catch (e) {
      // 直连失败不要直接报错，先试试上游还能不能给
      try {
        const doc = await fromUpstream();
        return send(res, 200, doc, 'public, s-maxage=30, stale-while-revalidate=120');
      } catch (e2) {
        return send(res, 200, {
          ok: false,
          reason: 'read-failed',
          error: String((e && e.message) || e).slice(0, 200),
          kvHost: kv.host,
          time: new Date().toISOString(),
        }, 'no-store');
      }
    }
  }

  // ---- 路径 2：没配密钥 → 走主站只读接口 ----
  try {
    const doc = await fromUpstream();
    const cache = doc.ok === true
      ? 'public, s-maxage=30, stale-while-revalidate=120'
      : 's-maxage=10, stale-while-revalidate=30';
    return send(res, 200, doc, cache);
  } catch (e) {
    return send(res, 200, {
      ok: false,
      reason: 'no-upstash',
      error: String((e && e.message) || e).slice(0, 200),
      hint: '本项目没配 UPSTASH_REDIS_REST_URL/_TOKEN，且回退上游 ' + UPSTREAM + ' 也不可达',
      time: new Date().toISOString(),
    }, 'no-store');
  }
}
