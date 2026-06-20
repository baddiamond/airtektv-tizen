/* Airtek TV — TizenBrew. Diseño hi-fi (handoff oficial) sobre datos reales de la API.
 * Vistas: boot -> home (sidebar/spotlight/grid) -> player. 100% control remoto.
 * Catálogo: GET {apiBase}/get/channels/{provider}/{version}. Streams HLS (.m3u8). */
(function () {
  'use strict';

  var CFG = window.AIRTEK_CONFIG;
  var COLS = 5;
  var GRAD = 'linear-gradient(135deg,#31cfff 0%,#1e7be6 55%,#7a3fe0 120%)';
  var ARTBG = 'linear-gradient(150deg,#16314f -8%,rgba(6,10,18,.72) 122%)';

  // En Samsung Tizen usamos el reproductor nativo AVPlay (decodifica AC-3/E-AC-3 por
  // hardware → con audio). Fuera de Tizen (PC), hls.js / <video> nativo.
  var IS_TIZEN = !!(window.webapis && window.webapis.avplay);

  var KEY = {
    LEFT: [37], UP: [38], RIGHT: [39], DOWN: [40], ENTER: [13, 10252],
    BACK: [10009, 8, 27], CH_UP: [427, 33], CH_DOWN: [428, 34]
  };
  function isKey(g, c) { return g.indexOf(c) !== -1; }
  var $ = function (id) { return document.getElementById(id); };

  // ---- Íconos de categoría (del handoff) ----
  var ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16M16 4v16"/>',
    sat: '<path d="M5 13a8 8 0 0 1 8 8M5 17a4 4 0 0 1 4 4"/><circle cx="6" cy="20" r="1.5"/><path d="M13 5l6 6-4 4-6-6z"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18M3 12h18M5 6c3 2 11 2 14 0M5 18c3-2 11-2 14 0"/>',
    star: '<path d="M12 3l2.6 5.6L20 9.3l-4 4 1 6-5-2.8L7 19.3l1-6-4-4 5.4-.7z"/>',
    goal: '<rect x="3" y="6" width="18" height="13" rx="1"/><path d="M3 10h18M3 14h18M8 6v13M16 6v13"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    cap: '<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M7 10v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5"/>',
    cross: '<path d="M10 3h4v6h6v4h-6v8h-4v-8H4V9h6z"/>',
    heart: '<path d="M12 20s-7-4.6-9.2-8.4C1.2 8.5 3 5 6.2 5 8 5 9.4 6 12 8.6 14.6 6 16 5 17.8 5 21 5 22.8 8.5 21.2 11.6 19 15.4 12 20 12 20z"/>'
  };
  var CAT_ORDER = ['Todos', 'Entretenimiento', 'Nacionales', 'Deportes', 'Infantil', 'Airtek Goool', 'Música', 'Educativo', 'Religión', 'Telenovelas', 'Estilo de vida'];
  var CAT_ICON = {
    'todos': 'grid', 'entretenimiento': 'film', 'nacionales': 'sat', 'deportes': 'ball',
    'infantil': 'star', 'airtek goool': 'goal', 'música': 'note', 'musica': 'note',
    'educativo': 'cap', 'religión': 'cross', 'religion': 'cross', 'telenovelas': 'heart',
    'estilo de vida': 'star'
  };
  function svg(inner, stroke, size) {
    size = size || 22;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="' +
      stroke + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }

  // ---- Estado ----
  var S = {
    view: 'boot', region: 'sidebar', catIndex: 0, gridIndex: 0,
    playerIndex: 0, bannerVisible: true,
    channels: [], categories: [],
    hls: null, bootTimer: null, bannerTimer: null, clockTimer: null
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sz(n) { n = n || ''; return n.length <= 4 ? '30px' : n.length <= 7 ? '24px' : n.length <= 10 ? '19px' : '16px'; }

  // ---- Carga de catálogo ----
  function fetchWithTimeout(url, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, ms);
      fetch(url, { headers: { 'Accept': 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { if (!done) { done = true; clearTimeout(t); resolve(j); } })
        .catch(function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }
  function loadCatalog() {
    var apiUrl = CFG.apiBase + '/get/channels/' + CFG.provider + '/' + CFG.version;
    return fetchWithTimeout(apiUrl, CFG.fetchTimeoutMs)
      .catch(function () { return fetchWithTimeout(CFG.mockUrl, CFG.fetchTimeoutMs); })
      .then(function (json) {
        var data = (json && json.data) ? json.data : [];
        S.channels = data.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        S.channels.forEach(function (ch, i) {
          ch._num = i + 1;
          ch._cat = (ch.categories && ch.categories.tags) ? ch.categories.tags : 'Otros';
        });
        buildCategories();
      });
  }
  function buildCategories() {
    var map = {}, found = [];
    S.channels.forEach(function (ch) {
      if (!map[ch._cat]) { map[ch._cat] = { name: ch._cat, items: [] }; found.push(ch._cat); }
      map[ch._cat].items.push(ch);
    });
    found.sort(function (a, b) {
      var ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      if (ia === -1) ia = 99; if (ib === -1) ib = 99;
      return ia - ib;
    });
    S.categories = [{ name: 'Todos', items: S.channels }];
    found.forEach(function (n) { S.categories.push(map[n]); });
    // Foco inicial: Deportes si existe, si no Todos
    var dep = -1;
    S.categories.forEach(function (c, i) { if (c.name.toLowerCase() === 'deportes') dep = i; });
    S.catIndex = dep >= 0 ? dep : 0;
  }
  function curList() { return (S.categories[S.catIndex] || { items: [] }).items; }
  function catIcon(name) { return ICONS[CAT_ICON[String(name).toLowerCase()] || 'grid']; }

  // ---- Arte del canal (logo real) ----
  function chBg(ch) { return ch._cat === 'Airtek Goool' ? GRAD : ARTBG; }
  function chArt(ch, mode) {
    // El thumbnail (1.54:1) llena el recuadro de borde a borde. El recuadro ya tiene esa
    // forma, así que cover = sin marcos ni recortes.
    if (ch.thumbnail) {
      return '<img src="' + esc(ch.thumbnail) + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'" />';
    }
    var size = mode === 'tile' ? sz(ch.title) : '46px';
    return '<span class="saira" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:' + size + ';color:#fff;opacity:.92">' + esc(ch.title || '') + '</span>';
  }

  // ---- Render: SIDEBAR ----
  function renderCats() {
    var html = '';
    S.categories.forEach(function (c, i) {
      var focused = S.region === 'sidebar' && i === S.catIndex;
      var selected = i === S.catIndex;
      var stroke = focused ? '#062231' : (selected ? '#9fe4ff' : '#86b0cf');
      var iconWrap = 'display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;flex:none;background:' +
        (focused ? 'linear-gradient(180deg,#7fe6ff,#31cfff)' : (selected ? 'rgba(49,207,255,.14)' : 'rgba(40,70,104,.26)')) +
        ';box-shadow:' + (focused ? '0 4px 14px rgba(49,207,255,.4)' : 'none');
      var rowStyle = 'display:flex;align-items:center;gap:15px;padding:11px 15px;border-radius:13px;transition:background .12s;color:' +
        (focused ? '#06141f' : (selected ? '#eafaff' : '#9fc1d8')) + ';background:' +
        (focused ? 'linear-gradient(90deg,#7fe6ff,#31cfff)' : (selected ? 'rgba(49,207,255,.08)' : 'transparent')) +
        ';border:1px solid ' + (focused ? 'transparent' : (selected ? 'rgba(49,207,255,.22)' : 'transparent'));
      html += '<div style="' + rowStyle + '">' +
        '<div style="' + iconWrap + '">' + svg(catIcon(c.name), stroke, 21) + '</div>' +
        '<span class="nun" style="font-weight:' + ((focused || selected) ? 800 : 700) + ';font-size:17px;letter-spacing:.2px">' + esc(c.name) + '</span>' +
        ((selected && !focused) ? '<span style="margin-left:auto;width:7px;height:7px;border-radius:50%;background:#31cfff;box-shadow:0 0 10px #31cfff"></span>' : '') +
        '</div>';
    });
    $('cats').innerHTML = html;
  }

  // ---- Render: SPOTLIGHT ----
  function renderSpotlight() {
    var list = curList();
    var idx = S.region === 'grid' ? clamp(S.gridIndex, 0, list.length - 1) : 0;
    var ch = list[idx] || S.channels[0];
    var catName = (S.categories[S.catIndex] || {}).name || '';
    if (!ch) { $('spotlight').innerHTML = ''; return; }
    $('spotlight').innerHTML =
      '<div id="sp-art" style="position:relative;width:392px;flex:none;border-radius:22px;overflow:hidden;background:' + chBg(ch) + ';box-shadow:0 18px 50px rgba(0,0,0,.45),inset 0 0 0 1px rgba(140,200,255,.12)">' +
        '<div class="sp-logo" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">' + chArt(ch, 'spot') + '</div>' +
        '<div class="sp-scrim" style="position:absolute;inset:0;background:linear-gradient(100deg,rgba(4,7,13,.5),transparent 55%)"></div>' +
        '<div class="nun" style="position:absolute;top:16px;left:16px;min-width:46px;height:36px;padding:0 11px;display:flex;align-items:center;justify-content:center;border-radius:11px;font-weight:900;font-size:20px;color:#062231;background:linear-gradient(180deg,#7fe6ff,#31cfff);box-shadow:0 5px 14px rgba(49,207,255,.4)">' + ch._num + '</div>' +
        '<div style="position:absolute;bottom:16px;left:16px;display:flex;align-items:center;gap:7px;padding:5px 11px;border-radius:9px;background:rgba(4,7,13,.65);border:1px solid rgba(255,49,73,.5)"><span style="width:7px;height:7px;border-radius:50%;background:#ff3149;box-shadow:0 0 9px #ff3149;animation:atk-blink 1.1s ease-in-out infinite"></span><span class="nun" style="font-weight:900;font-size:12px;letter-spacing:1.5px;color:#ff8a96">EN VIVO</span></div>' +
      '</div>' +
      '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;min-width:0">' +
        '<div class="nun" style="font-weight:800;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#31cfff">En vivo ahora · ' + esc(catName) + '</div>' +
        '<div class="nun" style="font-weight:900;font-size:54px;line-height:1;letter-spacing:-1px;color:#f6fdff;margin-top:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(ch.title) + '</div>' +
        '<div style="font-size:21px;color:#9fc0d8;font-weight:500;margin-top:12px">Transmisión en directo</div>' +
        '<div style="display:flex;align-items:center;gap:14px;margin-top:22px">' +
          '<span class="nun" style="min-width:42px;height:38px;padding:0 13px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;background:linear-gradient(180deg,#1c2a44,#0d1626);border:1px solid rgba(49,207,255,.4);box-shadow:0 3px 0 rgba(0,0,0,.5),inset 0 1px 0 rgba(120,180,230,.18);font-weight:900;font-size:15px;color:#dff4ff">OK</span>' +
          '<span style="font-size:16px;color:#8fb0cc;font-weight:600">Ver canal a pantalla completa</span>' +
        '</div>' +
      '</div>';
  }

  // ---- Render: GRID ----
  function renderGrid() {
    var list = curList();
    var html = '';
    list.forEach(function (ch, i) {
      var f = S.region === 'grid' && i === S.gridIndex;
      var cardStyle = 'position:relative;padding:12px;border-radius:16px;transition:transform .16s ease,box-shadow .16s ease,background .16s ease;transform:' +
        (f ? 'translateY(-3px) scale(1.03)' : 'none') + ';background:' +
        (f ? 'linear-gradient(180deg,rgba(22,46,76,.92),rgba(9,20,34,.94))' : 'rgba(12,20,33,.5)') +
        ';border:1px solid ' + (f ? 'rgba(49,207,255,.85)' : 'rgba(56,98,140,.16)') + ';box-shadow:' +
        (f ? '0 0 0 2px rgba(49,207,255,.55),0 16px 42px rgba(6,18,38,.7),0 0 46px rgba(49,207,255,.22)' : '0 5px 16px rgba(0,0,0,.3)');
      html += '<div data-foc="' + (f ? '1' : '0') + '" style="' + cardStyle + '">' +
        (f ? '<div style="position:absolute;inset:0;border-radius:16px;overflow:hidden;pointer-events:none"><div style="position:absolute;top:0;bottom:0;width:38%;background:linear-gradient(100deg,transparent,rgba(150,225,255,.16),transparent);animation:atk-sheen 1.6s ease-in-out infinite"></div></div>' : '') +
        '<div class="nun" style="position:absolute;top:10px;left:10px;z-index:2;min-width:34px;height:27px;padding:0 7px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-weight:900;font-size:15px;color:#062231;background:linear-gradient(180deg,#7fe6ff,#31cfff);box-shadow:0 3px 10px rgba(49,207,255,.4)">' + ch._num + '</div>' +
        '<div style="position:relative;width:100%;padding-top:64.9%;border-radius:12px;overflow:hidden;background:' + chBg(ch) + '">' + chArt(ch, 'tile') + '</div>' +
        '<div class="nun" style="margin-top:11px;font-weight:800;font-size:15px;color:#eaf6ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(ch.title) + '</div>' +
        '<div style="margin-top:3px;font-size:12px;color:#6f93b3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(ch._cat) + '</div>' +
      '</div>';
    });
    $('grid').innerHTML = html;
    scrollGrid();
  }
  function scrollGrid() {
    var c = $('grid-scroll'); if (!c) return;
    var el = c.querySelector('[data-foc="1"]'); if (!el) return;
    var top = el.offsetTop, bot = top + el.offsetHeight;
    if (top < c.scrollTop) c.scrollTop = top - 16;
    else if (bot > c.scrollTop + c.clientHeight) c.scrollTop = bot - c.clientHeight + 16;
  }
  function renderHeader() {
    var cat = S.categories[S.catIndex] || { name: '', items: [] };
    $('cat-title').textContent = cat.name;
    $('cat-count').textContent = cat.items.length;
  }
  function renderHome() {
    stopPreview();            // cierra el hueco/strips ANTES de re-dibujar (evita la franja negra al scrollear)
    renderCats(); renderHeader(); renderSpotlight(); renderGrid();
    schedulePreview();        // agenda el nuevo preview
  }

  // ---- Reloj ----
  var DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  var MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  function tickClock() {
    var d = new Date();
    var h = d.getHours(), mm = ('0' + d.getMinutes()).slice(-2);
    var ap = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    if ($('clock')) $('clock').innerHTML = h12 + ':' + mm +
      '<span style="font-size:20px;font-weight:800;color:#7fa6c4;margin-left:8px;letter-spacing:1px">' + ap + '</span>';
    if ($('clock-date')) $('clock-date').textContent = DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MES[d.getMonth()];
  }

  // ---- Vistas ----
  function showView(v) {
    S.view = v;
    $('boot').classList.toggle('hidden', v !== 'boot');
    $('home').classList.toggle('hidden', v !== 'home');
    $('player').classList.toggle('hidden', v !== 'player');
  }
  function goHome() {
    clearTimeout(S.bootTimer);
    showView('home');
    renderHome();
  }

  // ---- Boot ----
  function buildBoot() {
    var tops = [12, 22, 31, 40, 49, 58, 66, 74, 83, 92], fh = '';
    tops.forEach(function (t, i) {
      var len = (40 + (i % 4) * 22) + 'px', delay = (i * 0.09).toFixed(2) + 's';
      var dur = (1.05 + (i % 3) * 0.18).toFixed(2) + 's', anim = i % 2 === 0 ? 'atk-pktL' : 'atk-pktR';
      fh += '<div style="position:absolute;left:0;right:0;height:1px;top:' + t + '%;background:linear-gradient(90deg,transparent,rgba(120,200,255,.35),transparent);opacity:0;animation:atk-line .9s ease-out ' + delay + ' both">' +
        '<div style="position:absolute;top:50%;left:50%;width:' + len + ';height:3px;margin-top:-1.5px;border-radius:3px;background:linear-gradient(90deg,transparent,#7fe8ff 40%,#ffffff 50%,#5fb8ff 60%,transparent);box-shadow:0 0 14px 2px rgba(95,200,255,.9);animation:' + anim + ' ' + dur + ' cubic-bezier(.4,0,.2,1) ' + delay + ' both"></div></div>';
    });
    $('boot-fibers').innerHTML = fh;
    var xs = [-58, -36, -14, 6, 26, 46, 64], sh = '';
    xs.forEach(function (x, i) {
      sh += '<div style="position:absolute;left:50%;top:40%;width:4px;height:4px;border-radius:50%;background:#bdf0ff;box-shadow:0 0 8px 2px rgba(120,220,255,.9);margin-left:' + x + 'px;animation:atk-spark 1.1s ease-out ' + (1.45 + i * 0.04).toFixed(2) + 's both"></div>';
    });
    $('boot-sparks').innerHTML = sh;
  }
  function startBoot() {
    buildBoot();
    showView('boot');
    clearTimeout(S.bootTimer);
    S.bootTimer = setTimeout(goHome, 5000);
  }

  // ---- Player ----
  function openPlayer(i) {
    stopPreview();
    S.playerIndex = i;
    showView('player');
    if (IS_TIZEN) avSetup();
    playCurrent();
  }
  function exitPlayer() {
    clearTimeout(S.bannerTimer);
    stopPlayback();
    if (IS_TIZEN) avTeardown();
    showView('home');
    S.region = 'grid';
    renderHome();
  }
  function playerStep(d) {
    var n = curList().length; if (!n) return;
    S.playerIndex = (S.playerIndex + d + n) % n;
    playCurrent();
  }
  function playCurrent() {
    var ch = curList()[S.playerIndex]; if (!ch) return;
    ch._triedBackup = false;
    $('pl-backdrop').style.background = 'radial-gradient(70% 90% at 50% 32%,' +
      (ch._cat === 'Airtek Goool' ? '#1e7be6' : '#16314f') + ' -10%,#05080f 78%)';
    $('pl-corner').textContent = ch.title || '';
    spinner(true);
    showBanner(true);
    renderBanner(ch, 'Cargando…');
    startPlayback(ch.url || ch.backup_url, ch);
  }
  function renderBanner(ch, stateTxt) {
    var catName = (S.categories[S.catIndex] || {}).name || ch._cat || '';
    var live = stateTxt
      ? '<span class="nun" style="display:flex;align-items:center;gap:7px;padding:5px 12px;border-radius:8px;background:#33415a"><span style="font-size:13px;color:#cfe6f7;font-weight:700">' + esc(stateTxt) + '</span></span>'
      : '<span style="display:flex;align-items:center;gap:7px;padding:5px 12px;border-radius:8px;background:#ff3149"><span style="width:7px;height:7px;border-radius:50%;background:#fff;animation:atk-blink 1.1s ease-in-out infinite"></span><span class="nun" style="font-weight:900;font-size:13px;letter-spacing:1.5px;color:#fff">EN VIVO</span></span>';
    $('pl-banner').innerHTML =
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding-top:96px">' +
        '<div style="display:flex;align-items:center;gap:22px;min-width:0">' +
          '<div class="nun" style="min-width:96px;height:96px;padding:0 16px;display:flex;align-items:center;justify-content:center;border-radius:20px;font-weight:900;font-size:46px;color:#062231;background:linear-gradient(180deg,#7fe6ff,#31cfff);box-shadow:0 10px 30px rgba(49,207,255,.45)">' + ch._num + '</div>' +
          '<div style="min-width:0">' +
            '<div class="nun" style="font-weight:900;font-size:52px;line-height:1;letter-spacing:-1px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(ch.title) + '</div>' +
            '<div style="display:flex;align-items:center;gap:14px;margin-top:14px">' + live +
              '<span style="font-size:18px;color:#bcd6ea;font-weight:600">' + esc(catName) + '</span>' +
              '<span style="width:5px;height:5px;border-radius:50%;background:#5f7d99"></span>' +
              '<span style="font-size:18px;color:#9fc0d8;font-weight:500">En directo</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:22px;flex:none">' +
          '<div style="display:flex;align-items:center;gap:9px"><span class="nun" style="min-width:34px;height:34px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;background:linear-gradient(180deg,#1a2740,#0e1626);border:1px solid rgba(90,140,190,.3);box-shadow:0 3px 0 rgba(0,0,0,.5),inset 0 1px 0 rgba(120,180,230,.16);font-weight:900;font-size:15px;color:#cfe6f7">◀ ▶</span><span style="font-size:14px;color:#9fbdd6;font-weight:600">Cambiar canal</span></div>' +
          '<div style="display:flex;align-items:center;gap:9px"><span class="nun" style="min-width:34px;height:34px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;background:linear-gradient(180deg,#1a2740,#0e1626);border:1px solid rgba(90,140,190,.3);box-shadow:0 3px 0 rgba(0,0,0,.5),inset 0 1px 0 rgba(120,180,230,.16);font-weight:900;font-size:15px;color:#cfe6f7">↩</span><span style="font-size:14px;color:#9fbdd6;font-weight:600">Volver a la guía</span></div>' +
        '</div>' +
      '</div>';
  }
  function showBanner(v) {
    var b = $('pl-banner'), top = $('pl-top');
    b.style.display = v ? 'block' : 'none';
    if (top) top.style.display = v ? 'flex' : 'none';
    clearTimeout(S.bannerTimer);
    if (v) {
      b.style.animation = 'none'; void b.offsetWidth; b.style.animation = 'atk-bannerin .4s cubic-bezier(.2,.7,.2,1) both';
      S.bannerTimer = setTimeout(function () {
        b.style.display = 'none';
        if (top) top.style.display = 'none';
        S.bannerVisible = false;
      }, 4500);
    }
    S.bannerVisible = v;
  }
  function toggleBanner() { showBanner(!S.bannerVisible); }
  function spinner(on) { $('pl-spinner').classList.toggle('hidden', !on); }

  function startPlayback(url, ch) {
    if (!url) { tryBackupOr(ch, 'sin-url'); return; }
    stopPlayback(true);
    if (IS_TIZEN) { avPlay(url, ch); return; }

    var video = $('video');
    function onReady() { spinner(false); }
    function onError(detail) { spinner(false); tryBackupOr(ch, detail); }
    if (window.Hls && window.Hls.isSupported() && /\.m3u8(\?|$)/i.test(url)) {
      var hls = new window.Hls({ liveDurationInfinity: true, lowLatencyMode: false });
      S.hls = hls;
      hls.loadSource(url); hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () { video.play().then(onReady).catch(onReady); });
      hls.on(window.Hls.Events.ERROR, function (_e, data) { if (data && data.fatal) onError(data.type); });
      return;
    }
    video.src = url;
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', function () { onError('native'); }, { once: true });
    video.play().catch(function () {});
  }
  function tryBackupOr(ch, detail) {
    if (ch && ch.backup_url && ch.url !== ch.backup_url && !ch._triedBackup) {
      ch._triedBackup = true; renderBanner(ch, 'Reintentando…'); showBanner(true);
      startPlayback(ch.backup_url, ch);
    } else { renderBanner(ch, 'No se pudo reproducir'); showBanner(true); }
  }
  function stopPlayback(keepUI) {
    if (IS_TIZEN) { avStop(); if (!keepUI) spinner(false); return; }
    var video = $('video');
    if (S.hls) { try { S.hls.destroy(); } catch (e) {} S.hls = null; }
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {}
    if (!keepUI) spinner(false);
  }

  // ---- AVPlay (Samsung Tizen) ----
  function setTvTransparent(on) {
    document.documentElement.classList.toggle('av-transparent', on);
    document.body.classList.toggle('av-transparent', on);
  }
  function avSetup() {
    // El video de AVPlay se dibuja en una capa de hardware DETRÁS del navegador:
    // hay que volver transparentes html/body y el fondo del player para que se vea.
    setTvTransparent(true);
    $('player').style.background = 'transparent';
    $('pl-backdrop').style.display = 'none';
    $('video').style.display = 'none';
    $('av').style.display = 'block';
  }
  function avTeardown() {
    avStop();
    $('av').style.display = 'none';
    $('video').style.display = '';
    $('pl-backdrop').style.display = '';
    $('player').style.background = '#000';
    setTvTransparent(false);
  }
  function avPlay(url, ch) {
    var av = window.webapis.avplay;
    try { av.stop(); } catch (e) {}
    try { av.close(); } catch (e) {}
    try {
      av.open(url);
      try { av.setDisplayRect(0, 0, 1920, 1080); } catch (e) {}
      try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'); } catch (e) {}
      av.setListener({
        onbufferingstart: function () { spinner(true); },
        onbufferingcomplete: function () { spinner(false); },
        onstreamcompleted: function () { try { av.stop(); } catch (e) {} },
        onerror: function () { spinner(false); tryBackupOr(ch, 'avplay'); }
      });
      av.prepareAsync(function () {
        try { av.play(); } catch (e) {}
        spinner(false);
      }, function () { spinner(false); tryBackupOr(ch, 'avplay-prepare'); });
    } catch (e) { spinner(false); tryBackupOr(ch, 'avplay-open'); }
  }
  function avStop() {
    if (!IS_TIZEN) return;
    try { window.webapis.avplay.stop(); } catch (e) {}
    try { window.webapis.avplay.close(); } catch (e) {}
  }

  // ---- Vista previa en vivo en el spotlight ----
  var PV = { timer: null, active: false, hls: null };
  function spotlightChannel() {
    var list = curList();
    var idx = S.region === 'grid' ? clamp(S.gridIndex, 0, list.length - 1) : 0;
    return list[idx] || S.channels[0];
  }
  function schedulePreview() {
    if (!CFG.spotlightPreview || S.view !== 'home') return;
    clearTimeout(PV.timer);
    PV.timer = setTimeout(startPreview, CFG.previewDelayMs || 1200);
  }
  function startPreview() {
    if (S.view !== 'home' || !CFG.spotlightPreview) return;
    var ch = spotlightChannel(); if (!ch) return;
    var art = $('sp-art'); if (!art) return;
    var url = ch.url || ch.backup_url; if (!url) return;
    PV.active = true;
    var r = art.getBoundingClientRect();
    if (IS_TIZEN) avPreview(url, ch, r, art);
    else pcPreview(url, art);
  }
  function stopPreview() {
    clearTimeout(PV.timer);
    if (!PV.active) return;
    PV.active = false;
    if (IS_TIZEN) { avStop(); closeHole(); }
    else {
      var v = $('sp-video');
      if (PV.hls) { try { PV.hls.destroy(); } catch (e) {} PV.hls = null; }
      if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} v.style.display = 'none'; }
    }
    if (S.view === 'home') renderSpotlight();
  }
  function avPreview(url, ch, r, art) {
    var av = window.webapis.avplay;
    try { av.stop(); } catch (e) {}
    try { av.close(); } catch (e) {}
    try {
      av.open(url);
      try { av.setDisplayRect(Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)); } catch (e) {}
      try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN'); } catch (e) {}
      av.setListener({
        onbufferingcomplete: function () { if (PV.active) openHole(r, art); },
        onerror: function () { stopPreview(); }
      });
      av.prepareAsync(function () { try { av.play(); } catch (e) {} if (PV.active) openHole(r, art); },
        function () { stopPreview(); });
    } catch (e) { stopPreview(); }
  }
  function pcPreview(url, art) {
    var v = $('sp-video'); if (!v) return;
    var r = art.getBoundingClientRect();
    v.style.left = r.left + 'px'; v.style.top = r.top + 'px';
    v.style.width = r.width + 'px'; v.style.height = r.height + 'px';
    v.style.display = 'block';
    if (window.Hls && window.Hls.isSupported() && /\.m3u8(\?|$)/i.test(url)) {
      var hls = new window.Hls({ liveDurationInfinity: true });
      PV.hls = hls; hls.loadSource(url); hls.attachMedia(v);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () { v.play().catch(function () {}); });
    } else { v.src = url; v.play().catch(function () {}); }
  }
  function openHole(r, art) {
    if (!IS_TIZEN || !PV.active) return;
    setTvTransparent(true);
    var hb = $('home-bg'); if (hb) hb.classList.add('holed');
    setStrips(r);
    if (art) {
      art.style.background = 'transparent';
      var lg = art.querySelector('.sp-logo'); if (lg) lg.style.visibility = 'hidden';
      var sc = art.querySelector('.sp-scrim'); if (sc) sc.style.display = 'none';
    }
  }
  function closeHole() {
    setTvTransparent(false);
    var hb = $('home-bg'); if (hb) hb.classList.remove('holed');
    ['hole-t', 'hole-b', 'hole-l', 'hole-r'].forEach(function (id) { var e = $(id); if (e) e.style.display = 'none'; });
  }
  function setStrips(r) {
    var W = 1920, H = 1080, o = 1; // 1px de solape para que no queden costuras
    place('hole-t', 0, 0, W, r.top + o);
    place('hole-b', 0, r.bottom - o, W, H - r.bottom + o);
    place('hole-l', 0, r.top - o, r.left + o, r.height + 2 * o);
    place('hole-r', r.right - o, r.top - o, W - r.right + o, r.height + 2 * o);
  }
  function place(id, x, y, w, h) {
    var e = $(id); if (!e) return;
    e.style.left = x + 'px'; e.style.top = y + 'px';
    e.style.width = Math.max(0, w) + 'px'; e.style.height = Math.max(0, h) + 'px';
    e.style.display = 'block';
  }

  function changeCat(d) {
    var i = clamp(S.catIndex + d, 0, S.categories.length - 1);
    if (i === S.catIndex) return;
    S.catIndex = i; S.gridIndex = 0;
    renderHome(); // mantiene la región actual; la grilla y el spotlight reflejan la nueva categoría
  }

  // ---- Teclado ----
  function onKey(e) {
    var c = e.keyCode, v = S.view;
    if (v === 'boot') {
      if (isKey(KEY.ENTER, c) || isKey(KEY.RIGHT, c) || c === 32) { e.preventDefault(); goHome(); }
      return;
    }
    if (v === 'player') {
      if (isKey(KEY.BACK, c)) exitPlayer();
      else if (isKey(KEY.RIGHT, c) || isKey(KEY.CH_UP, c)) playerStep(1);
      else if (isKey(KEY.LEFT, c) || isKey(KEY.CH_DOWN, c)) playerStep(-1);
      else if (isKey(KEY.ENTER, c)) toggleBanner();
      else return;
      e.preventDefault(); return;
    }
    if (v !== 'home') return;
    var n = curList().length;
    // CH+ / CH- cambian de categoría en la guía (en cualquier región)
    if (isKey(KEY.CH_UP, c)) { changeCat(1); e.preventDefault(); return; }
    if (isKey(KEY.CH_DOWN, c)) { changeCat(-1); e.preventDefault(); return; }
    if (S.region === 'sidebar') {
      if (isKey(KEY.DOWN, c)) { S.catIndex = Math.min(S.categories.length - 1, S.catIndex + 1); S.gridIndex = 0; renderHome(); }
      else if (isKey(KEY.UP, c)) { S.catIndex = Math.max(0, S.catIndex - 1); S.gridIndex = 0; renderHome(); }
      else if (isKey(KEY.RIGHT, c) || isKey(KEY.ENTER, c)) { if (n) { S.region = 'grid'; S.gridIndex = 0; renderHome(); } }
      else return;
    } else {
      var gi = S.gridIndex;
      if (isKey(KEY.RIGHT, c)) { if (gi % COLS < COLS - 1 && gi + 1 < n) { S.gridIndex++; renderHome(); } }
      else if (isKey(KEY.LEFT, c)) { if (gi % COLS === 0) { S.region = 'sidebar'; renderHome(); } else { S.gridIndex--; renderHome(); } }
      else if (isKey(KEY.DOWN, c)) { if (gi + COLS < n) { S.gridIndex += COLS; renderHome(); } else if (gi < n - 1) { S.gridIndex = n - 1; renderHome(); } }
      else if (isKey(KEY.UP, c)) { if (gi < COLS) { S.region = 'sidebar'; renderHome(); } else { S.gridIndex -= COLS; renderHome(); } }
      else if (isKey(KEY.ENTER, c)) { openPlayer(S.gridIndex); }
      else if (isKey(KEY.BACK, c)) { S.region = 'sidebar'; renderHome(); }
      else return;
    }
    e.preventDefault();
  }

  function registerKeys() {
    try {
      if (window.tizen && window.tizen.tvinputdevice) {
        ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'ChannelUp', 'ChannelDown',
         'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'].forEach(function (k) {
          try { window.tizen.tvinputdevice.registerKey(k); } catch (e) {}
        });
      }
    } catch (e) {}
  }

  function start() {
    registerKeys();
    tickClock();
    S.clockTimer = setInterval(tickClock, 20000);
    document.addEventListener('keydown', onKey);
    startBoot();
    // El catálogo carga en paralelo mientras corre el boot; al llegar, refresca si ya estamos en Home.
    loadCatalog().then(function () { if (S.view === 'home') renderHome(); }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
