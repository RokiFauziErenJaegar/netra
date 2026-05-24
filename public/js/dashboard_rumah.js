(function () {
  var chart = null;

  function bpsToMbps(v) { return Number(v || 0) / 1000000; }

  function renderChart(rows) {
    var labels = rows.map(function (r) { return r.interface_name; });
    var rx = rows.map(function (r) { return bpsToMbps(r.avg_rx).toFixed(2); });
    var tx = rows.map(function (r) { return bpsToMbps(r.avg_tx).toFixed(2); });

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
          { label: 'Download avg (Mbps)', data: rx, backgroundColor: 'rgba(13,110,253,0.75)' },
          { label: 'Upload avg (Mbps)',   data: tx, backgroundColor: 'rgba(32,201,151,0.75)' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Mbps' } } }
      }
    });
  }

  function renderIfRow(row, i) {
    var running = Number(row.running) === 1 ? '<span class="text-success fw-bold">Ya</span>' : '<span class="text-danger fw-bold">Tidak</span>';
    var disabled = Number(row.disabled) === 1 ? '<span class="text-danger fw-bold">Ya</span>' : '<span class="text-success fw-bold">Tidak</span>';
    var status = row.status_terakhir === 'Terhubung'
      ? '<span class="badge bg-success rounded-pill px-3 py-2"><i class="fa-solid fa-check me-1"></i> TERHUBUNG</span>'
      : '<span class="badge bg-danger rounded-pill px-3 py-2"><i class="fa-solid fa-xmark me-1"></i> TIDAK TERHUBUNG</span>';
    return (
      '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td class="fw-bold">' + NETRA.escapeHtml(row.interface_name) +
          '<br><small class="text-muted fw-normal">ID: ' + NETRA.escapeHtml(row.routeros_id) + '</small></td>' +
        '<td>' + NETRA.escapeHtml(row.type || '-') + '</td>' +
        '<td><code>' + NETRA.escapeHtml(row.mac_address || '-') + '</code></td>' +
        '<td class="fw-bold text-primary">' + NETRA.fmtMbps(row.last_rx_bps) + '</td>' +
        '<td class="fw-bold text-info">' + NETRA.fmtMbps(row.last_tx_bps) + '</td>' +
        '<td>' + running + '</td>' +
        '<td>' + disabled + '</td>' +
        '<td class="text-muted small">' + NETRA.escapeHtml(row.last_update || '-') + '</td>' +
        '<td>' + status + '</td>' +
      '</tr>'
    );
  }

  function renderDhcpRow(row, i) {
    var status = String(row.lease_status || '').toLowerCase() === 'bound'
      ? '<span class="badge bg-success rounded-pill px-3 py-2"><i class="fa-solid fa-wifi me-1"></i> AKTIF</span>'
      : '<span class="badge bg-secondary rounded-pill px-3 py-2">' + NETRA.escapeHtml(String(row.lease_status || '').toUpperCase()) + '</span>';
    return (
      '<tr>' +
        '<td class="text-muted">' + (i + 1) + '</td>' +
        '<td class="fw-bold">' + NETRA.escapeHtml(row.host_name || 'Tanpa nama') +
          '<br><small class="text-muted fw-normal">ID: ' + NETRA.escapeHtml(row.routeros_id) + '</small></td>' +
        '<td class="text-nowrap"><code>' + NETRA.escapeHtml(row.ip_address || '-') + '</code></td>' +
        '<td class="fw-bold text-primary text-nowrap">' + NETRA.fmtBytes(row.total_usage_bytes) + '</td>' +
        '<td class="text-muted small">Last: ' + NETRA.escapeHtml(row.last_seen || '-') +
          '<br>Expires: ' + NETRA.escapeHtml(row.expires_after || '-') + '</td>' +
        '<td class="text-nowrap">' + status + '</td>' +
      '</tr>'
    );
  }

  function applySnapshot(snap) {
    if (!snap) return;
    if (!snap.ok) {
      var pesan = document.getElementById('pesanDashboard');
      pesan.className = 'alert alert-danger shadow-sm';
      pesan.textContent = 'Gagal kontak MikroTik Rumah: ' + snap.error;
      return;
    }

    document.getElementById('totalInterface').textContent = snap.summary.total;
    document.getElementById('totalTerhubung').textContent = snap.summary.terhubung;
    document.getElementById('totalTidakTerhubung').textContent = snap.summary.tidak_terhubung;
    document.getElementById('totalDhcp').textContent = snap.dhcpSummary.total;
    document.getElementById('totalDhcpAktif').textContent = snap.dhcpSummary.aktif;
    document.getElementById('totalDhcpTidakAktif').textContent = snap.dhcpSummary.tidak_aktif;
    document.getElementById('waktuUpdate').textContent = snap.time;

    document.getElementById('interfaceRows').innerHTML = snap.interfaces && snap.interfaces.length
      ? snap.interfaces.map(renderIfRow).join('')
      : '<tr><td colspan="10" class="text-center text-muted py-4">Belum ada data interface.</td></tr>';

    document.getElementById('dhcpRows').innerHTML = snap.leases && snap.leases.length
      ? snap.leases.map(renderDhcpRow).join('')
      : '<tr><td colspan="6" class="text-center text-muted py-4">Belum ada DHCP lease.</td></tr>';

    var pesan = document.getElementById('pesanDashboard');
    pesan.className = 'alert alert-success shadow-sm';
    pesan.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> ' +
      'Total ' + snap.summary.total + ' interface, ' + snap.dhcpSummary.total + ' DHCP lease — diperbarui ' + snap.time + '.';
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
          '<td>' + (i + 1) + '</td>' +
          '<td class="fw-bold">' + NETRA.escapeHtml(r.interface_name) + '</td>' +
          '<td>' + NETRA.fmtMbps(r.avg_rx) + '</td>' +
          '<td>' + NETRA.fmtMbps(r.avg_tx) + '</td>' +
          '<td>' + NETRA.fmtMbps(max) + '</td>' +
          '<td>' + NETRA.fmtBytes(r.estimasi_bytes) + '</td>' +
          '<td class="text-muted small">' + r.total_sample + ' sampel</td>' +
        '</tr>';
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Belum ada data penggunaan.</td></tr>';
    }
  }

  // initial chart
  renderChart(window.__INITIAL_TRAFFIC__ || []);

  document.getElementById('filterPeriode').addEventListener('change', function () {
    reloadTrafik(this.value);
  });

  // Refresh trafik agregat tiap 30 detik (DB query, ringan)
  setInterval(function () {
    var p = document.getElementById('filterPeriode').value;
    reloadTrafik(p);
  }, 30000);

  // initial: fetch latest snapshot lalu subscribe WS
  fetch('/api/rumah/snapshot').then(function (r) { return r.json(); }).then(function (data) {
    if (data.snapshot) applySnapshot(data.snapshot);
  });
  NETRA.connectWs('rumah', applySnapshot);
})();
