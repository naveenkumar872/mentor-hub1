/**
 * Add Test Student Allocations Table
 * This allows mentors to assign tests to specific students
 * Run: node add_test_allocations_table.js
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function createTable() {
    const connection = await pool.getConnection();
    try {
        console.log('Creating test_student_allocations table...');
        
        // Create the table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS test_student_allocations (
                id VARCHAR(50) PRIMARY KEY,
                test_id VARCHAR(50) NOT NULL,
                student_id VARCHAR(50) NOT NULL,
                assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (test_id) REFERENCES aptitude_tests(id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_allocation (test_id, student_id),
                INDEX idx_test_id (test_id),
                INDEX idx_student_id (student_id)
            )
        `);
        
        console.log('✅ test_student_allocations table created successfully!');
        
        // Check existing data
        const [rows] = await connection.query('SELECT COUNT(*) as count FROM test_student_allocations');
        console.log(`📊 Current allocations: ${rows[0].count}`);
        
    } catch (error) {
        console.error('❌ Error creating table:', error.message);
    } finally {
        await connection.release();
        await pool.end();
    }
}

createTable();
