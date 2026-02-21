/**
 * Migration: Connect Alumni Feature
 * Creates tables for alumni profiles, connections, posts, likes, comments, and DMs.
 * Run: node mentor-hub1/migrate_connect_alumni.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    const pool = await mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'mentor_hub',
        port: process.env.DB_PORT || 3306,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
        waitForConnections: true,
    });

    console.log('🔗 Connected to DB. Running Connect Alumni migration...\n');

    const queries = [
        // ── Alumni Profiles ──────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS alumni_profiles (
            id           VARCHAR(36)   PRIMARY KEY DEFAULT (UUID()),
            user_id      VARCHAR(36)   NOT NULL UNIQUE,
            company      VARCHAR(255)  DEFAULT '',
            job_title    VARCHAR(255)  DEFAULT '',
            location     VARCHAR(255)  DEFAULT '',
            batch_year   INT           DEFAULT NULL,
            skills_json  TEXT          DEFAULT '[]',
            bio          TEXT          DEFAULT '',
            avatar_url   VARCHAR(500)  DEFAULT NULL,
            linkedin_url VARCHAR(500)  DEFAULT NULL,
            created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // ── Alumni Connections ────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS alumni_connections (
            id           VARCHAR(36)   PRIMARY KEY DEFAULT (UUID()),
            requester_id VARCHAR(36)   NOT NULL,
            target_id    VARCHAR(36)   NOT NULL,
            status       ENUM('pending','accepted','declined') DEFAULT 'pending',
            created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (target_id)    REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY uq_conn (requester_id, target_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // ── Alumni Posts ──────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS alumni_posts (
            id          VARCHAR(36)   PRIMARY KEY DEFAULT (UUID()),
            author_id   VARCHAR(36)   NOT NULL,
            content     TEXT          NOT NULL,
            type        ENUM('update','job','insight') DEFAULT 'update',
            tags_json   TEXT          DEFAULT '[]',
            created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // ── Post Likes ────────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS alumni_post_likes (
            id         VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
            post_id    VARCHAR(36)  NOT NULL,
            user_id    VARCHAR(36)  NOT NULL,
            created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id)  REFERENCES alumni_posts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)  REFERENCES users(id)        ON DELETE CASCADE,
            UNIQUE KEY uq_like (post_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // ── Post Comments ─────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS alumni_post_comments (
            id         VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
            post_id    VARCHAR(36)  NOT NULL,
            user_id    VARCHAR(36)  NOT NULL,
            text       TEXT         NOT NULL,
            created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id)  REFERENCES alumni_posts(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id)  REFERENCES users(id)        ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // ── Alumni DMs ────────────────────────────────────────────────────────
        `CREATE TABLE IF NOT EXISTS alumni_messages (
            id          VARCHAR(36)  PRIMARY KEY DEFAULT (UUID()),
            sender_id   VARCHAR(36)  NOT NULL,
            receiver_id VARCHAR(36)  NOT NULL,
            text        TEXT         NOT NULL,
            is_read     TINYINT(1)   DEFAULT 0,
            created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_thread (sender_id, receiver_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // ─── Optional: allow 'alumni' as a role in users table ───────────────
        // Attempts to modify ENUM – safe to fail if role column is VARCHAR
        `ALTER TABLE users MODIFY COLUMN role VARCHAR(20) DEFAULT 'student'`,
    ];

    for (const sql of queries) {
        try {
            await pool.query(sql);
            const tableName = (sql.match(/TABLE\s+IF NOT EXISTS\s+(\w+)/i) ||
                sql.match(/MODIFY COLUMN\s+(\w+)/i) || ['', 'column'])[1];
            console.log(`✅ Created / verified: ${tableName}`);
        } catch (err) {
            if (err.code === 'ER_TABLE_EXISTS_ERROR') {
                console.log(`⏭️  Already exists, skipping.`);
            } else {
                console.warn(`⚠️  ${err.message}`);
            }
        }
    }

    // Seed demo alumni users if 'alumni' role users are missing
    const [existing] = await pool.query("SELECT COUNT(*) AS cnt FROM users WHERE role = 'alumni'");
    if (existing[0].cnt === 0) {
        console.log('\n🌱 Seeding demo alumni users...');
        const { v4: uuidv4 } = require('uuid');
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('Alumni@123', 10);

        const demoAlumni = [
            { name: 'Priya Sharma',   email: 'priya.sharma@alumni.local',   company: 'Google',    job_title: 'Senior Software Engineer', location: 'Bangalore', batch_year: 2019, skills: ['React', 'Node.js', 'System Design'], bio: 'Passionate about scalable systems.' },
            { name: 'Arjun Mehta',    email: 'arjun.mehta@alumni.local',    company: 'Microsoft', job_title: 'Product Manager',          location: 'Hyderabad', batch_year: 2018, skills: ['Product Strategy', 'Agile'], bio: 'PM at Microsoft TEAMS.' },
            { name: 'Sneha Reddy',    email: 'sneha.reddy@alumni.local',    company: 'Amazon',    job_title: 'Data Scientist',           location: 'Chennai',   batch_year: 2020, skills: ['Python', 'ML', 'AWS'], bio: 'Data Science @ Amazon.' },
            { name: 'Karthik Iyer',   email: 'karthik.iyer@alumni.local',   company: 'Flipkart',  job_title: 'Staff Engineer',           location: 'Mumbai',    batch_year: 2017, skills: ['Java', 'Kafka', 'Go'], bio: 'Building Flipkart supply chain.' },
            { name: 'Divya Nair',     email: 'divya.nair@alumni.local',     company: 'Razorpay',  job_title: 'Frontend Lead',            location: 'Pune',      batch_year: 2021, skills: ['Vue.js', 'TypeScript'], bio: 'Building fintech UIs.' },
            { name: 'Rahul Verma',    email: 'rahul.verma@alumni.local',    company: 'Infosys',   job_title: 'Cloud Architect',          location: 'Delhi',     batch_year: 2016, skills: ['AWS', 'Kubernetes', 'Terraform'], bio: 'Cloud solutions architect.' },
        ];

        for (const a of demoAlumni) {
            try {
                const uid = uuidv4();
                await pool.query(
                    'INSERT IGNORE INTO users (id, name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                    [uid, a.name, a.email, hash, 'alumni']
                );
                const pid = uuidv4();
                await pool.query(
                    'INSERT IGNORE INTO alumni_profiles (id, user_id, company, job_title, location, batch_year, skills_json, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [pid, uid, a.company, a.job_title, a.location, a.batch_year, JSON.stringify(a.skills), a.bio]
                );
                console.log(`  ✅ Seeded: ${a.name}`);
            } catch (e) {
                console.warn(`  ⚠️  Seed skipped for ${a.name}: ${e.message}`);
            }
        }
    }

    await pool.end();
    console.log('\n🎉 Connect Alumni migration complete!');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
