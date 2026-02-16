// Migration script to add duration columns to skill_tests table
require('dotenv').config();
const mysql = require('mysql2/promise');

async function addDurationColumns() {
    let pool;
    try {
        if (process.env.DATABASE_URL) {
            const dbUrl = new URL(process.env.DATABASE_URL);
            pool = mysql.createPool({
                host: dbUrl.hostname,
                user: dbUrl.username,
                password: dbUrl.password,
                database: dbUrl.pathname.slice(1),
                port: Number(dbUrl.port) || 4000,
                ssl: { rejectUnauthorized: false }, // Lenient SSL
                waitForConnections: true,
                connectionLimit: 5
            });
        } else {
            console.error('❌ DATABASE_URL not found in environment');
            process.exit(1);
        }

        console.log('🔗 Connected to database');

        // Get columns for skill_tests table
        const [columns] = await pool.query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'skill_tests'",
            [pool.pool.config.connectionConfig.database]
        );

        const existingCols = columns.map(c => c.COLUMN_NAME);
        console.log('📋 Existing columns:', existingCols.join(', '));

        const newCols = [
            { name: 'coding_duration_minutes', type: 'INT DEFAULT 30' },
            { name: 'sql_duration_minutes', type: 'INT DEFAULT 30' },
            { name: 'interview_duration_minutes', type: 'INT DEFAULT 30' }
        ];

        for (const col of newCols) {
            if (!existingCols.includes(col.name)) {
                console.log(`➕ Adding ${col.name}...`);
                await pool.query(`ALTER TABLE skill_tests ADD COLUMN ${col.name} ${col.type}`);
                console.log(`✅ ${col.name} added`);
            } else {
                console.log(`ℹ️ ${col.name} already exists`);
            }
        }

        console.log('\n🎉 Migration complete!');

    } catch (error) {
        console.error('❌ Migration Error:', error.message);
    } finally {
        if (pool) await pool.end();
    }
}

addDurationColumns();
