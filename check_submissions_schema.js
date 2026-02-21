const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkSchema() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const url = new URL(process.env.DATABASE_URL);
  
  const pool = mysql.createPool({
    host: url.hostname,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    port: 4000,
    waitForConnections: true,
    ssl: 'Amazon RDS',
    enableKeepAlive: true
  });
  
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query('DESCRIBE submissions');
    console.log('\n=== SUBMISSIONS TABLE SCHEMA ===');
    console.table(rows);
    
    // Also check sample data
    const [sampleData] = await connection.query('SELECT * FROM submissions LIMIT 1');
    console.log('\n=== SAMPLE SUBMISSION ROW ===');
    if (sampleData.length > 0) {
      console.log(JSON.stringify(sampleData[0], null, 2));
    } else {
      console.log('No submissions found in database');
    }
    
    connection.release();
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
