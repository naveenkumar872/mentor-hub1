/**
 * Migration: Create Skill Test tables for AI-powered assessment system
 * Run: node migrate_skill_tests.js
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function migrate() {
    const { URL } = require('url');
    const dbUrl = new URL(process.env.DATABASE_URL);
    const pool = mysql.createPool({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1),
        port: Number(dbUrl.port) || 4000,
        ssl: {},
        waitForConnections: true,
        connectionLimit: 5
    });

    console.log('🔄 Running Skill Test migration...');

    try {
        // 1. skill_tests - Admin-created test configurations
        await pool.query(`
            CREATE TABLE IF NOT EXISTS skill_tests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                skills JSON NOT NULL,
                mcq_count INT DEFAULT 10,
                coding_count INT DEFAULT 3,
                sql_count INT DEFAULT 3,
                interview_count INT DEFAULT 5,
                attempt_limit INT DEFAULT 1,
                mcq_duration_minutes INT DEFAULT 30,
                mcq_passing_score INT DEFAULT 60,
                coding_passing_score INT DEFAULT 50,
                sql_passing_score INT DEFAULT 50,
                interview_passing_score INT DEFAULT 6,
                is_active BOOLEAN DEFAULT TRUE,
                created_by VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created skill_tests table');

        // 2. skill_test_attempts - Student attempts with all test data
        await pool.query(`
            CREATE TABLE IF NOT EXISTS skill_test_attempts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                test_id INT NOT NULL,
                student_id VARCHAR(100) NOT NULL,
                student_name VARCHAR(255),
                attempt_number INT DEFAULT 1,
                current_stage VARCHAR(50) DEFAULT 'mcq',
                overall_status VARCHAR(50) DEFAULT 'in_progress',

                mcq_questions JSON,
                mcq_answers JSON,
                mcq_score DECIMAL(5,2) DEFAULT 0,
                mcq_status VARCHAR(20) DEFAULT 'pending',
                mcq_start_time TIMESTAMP NULL,
                mcq_end_time TIMESTAMP NULL,
                mcq_violations INT DEFAULT 0,

                coding_problems JSON,
                coding_submissions JSON,
                coding_score DECIMAL(5,2) DEFAULT 0,
                coding_status VARCHAR(20) DEFAULT 'pending',

                sql_problems JSON,
                sql_submissions JSON,
                sql_score DECIMAL(5,2) DEFAULT 0,
                sql_status VARCHAR(20) DEFAULT 'pending',

                interview_qa JSON,
                interview_current_index INT DEFAULT 0,
                interview_score DECIMAL(5,2) DEFAULT 0,
                interview_status VARCHAR(20) DEFAULT 'pending',
                interview_violations INT DEFAULT 0,

                report JSON,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

                FOREIGN KEY (test_id) REFERENCES skill_tests(id) ON DELETE CASCADE,
                UNIQUE KEY unique_attempt (test_id, student_id, attempt_number)
            )
        `);
        console.log('✅ Created skill_test_attempts table');

        // 3. skill_proctoring_logs - Proctoring events
        await pool.query(`
            CREATE TABLE IF NOT EXISTS skill_proctoring_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                attempt_id INT NOT NULL,
                test_stage VARCHAR(50) NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                details TEXT,
                severity VARCHAR(20) DEFAULT 'low',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (attempt_id) REFERENCES skill_test_attempts(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Created skill_proctoring_logs table');

        // Add indexes
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sta_test_student ON skill_test_attempts(test_id, student_id)`).catch(() => {});
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sta_status ON skill_test_attempts(overall_status)`).catch(() => {});
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_spl_attempt ON skill_proctoring_logs(attempt_id)`).catch(() => {});
        console.log('✅ Created indexes');

        console.log('\n🎉 Skill Test migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

migrate();
