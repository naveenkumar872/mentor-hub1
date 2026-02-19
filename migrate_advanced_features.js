/**
 * Database Migration for Advanced Features
 * - Plagiarism Detection + Behavioral Analysis
 * - Predictive Analytics
 * - Gamification System
 * - Automated Violation Scoring
 * 
 * Run: node migrate_advanced_features.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    // Parse DATABASE_URL the same way as server.js
    const dbUrl = new URL(process.env.DATABASE_URL);
    
    const connection = await mysql.createConnection({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1), // Remove leading slash
        port: Number(dbUrl.port) || 4000,
        ssl: { rejectUnauthorized: true },
        enableKeepAlive: true,
        timezone: '+00:00'
    });

    console.log('🚀 Starting advanced features migration...\n');

    try {
        // ============================================================
        // 1. PLAGIARISM DETECTION TABLES
        // ============================================================
        console.log('📋 Creating plagiarism detection tables...');

        // Plagiarism analysis store
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS plagiarism_analysis (
                id VARCHAR(36) PRIMARY KEY,
                submission_id VARCHAR(36) NOT NULL,
                problem_id VARCHAR(36) NOT NULL,
                student_id VARCHAR(36) NOT NULL,
                mentor_id VARCHAR(36),
                code_hash VARCHAR(255),
                lexical_similarity DECIMAL(5,2),
                structural_similarity DECIMAL(5,2),
                temporal_suspicion DECIMAL(5,2),
                overall_score DECIMAL(5,2),
                flagged BOOLEAN DEFAULT FALSE,
                severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'low',
                matched_submissions JSON,
                behavioral_flags JSON,
                analysis_details JSON,
                reviewed_by VARCHAR(36),
                review_status ENUM('pending', 'approved', 'rejected', 'appealed') DEFAULT 'pending',
                review_notes TEXT,
                appeal_status VARCHAR(50),
                appeal_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (submission_id) REFERENCES submissions(id),
                FOREIGN KEY (student_id) REFERENCES users(id),
                FOREIGN KEY (mentor_id) REFERENCES users(id),
                INDEX idx_student_id (student_id),
                INDEX idx_submission_id (submission_id),
                INDEX idx_flagged (flagged),
                INDEX idx_severity (severity),
                INDEX idx_overall_score (overall_score)
            )
        `);

        // Plagiarism matches (cross-submission comparison)
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS plagiarism_matches (
                id VARCHAR(36) PRIMARY KEY,
                submission_1_id VARCHAR(36) NOT NULL,
                submission_2_id VARCHAR(36) NOT NULL,
                student_1_id VARCHAR(36) NOT NULL,
                student_2_id VARCHAR(36) NOT NULL,
                similarity_score DECIMAL(5,2),
                matching_lines INT,
                matching_percentage DECIMAL(5,2),
                match_type ENUM('lexical', 'structural', 'both') DEFAULT 'both',
                reviewed BOOLEAN DEFAULT FALSE,
                action ENUM('flagged', 'approved', 'pending') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (submission_1_id) REFERENCES submissions(id),
                FOREIGN KEY (submission_2_id) REFERENCES submissions(id),
                FOREIGN KEY (student_1_id) REFERENCES users(id),
                FOREIGN KEY (student_2_id) REFERENCES users(id),
                INDEX idx_similarity_score (similarity_score),
                INDEX idx_created_at (created_at)
            )
        `);

        // ============================================================
        // 2. GAMIFICATION TABLES
        // ============================================================
        console.log('🎮 Creating gamification tables...');

        // Student points and XP
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS student_gamification (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(36) NOT NULL UNIQUE,
                total_points INT DEFAULT 0,
                level INT DEFAULT 1,
                current_xp INT DEFAULT 0,
                next_level_xp INT DEFAULT 1000,
                current_streak INT DEFAULT 0,
                longest_streak INT DEFAULT 0,
                badges JSON,
                achievements JSON,
                leaderboard_rank INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                INDEX idx_total_points (total_points),
                INDEX idx_level (level),
                INDEX idx_leaderboard_rank (leaderboard_rank)
            )
        `);

        // Badge definitions
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS badges (
                id VARCHAR(36) PRIMARY KEY,
                badge_name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                icon_url VARCHAR(255),
                criteria JSON,
                reward_points INT DEFAULT 100,
                category VARCHAR(50),
                tier VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_badge_name (badge_name),
                INDEX idx_category (category)
            )
        `);

        // Student badge achievements
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS student_badges (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(36) NOT NULL,
                badge_id VARCHAR(36) NOT NULL,
                earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                FOREIGN KEY (badge_id) REFERENCES badges(id),
                UNIQUE KEY unique_student_badge (student_id, badge_id),
                INDEX idx_student_id (student_id),
                INDEX idx_earned_at (earned_at)
            )
        `);

        // Points history log
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS points_history (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(36) NOT NULL,
                points_earned INT,
                source VARCHAR(100),
                source_id VARCHAR(36),
                multiplier DECIMAL(3,2) DEFAULT 1.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                INDEX idx_student_id (student_id),
                INDEX idx_created_at (created_at)
            )
        `);

        // Streak tracking
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS streak_tracking (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(36) NOT NULL UNIQUE,
                streak_type VARCHAR(50),
                current_streak INT DEFAULT 0,
                longest_streak INT DEFAULT 0,
                last_activity_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                INDEX idx_student_id (student_id)
            )
        `);

        // ============================================================
        // 3. PREDICTIVE ANALYTICS TABLES
        // ============================================================
        console.log('📊 Creating predictive analytics tables...');

        // Student performance metrics
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS student_analytics (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(36) NOT NULL UNIQUE,
                total_tests INT DEFAULT 0,
                total_problems INT DEFAULT 0,
                average_test_score DECIMAL(5,2),
                average_problem_score DECIMAL(5,2),
                problem_completion_rate DECIMAL(5,2),
                test_completion_rate DECIMAL(5,2),
                weak_concepts JSON,
                strong_concepts JSON,
                learning_curve_trend JSON,
                time_series_data JSON,
                risk_score DECIMAL(5,2) DEFAULT 0,
                at_risk BOOLEAN DEFAULT FALSE,
                prediction_confidence DECIMAL(5,2),
                last_analysis_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                INDEX idx_risk_score (risk_score),
                INDEX idx_at_risk (at_risk)
            )
        `);

        // Concept mastery tracking
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS concept_mastery (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(36) NOT NULL,
                concept_name VARCHAR(100) NOT NULL,
                mastery_level DECIMAL(5,2),
                attempts INT DEFAULT 0,
                successes INT DEFAULT 0,
                last_attempt_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                UNIQUE KEY unique_student_concept (student_id, concept_name),
                INDEX idx_student_id (student_id),
                INDEX idx_mastery_level (mastery_level)
            )
        `);

        // Learning recommendations
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS learning_recommendations (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(36) NOT NULL,
                recommended_problem_id VARCHAR(36),
                recommendation_type VARCHAR(50),
                confidence_score DECIMAL(5,2),
                reason TEXT,
                is_acted_upon BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                FOREIGN KEY (recommended_problem_id) REFERENCES problems(id),
                INDEX idx_student_id (student_id),
                INDEX idx_created_at (created_at)
            )
        `);

        // ============================================================
        // 4. VIOLATION SCORING AND PROCTORING CONFIG
        // ============================================================
        console.log('⚡ Creating violation scoring tables...');

        // Violation configuration
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS violation_rules (
                id VARCHAR(36) PRIMARY KEY,
                violation_type VARCHAR(100) NOT NULL UNIQUE,
                base_severity INT DEFAULT 5,
                is_auto_disqualify BOOLEAN DEFAULT FALSE,
                accumulation_type ENUM('additive', 'multiplicative') DEFAULT 'additive',
                time_window_minutes INT DEFAULT 5,
                max_occurrences_allowed INT DEFAULT NULL,
                description TEXT,
                enabled BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_violation_type (violation_type)
            )
        `);

        // Test-specific violation configuration
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS test_violation_config (
                id VARCHAR(36) PRIMARY KEY,
                test_id VARCHAR(36) NOT NULL,
                violation_rule_id VARCHAR(36) NOT NULL,
                severity_override INT,
                enabled BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (violation_rule_id) REFERENCES violation_rules(id),
                UNIQUE KEY unique_test_violation (test_id, violation_rule_id),
                INDEX idx_test_id (test_id)
            )
        `);

        // Enhanced violation logs with scoring
        // Note: Only alter if the table exists
        try {
            await connection.execute(`
                ALTER TABLE proctoring_logs ADD COLUMN IF NOT EXISTS 
                violation_score INT DEFAULT 0
            `).catch(() => console.log('⚠️  proctoring_logs table not found, skipping ALTER'));
        } catch (e) {
            console.log('⚠️  proctoring_logs table does not exist, skipping ALTER');
        }

        // Auto-scoring decisions
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS violation_scoring_decisions (
                id VARCHAR(36) PRIMARY KEY,
                attempt_id VARCHAR(36) NOT NULL,
                test_id VARCHAR(36) NOT NULL,
                student_id VARCHAR(36) NOT NULL,
                total_violation_score INT,
                violation_breakdown JSON,
                auto_disqualified BOOLEAN DEFAULT FALSE,
                disqualification_reason VARCHAR(255),
                manual_review_needed BOOLEAN DEFAULT FALSE,
                reviewed_by VARCHAR(36),
                review_decision VARCHAR(50),
                review_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                FOREIGN KEY (reviewed_by) REFERENCES users(id),
                INDEX idx_attempt_id (attempt_id),
                INDEX idx_auto_disqualified (auto_disqualified),
                INDEX idx_manual_review_needed (manual_review_needed)
            )
        `);

        // ============================================================
        // 5. BEHAVIORAL ANALYSIS
        // ============================================================
        console.log('🔍 Creating behavioral analysis tables...');

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS behavioral_profiles (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(36) NOT NULL UNIQUE,
                baseline_typing_speed DECIMAL(5,2),
                baseline_pause_interval DECIMAL(5,2),
                baseline_mouse_movement INT,
                normal_submission_time INT,
                keystroke_pattern JSON,
                mouse_pattern JSON,
                behavioral_flags JSON,
                anomaly_detected BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                INDEX idx_anomaly_detected (anomaly_detected)
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS behavioral_events (
                id VARCHAR(36) PRIMARY KEY,
                student_id VARCHAR(36) NOT NULL,
                attempt_id VARCHAR(36),
                event_type VARCHAR(50),
                event_data JSON,
                suspicion_score DECIMAL(5,2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES users(id),
                INDEX idx_student_id (student_id),
                INDEX idx_suspicion_score (suspicion_score)
            )
        `);

        // ============================================================
        // 6. INSERT DEFAULT VIOLATION RULES
        // ============================================================
        console.log('⚙️ Inserting default violation rules...');

        const violationRules = [
            { type: 'tab_switch', severity: 5, autoDisqualify: false, maxOccurrences: null },
            { type: 'fullscreen_exit', severity: 8, autoDisqualify: false, maxOccurrences: null },
            { type: 'camera_blocked', severity: 15, autoDisqualify: false, maxOccurrences: 2 },
            { type: 'phone_detected', severity: 20, autoDisqualify: false, maxOccurrences: 1 },
            { type: 'multiple_faces', severity: 25, autoDisqualify: true, maxOccurrences: 0 },
            { type: 'face_not_detected', severity: 10, autoDisqualify: false, maxOccurrences: null },
            { type: 'copy_paste', severity: 12, autoDisqualify: false, maxOccurrences: 3 },
            { type: 'face_lookaway', severity: 3, autoDisqualify: false, maxOccurrences: null },
            { type: 'unusual_typing_speed', severity: 7, autoDisqualify: false, maxOccurrences: null },
            { type: 'suspicious_keystroke_pattern', severity: 10, autoDisqualify: false, maxOccurrences: null }
        ];

        for (const rule of violationRules) {
            const ruleId = require('uuid').v4();
            try {
                await connection.execute(
                    `INSERT IGNORE INTO violation_rules 
                    (id, violation_type, base_severity, is_auto_disqualify, max_occurrences_allowed, description)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        ruleId,
                        rule.type,
                        rule.severity,
                        rule.autoDisqualify,
                        rule.maxOccurrences,
                        `${rule.type} violation rule`
                    ]
                );
            } catch (e) {
                // Rule may already exist
            }
        }

        // ============================================================
        // 7. INSERT DEFAULT BADGES
        // ============================================================
        console.log('🏅 Inserting default badges...');

        const badges = [
            { name: 'First Step', description: 'Complete your first problem', icon: '🚀', category: 'beginner', tier: 'bronze', points: 10 },
            { name: 'Code Master', description: 'Solve 10 coding problems', icon: '💻', category: 'achievement', tier: 'silver', points: 50 },
            { name: 'Speed Coder', description: 'Solve a problem in under 2 minutes', icon: '⚡', category: 'speed', tier: 'silver', points: 75 },
            { name: 'Perfect Score', description: 'Get 100% on a test', icon: '💯', category: 'achievement', tier: 'gold', points: 100 },
            { name: 'Consistent Performer', description: 'Maintain 7-day streak', icon: '🔥', category: 'streak', tier: 'gold', points: 150 },
            { name: 'Database Expert', description: 'Solve 5 SQL problems', icon: '🗄️', category: 'specialty', tier: 'silver', points: 75 },
            { name: 'Polyglot', description: 'Solve problems in 3+ languages', icon: '🌍', category: 'specialty', tier: 'gold', points: 120 },
            { name: 'Rising Star', description: 'Reach level 5', icon: '⭐', category: 'level', tier: 'gold', points: 200 }
        ];

        for (const badge of badges) {
            const badgeId = require('uuid').v4();
            try {
                await connection.execute(
                    `INSERT IGNORE INTO badges 
                    (id, badge_name, description, icon_url, category, tier, reward_points)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        badgeId,
                        badge.name,
                        badge.description,
                        badge.icon,
                        badge.category,
                        badge.tier,
                        badge.points
                    ]
                );
            } catch (e) {
                // Badge may already exist
            }
        }

        console.log('✅ Migration completed successfully!\n');
        console.log('🎉 New tables created:');
        console.log('   • plagiarism_analysis');
        console.log('   • plagiarism_matches');
        console.log('   • student_gamification');
        console.log('   • badges');
        console.log('   • student_badges');
        console.log('   • points_history');
        console.log('   • streak_tracking');
        console.log('   • student_analytics');
        console.log('   • concept_mastery');
        console.log('   • learning_recommendations');
        console.log('   • violation_rules');
        console.log('   • test_violation_config');
        console.log('   • violation_scoring_decisions');
        console.log('   • behavioral_profiles');
        console.log('   • behavioral_events\n');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

migrate();
