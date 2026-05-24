'use strict';

function formatMbps(bps) {
  return (Number(bps || 0) / 1_000_000).toFixed(2) + ' Mbps';
}

function formatBytes(bytes) {
  const b = Number(bytes || 0);
  if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(2) + ' GB';
  if (b >= 1_048_576) return (b / 1_048_576).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(2) + ' KB';
  return b + ' B';
}

function stripPort(addr) {
  const s = String(addr || '');
  if (s.startsWith('[')) {
    const end = s.indexOf(']');
    return end !== -1 ? s.slice(1, end) : s;
  }
  const i = s.lastIndexOf(':');
  if (i !== -1 && (s.match(/:/g) || []).length === 1) return s.slice(0, i);
  return s;
}

function nowMysql() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes()) +
    ':' +
    pad(d.getSeconds())
  );
}

function boolMt(v) {
  return /^(true|yes|1)$/i.test(String(v || '')) ? 1 : 0;
}

function safe(value) {
  return value === undefined || value === null ? '' : String(value);
}

module.exports = { formatMbps, formatBytes, stripPort, nowMysql, boolMt, safe };
