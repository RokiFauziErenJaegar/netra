'use strict';

const { pool } = require('./index');
const logger = require('../logger');

const TABLES = [
  {
    name: 'master_opd',
    sql: `
      CREATE TABLE IF NOT EXISTS master_opd (
        id_opd INT(11) NOT NULL AUTO_INCREMENT,
        nama_opd VARCHAR(150) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        interface_name VARCHAR(100) DEFAULT NULL,
        routeros_id VARCHAR(50) DEFAULT NULL,
        type VARCHAR(50) DEFAULT NULL,
        mac_address VARCHAR(50) DEFAULT NULL,
        status_terakhir ENUM('Up','Down','Unknown') DEFAULT 'Unknown',
        disabled TINYINT(1) DEFAULT 0,
        running TINYINT(1) DEFAULT 0,
        last_latency VARCHAR(20) DEFAULT NULL,
        last_rx_bps BIGINT(20) DEFAULT 0,
        last_tx_bps BIGINT(20) DEFAULT 0,
        last_update DATETIME DEFAULT NULL,
        last_notified_down DATETIME DEFAULT NULL,
        last_notified_disabled DATETIME DEFAULT NULL,
        PRIMARY KEY (id_opd),
        UNIQUE KEY uq_routeros_id (routeros_id),
        KEY idx_status (status_terakhir),
        KEY idx_disabled (disabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `
  },
  {
    name: 'log_traffic',
    sql: `
      CREATE TABLE IF NOT EXISTS log_traffic (
        id_log INT(11) NOT NULL AUTO_INCREMENT,
        id_opd INT(11) NOT NULL,
        rx_bytes BIGINT(20) DEFAULT 0,
        tx_bytes BIGINT(20) DEFAULT 0,
        waktu_cek DATETIME NOT NULL,
        PRIMARY KEY (id_log),
        KEY idx_opd_waktu (id_opd, waktu_cek),
        KEY idx_waktu (waktu_cek)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `
  },
  {
    name: 'monitoring_rumah_interface',
    sql: `
      CREATE TABLE IF NOT EXISTS monitoring_rumah_interface (
        id_interface INT(11) NOT NULL AUTO_INCREMENT,
        routeros_id VARCHAR(50) NOT NULL,
        interface_name VARCHAR(100) NOT NULL,
        type VARCHAR(50) DEFAULT NULL,
        mac_address VARCHAR(50) DEFAULT NULL,
        status_terakhir ENUM('Terhubung','Tidak Terhubung','Unknown') DEFAULT 'Unknown',
        disabled TINYINT(1) DEFAULT 0,
        running TINYINT(1) DEFAULT 0,
        last_rx_bps BIGINT(20) DEFAULT 0,
        last_tx_bps BIGINT(20) DEFAULT 0,
        last_update DATETIME DEFAULT NULL,
        last_notified_disabled DATETIME DEFAULT NULL,
        last_notified_down DATETIME DEFAULT NULL,
        PRIMARY KEY (id_interface),
        UNIQUE KEY uq_routeros_id (routeros_id),
        KEY idx_status (status_terakhir)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `
  },
  {
    name: 'monitoring_rumah_traffic',
    sql: `
      CREATE TABLE IF NOT EXISTS monitoring_rumah_traffic (
        id_log INT(11) NOT NULL AUTO_INCREMENT,
        routeros_id VARCHAR(50) NOT NULL,
        interface_name VARCHAR(100) NOT NULL,
        rx_bps BIGINT(20) DEFAULT 0,
        tx_bps BIGINT(20) DEFAULT 0,
        waktu_cek DATETIME NOT NULL,
        PRIMARY KEY (id_log),
        KEY idx_routeros_waktu (routeros_id, waktu_cek),
        KEY idx_waktu (waktu_cek)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `
  },
  {
    name: 'monitoring_rumah_dhcp_lease',
    sql: `
      CREATE TABLE IF NOT EXISTS monitoring_rumah_dhcp_lease (
        id_lease INT(11) NOT NULL AUTO_INCREMENT,
        routeros_id VARCHAR(50) NOT NULL,
        ip_address VARCHAR(50) DEFAULT NULL,
        mac_address VARCHAR(50) DEFAULT NULL,
        host_name VARCHAR(150) DEFAULT NULL,
        server_name VARCHAR(100) DEFAULT NULL,
        lease_status VARCHAR(50) DEFAULT NULL,
        dynamic TINYINT(1) DEFAULT 0,
        disabled TINYINT(1) DEFAULT 0,
        last_seen VARCHAR(50) DEFAULT NULL,
        expires_after VARCHAR(50) DEFAULT NULL,
        total_usage_bytes BIGINT(20) DEFAULT 0,
        last_update DATETIME DEFAULT NULL,
        PRIMARY KEY (id_lease),
        UNIQUE KEY uq_routeros_id (routeros_id),
        KEY idx_ip (ip_address),
        KEY idx_lease_status (lease_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `
  },
  {
    name: 'notification_log',
    sql: `
      CREATE TABLE IF NOT EXISTS notification_log (
        id INT(11) NOT NULL AUTO_INCREMENT,
        channel VARCHAR(20) NOT NULL,
        target VARCHAR(150) DEFAULT NULL,
        subject VARCHAR(200) DEFAULT NULL,
        body TEXT,
        success TINYINT(1) DEFAULT 0,
        error_message TEXT,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY idx_created (created_at),
        KEY idx_channel (channel)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `
  }
];

async function ensureSchema() {
  const conn = await pool.getConnection();
  try {
    for (const tbl of TABLES) {
      await conn.query(tbl.sql);
      logger.debug({ table: tbl.name }, 'ensured');
    }
    logger.info({ count: TABLES.length }, 'database schema ready');
  } finally {
    conn.release();
  }
}

module.exports = { ensureSchema, TABLES };
