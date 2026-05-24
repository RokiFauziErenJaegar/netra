(function () {
  var name = window.__OPD_NAME__;
  var distChart, top5Chart;

  function chartTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      text: dark ? '#cbd5e1' : '#64748b'
    };
  }

  function renderHotspot(rows) {
    var tbody = document.querySelector('#hotspotTable tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table__empty">Tidak ada user hotspot aktif</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r, i) {
      var inB = Number(r['bytes-in'] || 0);
      var outB = Number(r['bytes-out'] || 0);
      return '<tr>' +
        '<td class="muted">' + (i + 1) + '</td>' +
        '<td class="strong">' + NETRA.escapeHtml(r.user || '-') + '</td>' +
        '<td><code>' + NETRA.escapeHtml(r.address || '-') + '</code></td>' +
        '<td><code>' + NETRA.escapeHtml(r['mac-address'] || '-') + '</code></td>' +
        '<td class="muted fs-xs">' + NETRA.escapeHtml(r.uptime || '-') + '</td>' +
        '<td class="text-right num">' + NETRA.fmtBytes(inB) + '</td>' +
        '<td class="text-right num">' + NETRA.fmtBytes(outB) + '</td>' +
        '<td class="text-right num strong">' + NETRA.fmtBytes(inB + outB) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderPpp(rows) {
    var tbody = document.querySelector('#pppTable tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="table__empty">Tidak ada user PPP aktif</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r, i) {
      return '<tr>' +
        '<td class="muted">' + (i + 1) + '</td>' +
        '<td>' + NETRA.escapeHtml(r.service || '-') + '</td>' +
        '<td class="strong">' + NETRA.escapeHtml(r.name || '-') + '</td>' +
        '<td><code>' + NETRA.escapeHtml(r['caller-id'] || '-') + '</code></td>' +
        '<td class="muted fs-xs">' + NETRA.escapeHtml(r.uptime || '-') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderDist(hotspot, ppp) {
    var t = chartTheme();
    var ctx = document.getElementById('dist').getContext('2d');
    if (distChart) {
      distChart.data.datasets[0].data = [hotspot.length, ppp.length];
      distChart.update();
      return;
    }
    distChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Hotspot', 'PPP/VPN'], datasets: [{ data: [hotspot.length, ppp.length], backgroundColor: ['#2563eb', '#d97706'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: t.text, font: { family: 'Inter' } } } } }
    });
  }

  function renderTop5(hotspot) {
    var top = hotspot
      .map(function (r) { return { user: r.user || '-', total: Number(r['bytes-in'] || 0) + Number(r['bytes-out'] || 0) }; })
      .sort(function (a, b) { return b.total - a.total; })
      .slice(0, 5);
    var ctx = document.getElementById('top5').getContext('2d');
    var labels = top.map(function (t) { return t.user; });
    var data = top.map(function (t) { return +(t.total / 1048576).toFixed(2); });
    var th = chartTheme();
    if (top5Chart) {
      top5Chart.data.labels = labels;
      top5Chart.data.datasets[0].data = data;
      top5Chart.update();
      return;
    }
    top5Chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Total MB', data: data, backgroundColor: 'rgba(37,99,235,0.85)', borderRadius: 6 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: th.grid }, ticks: { color: th.text, font: { family: 'Inter' } } },
          y: { grid: { display: false }, ticks: { color: th.text, font: { family: 'Inter' } } }
        }
      }
    });
  }

  async function load() {
    var errBox = document.getElementById('errBox');
    errBox.style.display = 'none';
    try {
      var resp = await fetch('/api/opd-users/' + encodeURIComponent(name));
      var data = await resp.json();
      if (!data.ok) throw new Error(data.error || 'unknown');
      var hot = data.hotspot || [];
      var ppp = data.ppp || [];
      renderHotspot(hot);
      renderPpp(ppp);
      renderDist(hot, ppp);
      renderTop5(hot);
    } catch (e) {
      errBox.style.display = 'flex';
      document.getElementById('errBoxText').textContent = 'Gagal mengambil data: ' + e.message;
    }
  }

  load();
  setInterval(load, 20000);
})();
