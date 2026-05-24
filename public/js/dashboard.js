(function () {
  function renderRow(row, i) {
    var running = Number(row.running) === 1
      ? '<span class="text-success fw-bold">Ya</span>'
      : '<span class="text-danger fw-bold">Tidak</span>';
    var disabled = Number(row.disabled) === 1
      ? '<span class="text-danger fw-bold">Ya</span>'
      : '<span class="text-success fw-bold">Tidak</span>';
    var status = row.status_terakhir === 'Up'
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
        '<td><a href="/detail/' + row.id_opd + '" class="btn btn-sm btn-outline-primary"><i class="fa-solid fa-chart-line"></i></a></td>' +
      '</tr>'
    );
  }

  function applySnapshot(snap) {
    if (!snap) return;
    if (!snap.ok) {
      var alert = document.getElementById('pesanDashboard');
      alert.className = 'alert alert-danger shadow-sm';
      alert.textContent = 'Gagal kontak MikroTik Diskominfo: ' + snap.error;
      return;
    }
    var s = snap.summary || { total: 0, up: 0, down: 0 };
    document.getElementById('totalInterface').textContent = s.total;
    document.getElementById('totalUp').textContent = s.up;
    document.getElementById('totalDown').textContent = s.down;
    document.getElementById('waktuUpdate').textContent = snap.time;

    var tbody = document.getElementById('interfaceRows');
    if (snap.interfaces && snap.interfaces.length) {
      tbody.innerHTML = snap.interfaces.map(renderRow).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4">Belum ada data interface.</td></tr>';
    }

    var pesan = document.getElementById('pesanDashboard');
    pesan.className = 'alert alert-success shadow-sm';
    pesan.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> Berhasil membaca ' + s.total + ' interface MikroTik Diskominfo (terakhir: ' + snap.time + ').';
  }

  // initial: fetch latest snapshot
  fetch('/api/dashboard/snapshot').then(function (r) { return r.json(); }).then(function (data) {
    if (data.snapshot) applySnapshot(data.snapshot);
  });

  NETRA.connectWs('dashboard', applySnapshot);
})();
