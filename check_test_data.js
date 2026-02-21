const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkUsers() {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const pool = mysql.createPool({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1),
        port: Number(dbUrl.port) || 4000,
        ssl: {},
        waitForConnections: true,
        connectionLimit: 2,
        timezone: '+00:00'
    });

    try {
        const connection = await pool.getConnection();
        
        console.log('\n📋 Test Users in Database:');
        const [users] = await connection.query('SELECT id, email, role, name FROM users LIMIT 10');
        console.table(users);

        console.log('\n📋 Test Problems in Database:');
        const [problems] = await connection.query('SELECT id, title FROM problems LIMIT 5');
        console.table(problems);

        console.log('\n📋 Test Submissions in Database:');
        const [submissions] = await connection.query('SELECT id, student_id, score FROM submissions LIMIT 5');
        console.table(submissions);

        console.log('\n📋 Code Reviews in Database:');
        const [reviews] = await connection.query('SELECT id, submission_id FROM code_reviews LIMIT 3');
        console.table(reviews);

        connection.release();
        await pool.end();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

checkUsers();
