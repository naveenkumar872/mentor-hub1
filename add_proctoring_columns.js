require('dotenv').config();
const mysql = require('mysql2/promise');

async function addProctoringColumns() {
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
        }
    });

    // Problems table columns
    const problemColumns = [
        "ALTER TABLE problems ADD COLUMN enable_proctoring VARCHAR(10) DEFAULT 'false'",
        "ALTER TABLE problems ADD COLUMN enable_video_audio VARCHAR(10) DEFAULT 'false'",
        "ALTER TABLE problems ADD COLUMN disable_copy_paste VARCHAR(10) DEFAULT 'false'",
        "ALTER TABLE problems ADD COLUMN track_tab_switches VARCHAR(10) DEFAULT 'false'",
        "ALTER TABLE problems ADD COLUMN max_tab_switches INT DEFAULT 3"
    ];

    // Submissions table columns
    const submissionColumns = [
        "ALTER TABLE submissions ADD COLUMN proctoring_video VARCHAR(255) DEFAULT NULL"
    ];

    console.log('Adding columns to problems table...');
    for (const sql of problemColumns) {
        try {
            await pool.query(sql);
            console.log('SUCCESS:', sql.split('ADD COLUMN ')[1].split(' ')[0]);
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('EXISTS:', sql.split('ADD COLUMN ')[1].split(' ')[0]);
            } else {
                console.log('ERROR:', e.message);
            }
        }
    }

    console.log('\nAdding columns to submissions table...');
    for (const sql of submissionColumns) {
        try {
            await pool.query(sql);
            console.log('SUCCESS:', sql.split('ADD COLUMN ')[1].split(' ')[0]);
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('EXISTS:', sql.split('ADD COLUMN ')[1].split(' ')[0]);
            } else {
                console.log('ERROR:', e.message);
            }
        }
    }

    console.log('\nDone! Proctoring columns added.');
    process.exit(0);
}

addProctoringColumns();
