(function () {
  var chart = null;

  function chartTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      text: dark ? '#cbd5e1' : '#64748b'
    };
  }

  function renderChart(rows) {
    var labels = rows.map(function (r) { return r.name; });
    var hot = rows.map(function (r) { return r.hotspot; });
    var ppp = rows.map(function (r) { return r.ppp; });
    var t = chartTheme();
    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = hot;
      chart.data.datasets[1].data = ppp;
      chart.update();
      return;
    }
    var ctx = document.getElementById('opdChart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Hotspot', data: hot, backgroundColor: 'rgba(37,99,235,0.85)', borderRadius: 6 },
          { label: 'PPP/VPN', data: ppp, backgroundColor: 'rgba(217,119,6,0.85)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: t.text, font: { family: 'Inter' } } } },
        scales: {
          y: { beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.text } },
          x: { grid: { display: false }, ticks: { color: t.text } }
        }
      }
    });
  }

  function updateTable(rows) {
    rows.forEach(function (r) {
      var tr = document.querySelector('tr[data-name="' + CSS.escape(r.name) + '"]');
      if (!tr) return;
      var status = tr.querySelector('.status-cell');
      var btn = tr.querySelector('.detail-btn');
      if (r.online) {
        status.className = 'badge badge--success status-cell';
        status.innerHTML = '<i class="fa-solid fa-check"></i> Online · ' + (r.hotspot + r.ppp) + ' user';
        btn.classList.remove('is-disabled');
      } else {
        status.className = 'badge badge--danger status-cell';
        status.innerHTML = '<i class="fa-solid fa-xmark"></i> Offline';
        btn.classList.add('is-disabled');
      }
    });
  }

  async function refresh() {
    var resp = await fetch('/api/opd-users/summary');
    var data = await resp.json();
    renderChart(data);
    updateTable(data);
    NETRA.markUpdate();
  }

  refresh();
  setInterval(refresh, 15000);

  NETRA.connectWs('opd', function () {});
})();
