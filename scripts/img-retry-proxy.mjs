// 经 Netlify 代理补抓最后 2 张图并上传 pixhost
import fs from 'node:fs';
const MAP = 'K:/GroupBlackNet/_img-migrate/imgmap.json';
const FILES = 'K:/GroupBlackNet/_img-migrate/files';
const targets = [
  'https://img.blacknet.cc.cd/1786679560892-0a79fced858474b8160b48a1129b3df2.png',
  'https://img.blacknet.cc.cd/1786336115019-ed3e2d61ccb081bf276a38eb9a1cb204.png',
];
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));

async function pixhost(buf, name) {
  const fd = new FormData();
  fd.append('content_type', '0'); fd.append('max_th_size', '420');
  fd.append('img', new Blob([buf]), name);
  const up = await fetch('https://api.pixhost.to/images', { method: 'POST', body: fd, headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  const j = await up.json();
  const sp = await fetch(j.show_url, { signal: AbortSignal.timeout(60000) });
  const t = await sp.text();
  const dm = t.match(/https:\/\/[a-z0-9.]+\.pixhost\.to\/images\/[^\s"'<>]+/i);
  if (!dm) throw new Error('show 页未解析到直链');
  return { show_url: j.show_url, th_url: j.th_url, direct: dm[0], size: buf.length, at: new Date().toISOString() };
}

for (const u of targets) {
  const name = u.split('/').pop();
  if (map[u]) { console.log(name, '已有，跳过'); continue; }
  try {
    const r = await fetch('https://grp.blacknet.cc.cd/proxy/' + u.replace('https://', ''), { signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error('代理下载 ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(name.slice(0, 32), '下载 OK', buf.length, 'B');
    const rec = await pixhost(buf, name);
    map[u] = rec;
    fs.writeFileSync(MAP, JSON.stringify(map, null, 2));
    fs.writeFileSync(FILES + '/' + name.replace(/[^\w.-]/g, '_'), buf);
    console.log('→', rec.direct);
    await new Promise(r2 => setTimeout(r2, 2000));
  } catch (e) { console.log(name.slice(0, 32), 'FAIL', e.message); }
}
console.log('map 共', Object.keys(map).length, '/ 54 张');
