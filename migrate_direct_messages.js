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
        console.log('🔄 Starting direct messaging migration...');

        // Create messages table for Feature #13
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id VARCHAR(36) PRIMARY KEY,
                sender_id VARCHAR(36) NOT NULL,
                receiver_id VARCHAR(36) NOT NULL,
                content TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                read_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id),
                FOREIGN KEY (receiver_id) REFERENCES users(id),
                INDEX idx_sender (sender_id),
                INDEX idx_receiver (receiver_id),
                INDEX idx_created (created_at)
            )
        `);

        console.log('✅ messages table created');

        // Create conversation_metadata table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversation_metadata (
                id VARCHAR(36) PRIMARY KEY,
                user1_id VARCHAR(36) NOT NULL,
                user2_id VARCHAR(36) NOT NULL,
                last_message_id VARCHAR(36),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user1_id) REFERENCES users(id),
                FOREIGN KEY (user2_id) REFERENCES users(id),
                UNIQUE KEY unique_conversation (user1_id, user2_id),
                INDEX idx_user1 (user1_id),
                INDEX idx_user2 (user2_id)
            )
        `);

        console.log('✅ conversation_metadata table created');

        pool.end();
        console.log('🎉 Direct messaging migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
