/**
 * Migration: Add Tier Support to Users
 * Enables tier-based rate limiting (Free, Pro, Enterprise)
 * Run: node migrate_user_tiers.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const pool = mysql.createPool({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1),
        port: Number(dbUrl.port) || 4000,
        ssl: {},
        waitForConnections: true,
        connectionLimit: 5,
        timezone: '+00:00'
    });

    console.log('🚀 Running User Tiers migration...\n');

    try {
        // Add tier column to users
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(50) DEFAULT 'free'
            COMMENT 'User tier: free, pro, enterprise'
        `);
        console.log('✅ Added tier column to users table');

        // Add tier start date
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            COMMENT 'Date when user was assigned this tier'
        `);
        console.log('✅ Added tier_start_date column to users table');

        // Add tier upgrade date
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_expiry_date TIMESTAMP NULL
            COMMENT 'When the tier expires (for trial periods)'
        `);
        console.log('✅ Added tier_expiry_date column to users table');

        // Create tier_limits table for easy configuration
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tier_limits (
                id VARCHAR(36) PRIMARY KEY,
                tier VARCHAR(50) NOT NULL UNIQUE,
                daily_api_limit INT DEFAULT 100,
                code_execution_limit INT DEFAULT 10,
                submissions_per_day INT DEFAULT 50,
                concurrent_connections INT DEFAULT 1,
                file_upload_limit_mb INT DEFAULT 5,
                max_problem_attempts INT DEFAULT 5,
                ai_chat_limit_daily INT DEFAULT 10,
                export_limit_monthly INT DEFAULT 10,
                priority_support BOOLEAN DEFAULT FALSE,
                features JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created tier_limits table');

        // Insert default tiers
        const tiers = [
            {
                tier: 'free',
                daily_api_limit: 100,
                code_execution_limit: 10,
                submissions_per_day: 30,
                concurrent_connections: 1,
                file_upload_limit_mb: 5,
                max_problem_attempts: 3,
                ai_chat_limit_daily: 5,
                export_limit_monthly: 5,
                priority_support: false,
                features: JSON.stringify(['basic_coding', 'aptitude_tests', 'submissions'])
            },
            {
                tier: 'pro',
                daily_api_limit: 1000,
                code_execution_limit: 100,
                submissions_per_day: 200,
                concurrent_connections: 3,
                file_upload_limit_mb: 50,
                max_problem_attempts: 20,
                ai_chat_limit_daily: 50,
                export_limit_monthly: 50,
                priority_support: true,
                features: JSON.stringify(['basic_coding', 'aptitude_tests', 'submissions', 'collaboration', 'code_review', 'analytics'])
            },
            {
                tier: 'enterprise',
                daily_api_limit: 999999,
                code_execution_limit: 999999,
                submissions_per_day: 9999,
                concurrent_connections: 999,
                file_upload_limit_mb: 500,
                max_problem_attempts: 999,
                ai_chat_limit_daily: 9999,
                export_limit_monthly: 9999,
                priority_support: true,
                features: JSON.stringify(['all'])
            }
        ];

        for (const tierData of tiers) {
            const { v4: uuidv4 } = require('uuid');
            try {
                await pool.query(
                    `INSERT IGNORE INTO tier_limits (id, tier, daily_api_limit, code_execution_limit, submissions_per_day, concurrent_connections, file_upload_limit_mb, max_problem_attempts, ai_chat_limit_daily, export_limit_monthly, priority_support, features)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        uuidv4(),
                        tierData.tier,
                        tierData.daily_api_limit,
                        tierData.code_execution_limit,
                        tierData.submissions_per_day,
                        tierData.concurrent_connections,
                        tierData.file_upload_limit_mb,
                        tierData.max_problem_attempts,
                        tierData.ai_chat_limit_daily,
                        tierData.export_limit_monthly,
                        tierData.priority_support ? 1 : 0,
                        tierData.features
                    ]
                );
                console.log(`✅ Inserted ${tierData.tier} tier limits`);
            } catch (e) {
                if (e.code === 'ER_DUP_ENTRY') {
                    console.log(`⚠️  ${tierData.tier} tier already exists, skipping`);
                } else {
                    throw e;
                }
            }
        }

        // Create rate_limit_usage table to track usage
        await pool.query(`
            CREATE TABLE IF NOT EXISTS rate_limit_usage (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL,
                tier VARCHAR(50),
                endpoint VARCHAR(255),
                api_calls INT DEFAULT 1,
                code_executions INT DEFAULT 0,
                submissions INT DEFAULT 0,
                usage_date DATE DEFAULT CURDATE(),
                reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_usage (user_id, endpoint, usage_date),
                INDEX idx_user_date (user_id, usage_date),
                INDEX idx_reset (reset_at)
            )
        `);
        console.log('✅ Created rate_limit_usage table');

        // Create tier_history for audit trail
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tier_history (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL,
                old_tier VARCHAR(50),
                new_tier VARCHAR(50) NOT NULL,
                reason VARCHAR(255),
                changed_by VARCHAR(100),
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user (user_id),
                INDEX idx_changed_at (changed_at)
            )
        `);
        console.log('✅ Created tier_history table');

        console.log('\n✅ User Tiers migration complete!');
        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        await pool.end();
        process.exit(1);
    }
}

migrate();
