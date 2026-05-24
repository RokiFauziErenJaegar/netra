'use strict';

const { RouterOSAPI } = require('node-routeros');
const logger = require('../logger');

/**
 * Thin wrapper around node-routeros that adds:
 * - per-call timeout enforcement
 * - automatic connect/disconnect lifecycle
 * - normalized error reporting
 *
 * Designed for short-lived sessions: connect, execute few commands, disconnect.
 * Long-lived persistent connections are intentionally avoided to keep memory low
 * and to prevent hung sockets on flaky MikroTik APIs.
 */
class MikroTikClient {
  constructor(opts) {
    this.host = opts.host;
    this.user = opts.user;
    this.password = opts.password;
    this.port = opts.port || 8728;
    this.tls = !!opts.tls;
    this.timeoutMs = opts.timeoutMs || 5000;
    this.label = opts.label || opts.host;
  }

  _newConn() {
    return new RouterOSAPI({
      host: this.host,
      user: this.user,
      password: this.password,
      port: this.port,
      tls: this.tls ? {} : undefined,
      timeout: Math.ceil(this.timeoutMs / 1000)
    });
  }

  /**
   * Open a connection, run `fn(conn)`, always close.
   * Returns whatever fn returns or throws if anything fails.
   */
  async withSession(fn) {
    const conn = this._newConn();
    const start = Date.now();
    try {
      await this._withTimeout(conn.connect(), 'connect');
      const result = await fn(conn);
      return result;
    } finally {
      try {
        await conn.close();
      } catch (e) {
        // ignore close errors
      }
      logger.debug({ host: this.label, durationMs: Date.now() - start }, 'mikrotik session');
    }
  }

  _withTimeout(promise, label) {
    let to;
    const timeoutPromise = new Promise((_, reject) => {
      to = setTimeout(
        () => reject(new Error(`MikroTik ${this.label} ${label} timeout after ${this.timeoutMs}ms`)),
        this.timeoutMs
      );
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(to));
  }

  async write(conn, path, params = []) {
    return this._withTimeout(conn.write(path, params), `write ${path}`);
  }

  // ---- High-level helpers -----------------------------------------------

  async listInterfaces() {
    return this.withSession((conn) => this.write(conn, '/interface/print'));
  }

  async listAddresses() {
    return this.withSession((conn) => this.write(conn, '/ip/address/print'));
  }

  async listDhcpLeases() {
    return this.withSession((conn) => this.write(conn, '/ip/dhcp-server/lease/print'));
  }

  async listConnections() {
    return this.withSession((conn) => this.write(conn, '/ip/firewall/connection/print'));
  }

  async countHotspot() {
    const rows = await this.withSession((conn) => this.write(conn, '/ip/hotspot/active/print'));
    return Array.isArray(rows) ? rows.length : 0;
  }

  async listHotspot() {
    return this.withSession((conn) => this.write(conn, '/ip/hotspot/active/print'));
  }

  async countPpp() {
    const rows = await this.withSession((conn) => this.write(conn, '/ppp/active/print'));
    return Array.isArray(rows) ? rows.length : 0;
  }

  async listPpp() {
    return this.withSession((conn) => this.write(conn, '/ppp/active/print'));
  }

  async ping(address, count = 3) {
    return this.withSession((conn) =>
      this.write(conn, '/ping', [`=address=${address}`, `=count=${count}`])
    );
  }

  async monitorTrafficOnce(interfaceName) {
    return this.withSession((conn) =>
      this.write(conn, '/interface/monitor-traffic', [`=interface=${interfaceName}`, '=once=']
      )
    );
  }

  /**
   * Single-session snapshot for the home/Diskominfo monitor.
   * Reads interfaces + traffic per interface + dhcp + connections in ONE session.
   * Way more efficient than multiple connects.
   */
  async snapshot({ withDhcp = false, withConnections = false, withTraffic = true } = {}) {
    return this.withSession(async (conn) => {
      const interfaces = await this.write(conn, '/interface/print');
      const result = { interfaces: Array.isArray(interfaces) ? interfaces : [], traffic: {} };

      if (withTraffic && result.interfaces.length) {
        for (const iface of result.interfaces) {
          const name = iface.name;
          if (!name) continue;
          const disabled = String(iface.disabled || '').toLowerCase() === 'true';
          const running = String(iface.running || '').toLowerCase() === 'true';
          if (disabled || !running) {
            result.traffic[name] = { rxBps: 0, txBps: 0 };
            continue;
          }
          try {
            const t = await this.write(conn, '/interface/monitor-traffic', [
              `=interface=${name}`,
              '=once='
            ]);
            const row = Array.isArray(t) ? t[0] : null;
            result.traffic[name] = {
              rxBps: row ? parseInt(row['rx-bits-per-second'] || 0, 10) : 0,
              txBps: row ? parseInt(row['tx-bits-per-second'] || 0, 10) : 0
            };
          } catch (e) {
            result.traffic[name] = { rxBps: 0, txBps: 0 };
          }
        }
      }

      if (withDhcp) {
        try {
          result.dhcp = await this.write(conn, '/ip/dhcp-server/lease/print');
        } catch (e) {
          result.dhcp = [];
        }
      }

      if (withConnections) {
        try {
          result.connections = await this.write(conn, '/ip/firewall/connection/print');
        } catch (e) {
          result.connections = [];
        }
      }

      return result;
    });
  }
}

function boolValue(value) {
  return String(value || '').toLowerCase() === 'true' ? 1 : 0;
}

module.exports = { MikroTikClient, boolValue };
