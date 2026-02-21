#!/usr/bin/env node

/**
 * 📝 CREATE TEST USERS SCRIPT
 * Creates test users for student, mentor, and admin roles
 */

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const { URL } = require('url');

async function createTestUsers() {
    try {
        const dbUrl = new URL(process.env.DATABASE_URL);
        const pool = mysql.createPool({
            host: dbUrl.hostname,
            user: dbUrl.username,
            password: dbUrl.password,
            database: dbUrl.pathname.slice(1),
            port: Number(dbUrl.port) || 4000,
            ssl: { rejectUnauthorized: true },
        });

        console.log('📝 Creating test users...\n');

        // Test users to create
        const testUsers = [
            {
                email: 'student1@test.com',
                password: 'Password@123',
                name: 'Test Student',
                role: 'student'
            },
            {
                email: 'mentor1@test.com',
                password: 'Password@123',
                name: 'Test Mentor',
                role: 'mentor'
            },
            {
                email: 'admin@test.com',
                password: 'Password@123',
                name: 'Test Admin',
                role: 'admin'
            }
        ];

        for (const user of testUsers) {
            try {
                // Check if user already exists
                const [existing] = await pool.query(
                    'SELECT id FROM users WHERE email = ?',
                    [user.email]
                );

                if (existing && existing.length > 0) {
                    console.log(`✅ User already exists: ${user.email}`);
                    continue;
                }

                // Hash password
                const hashedPassword = await bcrypt.hash(user.password, 12);
                const userId = uuidv4();

                // Create user
                await pool.query(
                    'INSERT INTO users (id, email, password, name, role, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [userId, user.email, hashedPassword, user.name, user.role, 'active']
                );

                console.log(`✅ Created ${user.role.toUpperCase()}: ${user.email}`);
            } catch (error) {
                console.error(`❌ Error creating ${user.email}:`, error.message);
            }
        }

        await pool.end();
        console.log('\n✅ Test users ready!\n');
        console.log('Logins:');
        console.log('  Student: student1@test.com / Password@123');
        console.log('  Mentor:  mentor1@test.com / Password@123');
        console.log('  Admin:   admin@test.com / Password@123');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createTestUsers();
