/**
 * Database Migration - Proctoring Tables
 * Creates tables for tracking proctoring sessions, violations, and face events
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'mentor_hub',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

async function migrateProctoring() {
    const conn = await pool.getConnection();
    try {
        console.log('📋 Starting Proctoring Database Migration...\n');

        // 1. Create proctoring_sessions table
        console.log('1️⃣  Creating proctoring_sessions table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS proctoring_sessions (
                id VARCHAR(36) PRIMARY KEY COMMENT 'Session UUID',
                exam_id VARCHAR(36) NOT NULL COMMENT 'Exam reference',
                student_id VARCHAR(36) NOT NULL COMMENT 'Student taking exam',
                mentor_id VARCHAR(36) NULL COMMENT 'Assigned proctor',
                problem_id VARCHAR(36) NULL COMMENT 'Problem/Quiz ID',
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Exam start',
                end_time TIMESTAMP NULL COMMENT 'Exam end',
                duration_minutes INT DEFAULT 0 COMMENT 'Total exam duration',
                status ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FLAGGED') DEFAULT 'ACTIVE',
                violation_score INT DEFAULT 0 COMMENT 'Total violation points (0-100)',
                total_violations INT DEFAULT 0 COMMENT 'Count of all violations',
                critical_violations INT DEFAULT 0 COMMENT 'Count of CRITICAL violations',
                high_violations INT DEFAULT 0 COMMENT 'Count of HIGH violations',
                device_fingerprint JSON COMMENT 'Device identification data',
                ip_address VARCHAR(45) COMMENT 'Student IP address',
                user_agent TEXT COMMENT 'Browser user agent',
                is_flagged BOOLEAN DEFAULT FALSE COMMENT 'Requires review',
                flag_reason VARCHAR(500) COMMENT 'Why session was flagged',
                requires_review BOOLEAN DEFAULT FALSE COMMENT 'Manual review needed',
                reviewed_by VARCHAR(36) COMMENT 'Mentor who reviewed',
                review_notes LONGTEXT COMMENT 'Review comments',
                reviewed_at TIMESTAMP NULL COMMENT 'Review timestamp',
                violations JSON COMMENT 'Serialized violations array',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                KEY idx_exam (exam_id),
                KEY idx_student (student_id),
                KEY idx_mentor (mentor_id),
                KEY idx_status (status),
                KEY idx_is_flagged (is_flagged),
                KEY idx_created (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Core table for tracking exam proctoring sessions';
        `);
        console.log('   ✅ proctoring_sessions table created\n');

        // 2. Create proctoring_violations table
        console.log('2️⃣  Creating proctoring_violations table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS proctoring_violations (
                id VARCHAR(36) PRIMARY KEY COMMENT 'Violation UUID',
                session_id VARCHAR(36) NOT NULL COMMENT 'Session reference',
                violation_type VARCHAR(100) NOT NULL COMMENT 'Type of violation (TAB_SWITCH, PHONE_DETECTED, etc)',
                severity ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW') DEFAULT 'MEDIUM',
                points INT DEFAULT 0 COMMENT 'Points deducted for this violation',
                details JSON COMMENT 'Violation-specific details',
                screenshot_url VARCHAR(500) COMMENT 'Screenshot evidence URL',
                proctor_acknowledged BOOLEAN DEFAULT FALSE,
                proctor_note TEXT COMMENT 'Proctor review note',
                timestamp BIGINT NOT NULL COMMENT 'When violation occurred (ms)',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
                KEY idx_session (session_id),
                KEY idx_type (violation_type),
                KEY idx_severity (severity),
                KEY idx_timestamp (timestamp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Log of all detected violations during exams';
        `);
        console.log('   ✅ proctoring_violations table created\n');

        // 3. Create proctoring_face_events table
        console.log('3️⃣  Creating proctoring_face_events table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS proctoring_face_events (
                id VARCHAR(36) PRIMARY KEY COMMENT 'Event UUID',
                session_id VARCHAR(36) NOT NULL COMMENT 'Session reference',
                face_count INT DEFAULT 0 COMMENT 'Number of faces detected',
                face_confidence FLOAT COMMENT 'Detection confidence (0-1)',
                face_position JSON COMMENT 'Face position {x, y, width, height}',
                event_type VARCHAR(100) COMMENT 'FACE_DETECTED, MULTIPLE_FACES, FACE_LOST, etc',
                screenshot_url VARCHAR(500) COMMENT 'Screenshot of detection',
                timestamp BIGINT NOT NULL COMMENT 'When event occurred (ms)',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
                KEY idx_session (session_id),
                KEY idx_event_type (event_type),
                KEY idx_timestamp (timestamp)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Log of face detection events';
        `);
        console.log('   ✅ proctoring_face_events table created\n');

        // 4. Create proctoring_reports table (for final exam reports)
        console.log('4️⃣  Creating proctoring_reports table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS proctoring_reports (
                id VARCHAR(36) PRIMARY KEY COMMENT 'Report UUID',
                session_id VARCHAR(36) NOT NULL UNIQUE COMMENT 'Session reference',
                exam_id VARCHAR(36) NOT NULL,
                student_id VARCHAR(36) NOT NULL,
                mentor_id VARCHAR(36),
                total_violations INT DEFAULT 0,
                violation_score INT DEFAULT 0,
                final_decision ENUM('APPROVED', 'REQUIRES_REVIEW', 'REJECTED_FLAGGED', 'CANCELLED') DEFAULT 'REQUIRES_REVIEW',
                recommendations JSON COMMENT 'Array of recommendations',
                flagged_reasons JSON COMMENT 'Array of flag reasons',
                exam_duration_minutes INT DEFAULT 0,
                start_time TIMESTAMP,
                end_time TIMESTAMP,
                report_data JSON COMMENT 'Full report data',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
                KEY idx_exam (exam_id),
                KEY idx_student (student_id),
                KEY idx_decision (final_decision)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            COMMENT='Final proctoring reports for each exam';
        `);
        console.log('   ✅ proctoring_reports table created\n');

        // 5. Add proctoring columns to submissions table if not exists
        console.log('5️⃣  Checking submissions table for proctoring columns...');
        const [columns] = await conn.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='submissions' AND TABLE_SCHEMA=DATABASE()`
        );
        
        const columnNames = columns.map(c => c.COLUMN_NAME);
        
        if (!columnNames.includes('proctoring_session_id')) {
            await conn.query(`ALTER TABLE submissions ADD COLUMN proctoring_session_id VARCHAR(36) AFTER id`);
            console.log('   ✅ Added proctoring_session_id column');
        }
        
        if (!columnNames.includes('proctoring_violations_json')) {
            await conn.query(`ALTER TABLE submissions ADD COLUMN proctoring_violations_json JSON AFTER proctoring_session_id`);
            console.log('   ✅ Added proctoring_violations_json column');
        }
        
        if (!columnNames.includes('integrity_check_score')) {
            await conn.query(`ALTER TABLE submissions ADD COLUMN integrity_check_score INT DEFAULT 0 AFTER proctoring_violations_json`);
            console.log('   ✅ Added integrity_check_score column');
        }

        console.log('\n✅ Proctoring database migration completed successfully!\n');

        // Display summary
        console.log('📊 Migration Summary:');
        console.log('   ✓ proctoring_sessions');
        console.log('   ✓ proctoring_violations');
        console.log('   ✓ proctoring_face_events');
        console.log('   ✓ proctoring_reports');
        console.log('   ✓ submissions table enhanced');
        console.log('\n📝 Tables are ready for proctoring operations!\n');

        return true;

    } catch (error) {
        console.error('❌ Migration error:', error.message);
        return false;
    } finally {
        conn.release();
        await pool.end();
    }
}

// Run migration
if (require.main === module) {
    migrateProctoring()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(err => {
            console.error('Fatal error:', err);
            process.exit(1);
        });
}

module.exports = migrateProctoring;
