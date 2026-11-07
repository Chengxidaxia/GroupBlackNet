// ============================================================
// status.js — Vercel Function：服务状态数据（只读）
// ------------------------------------------------------------
// 数据来源：CF Worker `status-probe` 每 2 分钟探测一次，
//           写进 Upstash Redis 的单个键 bn:status:v1。
//           本函数只负责把它读出来给页面用，不做任何写操作。
//
// 页面：独立项目 status/（部署在 status.blacknet.cc.cd，自带同名函数；
//       本项目这个接口只作为它的上游备用数据源，主站本身没有状态页）
//
// 响应：
//   { ok:true,  source:'upstash', updated, seq, intervalSec, services[], hist[], days{} }
//   { ok:false, reason:'no-upstash' | 'no-data' | 'read-failed', ... }
//
// 缓存 30 秒：探测本身 2 分钟一次，压住 Upstash 的读取次数。
// ============================================================

const KEY = 'bn:status:v1';

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
  if (!kv) {
    return send(res, 200, {
      ok: false,
      reason: 'no-upstash',
      hint: 'Vercel 项目缺 UPSTASH_REDIS_REST_URL / _TOKEN 环境变量',
      time: new Date().toISOString(),
    }, 'no-store');
  }

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
    return send(res, 200, {
      ok: false,
      reason: 'read-failed',
      error: String((e && e.message) || e).slice(0, 200),
      kvHost: kv.host,
      time: new Date().toISOString(),
    }, 'no-store');
  }
}
