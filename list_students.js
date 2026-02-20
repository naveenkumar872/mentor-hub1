const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function run() {
    const pool = mysql.createPool(process.env.DATABASE_URL);
    try {
        const [rows] = await pool.query("SELECT id, name FROM users WHERE role = 'student' LIMIT 20");
        console.log('Students:', rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
