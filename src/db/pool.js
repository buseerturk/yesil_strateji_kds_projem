const mysql = require('mysql2/promise');

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

const config = {
  host: DB_HOST || '127.0.0.1',
  port: Number(DB_PORT || 3306),
  user: DB_USER || 'exapmle_user',
  password: DB_PASSWORD || 'example_password',
  database: DB_NAME || 'kds',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const pool = mysql.createPool(config);

const sanitized = { host: config.host, port: config.port, user: config.user, database: config.database };
console.log('MySQL bağlantı bilgileri:', sanitized);

module.exports = { pool, dbConfig: sanitized };
