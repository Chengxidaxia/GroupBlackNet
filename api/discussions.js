// discussions.js — Vercel Function：Discussions 只读代理（/api/discussions/*）
import { toWebRequest, sendResponse } from './_lib.mjs';
import { handleApi } from '../netlify/functions/api-core.mjs';

export default async function handler(req, res) {
  try {
    const r = await handleApi(toWebRequest(req), process.env);
    await sendResponse(res, r);
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
}
