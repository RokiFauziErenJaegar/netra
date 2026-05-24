(function () {
  var chart = null;

  function chartTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      text: dark ? '#cbd5e1' : '#64748b'
    };
  }

  function bpsToMbps(v) { return Number(v || 0) / 1000000; }

  function renderChart(rows) {
    var labels = rows.map(function (r) { return r.interface_name; });
    var rx = rows.map(function (r) { return +bpsToMbps(r.avg_rx).toFixed(2); });
    var tx = rows.map(function (r) { return +bpsToMbps(r.avg_tx).toFixed(2); });
    var t = chartTheme();

    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = rx;
      chart.data.datasets[1].data = tx;
      chart.update();
      return;
    }
    var ctx = document.getElementById('trafficChart').getContext('2d');
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Download avg (Mbps)', data: rx, backgroundColor: 'rgba(37,99,235,0.85)', borderRadius: 6, borderSkipped: false },
          { label: 'Upload avg (Mbps)',   data: tx, backgroundColor: 'rgba(5,150,105,0.85)',  borderRadius: 6, borderSkipped: false }
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

  function renderIfRow(row, i) {
    var status = row.status_terakhir === 'Terhubung'
      ? '<span class="badge badge--success"><i class="fa-solid fa-check"></i> Terhubung</span>'
      : '<span class="badge badge--danger"><i class="fa-solid fa-xmark"></i> Tidak Terhubung</span>';
    var disabled = Number(row.disabled) === 1
      ? '<span class="badge badge--warning"><i class="fa-solid fa-ban"></i> Ya</span>'
      : '<span class="badge badge--neutral">Tidak</span>';
    return (
      '<tr>' +
        '<td class="muted">' + (i + 1) + '</td>' +
        '<td>' +
          '<div class="strong">' + NETRA.escapeHtml(row.interface_name) + '</div>' +
          '<div class="muted">ID: ' + NETRA.escapeHtml(row.routeros_id) + '</div>' +
        '</td>' +
        '<td class="muted">' + NETRA.escapeHtml(row.type || '-') + '</td>' +
        '<td><code>' + NETRA.escapeHtml(row.mac_address || '-') + '</code></td>' +
        '<td class="text-right num strong text-accent text-nowrap">' + NETRA.fmtMbps(row.last_rx_bps) + '</td>' +
        '<td class="text-right num strong text-accent text-nowrap">' + NETRA.fmtMbps(row.last_tx_bps) + '</td>' +
        '<td class="text-center">' + disabled + '</td>' +
        '<td class="text-center">' + status + '</td>' +
        '<td class="muted fs-xs text-nowrap">' + NETRA.escapeHtml(row.last_update || '-') + '</td>' +
      '</tr>'
    );
  }

  function renderDhcpRow(row, i) {
    var status = String(row.lease_status || '').toLowerCase() === 'bound'
      ? '<span class="badge badge--success"><i class="fa-solid fa-wifi"></i> Aktif</span>'
      : '<span class="badge badge--neutral">' + NETRA.escapeHtml(String(row.lease_status || '').toUpperCase()) + '</span>';
    return (
      '<tr>' +
        '<td class="muted">' + (i + 1) + '</td>' +
        '<td>' +
          '<div class="strong">' + NETRA.escapeHtml(row.host_name || 'Tanpa nama') + '</div>' +
          '<div class="muted">ID: ' + NETRA.escapeHtml(row.routeros_id) + '</div>' +
        '</td>' +
        '<td><code>' + NETRA.escapeHtml(row.ip_address || '-') + '</code></td>' +
        '<td class="text-right num strong text-accent text-nowrap">' + NETRA.fmtBytes(row.total_usage_bytes) + '</td>' +
        '<td class="muted fs-xs">' +
          'Last seen: ' + NETRA.escapeHtml(row.last_seen || '-') + '<br>' +
          'Expires: ' + NETRA.escapeHtml(row.expires_after || '-') +
        '</td>' +
        '<td class="text-center">' + status + '</td>' +
      '</tr>'
    );
  }

  function applySnapshot(snap) {
    if (!snap) return;
    var pesan = document.getElementById('pesanDashboard');
    if (!snap.ok) {
      pesan.className = 'alert alert--danger';
      pesan.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><div>Gagal kontak MikroTik Rumah: ' + NETRA.escapeHtml(snap.error) + '</div>';
      return;
    }

    NETRA.setText('totalInterface', snap.summary.total);
    NETRA.setText('totalTerhubung', snap.summary.terhubung);
    NETRA.setText('totalTidakTerhubung', snap.summary.tidak_terhubung);
    NETRA.setText('totalDhcp', snap.dhcpSummary.total);
    NETRA.setText('totalDhcpAktif', snap.dhcpSummary.aktif);
    NETRA.setText('totalDhcpTidakAktif', snap.dhcpSummary.tidak_aktif);
    NETRA.setText('waktuUpdate', snap.time);

    document.getElementById('interfaceRows').innerHTML = snap.interfaces && snap.interfaces.length
      ? snap.interfaces.map(renderIfRow).join('')
      : '<tr><td colspan="8" class="table__empty">Belum ada data interface.</td></tr>';

    document.getElementById('dhcpRows').innerHTML = snap.leases && snap.leases.length
      ? snap.leases.map(renderDhcpRow).join('')
      : '<tr><td colspan="6" class="table__empty">Belum ada DHCP lease.</td></tr>';

    pesan.className = 'alert alert--success';
    pesan.innerHTML = '<i class="fa-solid fa-circle-check"></i><div>Total <strong>' + snap.summary.total + '</strong> interface, <strong>' + snap.dhcpSummary.total + '</strong> DHCP lease · Update: ' + snap.time + '</div>';

    NETRA.markUpdate();
  }

  async function reloadTrafik(periode) {
    var resp = await fetch('/api/rumah/traffic?periode=' + encodeURIComponent(periode));
    var data = await resp.json();
    renderChart(data.rows || []);
    var label = ({ harian: 'Harian', mingguan: 'Mingguan', bulanan: 'Bulanan' })[periode] || periode;
    document.getElementById('labelPeriode').textContent = label;
    document.getElementById('btnExportPdf').href = '/rumah/laporan?periode=' + encodeURIComponent(periode);

    var totalBytes = 0, sumRx = 0, sumTx = 0, peak = 0;
    data.rows.forEach(function (r) {
      totalBytes += Number(r.estimasi_bytes || 0);
      sumRx += Number(r.avg_rx || 0);
      sumTx += Number(r.avg_tx || 0);
      peak = Math.max(peak, Number(r.max_rx || 0), Number(r.max_tx || 0));
    });
    var n = data.rows.length;
    document.getElementById('trTotal').textContent = NETRA.fmtBytes(totalBytes);
    document.getElementById('trAvgRx').textContent = NETRA.fmtMbps(n ? sumRx / n : 0);
    document.getElementById('trAvgTx').textContent = NETRA.fmtMbps(n ? sumTx / n : 0);
    document.getElementById('trPeak').textContent = NETRA.fmtMbps(peak);

    var tbody = document.getElementById('trafficRows');
    if (data.rows.length) {
      tbody.innerHTML = data.rows.map(function (r, i) {
        var max = Math.max(Number(r.max_rx || 0), Number(r.max_tx || 0));
        return '<tr>' +
          '<td class="muted">' + (i + 1) + '</td>' +
          '<td class="strong">' + NETRA.escapeHtml(r.interface_name) + '</td>' +
          '<td class="text-right num">' + NETRA.fmtMbps(r.avg_rx) + '</td>' +
          '<td class="text-right num">' + NETRA.fmtMbps(r.avg_tx) + '</td>' +
          '<td class="text-right num">' + NETRA.fmtMbps(max) + '</td>' +
          '<td class="text-right num strong">' + NETRA.fmtBytes(r.estimasi_bytes) + '</td>' +
          '<td class="text-right muted fs-xs">' + r.total_sample + ' sampel</td>' +
        '</tr>';
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="7" class="table__empty">Belum ada data penggunaan untuk periode ini.</td></tr>';
    }
  }

  renderChart(window.__INITIAL_TRAFFIC__ || []);

  document.getElementById('filterPeriode').addEventListener('change', function () {
    reloadTrafik(this.value);
  });

  setInterval(function () {
    var p = document.getElementById('filterPeriode').value;
    reloadTrafik(p);
  }, 30000);

  fetch('/api/rumah/snapshot')
    .then(function (r) { return r.json(); })
    .then(function (data) { if (data.snapshot) applySnapshot(data.snapshot); });
  NETRA.connectWs('rumah', applySnapshot);
})();
