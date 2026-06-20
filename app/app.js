/* Airtek TV — TizenBrew app
 * Catálogo público: GET {apiBase}/get/channels/{provider}/{version}
 * Streams HLS (.m3u8) servidos solo dentro de la red Airtek.
 */
(function () {
  'use strict';

  var CFG = window.AIRTEK_CONFIG;
  var COLS = 5; // columnas de la grilla

  // Íconos por categoría (la clave se compara en minúsculas y sin acentos)
  var CAT_ICONS = {
    'todos': '▦', 'entretenimiento': '🎬', 'nacionales': '📡', 'deportes': '⚽',
    'infantil': '🧸', 'musica': '🎵', 'música': '🎵', 'airtek goool': '🥅',
    'religion': '✝', 'religión': '✝', 'educativo': '🎓', 'telenovelas': '💗',
    'estilo de vida': '✨'
  };
  function catIcon(name) {
    return CAT_ICONS[String(name || '').toLowerCase()] || '📺';
  }

  // Códigos de tecla (Tizen remote + teclado estándar para desarrollo)
  var KEY = {
    LEFT: [37], UP: [38], RIGHT: [39], DOWN: [40],
    ENTER: [13], BACK: [10009, 8, 27 /* Esc=dev */],
    CH_UP: [427, 33 /* PgUp */], CH_DOWN: [428, 34 /* PgDn */],
    PLAYPAUSE: [10252, 415, 19],
  };
  function isKey(group, code) { return group.indexOf(code) !== -1; }

  // ---------- Estado ----------
  var state = {
    channels: [],
    categories: [],          // [{name, items:[channel...]}]
    catIndex: 0,
    cardIndex: 0,
    zone: 'rail',            // 'rail' | 'grid'
    mode: 'splash',          // 'splash' | 'browse' | 'player'
    playingList: [],         // lista de canales del reproductor actual
    playingIndex: 0,
    hls: null,
    osdTimer: null,
  };

  // ---------- Utilidades DOM ----------
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Carga del catálogo ----------
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
    setSplash('Conectando con Airtek…');
    return fetchWithTimeout(apiUrl, CFG.fetchTimeoutMs)
      .catch(function (e) {
        // Fallback a catálogo local para no bloquear la UI en desarrollo
        setSplash('Sin conexión al API, usando catálogo local…');
        return fetchWithTimeout(CFG.mockUrl, CFG.fetchTimeoutMs);
      })
      .then(function (json) {
        var data = (json && json.data) ? json.data : [];
        state.channels = data.slice().sort(function (a, b) {
          return (a.order || 0) - (b.order || 0);
        });
        buildCategories();
      });
  }

  function buildCategories() {
    var map = {};
    var ordered = [];
    state.channels.forEach(function (ch, i) { ch._num = i + 1; });
    state.channels.forEach(function (ch) {
      var tag = (ch.categories && ch.categories.tags) ? ch.categories.tags : 'Otros';
      if (!map[tag]) { map[tag] = { name: tag, items: [] }; ordered.push(map[tag]); }
      map[tag].items.push(ch);
    });
    ordered.sort(function (a, b) { return b.items.length - a.items.length; });
    // "Todos" al inicio
    state.categories = [{ name: 'Todos', items: state.channels }].concat(ordered);
  }

  // ---------- Render ----------
  function setSplash(msg) { var s = $('splash-status'); if (s) s.textContent = msg; }

  function renderRail() {
    var rail = $('rail-cats');
    var html = '';
    state.categories.forEach(function (cat, i) {
      var cls = 'cat' + (i === state.catIndex ? ' active' : '') +
                (state.zone === 'rail' && i === state.catIndex ? ' focused' : '');
      html += '<div class="' + cls + '" data-i="' + i + '">' +
                '<span class="cat-ico">' + catIcon(cat.name) + '</span>' +
                '<span>' + esc(cat.name) + '</span></div>';
    });
    rail.innerHTML = html;
  }

  function renderGrid() {
    var cat = state.categories[state.catIndex] || { name: '', items: [] };
    $('cat-title').textContent = cat.name;
    $('cat-count').textContent = cat.items.length + ' canales';
    var grid = $('grid');
    if (!cat.items.length) { grid.innerHTML = '<div class="notice">No hay canales en esta categoría.</div>'; return; }
    var html = '';
    cat.items.forEach(function (ch, i) {
      var focused = (state.zone === 'grid' && i === state.cardIndex) ? ' focused' : '';
      var thumb = ch.thumbnail
        ? '<img src="' + esc(ch.thumbnail) + '" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.innerHTML=\'<span class=&quot;ph&quot;>📺</span>\'" />'
        : '<span class="ph">📺</span>';
      html += '<div class="card' + focused + '" data-i="' + i + '">' +
                '<div class="card-num">' + (ch._num || (i + 1)) + '</div>' +
                '<div class="card-thumb">' + thumb + '</div>' +
                '<div class="card-title">' + esc(ch.title || 'Canal') + '</div>' +
              '</div>';
    });
    grid.innerHTML = html;
    scrollToCard();
  }

  function scrollToCard() {
    var grid = $('grid');
    var card = grid.querySelector('.card.focused');
    if (!card) return;
    var row = Math.floor(state.cardIndex / COLS);
    var cardH = card.offsetHeight + 26; // + gap
    var targetTop = row * cardH;
    var viewH = grid.clientHeight;
    if (targetTop < grid.scrollTop) grid.scrollTop = targetTop;
    else if (targetTop + cardH > grid.scrollTop + viewH) grid.scrollTop = targetTop + cardH - viewH;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- Navegación ----------
  function moveRail(delta) {
    state.catIndex = clamp(state.catIndex + delta, 0, state.categories.length - 1);
    state.cardIndex = 0;
    renderRail(); renderGrid();
  }

  function enterGrid() {
    var cat = state.categories[state.catIndex];
    if (!cat || !cat.items.length) return;
    state.zone = 'grid'; state.cardIndex = 0;
    renderRail(); renderGrid();
  }

  function moveGrid(dx, dy) {
    var items = state.categories[state.catIndex].items;
    var i = state.cardIndex;
    var col = i % COLS;
    if (dx === -1) {
      if (col === 0) { state.zone = 'rail'; renderRail(); renderGrid(); return; }
      i -= 1;
    } else if (dx === 1) { if (col < COLS - 1) i += 1; }
    else if (dy === -1) { i -= COLS; }
    else if (dy === 1) { i += COLS; }
    if (i >= 0 && i < items.length) { state.cardIndex = i; renderGrid(); }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------- Reproductor ----------
  function playFromGrid() {
    var cat = state.categories[state.catIndex];
    state.playingList = cat.items;
    state.playingIndex = state.cardIndex;
    openPlayer();
    playCurrent();
  }

  function openPlayer() {
    state.mode = 'player';
    $('browse').classList.add('hidden');
    $('player').classList.remove('hidden');
  }
  function closePlayer() {
    stopPlayback();
    state.mode = 'browse';
    $('player').classList.add('hidden');
    $('browse').classList.remove('hidden');
  }

  function currentChannel() { return state.playingList[state.playingIndex]; }

  function playCurrent() {
    var ch = currentChannel();
    if (!ch) return;
    var url = ch.url || ch.backup_url;
    showSpinner(true);
    showOSD(ch, 'Cargando…');
    startPlayback(url, ch);
  }

  function startPlayback(url, ch) {
    var video = $('video');
    stopPlayback(true);

    function onReady() { showSpinner(false); showOSD(ch, '', true); }
    function onError(detail) { showSpinner(false); tryBackupOr(ch, detail); }

    // 1) hls.js (motores con MSE, recomendado en Tizen)
    if (window.Hls && window.Hls.isSupported() && /\.m3u8(\?|$)/i.test(url)) {
      var hls = new window.Hls({ liveDurationInfinity: true, lowLatencyMode: false });
      state.hls = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, function () { video.play().then(onReady).catch(onReady); });
      hls.on(window.Hls.Events.ERROR, function (_e, data) { if (data && data.fatal) onError(data.type); });
      return;
    }
    // 2) HLS nativo (Tizen suele soportarlo en <video>)
    video.src = url;
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', function () { onError('native'); }, { once: true });
    video.play().catch(function () { /* esperando loadeddata */ });
  }

  function tryBackupOr(ch, detail) {
    if (ch && ch.backup_url && ch.url !== ch.backup_url && !ch._triedBackup) {
      ch._triedBackup = true;
      showOSD(ch, 'Reintentando (respaldo)…');
      startPlayback(ch.backup_url, ch);
    } else {
      showOSD(ch, 'No se pudo reproducir (' + detail + ')');
    }
  }

  function stopPlayback(keepUI) {
    var video = $('video');
    if (state.hls) { try { state.hls.destroy(); } catch (e) {} state.hls = null; }
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {}
    if (!keepUI) showSpinner(false);
  }

  function zapBy(delta) {
    if (!state.playingList.length) return;
    state.playingIndex = (state.playingIndex + delta + state.playingList.length) % state.playingList.length;
    var ch = currentChannel(); if (ch) ch._triedBackup = false;
    playCurrent();
  }

  function showSpinner(on) { $('player-spinner').classList.toggle('hidden', !on); }

  function categoryOfPlaying() {
    var c = state.categories[state.catIndex];
    return c ? c.name : '';
  }

  function showOSD(ch, stateTxt, live) {
    ch = ch || {};
    $('osd-num').textContent = ch._num || '';
    $('osd-now').textContent = ch.title || '';
    var st = $('osd-state');
    st.textContent = live ? 'EN VIVO' : (stateTxt || '');
    st.style.display = live ? '' : (stateTxt ? '' : 'none');
    st.style.background = live ? '#ff4d4d' : 'transparent';
    st.style.color = live ? '#021018' : 'var(--text-dim)';
    var cat = $('osd-cat'); if (cat) cat.textContent = (ch.categories && ch.categories.tags) || categoryOfPlaying();
    var osd = $('osd'); osd.classList.add('show');
    $('player').classList.add('osd-on');
    if (state.osdTimer) clearTimeout(state.osdTimer);
    state.osdTimer = setTimeout(function () {
      osd.classList.remove('show'); $('player').classList.remove('osd-on');
    }, 4500);
  }

  // ---------- Teclado / control remoto ----------
  function onKey(e) {
    var c = e.keyCode;
    if (state.mode === 'browse') return onKeyBrowse(c, e);
    if (state.mode === 'player') return onKeyPlayer(c, e);
  }

  function onKeyBrowse(c, e) {
    if (isKey(KEY.UP, c)) { if (state.zone === 'rail') moveRail(-1); else moveGrid(0, -1); }
    else if (isKey(KEY.DOWN, c)) { if (state.zone === 'rail') moveRail(1); else moveGrid(0, 1); }
    else if (isKey(KEY.RIGHT, c)) { if (state.zone === 'rail') enterGrid(); else moveGrid(1, 0); }
    else if (isKey(KEY.LEFT, c)) { if (state.zone === 'grid') moveGrid(-1, 0); }
    else if (isKey(KEY.ENTER, c)) { if (state.zone === 'rail') enterGrid(); else playFromGrid(); }
    else if (isKey(KEY.BACK, c)) { if (state.zone === 'grid') { state.zone = 'rail'; renderRail(); renderGrid(); } }
    else return;
    e.preventDefault();
  }

  function onKeyPlayer(c, e) {
    if (isKey(KEY.BACK, c)) closePlayer();
    else if (isKey(KEY.RIGHT, c) || isKey(KEY.CH_UP, c)) zapBy(1);
    else if (isKey(KEY.LEFT, c) || isKey(KEY.CH_DOWN, c)) zapBy(-1);
    else if (isKey(KEY.UP, c) || isKey(KEY.DOWN, c)) showOSD(currentChannel(), '', true);
    else return;
    e.preventDefault();
  }

  // ---------- Registro de teclas Tizen ----------
  function registerKeys() {
    try {
      if (window.tizen && tizen.tvinputdevice) {
        ['MediaPlayPause','MediaPlay','MediaPause','MediaStop','ChannelUp','ChannelDown',
         'ColorF0Red','ColorF1Green','ColorF2Yellow','ColorF3Blue'].forEach(function (k) {
          try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
        });
      }
    } catch (e) {}
  }

  // ---------- Init ----------
  var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  function tickClock() {
    var d = new Date();
    var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
    var clk = $('clock'); if (clk) clk.textContent = hh + ':' + mm;
    var dt = $('clock-date'); if (dt) dt.textContent = DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()];
  }
  function startClock() { tickClock(); setInterval(tickClock, 15000); }

  function start() {
    registerKeys();
    startClock();
    document.addEventListener('keydown', onKey);
    loadCatalog().then(function () {
      state.mode = 'browse';
      $('splash').classList.add('hidden');
      $('browse').classList.remove('hidden');
      renderRail(); renderGrid();
    }).catch(function (e) {
      setSplash('Error cargando el catálogo: ' + e.message);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
