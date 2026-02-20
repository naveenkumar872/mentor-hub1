require('dotenv').config();
const mysql = require('mysql2/promise');
const PredictiveAnalyticsService = require('./services/analytics_service');

async function sync() {
    console.log('🚀 Starting Student Analytics Sync...');

    const dbUrl = new URL(process.env.DATABASE_URL);
    const pool = mysql.createPool({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1),
        port: Number(dbUrl.port) || 4000,
        ssl: { rejectUnauthorized: true },
    });

    const analyticsService = new PredictiveAnalyticsService(pool);

    try {
        // 1. Get all students
        console.log('👥 Fetching students...');
        const [students] = await pool.query('SELECT id FROM users WHERE role = "student"');
        console.log(`Found ${students.length} students.`);

        for (const student of students) {
            try {
                process.stdout.write(`Analyzing student ${student.id}... `);
                await analyticsService.analyzeStudentPerformance(student.id);
                console.log('✅');
            } catch (e) {
                console.log('❌', e.message);
            }
        }

        console.log('\n✅ Analytics Sync completed successfully!');

    } catch (err) {
        console.error('❌ Sync failed:', err.message);
    } finally {
        await pool.end();
    }
}

sync();
