/**
 * Migration: Global Complete Test tables
 * Sections: Aptitude, Verbal, Logical, Coding, SQL
 * Run: node migrate_global_tests.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    let pool;
    try {
        if (process.env.DATABASE_URL) {
            const dbUrl = new URL(process.env.DATABASE_URL);
            pool = mysql.createPool({
                host: dbUrl.hostname,
                user: dbUrl.username,
                password: dbUrl.password,
                database: dbUrl.pathname.slice(1),
                port: Number(dbUrl.port) || 3306,
                ssl: (dbUrl.hostname && dbUrl.hostname.includes('tidb')) ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });
        } else {
            pool = mysql.createPool({
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'mentor_hub',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });
        }

        console.log('🔗 Connected to database');

        // 1. global_tests
        console.log('\n📦 Creating global_tests...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS global_tests (
                id VARCHAR(50) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                type ENUM('aptitude', 'verbal', 'logical', 'coding', 'sql', 'comprehensive') NOT NULL,
                difficulty VARCHAR(20),
                duration INT,
                total_questions INT,
                passing_score INT DEFAULT 60,
                status VARCHAR(20) DEFAULT 'draft',
                created_by VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                description TEXT,
                start_time DATETIME,
                deadline DATETIME,
                max_attempts INT DEFAULT 1,
                max_tab_switches INT DEFAULT 3,
                section_config JSON,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        `);

        // 2. test_questions (all 5 sections)
        console.log('📦 Creating test_questions...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS test_questions (
                question_id VARCHAR(50) PRIMARY KEY,
                test_id VARCHAR(50),
                section ENUM('aptitude', 'verbal', 'logical', 'coding', 'sql') NOT NULL,
                question_type ENUM('mcq', 'coding', 'sql', 'true_false', 'pattern') DEFAULT 'mcq',
                question TEXT NOT NULL,
                option_1 TEXT,
                option_2 TEXT,
                option_3 TEXT,
                option_4 TEXT,
                correct_answer TEXT,
                test_cases JSON,
                starter_code TEXT,
                solution_code TEXT,
                explanation TEXT,
                category VARCHAR(100),
                difficulty VARCHAR(20),
                points INT DEFAULT 1,
                time_limit INT,
                FOREIGN KEY (test_id) REFERENCES global_tests(id) ON DELETE CASCADE
            )
        `);

        // 3. global_test_submissions (section-wise scores)
        console.log('📦 Creating global_test_submissions...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS global_test_submissions (
                id VARCHAR(50) PRIMARY KEY,
                test_id VARCHAR(50),
                test_title VARCHAR(255),
                student_id VARCHAR(50),
                aptitude_score INT DEFAULT 0,
                verbal_score INT DEFAULT 0,
                logical_score INT DEFAULT 0,
                coding_score INT DEFAULT 0,
                sql_score INT DEFAULT 0,
                total_score INT DEFAULT 0,
                overall_percentage DECIMAL(5,2),
                status VARCHAR(20) DEFAULT 'pending',
                time_spent INT,
                tab_switches INT DEFAULT 0,
                submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (test_id) REFERENCES global_tests(id),
                FOREIGN KEY (student_id) REFERENCES users(id)
            )
        `);

        // 4. section_results
        console.log('📦 Creating section_results...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS section_results (
                id VARCHAR(50) PRIMARY KEY,
                submission_id VARCHAR(50),
                section ENUM('aptitude', 'verbal', 'logical', 'coding', 'sql') NOT NULL,
                correct_count INT DEFAULT 0,
                total_questions INT DEFAULT 0,
                score INT DEFAULT 0,
                percentage DECIMAL(5,2),
                time_spent INT,
                FOREIGN KEY (submission_id) REFERENCES global_test_submissions(id) ON DELETE CASCADE
            )
        `);

        // 5. question_results
        console.log('📦 Creating question_results...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS question_results (
                id VARCHAR(50) PRIMARY KEY,
                submission_id VARCHAR(50),
                question_id VARCHAR(50),
                section VARCHAR(50),
                user_answer TEXT,
                correct_answer TEXT,
                is_correct BOOLEAN DEFAULT FALSE,
                points_earned INT DEFAULT 0,
                time_taken INT,
                explanation TEXT,
                FOREIGN KEY (submission_id) REFERENCES global_test_submissions(id) ON DELETE CASCADE,
                FOREIGN KEY (question_id) REFERENCES test_questions(question_id)
            )
        `);

        // 6. personalized_reports
        console.log('📦 Creating personalized_reports...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS personalized_reports (
                id VARCHAR(50) PRIMARY KEY,
                student_id VARCHAR(50),
                test_id VARCHAR(50),
                submission_id VARCHAR(50),
                report_data JSON,
                generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                FOREIGN KEY (test_id) REFERENCES global_tests(id),
                FOREIGN KEY (submission_id) REFERENCES global_test_submissions(id)
            )
        `);

        console.log('\n✅ Global test migration completed successfully.');
        console.log('   Sections: Aptitude, Verbal, Logical, Coding, SQL');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        if (pool) await pool.end();
    }
}

migrate();
