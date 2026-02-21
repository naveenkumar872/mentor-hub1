const mysql = require('mysql2/promise');
require('dotenv').config();

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

    try {
        console.log('🔄 Starting code reviews migration...');

        // Create code_reviews table for Feature #9
        await pool.query(`
            CREATE TABLE IF NOT EXISTS code_reviews (
                id VARCHAR(36) PRIMARY KEY,
                submission_id VARCHAR(36) NOT NULL,
                author_id VARCHAR(36) NOT NULL,
                line_number INT NOT NULL,
                comment TEXT NOT NULL,
                code_snippet TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id),
                INDEX idx_submission (submission_id),
                INDEX idx_author (author_id)
            )
        `);

        console.log('✅ code_reviews table created');

        // Create notification_digests table for digest emails
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notification_digests (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                digest_type VARCHAR(50) DEFAULT 'daily',
                notifications_count INT,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                INDEX idx_user (user_id)
            )
        `);

        console.log('✅ notification_digests table created');

        pool.end();
        console.log('🎉 Code reviews migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
