'use strict';

const mysql = require('mysql2/promise');
const config = require('../config');
const logger = require('../logger');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.poolLimit,
  queueLimit: 0,
  dateStrings: true,
  charset: 'utf8mb4_general_ci'
});

pool.on('connection', () => {
  logger.debug('MySQL: new connection acquired');
});

async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

async function close() {
  await pool.end();
}

module.exports = { pool, ping, close };
