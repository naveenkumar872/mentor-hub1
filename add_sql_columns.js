// Migration script to add SQL-specific columns to the problems table
require('dotenv').config();
const mysql = require('mysql2/promise');

async function addSQLColumns() {
    let pool;
    try {
        // Use DATABASE_URL if available, otherwise fallback
        if (process.env.DATABASE_URL) {
            const dbUrl = new URL(process.env.DATABASE_URL);
            pool = mysql.createPool({
                host: dbUrl.hostname,
                user: dbUrl.username,
                password: dbUrl.password,
                database: dbUrl.pathname.slice(1),
                port: Number(dbUrl.port) || 4000,
                ssl: {
                    minVersion: 'TLSv1.2',
                    rejectUnauthorized: true
                },
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });
        } else {
            pool = mysql.createPool({
                host: process.env.DB_HOST || 'mentor-hub-backend-tkil.onrender.com',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'mentor_hub',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });
        }

        console.log('🔗 Connected to database');

        // Get database name from URL or environment
        let dbName = 'mentor_hub';
        if (process.env.DATABASE_URL) {
            const dbUrl = new URL(process.env.DATABASE_URL);
            dbName = dbUrl.pathname.slice(1);
        } else {
            dbName = process.env.DB_NAME || 'mentor_hub';
        }

        // Check if columns exist
        const [columns] = await pool.query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'problems'",
            [dbName]
        );

        const columnNames = columns.map(c => c.COLUMN_NAME);
        console.log('📋 Existing columns:', columnNames.join(', '));

        // Add sql_schema column if it doesn't exist
        if (!columnNames.includes('sql_schema')) {
            console.log('➕ Adding sql_schema column...');
            await pool.query(`
                ALTER TABLE problems 
                ADD COLUMN sql_schema TEXT NULL DEFAULT NULL
            `);
            console.log('✅ sql_schema column added');
        } else {
            console.log('ℹ️ sql_schema column already exists');
        }

        // Add expected_query_result column if it doesn't exist
        if (!columnNames.includes('expected_query_result')) {
            console.log('➕ Adding expected_query_result column...');
            await pool.query(`
                ALTER TABLE problems 
                ADD COLUMN expected_query_result TEXT NULL DEFAULT NULL
            `);
            console.log('✅ expected_query_result column added');
        } else {
            console.log('ℹ️ expected_query_result column already exists');
        }

        console.log('\n🎉 Migration complete!');

    } catch (error) {
        console.error('❌ Migration Error:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

addSQLColumns();
