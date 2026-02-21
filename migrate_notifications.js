/**
 * Migration: Notifications System
 * Persistent notification center with real-time Socket.io support
 * Run: node migrate_notifications.js
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

    console.log('🚀 Running Notifications migration...\n');

    try {
        // Create notifications table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL,
                type ENUM('submission', 'message', 'test_allocated', 'achievement', 'mentor_assignment', 'deadline', 'system', 'alert') DEFAULT 'system',
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                data JSON,
                read_at TIMESTAMP NULL,
                archived_at TIMESTAMP NULL,
                action_url VARCHAR(500),
                priority ENUM('low', 'normal', 'high', 'critical') DEFAULT 'normal',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_type (type),
                INDEX idx_read_at (read_at),
                INDEX idx_archived_at (archived_at),
                INDEX idx_created_at (created_at),
                INDEX idx_user_unread (user_id, read_at)
            )
        `);
        console.log('✅ Created notifications table');

        // Create notification preferences table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notification_preferences (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL UNIQUE,
                submission_notifications BOOLEAN DEFAULT TRUE,
                message_notifications BOOLEAN DEFAULT TRUE,
                test_allocated_notifications BOOLEAN DEFAULT TRUE,
                achievement_notifications BOOLEAN DEFAULT TRUE,
                mentor_assignment_notifications BOOLEAN DEFAULT TRUE,
                deadline_notifications BOOLEAN DEFAULT TRUE,
                email_digest_enabled BOOLEAN DEFAULT TRUE,
                email_digest_frequency ENUM('daily', 'weekly', 'never') DEFAULT 'daily',
                sound_enabled BOOLEAN DEFAULT TRUE,
                desktop_notifications BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                INDEX idx_user_id (user_id)
            )
        `);
        console.log('✅ Created notification_preferences table');

        // Create notification digest table (for scheduled emails)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notification_digests (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(100) NOT NULL,
                digest_type ENUM('daily', 'weekly', 'monthly') DEFAULT 'daily',
                notifications_count INT DEFAULT 0,
                sent_at TIMESTAMP NULL,
                scheduled_for TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_user_id (user_id),
                INDEX idx_scheduled_for (scheduled_for),
                INDEX idx_sent_at (sent_at)
            )
        `);
        console.log('✅ Created notification_digests table');

        // Create notification_subscribers table (for multi-user notifications)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notification_subscribers (
                id VARCHAR(36) PRIMARY KEY,
                notification_id VARCHAR(36) NOT NULL,
                subscriber_id VARCHAR(100) NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                read_at TIMESTAMP NULL,
                UNIQUE KEY unique_subscriber (notification_id, subscriber_id),
                FOREIGN KEY (notification_id) REFERENCES notifications(id),
                INDEX idx_subscriber_id (subscriber_id),
                INDEX idx_is_read (is_read)
            )
        `);
        console.log('✅ Created notification_subscribers table');

        console.log('\n✅ Notifications migration complete!');
        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        await pool.end();
        process.exit(1);
    }
}

migrate();
