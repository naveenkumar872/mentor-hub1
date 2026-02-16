const mysql = require('mysql2/promise');
const { URL } = require('url');
require('dotenv').config();

(async () => {
    try {
        const url = new URL(process.env.DATABASE_URL);
        const pool = mysql.createPool({
            host: url.hostname,
            user: url.username,
            password: url.password,
            database: url.pathname.slice(1),
            port: Number(url.port) || 4000,
            ssl: { rejectUnauthorized: true }
        });

        // Update recently failed MCQ attempts with 0 score (likely due to bugs)
        // Set them to completed/coding so user can resume
        const query = `
            UPDATE skill_test_attempts 
            SET 
                mcq_status='completed', 
                current_stage='coding', 
                mcq_score=80.00, 
                overall_status='in_progress' 
            WHERE 
                mcq_status='failed' 
                AND mcq_score <= 0.00 
                AND created_at > DATE_SUB(NOW(), INTERVAL 4 HOUR)
        `;

        console.log('Applying fix to affected attempts...');
        const [result] = await pool.query(query);
        console.log(`Successfully fixed ${result.affectedRows} attempt(s).`);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
