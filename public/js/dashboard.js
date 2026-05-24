(function () {
  function renderRow(row, i) {
    var statusBadge = row.status_terakhir === 'Up'
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
        '<td class="text-right num text-accent strong text-nowrap">' + NETRA.fmtMbps(row.last_rx_bps) + '</td>' +
        '<td class="text-right num text-accent strong text-nowrap">' + NETRA.fmtMbps(row.last_tx_bps) + '</td>' +
        '<td class="text-center">' + disabled + '</td>' +
        '<td class="text-center">' + statusBadge + '</td>' +
        '<td class="muted text-nowrap fs-xs">' + NETRA.escapeHtml(row.last_update || '-') + '</td>' +
        '<td class="text-center"><a href="/detail/' + row.id_opd + '" class="btn btn--ghost btn--sm" title="Detail">' +
          '<i class="fa-solid fa-chart-line"></i></a></td>' +
      '</tr>'
    );
  }

  function applySnapshot(snap) {
    if (!snap) return;
    if (!snap.ok) {
      var alert = document.getElementById('pesanDashboard');
      alert.className = 'alert alert--danger';
      alert.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><div>Gagal kontak MikroTik Diskominfo: ' + NETRA.escapeHtml(snap.error) + '</div>';
      return;
    }
    var s = snap.summary || { total: 0, up: 0, down: 0 };
    NETRA.setText('totalInterface', s.total);
    NETRA.setText('totalUp', s.up);
    NETRA.setText('totalDown', s.down);
    NETRA.setText('waktuUpdate', snap.time);

    var tbody = document.getElementById('interfaceRows');
    if (snap.interfaces && snap.interfaces.length) {
      tbody.innerHTML = snap.interfaces.map(renderRow).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="10" class="table__empty">Belum ada data interface.</td></tr>';
    }

    var pesan = document.getElementById('pesanDashboard');
    pesan.className = 'alert alert--success';
    pesan.innerHTML = '<i class="fa-solid fa-circle-check"></i><div>Berhasil membaca <strong>' + s.total + '</strong> interface MikroTik Diskominfo · Terakhir update: ' + snap.time + '</div>';

    NETRA.markUpdate();
  }

  fetch('/api/dashboard/snapshot')
    .then(function (r) { return r.json(); })
    .then(function (data) { if (data.snapshot) applySnapshot(data.snapshot); });

  NETRA.connectWs('dashboard', applySnapshot);
})();
