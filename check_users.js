const mysql = require('mysql2/promise');

const dbUrl = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
    host: dbUrl.hostname,
    user: dbUrl.username,
    password: dbUrl.password,
    database: dbUrl.pathname.slice(1),
    port: Number(dbUrl.port) || 4000,
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: '+00:00'
});

async function checkUsers() {
    try {
        const [rows] = await pool.query('SELECT id, name, email, role, status FROM users LIMIT 20');
        console.log('Users in database:');
        console.table(rows);
        process.exit(0);
    } catch (error) {
        console.error('Database error:', error.message);
        process.exit(1);
    }
}

checkUsers();
