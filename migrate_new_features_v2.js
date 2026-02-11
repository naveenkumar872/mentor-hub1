// Migration: Add tables for User Management, Direct Messaging, Inline Code Feedback, File Uploads
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

    const migrations = [
        // 1. Direct Messages table
        `CREATE TABLE IF NOT EXISTS direct_messages (
            id VARCHAR(36) PRIMARY KEY,
            sender_id VARCHAR(100) NOT NULL,
            receiver_id VARCHAR(100) NOT NULL,
            message TEXT NOT NULL,
            message_type ENUM('text', 'code', 'file') DEFAULT 'text',
            file_url VARCHAR(500) DEFAULT NULL,
            is_read TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_dm_sender (sender_id),
            INDEX idx_dm_receiver (receiver_id),
            INDEX idx_dm_conversation (sender_id, receiver_id),
            INDEX idx_dm_created (created_at)
        )`,

        // 2. Inline Code Feedback table
        `CREATE TABLE IF NOT EXISTS code_feedback (
            id VARCHAR(36) PRIMARY KEY,
            submission_id VARCHAR(36) NOT NULL,
            mentor_id VARCHAR(100) NOT NULL,
            student_id VARCHAR(100) NOT NULL,
            line_number INT NOT NULL,
            end_line INT DEFAULT NULL,
            comment TEXT NOT NULL,
            feedback_type ENUM('suggestion', 'issue', 'praise', 'question') DEFAULT 'suggestion',
            is_resolved TINYINT(1) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_cf_submission (submission_id),
            INDEX idx_cf_mentor (mentor_id),
            INDEX idx_cf_student (student_id)
        )`,

        // 3. File attachments table (for tasks, problems, aptitude, global tests)
        `CREATE TABLE IF NOT EXISTS file_attachments (
            id VARCHAR(36) PRIMARY KEY,
            entity_type ENUM('task', 'problem', 'aptitude', 'global_test') NOT NULL,
            entity_id VARCHAR(36) NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            original_name VARCHAR(255) NOT NULL,
            file_type VARCHAR(100) NOT NULL,
            file_size INT NOT NULL,
            file_url VARCHAR(500) NOT NULL,
            uploaded_by VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_fa_entity (entity_type, entity_id),
            INDEX idx_fa_uploader (uploaded_by)
        )`,

        // 4. Add batch column to users if not exists
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS batch VARCHAR(50) DEFAULT NULL`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) DEFAULT NULL`,
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS status ENUM('active', 'inactive', 'suspended') DEFAULT 'active'`
    ];

    console.log('🚀 Running new feature migrations...\n');

    for (let i = 0; i < migrations.length; i++) {
        try {
            await pool.query(migrations[i]);
            const tableName = migrations[i].match(/(?:CREATE TABLE IF NOT EXISTS|ALTER TABLE)\s+(\w+)/i);
            console.log(`✅ [${i + 1}/${migrations.length}] ${tableName ? tableName[1] : 'Migration'} — Success`);
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME' || err.message.includes('Duplicate column')) {
                console.log(`⚠️  [${i + 1}/${migrations.length}] Column already exists — Skipped`);
            } else {
                console.error(`❌ [${i + 1}/${migrations.length}] Error:`, err.message);
            }
        }
    }

    console.log('\n✅ All migrations complete!');
    await pool.end();
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
