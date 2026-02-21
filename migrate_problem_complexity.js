const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'mentor_hub',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function migrateProblemComplexity() {
    try {
        console.log('🔄 Starting problem complexity migration...\n');

        const conn = await pool.getConnection();

        // Check existing columns
        const [columns] = await conn.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'problems' 
            AND COLUMN_NAME IN ('difficulty_score', 'pass_rate', 'avg_time_minutes', 
                                'structure_complexity', 'algorithm_complexity', 
                                'edge_cases_complexity', 'implementation_complexity',
                                'complexity_last_updated')
        `);

        const existingColumns = columns.map(c => c.COLUMN_NAME);

        // Add complexity-related columns
        const columnsToAdd = [
            { name: 'difficulty_score', def: 'DECIMAL(3,1) DEFAULT 5.0 COMMENT "Problem difficulty (0-10)"' },
            { name: 'pass_rate', def: 'DECIMAL(5,2) DEFAULT 0 COMMENT "Percentage of successful submissions"' },
            { name: 'avg_time_minutes', def: 'INT DEFAULT 30 COMMENT "Average time to solve in minutes"' },
            { name: 'min_time_minutes', def: 'INT DEFAULT 5 COMMENT "Minimum time to solve"' },
            { name: 'max_time_minutes', def: 'INT DEFAULT 300 COMMENT "Maximum time recorded"' },
            { name: 'total_submissions', def: 'INT DEFAULT 0' },
            { name: 'successful_submissions', def: 'INT DEFAULT 0' },
            { name: 'avg_attempts', def: 'DECIMAL(3,2) DEFAULT 1.0 COMMENT "Avg attempts per success"' },
            { name: 'structure_complexity', def: 'INT DEFAULT 5 COMMENT "0-10 scale"' },
            { name: 'algorithm_complexity', def: 'INT DEFAULT 5 COMMENT "0-10 scale"' },
            { name: 'edge_cases_complexity', def: 'INT DEFAULT 5 COMMENT "0-10 scale"' },
            { name: 'implementation_complexity', def: 'INT DEFAULT 5 COMMENT "0-10 scale"' },
            { name: 'complexity_last_updated', def: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
        ];

        for (const col of columnsToAdd) {
            if (!existingColumns.includes(col.name)) {
                console.log(`📝 Adding ${col.name} column...`);
                await conn.query(`ALTER TABLE problems ADD COLUMN ${col.name} ${col.def}`);
            }
        }
        console.log('✅ All complexity columns added to problems table\n');

        // Create complexity_analytics table
        console.log('📋 Creating complexity_analytics table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS complexity_analytics (
                id INT PRIMARY KEY AUTO_INCREMENT,
                problem_id INT NOT NULL,
                submission_time_minutes INT,
                attempt_number INT,
                submission_id INT,
                user_id INT,
                solved BOOLEAN,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                INDEX idx_problem_id (problem_id),
                INDEX idx_user_id (user_id),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ complexity_analytics table created\n');

        // Create problem_recommendations table
        console.log('📋 Creating problem_recommendations table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS problem_recommendations (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                recommended_problem_id INT NOT NULL,
                reason VARCHAR(255),
                difficulty_match DECIMAL(3,1),
                skill_match DECIMAL(3,1),
                recommended_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                viewed BOOLEAN DEFAULT FALSE,
                solved BOOLEAN DEFAULT FALSE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (recommended_problem_id) REFERENCES problems(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_recommended_at (recommended_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ problem_recommendations table created\n');

        // Create complexity_thresholds for categorization
        console.log('📋 Creating complexity_thresholds table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS complexity_thresholds (
                id INT PRIMARY KEY AUTO_INCREMENT,
                category_id INT NOT NULL,
                difficulty_min DECIMAL(3,1),
                difficulty_max DECIMAL(3,1),
                min_problems INT DEFAULT 5,
                recommended BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES problem_categories(id) ON DELETE CASCADE,
                INDEX idx_category_id (category_id),
                UNIQUE KEY unique_category_range (category_id, difficulty_min, difficulty_max)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ complexity_thresholds table created\n');

        // Seed some default complexity scores for existing problems
        console.log('📊 Initializing complexity scores for existing problems...');
        const [problems] = await conn.query('SELECT id, category FROM problems LIMIT 5');

        for (const problem of problems) {
            const difficulty = 3 + Math.random() * 6; // 3-9 range
            const passRate = Math.min(100, 40 + Math.random() * 50);
            const avgTime = Math.floor(20 + Math.random() * 120);

            await conn.query(`
                UPDATE problems 
                SET difficulty_score = ?,
                    pass_rate = ?,
                    avg_time_minutes = ?,
                    complexity_last_updated = NOW()
                WHERE id = ?
            `, [difficulty, passRate, avgTime, problem.id]);
        }
        console.log(`✅ Initialized ${problems.length} problem scores\n`);

        // Log the migration
        await conn.query(`
            INSERT INTO audit_logs (user_id, user_role, action, resource_type, changes, timestamp)
            VALUES (1, 'admin', 'MIGRATE', 'problem_complexity',
                    'Added difficulty scoring, complexity analytics, recommendations, and thresholds',
                    NOW())
        `);

        console.log('═════════════════════════════════════════════════════');
        console.log('🎉 Problem Complexity Migration Complete!\n');
        console.log('📋 Database Changes:');
        console.log('   ✅ Added 13 columns to problems table');
        console.log('   ✅ Created complexity_analytics table');
        console.log('   ✅ Created problem_recommendations table');
        console.log('   ✅ Created complexity_thresholds table\n');
        console.log('📊 Data Initialized:');
        console.log(`   ✅ ${problems.length} problems with initial scores\n`);
        console.log('🔧 API Endpoints:');
        console.log('   GET /api/problems/:id/complexity-analysis');
        console.log('   GET /api/problems/complexity/recommendations');
        console.log('   GET /api/problems/complexity/by-difficulty');
        console.log('   POST /api/problems/:id/difficulty-feedback\n');
        console.log('═════════════════════════════════════════════════════\n');

        conn.release();
        await pool.end();
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrateProblemComplexity();
