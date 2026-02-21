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
        console.log('🔄 Starting mentor matching migration...');

        // Create mentor_requests table for Feature #15
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mentor_requests (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(36) NOT NULL,
                mentor_id VARCHAR(36) NOT NULL,
                message TEXT,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                responded_at TIMESTAMP NULL,
                FOREIGN KEY (student_id) REFERENCES users(id),
                FOREIGN KEY (mentor_id) REFERENCES users(id),
                INDEX idx_student (student_id),
                INDEX idx_mentor (mentor_id),
                INDEX idx_status (status)
            )
        `);

        console.log('✅ mentor_requests table created');

        // Create mentor_ratings table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mentor_ratings (
                id VARCHAR(36) PRIMARY KEY,
                mentor_id VARCHAR(36) NOT NULL,
                student_id VARCHAR(36) NOT NULL,
                rating DECIMAL(2,1) NOT NULL,
                review TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (mentor_id) REFERENCES users(id),
                FOREIGN KEY (student_id) REFERENCES users(id),
                INDEX idx_mentor (mentor_id),
                UNIQUE KEY unique_rating (mentor_id, student_id)
            )
        `);

        console.log('✅ mentor_ratings table created');

        // Add mentor expertise areas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mentor_expertise (
                id VARCHAR(36) PRIMARY KEY,
                mentor_id VARCHAR(36) NOT NULL,
                expertise_area VARCHAR(100) NOT NULL,
                proficiency_level VARCHAR(50) DEFAULT 'intermediate',
                FOREIGN KEY (mentor_id) REFERENCES users(id),
                UNIQUE KEY unique_expertise (mentor_id, expertise_area)
            )
        `);

        console.log('✅ mentor_expertise table created');

        pool.end();
        console.log('🎉 Mentor matching migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
