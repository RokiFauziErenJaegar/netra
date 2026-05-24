(function () {
  var name = window.__OPD_NAME__;
  var distChart, top5Chart;

  function renderHotspot(rows) {
    var tbody = document.querySelector('#hotspotTable tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Tidak ada user hotspot aktif</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r, i) {
      var inB = Number(r['bytes-in'] || 0);
      var outB = Number(r['bytes-out'] || 0);
      var total = inB + outB;
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td class="fw-bold">' + NETRA.escapeHtml(r.user || '-') + '</td>' +
        '<td><code>' + NETRA.escapeHtml(r.address || '-') + '</code></td>' +
        '<td><code>' + NETRA.escapeHtml(r['mac-address'] || '-') + '</code></td>' +
        '<td>' + NETRA.escapeHtml(r.uptime || '-') + '</td>' +
        '<td>' + NETRA.fmtBytes(inB) + '</td>' +
        '<td>' + NETRA.fmtBytes(outB) + '</td>' +
        '<td class="fw-bold">' + NETRA.fmtBytes(total) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderPpp(rows) {
    var tbody = document.querySelector('#pppTable tbody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Tidak ada user PPP aktif</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (r, i) {
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + NETRA.escapeHtml(r.service || '-') + '</td>' +
        '<td class="fw-bold">' + NETRA.escapeHtml(r.name || '-') + '</td>' +
        '<td><code>' + NETRA.escapeHtml(r['caller-id'] || '-') + '</code></td>' +
        '<td>' + NETRA.escapeHtml(r.uptime || '-') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderDist(hotspot, ppp) {
    var ctx = document.getElementById('dist').getContext('2d');
    if (distChart) {
      distChart.data.datasets[0].data = [hotspot.length, ppp.length];
      distChart.update();
      return;
    }
    distChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Hotspot', 'PPP/VPN'], datasets: [{ data: [hotspot.length, ppp.length], backgroundColor: ['#0d6efd', '#ffc107'] }] },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  function renderTop5(hotspot) {
    var top = hotspot
      .map(function (r) { return { user: r.user || '-', total: Number(r['bytes-in'] || 0) + Number(r['bytes-out'] || 0) }; })
      .sort(function (a, b) { return b.total - a.total; })
      .slice(0, 5);
    var ctx = document.getElementById('top5').getContext('2d');
    var labels = top.map(function (t) { return t.user; });
    var data = top.map(function (t) { return (t.total / 1048576).toFixed(2); });
    if (top5Chart) {
      top5Chart.data.labels = labels;
      top5Chart.data.datasets[0].data = data;
      top5Chart.update();
      return;
    }
    top5Chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: 'Total MB', data: data, backgroundColor: 'rgba(13,110,253,0.75)' }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true } } }
    });
  }

  async function load() {
    document.getElementById('errBox').classList.add('d-none');
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
      var box = document.getElementById('errBox');
      box.classList.remove('d-none');
      box.textContent = 'Gagal mengambil data: ' + e.message;
    }
  }

  load();
  setInterval(load, 20000);
})();
