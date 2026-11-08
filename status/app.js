/* ============================================================
   app.js — 状态页渲染（沿用主站那套 .st-* 结构与样式）
   ------------------------------------------------------------
   数据来自同源 /api/status，页面每 30 秒拉一次，标签页隐藏时暂停。

   状态口径（比「正常/异常」细一档）：
     正常 up        2xx/3xx 且耗时低于阈值
     偏慢 slow      成功但超过 SLOW_MS（可用率仍算成功，只做提示）
     超时 timeout   10 秒内无响应
     解析失败 dns   域名解析不出地址
     证书错误 tls   TLS 握手 / 证书校验失败
     连接失败 connect  TCP 连不上或被重置
     服务端错误 http5  5xx
     客户端错误 http4  4xx
     未知错误 error
   历史位串可能是 0/1/2（0=异常 1=正常 2=偏慢），老数据只有 0/1，按兼容处理。
   ============================================================ */
(function () {
  'use strict';

  var API = '/api/status';
  var SLOT_MS = 120000;     // 探测间隔，与 Worker 的 SLOT_MS 一致
  var DAY_MS = 86400000;
  var WINDOW_SLOTS = Math.round(DAY_MS / SLOT_MS);   // 一天 720 个探测点
  var TZ_MS = 8 * 3600 * 1000;   // 日聚合按 UTC+8 分天
  var POLL_MS = 30000;
  var NEW_WINDOW = 12 * 3600 * 1000;   // 上线不足 12 小时按「数据累积中」处理
  var SLOW_MS = 1500;                  // 老数据没有 level 时按这个阈值判定偏慢
  // 相邻两次故障之间空档不超过这个宽度，就算同一次故障（时间合并成一段）
  var MERGE_GAP_MS = 10 * 60000;       // 10 分钟 = 5 个探测点
  var state = { doc: null, timer: null, ticker: null, barsScroll: null, barSyncing: false };

  /* ---------- 状态字典 ---------- */
  var LEVELS = {
    up:      { label: '正常',     tone: 'up',   desc: '响应正常' },
    slow:    { label: '偏慢',     tone: 'slow', desc: '请求成功，但超过 1.5 秒' },
    timeout: { label: '超时',     tone: 'down', desc: '10 秒内没有响应' },
    dns:     { label: '解析失败', tone: 'down', desc: '域名解析不出地址' },
    tls:     { label: '证书错误', tone: 'down', desc: 'TLS 握手或证书校验失败' },
    connect: { label: '连接失败', tone: 'down', desc: 'TCP 连不上或被重置' },
    http5:   { label: '服务端错误', tone: 'down', desc: '返回 5xx' },
    http4:   { label: '客户端错误', tone: 'down', desc: '返回 4xx' },
    error:   { label: '未知错误', tone: 'down', desc: '其他失败原因' },
    down:    { label: '异常',     tone: 'down', desc: '探测失败' },
    unknown: { label: '无数据',   tone: 'none', desc: '还没探测到' }
  };
  function levelMeta(lv) { return LEVELS[lv] || LEVELS.error; }
  function toneOf(lv) { return levelMeta(lv).tone; }

  // 与 Worker 的 levelOf 同一套判定：新数据直接用 services[].level，
  // 老数据（只有 ok/ms/code/err）在前端现算，避免页面显示退化成「异常」。
  function levelOf(s) {
    if (s && s.level && LEVELS[s.level]) return s.level;
    if (s && s.ok) return ((s.ms || 0) >= SLOW_MS) ? 'slow' : 'up';
    var e = String((s && s.err) || '');
    if (/abort|timeout|timed out|ETIMEDOUT/i.test(e)) return 'timeout';
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|dns/i.test(e)) return 'dns';
    if (/certificate|CERT_|SSL|TLS|handshake|self.signed/i.test(e)) return 'tls';
    if (/ECONNREFUSED|ECONNRESET|ECONNABORTED|connect|network|fetch failed/i.test(e)) return 'connect';
    var c = (s && s.code) || 0;
    if (c >= 500) return 'http5';
    if (c >= 400) return 'http4';
    return 'error';
  }

  /* ---------- 分组：按 id 静态映射（不依赖 Worker 的 group 字段，
       改这里就能立刻生效，不用等下一次探测写库） ---------- */
  var GROUPS = [
    { id: 'web',   label: '主站页面' },
    { id: 'book',  label: '书阁页面' },
    { id: 'api',   label: '接口与自检' },
    { id: 'asset', label: '资源与书目' },
    { id: 'ext',   label: '外部依赖' }
  ];
  var ID_GROUP = {
    'grp': 'web',
    'grp-archive': 'web', 'grp-edit': 'web', 'grp-about': 'web',
    'grp-contact': 'web', 'grp-sponsor': 'web', 'grp-subscribe': 'web',
    'book': 'book', 'book-books': 'book', 'book-shelf': 'book', 'book-works': 'book',
    'book-read': 'book', 'book-write': 'book', 'book-editor': 'book', 'book-collect': 'book',
    'grp-api': 'api', 'grp-feed': 'api', 'grp-fn': 'api', 'grp-content': 'api',
    'book-api': 'api',
    'grp-css': 'asset', 'book-index': 'asset', 'book-cdn': 'asset', 'gh-raw': 'asset',
    'gh-api': 'ext'
  };
  // 角色标签：让「分类」在每张卡片上也能看见，不只是一个分组标题
  var ID_ROLE = {
    web: '页面', book: '页面', api: '接口', asset: '资源', ext: '外部'
  };
  function groupOf(s) {
    var g = ID_GROUP[s.id];
    if (g) return g;
    // 未登记的新项：退回 Worker 的 group，再退回 id 前缀猜测
    var old = s.group || '';
    if (old === 'site' || old === 'web') return 'web';
    if (old === 'book') return 'book';
    if (old === 'api') return 'api';
    if (old === 'asset') return 'asset';
    if (old === 'ext') return 'ext';
    if (/^book/.test(s.id)) return 'book';
    if (/^(gh|ext)/.test(s.id)) return 'ext';
    return 'web';
  }
  function groupOrder(g) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === g) return i;
    return GROUPS.length;
  }
  function groupLabel(g) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === g) return GROUPS[i].label;
    return '其他';
  }
  // 显示顺序（按分组、组内保持 TARGETS 原序）。返回的永远是原始索引 —— 位串靠它对齐
  function orderedIndices(doc) {
    var idx = doc.services.map(function (_, i) { return i; });
    idx.sort(function (a, b) {
      var ga = groupOrder(groupOf(doc.services[a]));
      var gb = groupOrder(groupOf(doc.services[b]));
      return ga !== gb ? ga - gb : a - b;
    });
    return idx;
  }

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function p2(x) { return (x < 10 ? '0' : '') + x; }
  function pct(up, total) {
    if (!total) return null;
    return Math.round((up / total) * 1000) / 10;
  }
  function fmtPct(v) {
    if (v == null) return '—';
    return (v >= 100 ? '100' : v.toFixed(1).replace(/\.0$/, '')) + '%';
  }
  function ago(ms) {
    if (!ms) return '—';
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s + ' 秒前';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' 分钟前';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' 小时前';
    return Math.round(h / 24) + ' 天前';
  }
  function hostOf(u) {
    try { return new URL(u).host + (new URL(u).pathname === '/' ? '' : new URL(u).pathname); } catch (e) { return u || ''; }
  }

  /* ---------- 时间格式 ----------
     区间一律用半角 ~；同一天省略后一半的日期：11-08 14:20 ~ 14:32
  ------------------------------------ */
  function mdhm(ts) {
    var d = new Date(ts);
    return p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function hm(ts) {
    var d = new Date(ts);
    return p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function fmtRange(from, to) {
    if (!from) return '';
    if (!to || to <= from) return mdhm(from);
    var sameDay = new Date(from).toDateString() === new Date(to).toDateString();
    return mdhm(from) + ' ~ ' + (sameDay ? hm(to) : mdhm(to));
  }
  // 持续时长：不足 1 分钟按 1 分钟算（一个探测周期就是 2 分钟，别显示 0）
  function durText(ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + ' 分钟';
    var h = Math.floor(m / 60), mm = m % 60;
    if (h < 24) return h + ' 小时' + (mm ? ' ' + mm + ' 分钟' : '');
    var d = Math.floor(h / 24), hh = h % 24;
    return d + ' 天' + (hh ? ' ' + hh + ' 小时' : '');
  }
  // 耗时：1 秒以上换成秒（向下取整，避免 1495ms 显示成「1.5 秒」却判正常）；
  // 别显示 10000 ms 这种一眼看不出量级的数
  function msText(ms) {
    var v = ms || 0;
    if (v >= 1000) return (Math.floor(v / 100) / 10) + ' 秒';
    return v + ' ms';
  }

  /* ---------- 把 hist 按「时间」切成 BARS 个桶 ---------- */
  // 数据可能还不满 24 小时。窗口取「实际数据跨度」与 24 小时中较小的那个，
  // 桶在整个窗口上均匀分布 —— 条形因此连续铺满整行，不会左半边一片空白。
  // 桶值：'up' 正常 / 'slow' 偏慢 / 'minor' 性能下降 / 'down' 异常 / null 无数据。
  // 以前是「取最差」：一个桶里十几个槽只要掉 1 次，整桶就标红。
  // 现在按失败占比分档 —— 失败 ≤ 一半算「性能下降」（黄），超过一半才算异常（红）。
  var MINOR_RATIO = 0.5;
  function chKind(ch) { return ch === '1' ? 'up' : (ch === '2' ? 'slow' : 'down'); }

  function bucketize(doc, BARS) {
    var n = doc.services.length;
    var since = doc.since || [];
    var hist = (doc.hist || []).filter(function (h) { return Array.isArray(h) && typeof h[1] === 'string'; });
    hist.sort(function (a, b) { return a[0] - b[0]; });
    var buckets = [];
    var spans = [];                                  // 每个桶的时间范围（做 tooltip 用）
    var fails = [];                                  // 每个桶里的失败次数（做 tooltip 用）
    var bags = [];                                   // [桶][项] = { up, slow, bad, tot }
    for (var b = 0; b < BARS; b++) {
      var row = [], bagRow = [];
      for (var i = 0; i < n; i++) { row.push(null); bagRow.push(null); }
      buckets.push(row);
      bags.push(bagRow);
      spans.push(null);
      fails.push(0);
    }
    if (!hist.length) return { buckets: buckets, hist: hist, spans: spans, fails: fails, spanMs: 0 };
    var newest = hist[hist.length - 1][0];
    var per = Math.max(1e-6, WINDOW_SLOTS / BARS);   // 每桶包含多少个 2 分钟槽（可为小数）
    for (var j = 0; j < hist.length; j++) {
      var slot = hist[j][0];
      var back = newest - slot;                      // 距最新一个槽多少个槽
      if (back < 0 || back >= WINDOW_SLOTS) continue; // 超出 24 小时
      var bi = BARS - 1 - Math.floor(back / per);
      if (bi < 0) bi = 0;
      if (bi >= BARS) bi = BARS - 1;
      var at = slot * SLOT_MS;
      var cur = spans[bi];
      if (!cur) spans[bi] = { from: at, to: at };
      else { if (at < cur.from) cur.from = at; if (at > cur.to) cur.to = at; }
      var bitstr = hist[j][1];
      for (var s = 0; s < n; s++) {
        // 该项上线之前的时段不算（新增目标不该拖累历史）
        if (since[s] && at < since[s]) continue;
        var ch = bitstr.charAt(s);
        // 新增探测项后，旧位串里没有这一位 → 跳过，桶保持 null
        if (ch !== '0' && ch !== '1' && ch !== '2') continue;
        var kind = chKind(ch);
        var bag = bags[bi][s];
        if (!bag) bag = bags[bi][s] = { up: 0, slow: 0, bad: 0, tot: 0 };
        bag.tot++;
        if (kind === 'down') { bag.bad++; fails[bi]++; }
        else if (kind === 'slow') bag.slow++;
        else bag.up++;
      }
    }
    // 汇总成档位：一次没失败 → 正常/偏慢；有小比例失败 → 性能下降；失败过半 → 异常
    for (var bb = 0; bb < BARS; bb++) {
      for (var ss = 0; ss < n; ss++) {
        var g = bags[bb][ss];
        if (!g || !g.tot) continue;
        var frac = g.bad / g.tot;
        buckets[bb][ss] = frac === 0 ? (g.slow ? 'slow' : 'up')
          : (frac > MINOR_RATIO ? 'down' : 'minor');
      }
    }
    return { buckets: buckets, hist: hist, spans: spans, fails: fails, spanMs: WINDOW_SLOTS * SLOT_MS };
  }

  /* ---------- 可用率分母 ----------
     监控项是陆续加进来的，某天 12:00 才上线的项当天只有一半样本。
     有 cnt（Worker 记的真实样本数）就用它；老数据没有 cnt，
     按 since 与当天时间窗的重叠比例折算，绝不拿全天轮次当分母。
  ------------------------------------ */
  function dayStartOf(key) {
    return Date.parse(key + 'T00:00:00Z') - TZ_MS;   // 该日 UTC+8 0 点
  }
  function sampleCount(day, i, sinceTs, key) {
    if (Array.isArray(day.cnt) && typeof day.cnt[i] === 'number') return day.cnt[i] || 0;
    var n = day.n || 0;
    if (!n) return 0;
    if (!sinceTs || !key) return n;
    var start = dayStartOf(key);
    var end = start + DAY_MS;
    if (sinceTs >= end) return 0;
    if (sinceTs <= start) return n;
    return Math.round(n * (end - sinceTs) / DAY_MS);
  }

  /* ---------- 单项的 24 小时 / 近 7 天可用率 ---------- */
  function metrics(doc, bk, i) {
    var sinceTs = (doc.since && doc.since[i]) || 0;
    var up = 0, total = 0, slow = 0, down = 0;
    bk.hist.forEach(function (h) {
      if (sinceTs && h[0] * SLOT_MS < sinceTs) return;
      var ch = h[1].charAt(i);
      if (ch === '1') { up++; total++; } else if (ch === '2') { up++; total++; slow++; } else if (ch === '0') { total++; down++; }
    });
    var days = doc.days || {};
    var keys = Object.keys(days).sort().slice(-7);
    var up7 = 0, n7 = 0;
    keys.forEach(function (k) {
      var d = days[k] || {};
      up7 += (d.ok && d.ok[i]) || 0;
      n7 += sampleCount(d, i, sinceTs, k);
    });
    return {
      h24: pct(up, total), d7: n7 >= 5 ? pct(up7, n7) : null,
      n7: n7, h24n: total, slow: slow, down: down
    };
  }

  /* ---------- 状态序列（按时间升序） ---------- */
  function seriesOf(doc, i) {
    var sinceTs = (doc.since && doc.since[i]) || 0;
    var hist = (doc.hist || []).filter(function (h) { return Array.isArray(h) && typeof h[1] === 'string'; });
    hist.sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    hist.forEach(function (h) {
      var t = h[0] * SLOT_MS;
      if (sinceTs && t < sinceTs) return;
      var ch = h[1].charAt(i);
      if (ch !== '0' && ch !== '1' && ch !== '2') return;
      out.push({ t: t, bad: ch === '0', slow: ch === '2' });
    });
    return out;
  }

  /* ---------- 当前这一段状态：起始时刻 / 最近成功 / 失败次数 ---------- */
  function streakOf(doc, i) {
    var s = seriesOf(doc, i);
    if (!s.length) return null;
    var last = s[s.length - 1];
    var since = null, lastUp = null, bad = 0;
    if (last.bad) {
      var k = s.length - 1;
      while (k >= 0 && s[k].bad) k--;
      since = s[k + 1].t;                    // 连续异常的起点（末尾一段仍在持续）
    }
    for (var j = s.length - 1; j >= 0; j--) {
      if (!s[j].bad) { lastUp = s[j].t; break; }
    }
    s.forEach(function (x) { if (x.bad) bad++; });
    return { bad: last.bad, slow: last.slow, since: since, lastUp: lastUp, badCount: bad, samples: s.length };
  }
  // 近 24 小时的故障段（连续异常），新的在前
  function segmentsOf(doc, i) {
    var s = seriesOf(doc, i), segs = [], cur = null;
    s.forEach(function (x) {
      if (x.bad) {
        if (!cur) cur = { from: x.t, to: x.t };
        else cur.to = x.t;
      } else if (cur) { segs.push(cur); cur = null; }
    });
    if (cur) segs.push(cur);
    return segs;
  }

  /* ---------- 顶部横幅 ---------- */
  function renderBanner(doc) {
    var el = $('stBanner');
    var title = $('stBannerTitle');
    var sub = $('stBannerSub');
    if (!doc) return;
    var tail = ' · 最后检测 <span class="st-ago">' + ago(doc.updated) + '</span>';
    var bad = [], slow = [];
    doc.services.forEach(function (s) {
      var lv = levelOf(s);
      if (lv === 'slow') slow.push(s);
      else if (lv !== 'up') bad.push({ s: s, lv: lv });
    });
    if (!bad.length && !slow.length) {
      el.setAttribute('data-state', 'up');
      title.textContent = '全部服务正常';
      sub.innerHTML = doc.services.length + ' 项检查全部通过' + tail;
      return;
    }
    if (!bad.length) {
      el.setAttribute('data-state', 'slow');
      title.textContent = slow.length + ' 项响应偏慢';
      sub.innerHTML = esc(slow.map(function (s) { return s.name; }).join('、'))
        + ' · 请求成功但超过 1.5 秒' + tail;
      return;
    }
    // 有异常：按故障类型归类统计，横幅上就能看出是哪一类
    var byLv = {};
    bad.forEach(function (x) { byLv[x.lv] = (byLv[x.lv] || 0) + 1; });
    var kinds = Object.keys(byLv).map(function (lv) {
      return byLv[lv] + ' 项' + levelMeta(lv).label;
    }).join('、');
    if (bad.length === doc.services.length) {
      el.setAttribute('data-state', 'down');
      title.textContent = '全部服务异常';
      sub.innerHTML = kinds + ' · 可能是网络或数据源整体故障' + tail;
    } else {
      el.setAttribute('data-state', 'down');
      title.textContent = bad.length + ' 项服务异常';
      sub.innerHTML = kinds + '：' + esc(bad.map(function (x) { return x.s.name; }).join('、'))
        + (slow.length ? '（另有 ' + slow.length + ' 项偏慢）' : '') + tail;
    }
  }

  /* ---------- 服务卡片 ---------- */
  // 右侧第一行的短文本：正常给耗时，异常给最有信息量的那一个
  function shortText(s, lv) {
    var m = levelMeta(lv);
    if (lv === 'up') return msText(s.ms);
    if (lv === 'slow') return msText(s.ms);
    if (lv === 'http4' || lv === 'http5') return 'HTTP ' + (s.code || '—');
    if (lv === 'timeout') return '10 秒无响应';
    return m.label;
  }

  function detailBlock(doc, s, lv, m, st) {
    if (lv === 'up') return '';
    // 偏慢：角色行已经写了含义，这里只补数字，别把同一句话重复两遍
    if (lv === 'slow') {
      return '<div class="st-detail" data-lv="slow">'
        + '<div class="st-detail-main"><b>偏慢</b><span>成功但耗时 ' + esc(msText(s.ms))
        + '（阈值 ' + esc(msText(SLOW_MS)) + '）</span></div>'
        + (s.err ? '<code class="st-detail-err">' + esc(s.err) + '</code>' : '')
        + '</div>';
    }
    var when = st && st.since ? st.since : 0;
    var held = when ? Math.max(SLOT_MS, doc.updated - when + SLOT_MS) : 0;
    var meta = [];
    if (held) meta.push('已持续 ' + durText(held) + '（自 ' + fmtRange(when) + ' 起）');
    if (st && st.lastUp) meta.push('最近成功 ' + ago(st.lastUp));
    if (st && st.badCount) meta.push('24h 内失败 ' + st.badCount + ' / ' + st.samples + ' 次');
    var raw = s.err ? String(s.err) : ((s.code ? 'HTTP ' + s.code + ' ' : '') + m.desc);
    return '<div class="st-detail" data-lv="' + lv + '">'
      + '<div class="st-detail-main"><b>' + esc(m.label) + '</b><span>' + esc(m.desc) + '</span></div>'
      + (meta.length ? '<div class="st-detail-meta">' + esc(meta.join(' · ')) + '</div>' : '')
      + (raw ? '<code class="st-detail-err">' + esc(raw) + '</code>' : '')
      + '</div>';
  }

  function cardOf(doc, bk, s, i, geom) {
    var m = metrics(doc, bk, i);
    var sinceTs = (doc.since && doc.since[i]) || 0;
    var isNew = sinceTs ? (Date.now() - sinceTs < NEW_WINDOW) : false;
    var lv = levelOf(s);
    var lm = levelMeta(lv);
    var st = streakOf(doc, i);

    // 已填过数据的桶数：再兜一层，位串里没这一位时也不把它当正常
    var filled = 0;
    bk.buckets.forEach(function (row) { if (row[i] !== null) filled++; });
    if (!isNew && filled > 0 && filled < 6) isNew = true;

    // SVG 1:1 绘制：全整数坐标（条宽 3/2px，间隔 1px），间隔绝对均匀
    var step = geom.w + geom.g;
    var rects = '';
    for (var bi = 0; bi < bk.buckets.length; bi++) {
      var v = bk.buckets[bi][i];
      var x = bi * step;
      var g2 = 'x="' + x + '" y="0" width="' + geom.w + '" height="24" rx="1.5"';
      var sp = bk.spans && bk.spans[bi];
      var when = sp ? fmtRange(sp.from, sp.to) : '';
      var fl = (bk.fails && bk.fails[bi]) || 0;
      if (v === null) {
        rects += '<rect ' + g2 + ' fill="var(--c-gap)" data-tip="'
          + esc((when ? when + ' · ' : '') + '无数据') + '"></rect>';
      } else {
        var nm = v;
        var lvTxt = nm === 'up' ? '正常' : (nm === 'slow' ? '偏慢' : (nm === 'minor' ? '性能下降' : '异常'));
        var tip = (when ? when + ' · ' : '') + lvTxt
          + (fl ? '（该时段 ' + fl + ' 次失败）' : '');
        rects += '<rect ' + g2 + ' fill="var(--c-' + nm + ')" data-tip="' + esc(tip) + '"></rect>';
      }
    }
    var bars = '<div class="st-bars-wrap"><svg class="st-bars" width="' + geom.total + '" height="24" viewBox="0 0 '
      + geom.total + ' 24" aria-hidden="true">' + rects + '</svg></div>';

    // 悬停汇总：把「哪一类故障、什么时候开始的、24h 内坏了几次」一次说清
    var tipLines = [];
    tipLines.push(lv === 'up' ? ('正常 · ' + msText(s.ms)) : (lm.label + ' · ' + lm.desc));
    if (s.code) tipLines.push('HTTP ' + s.code);
    if (lv !== 'up' && lv !== 'slow' && st && st.since) {
      tipLines.push('自 ' + fmtRange(st.since) + ' 起持续 ' + durText(Math.max(SLOT_MS, doc.updated - st.since + SLOT_MS)));
    }
    if (st && st.lastUp) tipLines.push('最近成功 ' + ago(st.lastUp));
    if (st && st.badCount) tipLines.push('24h 失败 ' + st.badCount + ' / ' + st.samples + ' 次');
    if (m.slow) tipLines.push('24h 偏慢 ' + m.slow + ' 次');
    tipLines.push('24h ' + fmtPct(m.h24) + '（' + m.h24n + ' 次样本）');
    tipLines.push('近 7 天 ' + fmtPct(m.d7) + '（' + m.n7 + ' 次样本）');
    if (sinceTs) tipLines.push('自 ' + fmtRange(sinceTs) + ' 起监控');
    var detailTip = tipLines.join('\n');

    var rateText;
    if (isNew) {
      rateText = filled ? '新增监控 · 数据累积中' : '新增监控 · 等待首次探测';
    } else {
      rateText = '24h ' + fmtPct(m.h24);
      if (m.d7 != null) rateText += ' · 7 天 ' + fmtPct(m.d7);
      if (m.slow) rateText += ' · 偏慢 ' + m.slow + ' 次';
    }

    var g = groupOf(s);
    return '<li class="st-card" data-state="' + lm.tone + '" data-lv="' + lv + '">'
      +   '<div class="st-card-head">'
      +     '<span class="st-dot"></span>'
      +     '<div class="st-card-title">'
      +       '<b class="st-name">' + esc(s.name) + '</b>'
      +       '<a class="st-url" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(hostOf(s.url)) + ' ↗</a>'
      +     '</div>'
      +     '<div class="st-card-stat" data-tip="' + esc(detailTip) + '">'
      +       '<span class="st-lv" data-lv="' + lv + '">' + esc(lm.label) + '</span>'
      +       '<span class="st-ms">' + esc(shortText(s, lv)) + '</span>'
      +       '<span class="st-rate">' + esc(rateText) + '</span>'
      +     '</div>'
      +   '</div>'
      +   '<div class="st-role"><span class="st-role-tag">' + esc(ID_ROLE[g] || '资源') + '</span>'
      +     '<span class="st-role-desc">' + esc(lm.desc) + '</span></div>'
      +   bars
      +   detailBlock(doc, s, lv, lm, st)
      + '</li>';
  }

  function renderList(doc) {
    var box = $('stList');
    var geom = barsGeom();
    var bk = bucketize(doc, geom.N);
    // 按分组排，组内保持 TARGETS 原始顺序（索引 i 必须一直是原索引，位串靠它对齐）
    var counts = {}, bads = {};
    doc.services.forEach(function (s) {
      var g0 = groupOf(s);
      counts[g0] = (counts[g0] || 0) + 1;
      if (levelOf(s) !== 'up') bads[g0] = (bads[g0] || 0) + 1;
    });
    var html = '';
    var last = '';
    orderedIndices(doc).forEach(function (i) {
      var s = doc.services[i];
      var g = groupOf(s);
      if (g !== last) {
        html += '<li class="st-group">' + esc(groupLabel(g))
          + '<span class="st-gcount">' + counts[g] + ' 项'
          + (bads[g] ? ' · <b>' + bads[g] + ' 项不达标</b>' : '')
          + '</span></li>';
        last = g;
      }
      html += cardOf(doc, bk, s, i, geom);
    });
    box.innerHTML = html;
    // 工具栏显示时间窗口与每格粒度
    var granEl = $('stGran');
    if (granEl) {
      var granMin = Math.max(1, Math.round(WINDOW_SLOTS / geom.N * SLOT_MS / 60000));
      granEl.textContent = '24 小时 · 每格 ' + granMin + ' 分钟 · 可左右滚动';
    }
    applyBarScroll();
  }

  /* ---------- 细条横向滚动：位置全局共享，重绘后还原 ---------- */
  // 720 格放不进一屏，靠横向滚动查看。默认停在最右（最新数据），
  // 任意一张卡片被拖动时其余卡片跟着动，保证上下时间轴对齐。
  function applyBarScroll() {
    var all = document.querySelectorAll('.st-bars-wrap');
    if (!all.length) return;
    var max = all[0].scrollWidth - all[0].clientWidth;
    if (state.barsScroll === null) state.barsScroll = max;      // 首次：最右
    var v = Math.max(0, Math.min(state.barsScroll, max));
    state.barSyncing = true;
    for (var i = 0; i < all.length; i++) {
      all[i].scrollLeft = v;
      if (!all[i].__barBound) {                                 // scroll 不冒泡，得逐个绑
        all[i].__barBound = true;
        all[i].addEventListener('scroll', onBarScroll, { passive: true });
      }
    }
    state.barSyncing = false;
  }

  function onBarScroll(e) {
    var el = e.currentTarget;
    if (state.barSyncing || Math.abs(el.scrollLeft - (state.barsScroll || 0)) < 1) return;
    state.barsScroll = el.scrollLeft;
    var all = document.querySelectorAll('.st-bars-wrap');
    state.barSyncing = true;
    for (var i = 0; i < all.length; i++) {
      if (all[i] !== el) all[i].scrollLeft = el.scrollLeft;
    }
    state.barSyncing = false;
  }

  // 条的几何：**一格 = 一个探测点（2 分钟）**，24 小时正好 720 格。
  // 条宽保持 3px（小屏 2px）、间隔 2px，整条约 3.6k px，放不进卡片宽 → 横向滚动查看，
  // 默认滚到最右（最新）。所有卡片共用同一个滚动位置，时间轴上下对齐。
  function barsGeom() {
    var list = $('stList');
    var pad = (window.innerWidth || 960) <= 760 ? 15 : 18;   // .st-card 的左右 padding
    var W = Math.max(120, (list.clientWidth || 810) - pad * 2);
    var w = window.innerWidth <= 760 ? 2 : 3;
    var g = 2;
    var N = WINDOW_SLOTS;
    var total = N * (w + g) - g;
    return { W: W, w: w, g: g, N: N, total: total };
  }

  /* ---------- 近 24 小时故障记录 ---------- */
  // 同一项在短时间内反复掉几次（像 GH API 那样 06:18 / 06:24 / 06:32），
  // 逐段列出来等于把一次抖动拆成好几行。这里按「相邻两段之间空档 ≤ MERGE_GAP_MS」
  // 合并成一段，时间写成 起 ~ 止，并记下中间一共失败了几次。
  function mergeSegs(segs) {
    var out = [];
    segs.forEach(function (sg) {
      var p = out[out.length - 1];
      if (p && sg.from - p.to - SLOT_MS <= MERGE_GAP_MS) {
        p.to = sg.to;
        p.count++;
      } else {
        out.push({ from: sg.from, to: sg.to, count: 1 });
      }
    });
    return out;
  }

  function renderOutages(doc) {
    var ul = $('stOutageList');
    if (!ul) return;
    var rows = [];
    orderedIndices(doc).forEach(function (i) {
      var s = doc.services[i];
      var segs = segmentsOf(doc, i);
      var st = streakOf(doc, i);
      var tail = segs.length ? segs[segs.length - 1] : null;
      mergeSegs(segs).forEach(function (sg) {
        rows.push({
          s: s,
          from: sg.from,
          to: sg.to,
          count: sg.count,
          // 合并段的终点就是当前这段 → 仍未恢复
          open: !!(st && st.bad && tail && sg.to === tail.to),
          ms: sg.to - sg.from + SLOT_MS
        });
      });
    });
    // 新的在前
    rows.sort(function (a, b) { return b.from - a.from; });
    if (!rows.length) {
      ul.innerHTML = '<li class="st-olog-empty">近 24 小时没有故障记录。</li>';
      return;
    }
    ul.innerHTML = rows.slice(0, 60).map(function (r) {
      return '<li class="st-olog-row">'
        + '<span class="st-olog-name">' + esc(r.s.short || r.s.name) + '</span>'
        + '<span class="st-olog-time">' + esc(fmtRange(r.from, r.to)) + '</span>'
        + '<span class="st-olog-dur">' + (r.open ? '持续中 · 已 ' : '持续 ') + durText(r.ms)
        + (r.count > 1 ? ' · ' + r.count + ' 次失败' : '') + '</span>'
        + '</li>';
    }).join('') + (rows.length > 60
      ? '<li class="st-olog-more">仅显示最近 60 条，共 ' + rows.length + ' 条。</li>' : '');
  }

  /* ---------- 近 7 天可用率：每个服务一块，块内横排 7 天 ---------- */
  function renderWeek(doc) {
    var ul = $('stWeek');
    var days = doc.days || {};
    var keys = Object.keys(days).sort().slice(-7);   // 升序：左旧右新
    if (!keys.length) { ul.innerHTML = '<li class="st-wrow" style="grid-column:1/-1"><span class="st-wname muted">还没有历史数据。</span></li>'; return; }
    var idx = orderedIndices(doc);
    var rows = idx.map(function (i) {
      var s = doc.services[i];
      var sinceTs = (doc.since && doc.since[i]) || 0;
      var cells = keys.map(function (k) {
        var d = days[k] || {};
        var cnt = sampleCount(d, i, sinceTs, k);
        // 样本太少（< 5 次）不给百分比：1/1 的 100% 比留空更容易误导
        var failed = cnt ? cnt - ((d.ok && d.ok[i]) || 0) : 0;
        var rate = cnt >= 5 ? pct((d.ok && d.ok[i]) || 0, cnt) : null;
        // 四档：正常（一次没失败）→ 性能下降（有失败但可用率仍达标）
        //       → 波动 → 异常。只要有 1 次失败就不给绿色，避免 99.9% 掩盖事故。
        var cls = rate == null ? 'none'
          : (failed > 0 && rate >= 99.5 ? 'minor'
            : (rate >= 99.5 ? 'ok' : (rate >= 95 ? 'mid' : 'bad')));
        var v = rate == null ? '—' : (rate >= 100 ? '100' : rate.toFixed(1).replace(/\.0$/, ''));
        var lvText = cls === 'ok' ? '正常'
          : cls === 'minor' ? '性能下降'
            : cls === 'mid' ? '波动' : cls === 'bad' ? '异常' : '无数据';
        var tip = s.name + ' · ' + k + ' · ' + lvText + ' · 可用率 ' + (rate == null ? '—' : v + '%')
          + (cnt ? ' · 失败 ' + failed + ' / ' + cnt + ' 次样本' : ' · 当天还没上线');
        return '<span class="st-wcell ' + cls + '" data-tip="' + esc(tip) + '">'
          + '<i class="d">' + esc(k.slice(8)) + '</i>'
          + '<b>' + v + (v === '—' ? '' : '<i class="pu">%</i>') + '</b>'
          + '</span>';
      }).join('');
      return '<li class="st-wrow">'
        + '<span class="st-wname" title="' + esc(s.name) + '">' + esc(s.short || s.name.replace(/^.*·\s*/, '')) + '</span>'
        + '<span class="st-wcells">' + cells + '</span>'
        + '</li>';
    }).join('');
    ul.innerHTML = rows;
  }

  /* ---------- 空态 ---------- */
  function renderEmpty(info) {
    $('stBanner').setAttribute('data-state', 'unknown');
    $('stBannerTitle').textContent = '暂时读不到状态数据';
    var map = {
      'no-data': 'Worker 还没写过数据。确认 status-probe 已部署、cron 已触发。',
      'no-upstash': '服务端没配 Upstash 环境变量。',
      'read-failed': '读取存储时出错：' + (info.error || '未知错误'),
    };
    $('stBannerSub').textContent = map[info.reason] || (info.reason || '未知原因');
    $('stList').innerHTML = '<li class="st-card" data-state="unknown"><div class="st-card-head">'
      + '<span class="st-dot"></span><div class="st-card-title"><b class="st-name">没有可显示的服务</b>'
      + '<span class="st-url">数据源为空</span></div></div></li>';
    $('stWeek').innerHTML = '<li class="st-wrow" style="grid-column:1/-1"><span class="st-wname muted">暂无数据。</span></li>';
    var ol = $('stOutageList');
    if (ol) ol.innerHTML = '<li class="st-olog-empty">暂无数据。</li>';
    $('stUpdated').textContent = '最后检测：—';
  }

  /* ---------- 拉取 ---------- */
  async function load() {
    $('stRefresh').disabled = true;
    try {
      var res = await fetch(API + '?t=' + Date.now(), { cache: 'no-store' });
      var doc = await res.json();
      if (!doc || doc.ok !== true || !Array.isArray(doc.services) || !doc.services.length) {
        renderEmpty(doc || {});
        return;
      }
      state.doc = doc;
      $('stInterval').textContent = '每 ' + Math.round((doc.intervalSec || 120) / 60) + ' 分钟探测 · '
        + doc.services.length + ' 项';
      renderBanner(doc);
      renderList(doc);
      renderOutages(doc);
      renderWeek(doc);
      $('stUpdated').innerHTML = '最后检测：<span class="st-ago">' + ago(doc.updated) + '</span>';
    } catch (e) {
      renderEmpty({ reason: 'read-failed', error: String(e.message || e) });
    } finally {
      $('stRefresh').disabled = false;
    }
  }

  function startPolling() {
    stopPolling();
    state.timer = setInterval(load, POLL_MS);
    state.ticker = setInterval(function () {
      if (!state.doc) return;
      var a = ago(state.doc.updated);
      var list = document.querySelectorAll('.st-ago');
      for (var i = 0; i < list.length; i++) list[i].textContent = a;
    }, 1000);
  }
  function stopPolling() {
    if (state.timer) clearInterval(state.timer);
    if (state.ticker) clearInterval(state.ticker);
    state.timer = state.ticker = null;
  }

  $('stRefresh').addEventListener('click', load);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopPolling();
    else { load(); startPolling(); }
  });

  /* ---------- 即时浮窗（原生 title 有约 1 秒延迟，改用自己的） ---------- */
  var tipEl = $('stTip');
  function placeTip(e) {
    if (!tipEl) return;
    var pad = 12, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - pad;
    tipEl.style.left = Math.max(8, x) + 'px';
    tipEl.style.top = Math.max(8, y) + 'px';
  }
  document.addEventListener('mouseover', function (e) {
    if (!tipEl) return;
    var t = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!t) return;
    tipEl.textContent = t.getAttribute('data-tip');
    tipEl.classList.add('on');
    placeTip(e);
  });
  document.addEventListener('mousemove', function (e) {
    if (tipEl && tipEl.classList.contains('on')) placeTip(e);
  });
  document.addEventListener('mouseout', function (e) {
    if (!tipEl) return;
    var t = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (t) tipEl.classList.remove('on');
  });

  /* ---------- 窗口尺寸变化后按新格数重画 ---------- */
  var rzTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(function () { if (state.doc) renderList(state.doc); }, 250);
  });

  load().then(startPolling);
})();
