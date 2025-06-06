const mysql = require("mysql2/promise");
require("dotenv").config();

const db = mysql.createPool({
  host: "mysql-harmonilink.alwaysdata.net",
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

module.exports = db;
