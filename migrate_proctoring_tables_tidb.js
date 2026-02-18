/**
 * Database Migration - Proctoring Tables (TiDB Cloud Compatible)
 * Creates tables for tracking proctoring sessions, violations, and face events
 * Uses DATABASE_URL with SSL support for TiDB Cloud
 */

const mysql = require('mysql2/promise');
const url = require('url');
require('dotenv').config();

// Parse DATABASE_URL 
const dbUrl = process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/mentor_hub';
const parsedUrl = url.parse(dbUrl);
const auth = parsedUrl.auth.split(':');

const poolConfig = {
    host: parsedUrl.hostname,
    port: parsedUrl.port || 3306,
    user: auth[0],
    password: decodeURIComponent(auth[1]),
    database: parsedUrl.pathname.slice(1),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false // TiDB Cloud uses self-signed certs
    },
    enableKeepAlive: true,
};

console.log(`🔌 Connecting to TiDB Cloud...`);
console.log(`   Host: ${poolConfig.host}`);
console.log(`   Database: ${poolConfig.database}`);
console.log(`   SSL: Enabled\n`);

const pool = mysql.createPool(poolConfig);

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
                INDEX idx_student(student_id),
                INDEX idx_exam(exam_id),
                INDEX idx_status(status),
                INDEX idx_created(created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ proctoring_sessions table created\n');

        // 2. Create proctoring_violations table
        console.log('2️⃣  Creating proctoring_violations table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS proctoring_violations (
                id VARCHAR(36) PRIMARY KEY COMMENT 'Violation UUID',
                session_id VARCHAR(36) NOT NULL COMMENT 'Proctoring session',
                violation_type ENUM('TAB_SWITCH', 'COPY_PASTE', 'RIGHT_CLICK', 'FULLSCREEN_EXIT', 'URL_BLOCKED', 'KEYSTROKE_PATTERN', 'MULTIPLE_FACES', 'PHONE_DETECTED', 'FACE_LOOKAWAY', 'FACE_NOT_DETECTED', 'INTEGRITY_VIOLATION', 'PLAGIARISM') NOT NULL,
                severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'MEDIUM',
                points INT DEFAULT 0 COMMENT 'Points deducted',
                description TEXT COMMENT 'Violation details',
                evidence JSON COMMENT 'Proof/metadata',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                action_taken ENUM('NONE', 'WARNING', 'PAUSE', 'HALT', 'AUTO_HALT') DEFAULT 'NONE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_session(session_id),
                INDEX idx_type(violation_type),
                INDEX idx_severity(severity),
                FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ proctoring_violations table created\n');

        // 3. Create proctoring_face_events table
        console.log('3️⃣  Creating proctoring_face_events table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS proctoring_face_events (
                id VARCHAR(36) PRIMARY KEY COMMENT 'Event UUID',
                session_id VARCHAR(36) NOT NULL,
                event_type ENUM('FACE_DETECTED', 'FACE_LOST', 'MULTIPLE_FACES', 'FACE_BLUR', 'FACE_SIDE', 'FACE_ROTATION', 'EYE_CLOSED', 'MOUTH_OPEN', 'EXPRESSION_CHANGE') NOT NULL,
                face_count INT DEFAULT 0,
                confidence FLOAT DEFAULT 0,
                landmarks JSON COMMENT 'Face landmark data',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_session(session_id),
                INDEX idx_type(event_type),
                FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ proctoring_face_events table created\n');

        // 4. Create proctoring_reports table
        console.log('4️⃣  Creating proctoring_reports table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS proctoring_reports (
                id VARCHAR(36) PRIMARY KEY COMMENT 'Report UUID',
                session_id VARCHAR(36) NOT NULL UNIQUE,
                student_id VARCHAR(36) NOT NULL,
                exam_id VARCHAR(36),
                violation_summary JSON COMMENT 'Aggregated violation counts',
                risk_level ENUM('CLEAN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') DEFAULT 'CLEAN',
                recommendation ENUM('ACCEPT', 'REVIEW', 'REJECT', 'ESCALATE') DEFAULT 'ACCEPT',
                forensic_report LONGTEXT COMMENT 'Detailed analysis',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_session(session_id),
                INDEX idx_student(student_id),
                INDEX idx_risk(risk_level),
                FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ proctoring_reports table created\n');

        console.log('✅ All tables created successfully!');
        console.log('\n📊 Tables Summary:');
        console.log('   ├─ proctoring_sessions: Main session tracking');
        console.log('   ├─ proctoring_violations: Recorded violations');
        console.log('   ├─ proctoring_face_events: Face detection events');
        console.log('   └─ proctoring_reports: Forensic reports');
        console.log('\n✨ Migration Complete! Ready to use proctoring system.\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration Error:', error.message);
        if (error.code) console.error('   Error Code:', error.code);
        if (error.errno) console.error('   Error Number:', error.errno);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run migration
migrateProctoring();
