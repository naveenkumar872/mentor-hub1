// Test database connection
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    try {
        console.log('🔍 Testing database connection...');
        console.log('Host:', process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'Unknown');

        const pool = mysql.createPool({
            host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
            port: 4000,
            user: 's4Ko3L3HQZfFsJy.root',
            password: 'SthXXGh6d3dLcOTo',
            database: 'mentor_hub',
            ssl: {},
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
            enableKeepAlive: true,
            timezone: '+00:00'
        });

        console.log('✓ Pool created');

        const connection = await pool.getConnection();
        console.log('✓ Connection established');

        const [[result]] = await connection.query('SELECT 1 as result');
        console.log('✓ Query successful:', result);

        connection.release();
        
        // Test a real query
        const [users] = await pool.query('SELECT COUNT(*) as count FROM users LIMIT 1');
        console.log('✓ Users count:', users[0].count);

        await pool.end();
        console.log('\n✅ Database connection is working!');
        
    } catch (error) {
        console.error('❌ Connection Error:', error.message);
        console.error('\nFull Error:');
        console.error(error);
        process.exit(1);
    }
}

testConnection();
