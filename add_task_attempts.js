const mysql = require('mysql2/promise');
require('dotenv').config();
const { URL } = require('url');

const dbUrl = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
    host: dbUrl.hostname,
    user: dbUrl.username,
    password: dbUrl.password,
    database: dbUrl.pathname.slice(1),
    port: Number(dbUrl.port) || 4000,
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10
});

async function migrate() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('Connected to database');

        // Check if max_attempts column exists in tasks table
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'max_attempts'
        `, [dbUrl.pathname.slice(1)]);

        if (columns.length === 0) {
            console.log('Adding max_attempts column to tasks table...');
            await connection.query('ALTER TABLE tasks ADD COLUMN max_attempts INT DEFAULT 0');
            console.log('✅ Added max_attempts column');
        } else {
            console.log('ℹ️ max_attempts column already exists in tasks table');
        }

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

migrate();
