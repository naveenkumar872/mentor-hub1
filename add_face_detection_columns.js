require('dotenv').config();
const mysql = require('mysql2/promise');
const { URL } = require('url');

async function addFaceDetectionColumns() {
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

    try {
        console.log('🔧 Adding face detection columns to submissions table...');

        // Add face_not_detected_count column
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN face_not_detected_count INT DEFAULT 0`);
            console.log('✅ Added face_not_detected_count column');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ face_not_detected_count column already exists');
            } else {
                throw e;
            }
        }

        // Add multiple_faces_count column
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN multiple_faces_count INT DEFAULT 0`);
            console.log('✅ Added multiple_faces_count column');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ multiple_faces_count column already exists');
            } else {
                throw e;
            }
        }

        // Add face_lookaway_count column
        try {
            await pool.query(`ALTER TABLE submissions ADD COLUMN face_lookaway_count INT DEFAULT 0`);
            console.log('✅ Added face_lookaway_count column');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ face_lookaway_count column already exists');
            } else {
                throw e;
            }
        }

        // Add face detection settings to problems table
        try {
            await pool.query(`ALTER TABLE problems ADD COLUMN enable_face_detection VARCHAR(10) DEFAULT 'true'`);
            console.log('✅ Added enable_face_detection column to problems table');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ enable_face_detection column already exists');
            } else {
                throw e;
            }
        }

        // Add detect multiple faces setting
        try {
            await pool.query(`ALTER TABLE problems ADD COLUMN detect_multiple_faces VARCHAR(10) DEFAULT 'true'`);
            console.log('✅ Added detect_multiple_faces column to problems table');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ detect_multiple_faces column already exists');
            } else {
                throw e;
            }
        }

        // Add track face lookaway setting
        try {
            await pool.query(`ALTER TABLE problems ADD COLUMN track_face_lookaway VARCHAR(10) DEFAULT 'true'`);
            console.log('✅ Added track_face_lookaway column to problems table');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ track_face_lookaway column already exists');
            } else {
                throw e;
            }
        }

        console.log('\n✅ All face detection columns added successfully!');
        console.log('New columns in submissions table:');
        console.log('  - face_not_detected_count (INT)');
        console.log('  - multiple_faces_count (INT)');
        console.log('  - face_lookaway_count (INT)');
        console.log('New columns in problems table:');
        console.log('  - enable_face_detection (VARCHAR)');
        console.log('  - detect_multiple_faces (VARCHAR)');
        console.log('  - track_face_lookaway (VARCHAR)');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
    } finally {
        await pool.end();
    }
}

addFaceDetectionColumns();
