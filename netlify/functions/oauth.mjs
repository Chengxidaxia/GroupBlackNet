// oauth.mjs — Netlify Function：GitHub OAuth 全量（/api/oauth/*）
import { handleOauth } from './oauth-core.mjs';

export default async (req) => handleOauth(req, process.env);
