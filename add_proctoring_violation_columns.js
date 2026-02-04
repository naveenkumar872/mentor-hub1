// Migration script to add phone_detection_count and camera_blocked_count columns to submissions table
require('dotenv').config();
const mysql = require('mysql2/promise');
const { URL } = require('url');

async function migrate() {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const pool = mysql.createPool({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1),
        port: dbUrl.port || 4000,
        ssl: { rejectUnauthorized: true },
        waitForConnections: true,
        connectionLimit: 5
    });

    try {
        console.log('🔧 Adding proctoring violation columns to submissions table...');

        // Add phone_detection_count column
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN phone_detection_count INT DEFAULT 0`);
            console.log('✅ Added phone_detection_count column');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ phone_detection_count column already exists');
            } else {
                throw e;
            }
        }

        // Add camera_blocked_count column
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN camera_blocked_count INT DEFAULT 0`);
            console.log('✅ Added camera_blocked_count column');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ camera_blocked_count column already exists');
            } else {
                throw e;
            }
        }

        // Add copy_paste_attempts column if not exists
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN copy_paste_attempts INT DEFAULT 0`);
            console.log('✅ Added copy_paste_attempts column');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ copy_paste_attempts column already exists');
            } else {
                throw e;
            }
        }

        console.log('\n✅ Migration completed successfully!');
        console.log('New columns added to submissions table:');
        console.log('  - phone_detection_count (INT)');
        console.log('  - camera_blocked_count (INT)');
        console.log('  - copy_paste_attempts (INT)');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
    } finally {
        await pool.end();
    }
}

migrate();
