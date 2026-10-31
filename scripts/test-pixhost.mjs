// test-pixhost.mjs — pixhost.to API 连通性测试
import fs from 'node:fs';

const buf = fs.readFileSync('K:/GroupBlackNet/img/pole.jpg');
const fd = new FormData();
fd.append('content_type', '0');
fd.append('max_th_size', '420');
fd.append('img', new Blob([buf]), 'pole.jpg');

const r = await fetch('https://api.pixhost.to/images', {
  method: 'POST', body: fd, headers: { Accept: 'application/json' },
  signal: AbortSignal.timeout(60000),
});
console.log('upload status:', r.status);
const j = await r.json().catch(() => null);
console.log('resp:', JSON.stringify(j));

if (j && j.show_url) {
  const p = await fetch(j.show_url, { signal: AbortSignal.timeout(60000) });
  const t = await p.text();
  const m = t.match(/https:\/\/[a-z0-9.]+\.pixhost\.to\/images\/[^\s"'<>]+/i);
  console.log('show page status:', p.status);
  console.log('direct link:', m && m[0]);
}
