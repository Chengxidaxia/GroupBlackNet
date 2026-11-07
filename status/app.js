/* ============================================================
   app.js — 状态页渲染（沿用主站那套 .st-* 结构与样式）
   ------------------------------------------------------------
   数据来自同源 /api/status，页面每 30 秒拉一次，标签页隐藏时暂停。
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
  var state = { doc: null, timer: null, ticker: null };
  // 条的格数：窄屏少一点，保证每条还有 3px 左右的可视宽度；宽屏多一些，条更细
  function barCount() { return (window.innerWidth || 960) < 760 ? 72 : 144; }

  // 分组顺序与标题
  var GROUPS = [
    { id: 'site', label: '主站页面' },
    { id: 'book', label: '书阁页面' },
    { id: 'api',  label: '接口与数据' },
    { id: 'ext',  label: '外部依赖' }
  ];
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
      var ga = groupOrder(doc.services[a].group || 'site');
      var gb = groupOrder(doc.services[b].group || 'site');
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
  // 把探测端吐回来的英文错误翻成人话；原文保留在 title 里
  function errText(s) {
    if (s.ok) return (s.ms || 0) + ' ms';
    var e = String(s.err || '');
    if (/timeout|abort|timed out/i.test(e)) return '超时（10 秒无响应）';
    if (/dns|ENOTFOUND|getaddrinfo/i.test(e)) return '域名解析失败';
    if (/connect|network|fetch failed|ECONN/i.test(e)) return '连接失败';
    if (s.code) return 'HTTP ' + s.code;
    return e ? '异常' : '无响应';
  }

  /* ---------- 把 hist 切成 BARS 个桶 ---------- */
  // hist: [[slot, "101101"], ...]
  function bucketize(doc) {
    var BARS = barCount();
    var n = doc.services.length;
    var since = doc.since || [];
    var hist = (doc.hist || []).filter(function (h) { return Array.isArray(h) && typeof h[1] === 'string'; });
    hist.sort(function (a, b) { return a[0] - b[0]; });
    var slots = hist.slice(-WINDOW_SLOTS);          // 只取最近 24 小时
    var per = Math.max(1e-6, slots.length / BARS);  // 每个桶分到多少个探测点（可为小数）
    var buckets = [];
    var times = [];                                  // 每个桶最新一个探测点的时刻（做 tooltip 用）
    for (var b = 0; b < BARS; b++) {
      var row = [];
      for (var i = 0; i < n; i++) row.push(null);
      buckets.push(row);
      times.push(null);
    }
    var L = slots.length;
    for (var j = 0; j < L; j++) {
      var bi = BARS - 1 - Math.floor((L - 1 - j) / per);
      if (bi < 0) continue;
      if (bi >= BARS) bi = BARS - 1;
      var slot = slots[j][0];
      var at = slot * SLOT_MS;
      times[bi] = at;
      var bitstr = slots[j][1];
      for (var s = 0; s < n; s++) {
        // 该项上线之前的时段不算（新增目标不该拖累历史）
        if (since[s] && at < since[s]) continue;
        var ch = bitstr.charAt(s);
        // 新增探测项后，旧位串里没有这一位 → 跳过，桶保持 null
        if (ch !== '0' && ch !== '1') continue;
        var cur = buckets[bi][s];
        var v = ch === '1' ? 1 : 0;
        buckets[bi][s] = cur === null ? v : Math.min(cur, v);   // 桶里只要掉过一次就标红
      }
    }
    return { buckets: buckets, hist: hist, times: times };
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
    var up = 0, total = 0;
    bk.hist.forEach(function (h) {
      if (sinceTs && h[0] * SLOT_MS < sinceTs) return;
      var ch = h[1].charAt(i);
      if (ch === '1') { up++; total++; } else if (ch === '0') { total++; }
    });
    var days = doc.days || {};
    var keys = Object.keys(days).sort().slice(-7);
    var up7 = 0, n7 = 0;
    keys.forEach(function (k) {
      var d = days[k] || {};
      up7 += (d.ok && d.ok[i]) || 0;
      n7 += sampleCount(d, i, sinceTs, k);
    });
    return { h24: pct(up, total), d7: n7 >= 5 ? pct(up7, n7) : null, n7: n7, h24n: total };
  }

  /* ---------- 顶部横幅 ---------- */
  function renderBanner(doc) {
    var el = $('stBanner');
    var title = $('stBannerTitle');
    var sub = $('stBannerSub');
    if (!doc) return;
    var bad = doc.services.filter(function (s) { return !s.ok; });
    var tail = ' · 最后检测 <span class="st-ago">' + ago(doc.updated) + '</span>';
    if (!bad.length) {
      el.setAttribute('data-state', 'up');
      title.textContent = '全部服务正常';
      sub.innerHTML = doc.services.length + ' 项检查全部通过' + tail;
    } else if (bad.length === doc.services.length) {
      el.setAttribute('data-state', 'down');
      title.textContent = '全部服务异常';
      sub.innerHTML = '可能是网络或数据源整体故障' + tail;
    } else {
      el.setAttribute('data-state', 'warn');
      title.textContent = bad.length + ' 项服务异常';
      sub.innerHTML = esc(bad.map(function (s) { return s.name; }).join('、')) + tail;
    }
  }

  /* ---------- 服务卡片 ---------- */
  function hhmm(ts) {
    var d = new Date(ts);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function cardOf(doc, bk, s, i) {
    var BARS = barCount();
    var m = metrics(doc, bk, i);
    var sinceTs = (doc.since && doc.since[i]) || 0;
    var isNew = sinceTs ? (Date.now() - sinceTs < NEW_WINDOW) : false;

    // 已填过数据的桶数：再兜一层，位串里没这一位时也不把它当正常
    var filled = 0;
    bk.buckets.forEach(function (row) { if (row[i] !== null) filled++; });
    if (!isNew && filled > 0 && filled < 6) isNew = true;

    var bars = bk.buckets.map(function (row, bi) {
      var v = row[i];
      // 没有这一位（该项上线前 / 旧记录里还没这一列）→ 透明占位，不画灰条，
      // 否则一整段浅灰会被误读成「未知状态」
      if (v === null) return '<span class="st-bar gap"></span>';
      var tip = (bk.times && bk.times[bi] ? hhmm(bk.times[bi]) + ' · ' : '')
        + (v === 1 ? '正常' : '异常');
      return '<span class="st-bar ' + (v === 1 ? 'up' : 'down') + '" data-tip="' + esc(tip) + '"></span>';
    }).join('');

    var st = s.ok ? 'up' : 'down';
    var detail = errText(s);

    var sinceText = '';
    if (sinceTs) {
      var d0 = new Date(sinceTs);
      sinceText = ' · 自 ' + (d0.getMonth() + 1) + '-' + d0.getDate() + ' 起监控';
    }
    // 悬停能看到：HTTP 状态码、原始错误、24h 与近 7 天（含真实样本数）
    var detailTip = (s.code ? 'HTTP ' + s.code + ' · ' : '')
      + (s.ok ? (s.ms + ' ms') : (s.err || detail))
      + '\n24h ' + fmtPct(m.h24) + '（' + m.h24n + ' 次样本）'
      + '\n近 7 天 ' + fmtPct(m.d7) + '（' + m.n7 + ' 次样本）'
      + sinceText.replace(/^ · /, '自 ');

    var rateText;
    if (isNew) {
      rateText = filled ? '新增监控 · 数据累积中' : '新增监控 · 等待首次探测';
    } else {
      rateText = '24h ' + fmtPct(m.h24);
      if (m.d7 != null) rateText += ' · 7 天 ' + fmtPct(m.d7);
    }

    return '<li class="st-card" data-state="' + st + '">'
      +   '<div class="st-card-head">'
      +     '<span class="st-dot"></span>'
      +     '<div class="st-card-title">'
      +       '<b class="st-name">' + esc(s.name) + '</b>'
      +       '<a class="st-url" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(hostOf(s.url)) + ' ↗</a>'
      +     '</div>'
      +     '<div class="st-card-stat" data-tip="' + esc(detailTip) + '">'
      +       '<span class="st-ms">' + esc(detail) + '</span>'
      +       '<span class="st-rate">' + esc(rateText) + '</span>'
      +     '</div>'
      +   '</div>'
      +   '<div class="st-bars' + (isNew ? ' is-new' : '') + '" style="--slices:' + BARS + '">' + bars + '</div>'
      + '</li>';
  }

  function renderList(doc) {
    var box = $('stList');
    var bk = bucketize(doc);
    // 按分组排，组内保持 TARGETS 原始顺序（索引 i 必须一直是原索引，位串靠它对齐）
    var html = '';
    var last = '';
    orderedIndices(doc).forEach(function (i) {
      var s = doc.services[i];
      var g = s.group || 'site';
      if (g !== last) {
        html += '<li class="st-group">' + esc(groupLabel(g)) + '</li>';
        last = g;
      }
      html += cardOf(doc, bk, s, i);
    });
    box.innerHTML = html;
  }

  /* ---------- 近 7 天表格（服务为行、日期为列，窄屏也不横向滚动） ---------- */
  function renderWeek(doc) {
    var tbl = $('stWeek');
    var days = doc.days || {};
    var keys = Object.keys(days).sort().slice(-7);   // 升序：左旧右新
    if (!keys.length) { tbl.innerHTML = '<tbody><tr><td class="muted">还没有历史数据。</td></tr></tbody>'; return; }
    var idx = orderedIndices(doc);
    var head = '<thead><tr><th>服务</th>'
      + keys.map(function (k) {
        return '<th title="' + esc(k) + '">'
          + '<span class="d-full">' + esc(k.slice(5)) + '</span>'
          + '<span class="d-mini">' + esc(k.slice(8)) + '</span>'
          + '</th>';
      }).join('')
      + '</tr></thead>';
    var rows = idx.map(function (i) {
      var s = doc.services[i];
      var sinceTs = (doc.since && doc.since[i]) || 0;
      var cells = keys.map(function (k) {
        var d = days[k] || {};
        var cnt = sampleCount(d, i, sinceTs, k);
        // 样本太少（< 5 次）不给百分比：1/1 的 100% 比留空更容易误导
        var rate = cnt >= 5 ? pct((d.ok && d.ok[i]) || 0, cnt) : null;
        var cls = rate == null ? 'none' : (rate >= 99.5 ? 'ok' : (rate >= 95 ? 'mid' : 'bad'));
        var v = rate == null ? '—' : (rate >= 100 ? '100' : rate.toFixed(1).replace(/\.0$/, ''));
        var tip = s.name + ' · ' + k + ' · 可用率 ' + (rate == null ? '—' : v + '%')
          + ' · ' + (cnt ? cnt + ' 次样本' : '当天还没上线');
        return '<td class="' + cls + '"><span class="st-cell" data-tip="' + esc(tip) + '">'
          + (rate == null
            ? '<span class="pv">—</span>'
            : '<span class="pv">' + v + '</span><span class="pu">%</span>')
          + '</span></td>';
      }).join('');
      var label = s.short || s.name.replace(/^.*·\s*/, '');
      return '<tr><td class="d" title="' + esc(s.name) + '">' + esc(label) + '</td>' + cells + '</tr>';
    }).join('');
    tbl.innerHTML = head + '<tbody>' + rows + '</tbody>';
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
    $('stWeek').innerHTML = '<tbody><tr><td class="muted">暂无数据。</td></tr></tbody>';
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
