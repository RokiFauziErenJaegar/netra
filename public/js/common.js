// Utilities umum dipakai semua halaman dashboard
(function () {
  window.NETRA = window.NETRA || {};

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

  NETRA.connectWs = function (topic, onMessage) {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = proto + '//' + location.host + '/ws?topic=' + encodeURIComponent(topic);
    var ws;
    var badge = document.getElementById('wsBadge');
    var retry = 0;

    function setBadge(state) {
      if (!badge) return;
      badge.classList.remove('connected', 'disconnected', 'bg-secondary');
      if (state === 'connected') {
        badge.classList.add('connected');
        badge.innerHTML = '<i class="fa-solid fa-plug me-1"></i> Live';
      } else if (state === 'connecting') {
        badge.classList.add('bg-secondary');
        badge.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin me-1"></i> WS';
      } else {
        badge.classList.add('disconnected');
        badge.innerHTML = '<i class="fa-solid fa-plug me-1"></i> Offline';
      }
    }

    function connect() {
      setBadge('connecting');
      ws = new WebSocket(url);
      ws.onopen = function () {
        retry = 0;
        setBadge('connected');
      };
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
      ws.onerror = function () {
        try { ws.close(); } catch (e) {}
      };
    }

    connect();
    return { close: function () { ws && ws.close(); } };
  };
})();
