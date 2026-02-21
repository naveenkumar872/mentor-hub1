const mysql = require('mysql2/promise');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

async function createTestData() {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const pool = mysql.createPool({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1),
        port: Number(dbUrl.port) || 4000,
        ssl: {},
        waitForConnections: true,
        connectionLimit: 5,
        timezone: '+00:00'
    });

    try {
        console.log('🔄 Creating test data for end-to-end testing...\n');

        // Create test users
        const users = [
            { id: uuidv4(), email: 'student@test.com', name: 'Alice Student', role: 'student', avatar: 'AS', password: '$2b$10$hashedpassword1' },
            { id: uuidv4(), email: 'mentor@test.com', name: 'Bob Mentor', role: 'mentor', avatar: 'BM', password: '$2b$10$hashedpassword2' },
            { id: uuidv4(), email: 'admin@test.com', name: 'Admin User', role: 'admin', avatar: 'AU', password: '$2b$10$hashedpassword3' }
        ];

        console.log('📝 Inserting test users...');
        for (const user of users) {
            try {
                await pool.query(
                    'INSERT IGNORE INTO users (id, email, name, role, avatar, password, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
                    [user.id, user.email, user.name, user.role, user.avatar, user.password]
                );
            } catch (e) {
                // User might already exist, continue
            }
        }
        console.log(`✅ Created ${users.length} test users (or they already exist)\n`);

        // Create test problems
        const problems = [
            { id: uuidv4(), title: 'Two Sum', description: 'Find two numbers that add up to target', difficulty: 'easy', category_id: 1 },
            { id: uuidv4(), title: 'Median of Two Sorted Arrays', description: 'Find median of two sorted arrays', difficulty: 'hard', category_id: 1 },
            { id: uuidv4(), title: 'Longest Substring', description: 'Find longest substring without repeating chars', difficulty: 'medium', category_id: 1 }
        ];

        console.log('📝 Inserting test problems...');
        for (const problem of problems) {
            try {
                await pool.query(
                    'INSERT IGNORE INTO problems (id, title, description, difficulty, category_id, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                    [problem.id, problem.title, problem.description, problem.difficulty, problem.category_id || 1]
                );
            } catch (e) {
                // Problem might already exist, continue
            }
        }
        console.log(`✅ Created ${problems.length} test problems (or they already exist)\n`);

        // Create test submissions
        const studentId = users[0].id;
        const submissions = [
            { id: uuidv4(), student_id: studentId, problem_id: problems[0].id, code: 'def twoSum(): pass', score: 85, status: 'accepted' },
            { id: uuidv4(), student_id: studentId, problem_id: problems[1].id, code: 'def median(): pass', score: 92, status: 'accepted' },
            { id: uuidv4(), student_id: studentId, problem_id: problems[2].id, code: 'def longest(): pass', score: 78, status: 'accepted' }
        ];

        console.log('📝 Inserting test submissions...');
        for (const submission of submissions) {
            try {
                await pool.query(
                    'INSERT IGNORE INTO submissions (id, student_id, problem_id, code, score, status, submitted_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
                    [submission.id, submission.student_id, submission.problem_id, submission.code, submission.score, submission.status]
                );
            } catch (e) {
                // Submission might already exist, continue
            }
        }
        console.log(`✅ Created ${submissions.length} test submissions (or they already exist)\n`);

        // Create test code reviews
        const mentorId = users[1].id;
        const reviews = [
            { id: uuidv4(), submission_id: submissions[0].id, author_id: mentorId, line_number: 5, comment: 'Great use of two-pointer approach!', code_snippet: 'left, right = 0, len(arr)-1' },
            { id: uuidv4(), submission_id: submissions[0].id, author_id: mentorId, line_number: 10, comment: 'Consider edge cases', code_snippet: 'if left < right:' }
        ];

        console.log('📝 Inserting test code reviews...');
        for (const review of reviews) {
            try {
                await pool.query(
                    'INSERT IGNORE INTO code_reviews (id, submission_id, author_id, line_number, comment, code_snippet, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
                    [review.id, review.submission_id, review.author_id, review.line_number, review.comment, review.code_snippet]
                );
            } catch (e) {
                // Review might already exist, continue
            }
        }
        console.log(`✅ Created ${reviews.length} test code reviews (or they already exist)\n`);

        // Create test messages
        const messages = [
            { id: uuidv4(), sender_id: studentId, receiver_id: mentorId, content: 'Hi Bob, can you review my submission?', is_read: false },
            { id: uuidv4(), sender_id: mentorId, receiver_id: studentId, content: 'Sure! Great work on the two-pointer solution.', is_read: false }
        ];

        console.log('📝 Inserting test messages...');
        for (const message of messages) {
            try {
                await pool.query(
                    'INSERT IGNORE INTO messages (id, sender_id, receiver_id, content, is_read, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                    [message.id, message.sender_id, message.receiver_id, message.content, message.is_read]
                );
            } catch (e) {
                // Message might already exist, continue
            }
        }
        console.log(`✅ Created ${messages.length} test messages (or they already exist)\n`);

        // Create mentor request
        console.log('📝 Inserting test mentor request...');
        try {
            const mentorRequestId = uuidv4();
            await pool.query(
                'INSERT IGNORE INTO mentor_requests (id, student_id, mentor_id, message, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [mentorRequestId, studentId, mentorId, 'Can you be my mentor for DSA?', 'pending']
            );
        } catch (e) {
            // Request might already exist, continue
        }
        console.log('✅ Created mentor request (or it already exists)\n');

        // Create availability calendar entry
        console.log('📝 Inserting test availability calendar...');
        try {
            const availabilityId = uuidv4();
            const slots = {
                '2026-02-22': true,
                '2026-02-23': true,
                '2026-02-24': false,
                '2026-02-25': true
            };
            await pool.query(
                'INSERT IGNORE INTO user_availability (id, user_id, slots_json, timezone, created_at) VALUES (?, ?, ?, ?, NOW())',
                [availabilityId, mentorId, JSON.stringify(slots), 'UTC']
            );
        } catch (e) {
            // Availability might already exist, continue
        }
        console.log('✅ Created availability calendar (or it already exists)\n');

        // Create mentor ratings
        console.log('📝 Inserting test mentor rating...');
        try {
            const ratingId = uuidv4();
            await pool.query(
                'INSERT IGNORE INTO mentor_ratings (id, mentor_id, student_id, rating, review, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [ratingId, mentorId, studentId, 4.5, 'Excellent mentor! Very helpful and responsive.']
            );
        } catch (e) {
            // Rating might already exist, continue
        }
        console.log('✅ Created mentor rating (or it already exists)\n');

        console.log('═'.repeat(60));
        console.log('🎉 Test data created successfully!');
        console.log('═'.repeat(60));
        console.log('\n📊 Test Data Summary:');
        console.log(`   Students: ${users.filter(u => u.role === 'student').length}`);
        console.log(`   Mentors: ${users.filter(u => u.role === 'mentor').length}`);
        console.log(`   Problems: ${problems.length}`);
        console.log(`   Submissions: ${submissions.length}`);
        console.log(`   Code Reviews: ${reviews.length}`);
        console.log(`   Messages: ${messages.length}`);
        console.log(`   Mentor Requests: 1`);
        console.log(`   Availability Calendar: 1`);
        console.log(`   Mentor Ratings: 1`);
        console.log('\n👤 Test User Credentials:');
        users.forEach(u => {
            console.log(`   ${u.role.toUpperCase()}: ${u.email}`);
        });

        pool.end();
    } catch (error) {
        console.error('❌ Error creating test data:', error.message);
        process.exit(1);
    }
}

createTestData();
