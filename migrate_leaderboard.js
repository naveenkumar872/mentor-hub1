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

async function migrateLeaderboard() {
    try {
        console.log('🔄 Starting leaderboard migration...\n');

        const conn = await pool.getConnection();

        // Create leaderboard_stats table
        console.log('📋 Creating leaderboard_stats table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS leaderboard_stats (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL UNIQUE,
                problems_solved INT DEFAULT 0,
                total_points INT DEFAULT 0,
                current_streak INT DEFAULT 0,
                best_streak INT DEFAULT 0,
                success_rate DECIMAL(5,2) DEFAULT 0,
                total_submissions INT DEFAULT 0,
                successful_submissions INT DEFAULT 0,
                avg_solve_time_minutes INT DEFAULT 0,
                last_problem_solved DATETIME,
                ranking INT,
                ranking_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_total_points (total_points),
                INDEX idx_ranking (ranking),
                INDEX idx_success_rate (success_rate)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ leaderboard_stats table created\n');

        // Create category_leaderboard table
        console.log('📋 Creating category_leaderboard table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS category_leaderboard (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                category_id INT NOT NULL,
                problems_solved INT DEFAULT 0,
                category_points INT DEFAULT 0,
                category_rank INT,
                success_rate DECIMAL(5,2) DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES problem_categories(id) ON DELETE CASCADE,
                UNIQUE KEY unique_user_category (user_id, category_id),
                INDEX idx_category_id (category_id),
                INDEX idx_category_points (category_points)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ category_leaderboard table created\n');

        // Create weekly_leaderboard table
        console.log('📋 Creating weekly_leaderboard table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS weekly_leaderboard (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                weekly_points INT DEFAULT 0,
                problems_solved_week INT DEFAULT 0,
                week_start DATE,
                week_rank INT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_week_start (week_start),
                INDEX idx_weekly_points (weekly_points)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ weekly_leaderboard table created\n');

        // Check if columns exist in users table
        const [columns] = await conn.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'users' AND COLUMN_NAME IN ('tier', 'avatar')
        `);

        const existingCols = columns.map(c => c.COLUMN_NAME);

        if (!existingCols.includes('tier')) {
            console.log('📝 Adding tier column to users...');
            await conn.query(`ALTER TABLE users ADD COLUMN tier VARCHAR(50) DEFAULT 'Free'`);
        }

        if (!existingCols.includes('avatar')) {
            console.log('📝 Adding avatar column to users...');
            await conn.query(`ALTER TABLE users ADD COLUMN avatar VARCHAR(255)`);
        }

        console.log('✅ Users table updated\n');

        // Initialize leaderboard stats for existing users
        console.log('📊 Initializing leaderboard stats for existing users...');
        const [users] = await conn.query('SELECT id FROM users LIMIT 5');

        for (const user of users) {
            await conn.query(`
                INSERT INTO leaderboard_stats (user_id, problems_solved, total_points)
                VALUES (?, 0, 0)
                ON DUPLICATE KEY UPDATE updated_at = NOW()
            `, [user.id]);
        }
        console.log(`✅ Initialized ${users.length} user stats\n`);

        // Create stored procedure for updating rankings
        console.log('📋 Creating ranking update procedure...');
        await conn.query(`
            DROP PROCEDURE IF EXISTS update_leaderboard_rankings;
        `);

        await conn.query(`
            CREATE PROCEDURE update_leaderboard_rankings()
            BEGIN
                UPDATE leaderboard_stats 
                SET ranking = (
                    SELECT COUNT(*) + 1 
                    FROM leaderboard_stats ls2 
                    WHERE ls2.total_points > leaderboard_stats.total_points
                ),
                ranking_updated = NOW();
            END;
        `);
        console.log('✅ Ranking update procedure created\n');

        // Log migration
        await conn.query(`
            INSERT INTO audit_logs (user_id, user_role, action, resource_type, changes, timestamp)
            VALUES (1, 'admin', 'MIGRATE', 'leaderboard',
                    'Created leaderboard_stats, category_leaderboard, and weekly_leaderboard tables',
                    NOW())
        `);

        console.log('═════════════════════════════════════════════════════');
        console.log('🎉 Leaderboard Migration Complete!\n');
        console.log('📋 Database Changes:');
        console.log('   ✅ Created leaderboard_stats table');
        console.log('   ✅ Created category_leaderboard table');
        console.log('   ✅ Created weekly_leaderboard table');
        console.log('   ✅ Added tier column to users');
        console.log('   ✅ Added avatar column to users');
        console.log('   ✅ Created ranking update procedure\n');
        console.log('📊 Data Initialized:');
        console.log(`   ✅ ${users.length} users initialized\n`);
        console.log('🔧 API Endpoints:');
        console.log('   GET /api/leaderboard - Global leaderboard');
        console.log('   GET /api/leaderboard/category - Category leaderboard');
        console.log('   GET /api/leaderboard/weekly - Weekly leaderboard');
        console.log('   GET /api/leaderboard/monthly - Monthly leaderboard');
        console.log('   GET /api/users/:id/rank - User specific rank\n');
        console.log('═════════════════════════════════════════════════════\n');

        conn.release();
        await pool.end();
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrateLeaderboard();
