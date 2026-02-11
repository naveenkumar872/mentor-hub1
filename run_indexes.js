// Run database indexes from SQL file
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runIndexes() {
    const pool = mysql.createPool({
        host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
        port: 4000,
        user: 's4Ko3L3HQZfFsJy.root',
        password: 'SthXXGh6d3dLcOTo',
        database: 'mentor_hub',
        ssl: {},
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    try {
        const connection = await pool.getConnection();
        console.log('✅ Connected to database');

        // Read SQL file
        const sqlFile = path.join(__dirname, 'database_indexes.sql');
        let sqlContent = fs.readFileSync(sqlFile, 'utf8');

        // Remove SQL comments (-- and /* */)
        sqlContent = sqlContent
            .replace(/--.*$/gm, '') // Remove -- comments
            .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ comments

        // Split by semicolon and execute each statement
        const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        let count = 0;
        for (const statement of statements) {
            try {
                await connection.query(statement);
                count++;
                console.log(`✓ Executed statement ${count}`);
            } catch (err) {
                // Skip if index already exists
                if (err.code === 'ER_DUP_KEYNAME') {
                    console.log(`⊘ Index already exists (${err.message.substring(0, 40)}...)`);
                } else {
                    console.error(`✗ Error: ${err.message}`);
                }
            }
        }

        connection.release();
        console.log(`\n✅ Successfully executed ${count} index statements!`);
        
        // Verify indexes
        console.log('\n📊 Verifying indexes created...');
        const conn2 = await pool.getConnection();
        const [userIndexes] = await conn2.query('SHOW INDEX FROM users');
        const [problemIndexes] = await conn2.query('SHOW INDEX FROM problems');
        const [submissionIndexes] = await conn2.query('SHOW INDEX FROM submissions');
        
        console.log(`\n📋 Database Indexes Summary:`);
        console.log(`   • users table: ${userIndexes.length} indexes`);
        console.log(`   • problems table: ${problemIndexes.length} indexes`);
        console.log(`   • submissions table: ${submissionIndexes.length} indexes`);
        
        conn2.release();
        
        await pool.end();
        console.log('\n🎉 Database optimization complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

runIndexes();
