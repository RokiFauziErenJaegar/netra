(function () {
  var id = window.__OPD_ID__;
  var chart = null;

  async function load() {
    var resp = await fetch('/api/opd/' + id + '/chart');
    var data = await resp.json();
    if (!data.length) {
      document.getElementById('emptyState').classList.remove('d-none');
      return;
    }
    document.getElementById('emptyState').classList.add('d-none');
    var labels = data.map(function (d) { return String(d.waktu_cek).substring(11, 16); });
    var rx = data.map(function (d) { return d.rx_mbps; });
    var tx = data.map(function (d) { return d.tx_mbps; });

    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = rx;
      chart.data.datasets[1].data = tx;
      chart.update();
      return;
    }
    var ctx = document.getElementById('trafficChart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Download (Mbps)', data: rx, borderColor: '#0d6efd', tension: 0.3, fill: false },
          { label: 'Upload (Mbps)',   data: tx, borderColor: '#dc3545', tension: 0.3, fill: false }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Mbps' } } }
      }
    });
  }

  load();
  setInterval(load, 10000);
})();
