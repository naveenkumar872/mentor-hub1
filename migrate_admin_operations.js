/**
 * Migration: Admin Operations Tables (Features 66-72)
 * - audit_logs: Comprehensive audit logging
 * - problem_set_templates: Reusable problem collections
 * - problem_set_template_items: Problems in each template
 * - scheduled_backups: Backup schedule tracking
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const { URL } = require('url');

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

    const connection = await pool.getConnection();

    try {
        console.log('🚀 Starting Admin Operations migration...\n');

        // 1. Audit Logs Table
        console.log('📋 Creating audit_logs table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36),
                user_name VARCHAR(255),
                user_role VARCHAR(50),
                action VARCHAR(100) NOT NULL,
                resource_type VARCHAR(100),
                resource_id VARCHAR(36),
                details JSON,
                ip_address VARCHAR(45),
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_audit_user (user_id),
                INDEX idx_audit_action (action),
                INDEX idx_audit_resource (resource_type, resource_id),
                INDEX idx_audit_timestamp (timestamp)
            )
        `);
        console.log('  ✅ audit_logs table created');

        // 2. Problem Set Templates Table
        console.log('📋 Creating problem_set_templates table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS problem_set_templates (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                difficulty VARCHAR(50) DEFAULT 'Mixed',
                tags JSON,
                created_by VARCHAR(36),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_template_creator (created_by)
            )
        `);
        console.log('  ✅ problem_set_templates table created');

        // 3. Problem Set Template Items
        console.log('📋 Creating problem_set_template_items table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS problem_set_template_items (
                id VARCHAR(36) PRIMARY KEY,
                template_id VARCHAR(36) NOT NULL,
                problem_id VARCHAR(36) NOT NULL,
                sort_order INT DEFAULT 0,
                INDEX idx_template_items (template_id),
                INDEX idx_template_problem (problem_id)
            )
        `);
        console.log('  ✅ problem_set_template_items table created');

        // 4. Scheduled Backups Table
        console.log('📋 Creating scheduled_backups table...');
        await connection.query(`
            CREATE TABLE IF NOT EXISTS scheduled_backups (
                id VARCHAR(36) PRIMARY KEY,
                backup_type VARCHAR(50) DEFAULT 'full',
                status VARCHAR(50) DEFAULT 'pending',
                file_path VARCHAR(500),
                file_size BIGINT DEFAULT 0,
                tables_backed_up JSON,
                started_at DATETIME,
                completed_at DATETIME,
                created_by VARCHAR(36),
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_backup_status (status),
                INDEX idx_backup_date (created_at)
            )
        `);
        console.log('  ✅ scheduled_backups table created');

        console.log('\n🎉 All Admin Operations tables created successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

migrate().catch(console.error);
