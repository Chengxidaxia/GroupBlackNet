// api.mjs — Netlify Function：Discussions 只读代理（/api/discussions/*）
import { handleApi } from './api-core.mjs';

export default async (req) => handleApi(req, process.env);
