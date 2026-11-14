/* Launch Radar: the board, the detail view, the filters and the live view.
 *
 * All data comes from window.RADAR, the dataset main.ts writes from the
 * snapshot beside this page (../data.js). Nothing here fetches, and nothing
 * here reaches the network: the page renders from the one global alone.
 * Views are hash-routed so any state of the page has an address: #/ is the
 * board, #/p/<slug> is one protocol's detail, #/live is the live-token view
 * and #/method is the methodology. */

(function () {
  'use strict';

  var D = window.RADAR;
  if (!D || !Array.isArray(D.rows)) {
    document.getElementById('main').innerHTML = '<p>Launch Radar needs its dataset (data.js) beside this page.</p>';
    return;
  }

  var MODEL = D.model;
  var MAX_IMPLIED = D.rows.reduce(function (n, r) { return Math.max(n, r.implied_value_usd); }, 1);

  /* ------------------------------------------------------------ formatting */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) {
    if (n === null || n === undefined) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function moneyFull(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function pct(v) {
    if (v === null || v === undefined) return { text: '—', cls: 'flat' };
    var sign = v > 0 ? '+' : '';
    return { text: sign + v.toFixed(1) + '%', cls: v > 0 ? 'up' : v < 0 ? 'down' : 'flat' };
  }

  function ageText(days) {
    if (days === null || days === undefined) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }

  function chainsText(chains) {
    if (!chains || chains.length === 0) return '—';
    if (chains.length <= 3) return chains.join(', ');
    return chains.slice(0, 3).join(', ') + ' +' + (chains.length - 3);
  }

  /* ------------------------------------------------------------ the model, rerun in the page */

  /** The growth factor, from the same clamp the model states. */
  function growthOf(row) {
    var raw = typeof row.change_7d === 'number' ? row.change_7d : 0;
    var clamped = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, raw));
    return { raw: raw, clamped: clamped, factor: 1 + (clamped / 100) * MODEL.growth_weight };
  }

  /** The age factor, from the same cap and unknown-age rule the model states. */
  function ageOf(row) {
    var days = row.age_days === null || row.age_days === undefined ? MODEL.unknown_age_days : row.age_days;
    var capped = Math.min(Math.max(days, 0), MODEL.age_cap_days);
    return { days: days, known: row.age_days !== null && row.age_days !== undefined, factor: MODEL.age_floor + (capped / MODEL.age_cap_days) * MODEL.age_range };
  }

  /** The chain-reach factor. */
  function reachOf(row) {
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), MODEL.chain_max_extra);
    return { extra: extra, factor: 1 + MODEL.chain_step * extra };
  }

  /* ------------------------------------------------------------ state + routing */

  var state = { q: '', category: '', chain: '', watchlistOnly: false, earlyOnly: false, sort: 'implied', dir: -1 };

  function $(id) { return document.getElementById(id); }

  function currentRoute() {
    var h = window.location.hash || '#/';
    if (h === '#/' || h === '#') return { view: 'board' };
    if (h === '#/live') return { view: 'live' };
    if (h === '#/method') return { view: 'method' };
    var m = h.match(/^#\/p\/(.+)$/);
    if (m) return { view: 'detail', slug: decodeURIComponent(m[1]) };
    return { view: 'board' };
  }

  function show(view) {
    $('view-board').hidden = view !== 'board';
    $('view-detail').hidden = view !== 'detail';
    $('view-live').hidden = view !== 'live';
    $('view-method').hidden = view !== 'method';
    $('leaders').style.display = view === 'board' ? '' : 'none';
    document.querySelector('.hero').style.display = view === 'board' ? '' : 'none';
    var nav = view === 'detail' ? 'board' : view;
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === nav);
    });
  }

  /* ------------------------------------------------------------ header, stats, leaders */

  function renderHeader() {
    $('as-of').textContent = D.as_of;
    $('model-version').textContent = D.model_version;
    $('source-line').textContent = 'Source: ' + D.source + '.';
    var covered = D.rows.filter(function (r) { return r.on_watchlist; }).length;
    $('stats').innerHTML =
      stat('Protocols scanned', String(D.protocols_scanned)) +
      stat('Watchlist covered', covered + ' / ' + D.watchlist_size) +
      stat('Board rows', String(D.board_size), D.early_size + ' early finds') +
      stat('Total implied value', money(D.total_implied_usd), 'sum of the board');
    function stat(label, value, sub) {
      return '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + '</dd></div>';
    }
  }

  function renderLeaders() {
    var top = D.rows.slice().sort(function (a, b) { return a.rank - b.rank; }).slice(0, 10);
    var max = top.length ? top[0].implied_value_usd : 1;
    $('leaders-chart').innerHTML = top.map(function (r) {
      var w = Math.max(2, Math.round((r.implied_value_usd / max) * 100));
      return '<div class="leader-row"><span class="leader-rank">' + r.rank + '</span>' +
        '<span class="leader-name">' + esc(r.name) + '</span>' +
        '<span class="leader-bar"><i style="width:' + w + '%"></i></span>' +
        '<span class="leader-value">' + money(r.implied_value_usd) + '</span></div>';
    }).join('');
  }

  /* ------------------------------------------------------------ board: filter, sort, render */

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (state.category && (r.category || '') !== state.category) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchlistOnly && !r.on_watchlist) return false;
      if (state.earlyOnly && r.on_watchlist) return false;
      return true;
    });
    var dir = state.dir;
    var key = state.sort;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'implied') d = a.implied_value_usd - b.implied_value_usd;
      else if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'growth') d = (a.change_7d === null ? -Infinity : a.change_7d) - (b.change_7d === null ? -Infinity : b.change_7d);
      else if (key === 'age') d = (a.age_days === null ? -1 : a.age_days) - (b.age_days === null ? -1 : b.age_days);
      else if (key === 'name') d = a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
      if (d === 0) d = a.rank - b.rank;
      return d * dir;
    });
    return rows;
  }

  function rowHtml(r) {
    var p = pct(r.change_7d);
    var w = Math.max(1, Math.round((r.implied_value_usd / MAX_IMPLIED) * 100));
    var badge = r.on_watchlist
      ? '<span class="badge badge-watch">Watchlist</span>'
      : '<span class="badge badge-early">Early</span>';
    return '<tr data-slug="' + esc(r.slug) + '" tabindex="0">' +
      '<td class="num rank">' + r.rank + '</td>' +
      '<td class="name-cell"><b>' + esc(r.name) + badge + '</b><span>' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td>' +
      '<td class="chain-list">' + esc(chainsText(r.chains)) + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num ' + p.cls + '">' + p.text + '</td>' +
      '<td class="num">' + ageText(r.age_days) + '</td>' +
      '<td class="num implied">' + money(r.implied_value_usd) + '<span class="value-bar"><i style="width:' + w + '%"></i></span></td>' +
      '<td class="num">' + r.farm_steps.length + ' steps</td>' +
      '</tr>';
  }

  function renderBoard() {
    var rows = filteredRows();
    $('result-line').textContent = rows.length === D.rows.length
      ? 'Showing all ' + rows.length + ' ranked protocols.'
      : 'Showing ' + rows.length + ' of ' + D.rows.length + ' ranked protocols.';
    $('board-body').innerHTML = rows.length
      ? rows.map(rowHtml).join('')
      : '<tr class="empty-row"><td colspan="9">No protocol matches these filters. Loosen one and try again.</td></tr>';
    Array.prototype.forEach.call(document.querySelectorAll('#board-table th.sortable'), function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort);
    });
  }

  function fillFilters() {
    var cats = {}, chains = {};
    D.rows.forEach(function (r) {
      if (r.category) cats[r.category] = true;
      (r.chains || []).forEach(function (c) { chains[c] = true; });
    });
    var catSel = $('category'), chainSel = $('chain');
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
    });
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
    });
  }

  function bindControls() {
    $('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
    $('category').addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); });
    $('chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
    $('sort').addEventListener('change', function (e) {
      state.sort = e.target.value;
      state.dir = state.sort === 'name' ? 1 : -1;
      renderBoard();
    });
    $('watchlist-only').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; renderBoard(); });
    $('early-only').addEventListener('change', function (e) { state.earlyOnly = e.target.checked; renderBoard(); });
    $('reset').addEventListener('click', function () {
      state.q = ''; state.category = ''; state.chain = '';
      state.watchlistOnly = false; state.earlyOnly = false; state.sort = 'implied'; state.dir = -1;
      $('q').value = ''; $('category').value = ''; $('chain').value = ''; $('sort').value = 'implied';
      $('watchlist-only').checked = false; $('early-only').checked = false;
      renderBoard();
    });
    Array.prototype.forEach.call(document.querySelectorAll('#board-table th.sortable'), function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sort === key) { state.dir = -state.dir; }
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        $('sort').value = state.sort;
        renderBoard();
      });
    });
    $('board-body').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-slug]');
      if (tr) window.location.hash = '#/p/' + encodeURIComponent(tr.getAttribute('data-slug'));
    });
    $('board-body').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var tr = e.target.closest('tr[data-slug]');
      if (tr) window.location.hash = '#/p/' + encodeURIComponent(tr.getAttribute('data-slug'));
    });
  }

  /* ------------------------------------------------------------ detail view */

  /** Split one farm step into its action, cost and time for display. */
  function splitStep(step) {
    var m = step.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
    if (!m) return { action: step, cost: '', time: '' };
    return { action: m[1], cost: m[2], time: m[3] };
  }

  function renderDetail(slug) {
    var row = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) { row = D.rows[i]; break; }
    var el = $('view-detail');
    if (!row) {
      el.innerHTML = '<div class="detail-head"><h2>Not on the board</h2></div>' +
        '<p>No ranked protocol has the slug <b>' + esc(slug) + '</b>.</p>' +
        '<p><a class="btn" href="#/">Back to the board</a></p>';
      show('detail');
      return;
    }
    var g = growthOf(row), a = ageOf(row), r = reachOf(row);
    var base = row.tvl_usd * MODEL.base_multiple;
    var p = pct(row.change_7d);
    var badge = row.on_watchlist
      ? '<span class="badge badge-watch">On the watchlist</span>'
      : '<span class="badge badge-early">Early find, below the floor</span>';
    var prev = D.rows.filter(function (x) { return x.rank === row.rank - 1; })[0];
    var next = D.rows.filter(function (x) { return x.rank === row.rank + 1; })[0];
    var growthNote = g.raw !== g.clamped
      ? 'reported ' + g.raw.toFixed(1) + '%, clamped to ' + g.clamped.toFixed(1) + '%'
      : (row.change_7d === null ? 'unreported, counted as flat' : g.raw.toFixed(1) + '%');
    var ageNote = a.known ? a.days + ' days listed' : 'listing date unreported, counted as ' + MODEL.unknown_age_days + ' days';

    var steps = row.farm_steps.map(function (s) {
      var part = splitStep(s);
      return '<li><p>' + esc(part.action) + '</p>' +
        (part.cost ? '<p class="step-meta"><b>Cost:</b> ' + esc(part.cost) + ' &middot; <b>Time:</b> ' + esc(part.time) + '</p>' : '') + '</li>';
    }).join('');

    el.innerHTML =
      '<div class="detail-nav"><a class="btn" href="#/">&larr; Back to the board</a>' +
      (prev ? '<a class="btn-ghost btn" href="#/p/' + encodeURIComponent(prev.slug) + '">&larr; Rank ' + prev.rank + ': ' + esc(prev.name) + '</a>' : '') +
      (next ? '<a class="btn-ghost btn" href="#/p/' + encodeURIComponent(next.slug) + '">Rank ' + next.rank + ': ' + esc(next.name) + ' &rarr;</a>' : '') + '</div>' +
      '<div class="detail-head"><span class="rank-chip">Rank ' + row.rank + '</span><h2>' + esc(row.name) + '</h2>' + badge + '</div>' +
      '<p class="detail-meta">' + esc(row.slug) + ' &middot; ' + esc(row.category || 'no category recorded') +
      ' &middot; ' + esc(chainsText(row.chains)) + ' &middot; records no token</p>' +
      '<dl class="detail-grid">' +
      '<div><dt>TVL</dt><dd>' + moneyFull(row.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd class="' + p.cls + '">' + p.text + '</dd></div>' +
      '<div><dt>Age listed</dt><dd>' + ageText(row.age_days) + (row.listed_at ? ' <small>since ' + esc(row.listed_at) + '</small>' : '') + '</dd></div>' +
      '<div><dt>Chains</dt><dd>' + (row.chains || []).length + '</dd></div>' +
      '<div><dt>Implied value</dt><dd>' + moneyFull(row.implied_value_usd) + '</dd></div>' +
      '</dl>' +
      '<h3>How rank ' + row.rank + ' is built</h3>' +
      '<div class="math"><table><thead><tr><th scope="col">Factor</th><th scope="col">Input</th><th scope="col" class="num">Value</th></tr></thead><tbody>' +
      '<tr><td>Size: TVL &times; ' + MODEL.base_multiple + '</td><td>' + moneyFull(row.tvl_usd) + '</td><td class="num">' + moneyFull(base) + '</td></tr>' +
      '<tr><td>Growth factor</td><td>' + esc(growthNote) + '</td><td class="num">&times; ' + g.factor.toFixed(4) + '</td></tr>' +
      '<tr><td>Age factor</td><td>' + esc(ageNote) + '</td><td class="num">&times; ' + a.factor.toFixed(4) + '</td></tr>' +
      '<tr><td>Reach factor</td><td>' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ', +' + r.extra + ' beyond the first</td><td class="num">&times; ' + r.factor.toFixed(4) + '</td></tr>' +
      '<tr class="total"><td>Implied value</td><td>rounded to whole dollars</td><td class="num">' + moneyFull(row.implied_value_usd) + '</td></tr>' +
      '</tbody></table></div>' +
      '<h3>Farm plan: ' + row.farm_steps.length + ' steps</h3>' +
      '<ol class="plan">' + steps + '</ol>' +
      '<p class="board-note">The plan is generated from this protocol\u2019s own record. It promises no token and no ' +
      'airdrop: a protocol that records no token may still have one its record does not carry. Never pay to claim.</p>';
    show('detail');
  }

  /* ------------------------------------------------------------ live view */

  function renderLive() {
    $('live-body').innerHTML = D.live.map(function (r) {
      var p = pct(r.change_7d);
      return '<tr>' +
        '<td class="name-cell"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + (r.symbol ? ' &middot; $' + esc(r.symbol) : '') + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="chain-list">' + esc(chainsText(r.chains)) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num ' + p.cls + '">' + p.text + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ------------------------------------------------------------ boot */

  function route() {
    var r = currentRoute();
    if (r.view === 'detail') renderDetail(r.slug);
    else if (r.view === 'live') { renderLive(); show('live'); }
    else if (r.view === 'method') show('method');
    else show('board');
  }

  renderHeader();
  renderLeaders();
  fillFilters();
  bindControls();
  renderBoard();
  window.addEventListener('hashchange', route);
  route();
})();
