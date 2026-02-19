require('dotenv').config();
const mysql = require('mysql2/promise');
const dbUrl = new URL(process.env.DATABASE_URL);

(async () => {
    const conn = await mysql.createConnection({
        host: dbUrl.hostname,
        port: dbUrl.port,
        user: decodeURIComponent(dbUrl.username),
        password: decodeURIComponent(dbUrl.password),
        database: dbUrl.pathname.slice(1),
        ssl: { rejectUnauthorized: true }
    });

    await conn.query(`
        CREATE TABLE IF NOT EXISTS plagiarism_reports (
            id VARCHAR(36) PRIMARY KEY,
            submission_id VARCHAR(36),
            student_id VARCHAR(36),
            problem_id VARCHAR(36),
            suspicion_score FLOAT DEFAULT 0,
            intensity_level VARCHAR(20) DEFAULT 'LOW',
            similarity_details TEXT,
            recommendation TEXT,
            review_status VARCHAR(20) DEFAULT 'pending',
            reviewed_by VARCHAR(36),
            review_notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    await conn.query(`
        CREATE TABLE IF NOT EXISTS plagiarism_matches (
            id VARCHAR(36) PRIMARY KEY,
            plagiarism_report_id VARCHAR(36),
            matched_student_id VARCHAR(36),
            matched_submission_id VARCHAR(36),
            similarity_score FLOAT DEFAULT 0,
            match_type VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('Created plagiarism_reports and plagiarism_matches tables');
    await conn.end();
})().catch(e => console.error(e));
