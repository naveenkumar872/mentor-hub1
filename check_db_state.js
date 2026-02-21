const mysql = require('mysql2/promise');
require('dotenv').config();
const { URL } = require('url');

async function checkDatabase() {
    try {
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
            queueLimit: 0
        });

        console.log('🔍 Checking database...\n');

        //1. Check users
        console.log('1️⃣  Users in database:');
        const [users] = await pool.query(`SELECT id, name, email, role FROM users LIMIT 5`);
        console.table(users);

        // 2. Check leaderboard_stats
        console.log('\n2️⃣  Leaderboard stats:');
        const [leaderboard] = await pool.query(`SELECT user_id, problems_solved, total_points FROM leaderboard_stats LIMIT 3`);
        console.table(leaderboard);

        // 3. Check notifications
        console.log('\n3️⃣  Notifications table columns:');
        const [columns] = await pool.query(`
            SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'notifications' AND TABLE_SCHEMA = 'mentor_hub'
        `);
        console.table(columns);

        // 4. Test direct query
        console.log('\n4️⃣  Direct query test - Get admin:');
        const [admin] = await pool.query('SELECT id, name, email FROM users WHERE email = ?', ['admin@test.com']);
        console.table(admin);

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkDatabase();
