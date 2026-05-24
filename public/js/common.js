// Netra — Common client-side utilities
// Auto-initialized: theme toggle, mobile drawer, WS badge management.
(function () {
  window.NETRA = window.NETRA || {};

  // ---- Formatters --------------------------------------------------------
  NETRA.fmtMbps = function (bps) {
    return (Number(bps || 0) / 1000000).toFixed(2) + ' Mbps';
  };

  NETRA.fmtBytes = function (bytes) {
    var b = Number(bytes || 0);
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(2) + ' KB';
    return b + ' B';
  };

  NETRA.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // ---- Live ticker (relative "Xs lalu") ----------------------------------
  NETRA.markUpdate = function () {
    window.__netraLastUpdate = Date.now();
    var el = document.getElementById('waktuSinceUpdate');
    if (el) {
      el.textContent = 'baru saja';
      el.classList.remove('flash-update');
      void el.offsetWidth; // restart animation
      el.classList.add('flash-update');
    }
  };

  function tickLiveLabel() {
    if (!window.__netraLastUpdate) return;
    var el = document.getElementById('waktuSinceUpdate');
    if (!el) return;
    var s = Math.round((Date.now() - window.__netraLastUpdate) / 1000);
    if (s <= 1) el.textContent = 'baru saja';
    else if (s < 60) el.textContent = s + ' detik lalu';
    else if (s < 3600) el.textContent = Math.floor(s / 60) + ' menit lalu';
    else el.textContent = Math.floor(s / 3600) + ' jam lalu';
  }
  setInterval(tickLiveLabel, 500);

  // ---- setText with flash-on-change --------------------------------------
  // Update DOM text only if value berubah, lalu flash animasi singkat agar
  // mata user langsung tertarik ke value yang baru.
  NETRA.setText = function (elOrId, value) {
    var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return;
    var str = value == null ? '' : String(value);
    if (el.textContent === str) return;
    el.textContent = str;
    el.classList.remove('flash-update');
    void el.offsetWidth;
    el.classList.add('flash-update');
  };

  // ---- Mobile drawer -----------------------------------------------------
  function initDrawer() {
    var btn = document.getElementById('menuBtn');
    var sidebar = document.getElementById('sidebar');
    var scrim = document.getElementById('scrim');
    if (!btn || !sidebar || !scrim) return;
    function open() { sidebar.classList.add('is-open'); scrim.classList.add('is-open'); }
    function close() { sidebar.classList.remove('is-open'); scrim.classList.remove('is-open'); }
    btn.addEventListener('click', open);
    scrim.addEventListener('click', close);
    sidebar.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  // ---- Theme toggle ------------------------------------------------------
  function initTheme() {
    var btn = document.getElementById('themeBtn');
    if (!btn) return;
    var icon = btn.querySelector('i');
    function apply(theme) {
      if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (icon) icon.className = 'fa-solid fa-sun';
      } else {
        document.documentElement.removeAttribute('data-theme');
        if (icon) icon.className = 'fa-solid fa-moon';
      }
      localStorage.setItem('netra-theme', theme);
    }
    var current = localStorage.getItem('netra-theme') === 'dark' ? 'dark' : 'light';
    apply(current);
    btn.addEventListener('click', function () {
      current = current === 'dark' ? 'light' : 'dark';
      apply(current);
    });
  }

  // ---- WebSocket connection helper ---------------------------------------
  NETRA.connectWs = function (topic, onMessage) {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = proto + '//' + location.host + '/ws?topic=' + encodeURIComponent(topic);
    var ws;
    var badge = document.getElementById('wsBadge');
    var retry = 0;

    function setBadge(state) {
      if (!badge) return;
      badge.classList.remove('is-connected', 'is-disconnected', 'is-connecting');
      if (state === 'connected') {
        badge.classList.add('is-connected');
        badge.innerHTML = '<i class="fa-solid fa-circle"></i> Live';
      } else if (state === 'connecting') {
        badge.classList.add('is-connecting');
        badge.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Connecting';
      } else {
        badge.classList.add('is-disconnected');
        badge.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> Offline';
      }
    }

    function connect() {
      setBadge('connecting');
      ws = new WebSocket(url);
      ws.onopen = function () { retry = 0; setBadge('connected'); };
      ws.onmessage = function (evt) {
        try {
          var msg = JSON.parse(evt.data);
          if (msg.type === 'update') onMessage(msg.data);
        } catch (e) {}
      };
      ws.onclose = function () {
        setBadge('disconnected');
        var delay = Math.min(15000, 1000 * Math.pow(2, retry++));
        setTimeout(connect, delay);
      };
      ws.onerror = function () { try { ws.close(); } catch (e) {} };
    }

    connect();
    return { close: function () { ws && ws.close(); } };
  };

  // ---- Bootstrap on DOM ready -------------------------------------------
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(function () {
    initDrawer();
    initTheme();
  });
})();
