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
        console.log('🔄 Starting availability calendar migration...');

        // Create user_availability table for Feature #19
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_availability (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL UNIQUE,
                slots_json JSON,
                timezone VARCHAR(50) DEFAULT 'UTC',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user (user_id)
            )
        `);

        console.log('✅ user_availability table created');

        // Create mentor_slots table for scheduling
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mentor_slots (
                id VARCHAR(36) PRIMARY KEY,
                mentor_id VARCHAR(36) NOT NULL,
                date_time DATETIME NOT NULL,
                duration_minutes INT DEFAULT 60,
                is_booked BOOLEAN DEFAULT FALSE,
                booked_by VARCHAR(36),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (mentor_id) REFERENCES users(id),
                FOREIGN KEY (booked_by) REFERENCES users(id),
                INDEX idx_mentor (mentor_id),
                INDEX idx_datetime (date_time)
            )
        `);

        console.log('✅ mentor_slots table created');

        pool.end();
        console.log('🎉 Availability calendar migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
