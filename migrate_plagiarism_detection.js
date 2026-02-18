/**
 * Database Migration: Add Plagiarism Detection Columns
 * Adds plagiarism_score and flagged_submission columns to submissions table
 * Also creates plagiarism_reports and plagiarism_matches tables
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
        ssl: {
            minVersion: 'TLSv1.2',
            rejectUnauthorized: true
        },
        waitForConnections: true,
        connectionLimit: 5
    });

    try {
        console.log('🔧 Adding plagiarism detection columns to submissions table...\n');

        // 1. Add plagiarism_score column to submissions
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN plagiarism_score DECIMAL(5,2) DEFAULT 0.00`);
            console.log('✅ Added plagiarism_score column to submissions');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ plagiarism_score column already exists');
            } else {
                throw e;
            }
        }

        // 2. Add flagged_submission column
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN flagged_submission TINYINT(1) DEFAULT 0`);
            console.log('✅ Added flagged_submission column to submissions');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ flagged_submission column already exists');
            } else {
                throw e;
            }
        }

        // 3. Add plagiarism_intensity column
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN plagiarism_intensity ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW') DEFAULT 'LOW'`);
            console.log('✅ Added plagiarism_intensity column to submissions');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ plagiarism_intensity column already exists');
            } else {
                throw e;
            }
        }

        // 4. Add review_status column
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN plagiarism_review_status ENUM('pending', 'reviewed', 'appealed', 'resolved') DEFAULT 'pending'`);
            console.log('✅ Added plagiarism_review_status column to submissions');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ plagiarism_review_status column already exists');
            } else {
                throw e;
            }
        }

        // 5. Add code_hash column (for fast comparison)
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN code_hash VARCHAR(16) DEFAULT NULL`);
            console.log('✅ Added code_hash column to submissions');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ code_hash column already exists');
            } else {
                throw e;
            }
        }

        // 6. Create plagiarism_reports table
        console.log('\n📦 Creating plagiarism_reports table...');
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS plagiarism_reports (
                    id VARCHAR(50) PRIMARY KEY,
                    submission_id VARCHAR(50) NOT NULL,
                    student_id VARCHAR(100) NOT NULL,
                    problem_id VARCHAR(50),
                    suspicion_score DECIMAL(5,2) NOT NULL,
                    intensity ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW') NOT NULL,
                    flagged TINYINT(1) DEFAULT 1,
                    max_similarity DECIMAL(5,2),
                    suspicious_match_count INT DEFAULT 0,
                    recommendation ENUM('IMMEDIATE_REVIEW_REQUIRED', 'DETAILED_REVIEW', 'MONITOR', 'NORMAL') DEFAULT 'NORMAL',
                    report_data JSON,
                    reviewed_by VARCHAR(100),
                    review_notes TEXT,
                    reviewed_at DATETIME,
                    appeal_status ENUM('none', 'pending', 'approved', 'rejected') DEFAULT 'none',
                    appeal_notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    
                    FOREIGN KEY (submission_id) REFERENCES submissions(id),
                    FOREIGN KEY (student_id) REFERENCES users(id),
                    FOREIGN KEY (problem_id) REFERENCES problems(id),
                    INDEX idx_student (student_id),
                    INDEX idx_submission (submission_id),
                    INDEX idx_flagged (flagged),
                    INDEX idx_intensity (intensity),
                    INDEX idx_created (created_at)
                )
            `);
            console.log('✅ Created plagiarism_reports table');
        } catch (e) {
            if (e.code === 'ER_TABLE_EXISTS_ERROR') {
                console.log('ℹ️ plagiarism_reports table already exists');
            } else {
                throw e;
            }
        }

        // 7. Create plagiarism_matches table (tracks specific matches)
        console.log('📦 Creating plagiarism_matches table...');
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS plagiarism_matches (
                    id VARCHAR(50) PRIMARY KEY,
                    plagiarism_report_id VARCHAR(50) NOT NULL,
                    source_submission_id VARCHAR(50) NOT NULL,
                    target_submission_id VARCHAR(50) NOT NULL,
                    source_student_id VARCHAR(100) NOT NULL,
                    target_student_id VARCHAR(100) NOT NULL,
                    similarity_percentage DECIMAL(5,2) NOT NULL,
                    jaccard_similarity DECIMAL(5,2),
                    lcs_similarity DECIMAL(5,2),
                    structural_similarity DECIMAL(5,2),
                    common_tokens INT DEFAULT 0,
                    match_details JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    
                    FOREIGN KEY (plagiarism_report_id) REFERENCES plagiarism_reports(id),
                    FOREIGN KEY (source_submission_id) REFERENCES submissions(id),
                    FOREIGN KEY (target_submission_id) REFERENCES submissions(id),
                    FOREIGN KEY (source_student_id) REFERENCES users(id),
                    FOREIGN KEY (target_student_id) REFERENCES users(id),
                    INDEX idx_report (plagiarism_report_id),
                    INDEX idx_similarity (similarity_percentage),
                    INDEX idx_created (created_at)
                )
            `);
            console.log('✅ Created plagiarism_matches table');
        } catch (e) {
            if (e.code === 'ER_TABLE_EXISTS_ERROR') {
                console.log('ℹ️ plagiarism_matches table already exists');
            } else {
                throw e;
            }
        }

        // 8. Create plagiarism_settings table
        console.log('📦 Creating plagiarism_settings table...');
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS plagiarism_settings (
                    id VARCHAR(50) PRIMARY KEY,
                    problem_id VARCHAR(50) UNIQUE,
                    similarity_threshold INT DEFAULT 70,
                    enable_plagiarism_check TINYINT(1) DEFAULT 1,
                    enable_moss_integration TINYINT(1) DEFAULT 0,
                    enable_codechef_integration TINYINT(1) DEFAULT 0,
                    auto_flag_threshold INT DEFAULT 80,
                    compare_across_batches TINYINT(1) DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    
                    FOREIGN KEY (problem_id) REFERENCES problems(id),
                    INDEX idx_problem (problem_id),
                    INDEX idx_enabled (enable_plagiarism_check)
                )
            `);
            console.log('✅ Created plagiarism_settings table');
        } catch (e) {
            if (e.code === 'ER_TABLE_EXISTS_ERROR') {
                console.log('ℹ️ plagiarism_settings table already exists');
            } else {
                throw e;
            }
        }

        // 9. Add indexes
        console.log('\n📊 Adding indexes for performance...');
        try {
            await pool.query(`ALTER TABLE submissions ADD INDEX idx_plagiarism_score (plagiarism_score)`);
            console.log('✅ Added plagiarism_score index');
        } catch (e) {
            if (e.code === 'ER_DUP_KEY_NAME') {
                console.log('ℹ️ plagiarism_score index already exists');
            }
        }

        try {
            await pool.query(`ALTER TABLE submissions ADD INDEX idx_flagged_submission (flagged_submission)`);
            console.log('✅ Added flagged_submission index');
        } catch (e) {
            if (e.code === 'ER_DUP_KEY_NAME') {
                console.log('ℹ️ flagged_submission index already exists');
            }
        }

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📋 Summary of changes:');
        console.log('   ├─ submisions table:');
        console.log('   │  ├─ plagiarism_score (DECIMAL)');
        console.log('   │  ├─ flagged_submission (TINYINT)');
        console.log('   │  ├─ plagiarism_intensity (ENUM)');
        console.log('   │  ├─ plagiarism_review_status (ENUM)');
        console.log('   │  └─ code_hash (VARCHAR)');
        console.log('   ├─ plagiarism_reports table (NEW)');
        console.log('   ├─ plagiarism_matches table (NEW)');
        console.log('   └─ plagiarism_settings table (NEW)');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run migration
migrate();
