// 一次性：创建 ProxyBlackNet 仓库并初始化推送 vercel-proxy/
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const envTxt = fs.readFileSync('K:/GroupBlackNet/backend/.env', 'utf8');
const TOKEN = (envTxt.match(/^GITHUB_TOKEN\s*=\s*["']?([^\s"']+)["']?\s*$/m) || [])[1];
if (!TOKEN) { console.error('no token'); process.exit(1); }
const H = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', 'User-Agent': 'gbn-setup' };

async function main() {
  // 1. 建仓库（已存在则忽略 422）
  let r = await fetch('https://api.github.com/user/repos', {
    method: 'POST', headers: H,
    body: JSON.stringify({ name: 'ProxyBlackNet', description: 'Whitelist generic proxy on Vercel (git-push deploy)', private: false, auto_init: false }),
  });
  const j = await r.json();
  console.log('create repo:', j.full_name || (j.errors ? 'already exists' : j.message));

  // 2. 准备本地 git 仓库
  const dir = 'K:/GroupBlackNet/vercel-proxy';
  execSync('git init -b main', { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(dir + '/.gitignore', 'node_modules\n.vercel\n.env\n');
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync('git -c user.email=bot@blacknet.cc.cd -c user.name=gbn-bot commit -m "whitelist proxy: vercel function + allowlist + token auth"', { cwd: dir, stdio: 'pipe' });
  // 3. 推送（用 token 走 HTTPS）
  const url = 'https://x-access-token:' + TOKEN + '@github.com/Chengxidaxia/ProxyBlackNet.git';
  execSync('git remote remove origin 2>nul & git remote add origin ' + url, { cwd: dir, shell: 'cmd.exe', stdio: 'pipe' });
  execSync('git push -u origin main', { cwd: dir, stdio: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  console.log('pushed to Chengxidaxia/ProxyBlackNet');
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
