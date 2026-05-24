(function () {
  var id = window.__OPD_ID__;
  var chart = null;

  function chartTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      text: dark ? '#cbd5e1' : '#64748b'
    };
  }

  async function load() {
    var resp = await fetch('/api/opd/' + id + '/chart');
    var data = await resp.json();
    var empty = document.getElementById('emptyState');
    var canvas = document.getElementById('trafficChart');
    if (!data.length) {
      empty.style.display = 'block';
      canvas.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    canvas.style.display = 'block';

    var labels = data.map(function (d) { return String(d.waktu_cek).substring(11, 16); });
    var rx = data.map(function (d) { return +d.rx_mbps.toFixed(3); });
    var tx = data.map(function (d) { return +d.tx_mbps.toFixed(3); });
    var t = chartTheme();

    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = rx;
      chart.data.datasets[1].data = tx;
      chart.update();
      return;
    }
    var ctx = canvas.getContext('2d');
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Download (Mbps)', data: rx, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.10)', tension: 0.35, fill: true, pointRadius: 0 },
          { label: 'Upload (Mbps)',   data: tx, borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.10)', tension: 0.35, fill: true, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: t.text, font: { family: 'Inter' } } } },
        scales: {
          y: { beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.text, font: { family: 'Inter' } } },
          x: { grid: { display: false }, ticks: { color: t.text, font: { family: 'Inter' } } }
        }
      }
    });
  }

  load();
  setInterval(load, 10000);
})();
