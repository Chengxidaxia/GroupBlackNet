// oauth.js — Vercel Function：GitHub OAuth 全量（/api/oauth/*）
import { toWebRequest, sendResponse } from './_lib.mjs';
import { handleOauth } from '../netlify/functions/oauth-core.mjs';

export default async function handler(req, res) {
  try {
    const r = await handleOauth(toWebRequest(req), process.env);
    await sendResponse(res, r);
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
}
