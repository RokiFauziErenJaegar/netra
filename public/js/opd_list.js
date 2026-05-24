(function () {
  var chart = null;

  function renderChart(rows) {
    var labels = rows.map(function (r) { return r.name; });
    var hot = rows.map(function (r) { return r.hotspot; });
    var ppp = rows.map(function (r) { return r.ppp; });
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
          { label: 'Hotspot', data: hot, backgroundColor: 'rgba(13,110,253,0.75)' },
          { label: 'PPP/VPN', data: ppp, backgroundColor: 'rgba(255,193,7,0.75)' }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
  }

  function updateTable(rows) {
    rows.forEach(function (r) {
      var tr = document.querySelector('tr[data-name="' + CSS.escape(r.name) + '"]');
      if (!tr) return;
      var status = tr.querySelector('.status-cell');
      var btn = tr.querySelector('.detail-btn');
      if (r.online) {
        status.className = 'badge bg-success status-cell';
        status.textContent = 'Online (' + (r.hotspot + r.ppp) + ' user)';
        btn.classList.remove('disabled');
      } else {
        status.className = 'badge bg-danger status-cell';
        status.textContent = 'Offline';
        btn.classList.add('disabled');
      }
    });
  }

  async function refresh() {
    var resp = await fetch('/api/opd-users/summary');
    var data = await resp.json();
    renderChart(data);
    updateTable(data);
  }

  refresh();
  setInterval(refresh, 15000);
})();
