const mysql = require('mysql2/promise');
const url = require('url');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL;
const parsedUrl = url.parse(dbUrl);
const auth = parsedUrl.auth.split(':');

const pool = mysql.createPool({
    host: parsedUrl.hostname,
    port: parsedUrl.port || 3306,
    user: auth[0],
    password: decodeURIComponent(auth[1]),
    database: parsedUrl.pathname.slice(1),
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        const conn = await pool.getConnection();
        
        // Check proctoring_sessions records
        const [sessions] = await conn.query('SELECT COUNT(*) as count FROM proctoring_sessions');
        console.log('📊 proctoring_sessions:', sessions[0].count, 'records');
        
        // Check violations records
        const [violations] = await conn.query('SELECT COUNT(*) as count FROM proctoring_violations');
        console.log('📋 proctoring_violations:', violations[0].count, 'records');
        
        // Get latest session info
        const [latest] = await conn.query('SELECT ps.id, ps.student_id, ps.violation_score, ps.total_violations, ps.created_at FROM proctoring_sessions ps ORDER BY ps.created_at DESC LIMIT 1');
        
        if(latest.length > 0) {
            console.log('\n🔍 Latest session:');
            console.log('   ID:', latest[0].id);
            console.log('   Student:', latest[0].student_id);
            console.log('   Violation Score:', latest[0].violation_score);
            console.log('   Total Violations:', latest[0].total_violations);
        } else {
            console.log('\n⚠️ No proctoring sessions found in database!');
            console.log('   Violations are being detected but NOT saved to DB');
        }
        
        // Get admin analytics query result
        console.log('\n📈 Admin analytics query test:');
        const [analyticsRes] = await conn.query(`
            SELECT 
                ps.student_id,
                COUNT(DISTINCT ps.id) as total_exams,
                SUM(CASE WHEN ps.violation_score >= 60 THEN 1 ELSE 0 END) as flagged_exams,
                ROUND(AVG(ps.violation_score), 1) as avg_score
            FROM proctoring_sessions ps
            WHERE ps.student_id IS NOT NULL
            GROUP BY ps.student_id
            LIMIT 5
        `);
        
        if(analyticsRes.length > 0) {
            console.log('   ✅ Found', analyticsRes.length, 'student records');
            console.log('   Sample:', analyticsRes[0]);
        } else {
            console.log('   ❌ Analytics query returned no results');
        }
        
        await conn.end();
        await pool.end();
        process.exit(0);
    } catch(e) {
        console.error('❌ Error:', e.message);
        if(e.code) console.error('   Code:', e.code);
        process.exit(1);
    }
})();
