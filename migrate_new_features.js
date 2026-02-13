// Migration script for new features:
// 1. Test Cases (visible/hidden)
// 2. Coding Streaks
// 3. SQL Validation logs

require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    let pool;
    try {
        // Use DATABASE_URL if available
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

        // 1. Create test_cases table for problems
        console.log('\n📦 Creating test_cases table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS test_cases (
                id VARCHAR(36) PRIMARY KEY,
                problem_id VARCHAR(36) NOT NULL,
                input TEXT NOT NULL,
                expected_output TEXT NOT NULL,
                is_hidden BOOLEAN DEFAULT FALSE,
                points INT DEFAULT 10,
                description VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ test_cases table created');

        // 2. Create coding_activity table for streaks
        console.log('\n📦 Creating coding_activity table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS coding_activity (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                activity_date DATE NOT NULL,
                problems_solved INT DEFAULT 0,
                submissions_count INT DEFAULT 0,
                tasks_completed INT DEFAULT 0,
                aptitude_completed INT DEFAULT 0,
                total_points INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_date (user_id, activity_date),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ coding_activity table created');

        // 3. Create user_streaks table
        console.log('\n📦 Creating user_streaks table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_streaks (
                user_id VARCHAR(36) PRIMARY KEY,
                current_streak INT DEFAULT 0,
                longest_streak INT DEFAULT 0,
                last_activity_date DATE,
                total_active_days INT DEFAULT 0,
                weekly_goal INT DEFAULT 5,
                weekly_progress INT DEFAULT 0,
                week_start_date DATE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ user_streaks table created');

        // 4. Create test_case_results table for storing execution results
        console.log('\n📦 Creating test_case_results table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS test_case_results (
                id VARCHAR(36) PRIMARY KEY,
                submission_id VARCHAR(36) NOT NULL,
                test_case_id VARCHAR(36) NOT NULL,
                passed BOOLEAN DEFAULT FALSE,
                actual_output TEXT,
                execution_time_ms INT,
                memory_used_kb INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
                FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ test_case_results table created');

        console.log('\n🎉 All migrations completed successfully!');

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

migrate();
