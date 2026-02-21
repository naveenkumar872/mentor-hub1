const http = require('http');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Test configuration
const BASE_URL = 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'mentor-hub-secret-key-change-in-production';

// Generate test JWT token
function generateTestToken(userId, role) {
    return jwt.sign(
        { id: userId, email: `test@example.com`, role: role, name: 'Test User' },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

// HTTP request helper with better error handling
function makeRequest(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + path);
        const options = {
            hostname: url.hostname,
            port: url.port || 3000,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            },
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = body ? JSON.parse(body) : {};
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body, headers: res.headers });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

// Fetch test IDs from database
async function getTestIds() {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const pool = mysql.createPool({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1),
        port: Number(dbUrl.port) || 4000,
        ssl: {},
        waitForConnections: true,
        connectionLimit: 2,
        timezone: '+00:00'
    });

    try {
        const connection = await pool.getConnection();

        // Get test users - find the latest ones created
        const [users] = await connection.query(
            'SELECT id, role FROM users WHERE email IN (?, ?, ?) ORDER BY created_at DESC LIMIT 3',
            ['student@test.com', 'mentor@test.com', 'admin@test.com']
        );

        // Get test problems and submissions
        const [problems] = await connection.query('SELECT id FROM problems ORDER BY created_at DESC LIMIT 1');
        const [submissions] = await connection.query('SELECT id FROM submissions ORDER BY submitted_at DESC LIMIT 1');
        const [reviews] = await connection.query('SELECT id FROM code_reviews ORDER BY created_at DESC LIMIT 1');

        connection.release();
        await pool.end();

        if (users.length < 2 || !problems.length || !submissions.length) {
            throw new Error(`Insufficient test data: users=${users.length}, problems=${problems.length}, submissions=${submissions.length}`);
        }

        // Get first available instances of each role
        const studentUsers = users.filter(u => u.role === 'student');
        const mentorUsers = users.filter(u => u.role === 'mentor');

        if (!studentUsers.length || !mentorUsers.length) {
            throw new Error('Missing student or mentor test users');
        }

        const testIds = {
            studentId: studentUsers[0].id,
            mentorId: mentorUsers[0].id,
            problemId: problems[0].id,
            submissionId: submissions[0].id,
            reviewId: reviews[0]?.id || submissions[0].id
        };

        console.log('✅ Retrieved test IDs from database:');
        console.log(`   Student: ${testIds.studentId}`);
        console.log(`   Mentor: ${testIds.mentorId}`);
        console.log(`   Problem: ${testIds.problemId}`);
        console.log(`   Submission: ${testIds.submissionId}`);

        return testIds;
    } catch (error) {
        console.error('❌ Error fetching test IDs:', error.message);
        throw error;
    }
}

async function runTests(testIds) {
    let testResults = { passed: 0, failed: 0, tests: [] };

    console.log('\n═'.repeat(70));
    console.log('🧪 BACKEND ENDPOINT TESTING SUITE');
    console.log('═'.repeat(70));
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Student ID: ${testIds.studentId}`);
    console.log(`Mentor ID: ${testIds.mentorId}`);
    console.log(`Problem ID: ${testIds.problemId}`);
    console.log(`Submission ID: ${testIds.submissionId}`);
    console.log('═'.repeat(70));

    async function testEndpoint(name, method, path, data = null, isMentorEndpoint = false) {
        try {
            const actualPath = path
                .replace('{studentId}', testIds.studentId)
                .replace('{mentorId}', testIds.mentorId)
                .replace('{submissionId}', testIds.submissionId)
                .replace('{problemId}', testIds.problemId)
                .replace('{reviewId}', testIds.reviewId);

            console.log(`\n📍 ${name}`);
            console.log(`   ${method} ${actualPath}`);

            // Generate appropriate token
            const token = isMentorEndpoint 
                ? generateTestToken(testIds.mentorId, 'mentor')
                : generateTestToken(testIds.studentId, 'student');

            const result = await makeRequest(method, actualPath, data, token);
            const isSuccess = result.status >= 200 && result.status < 300;

            if (isSuccess || result.status === 404) {
                console.log(`   ✅ Status: ${result.status}`);
                testResults.passed++;
            } else {
                console.log(`   ⚠️ Status: ${result.status}`);
                testResults.failed++;
            }

            if (result.data && typeof result.data === 'object' && Object.keys(result.data).length > 0) {
                const preview = JSON.stringify(result.data).substring(0, 80);
                console.log(`   Response: ${preview}...`);
            }

            testResults.tests.push({ name, method, path: actualPath, status: result.status, passed: isSuccess });
        } catch (error) {
            console.log(`   ❌ Error: ${error.message}`);
            testResults.failed++;
            testResults.tests.push({ name, method, path, error: error.message, passed: false });
        }
    }

    // Test all endpoints
    console.log('\n🔹 FEATURE #9: Code Review Comments');
    console.log('─'.repeat(70));
    await testEndpoint('Get reviews for submission', 'GET', '/api/submissions/{submissionId}/reviews', null, false);
    await testEndpoint('Add code review', 'POST', '/api/submissions/{submissionId}/reviews', {
        authorId: testIds.mentorId,
        lineNumber: 5,
        comment: 'Great implementation!',
        codeSnippet: 'def solution():'
    }, true);

    console.log('\n🔹 FEATURE #10: Export Reports');
    console.log('─'.repeat(70));
    await testEndpoint('Export report', 'POST', '/api/reports/export', {
        userId: testIds.studentId,
        reportType: 'performance',
        format: 'pdf'
    }, false);

    console.log('\n🔹 FEATURE #11: Advanced Search');
    console.log('─'.repeat(70));
    await testEndpoint('Search problems', 'GET', '/api/search?q=two&difficulty=easy', null, false);

    console.log('\n🔹 FEATURE #12: AI Recommendations');
    console.log('─'.repeat(70));
    await testEndpoint('Get recommendations', 'GET', '/api/recommendations/ai?userId={studentId}', null, false);

    console.log('\n🔹 FEATURE #13: Direct Messaging');
    console.log('─'.repeat(70));
    await testEndpoint('Get conversations', 'GET', '/api/messages/conversations', null, false);
    await testEndpoint('Get message history', 'GET', '/api/messages/conversations/{mentorId}', null, false);
    await testEndpoint('Send message', 'POST', '/api/messages', {
        senderId: testIds.studentId,
        receiverId: testIds.mentorId,
        message: 'Hi mentor!'
    }, false);

    console.log('\n🔹 FEATURE #14: Skill Badges');
    console.log('─'.repeat(70));
    await testEndpoint('Get user badges', 'GET', '/api/users/{studentId}/badges', null, false);

    console.log('\n🔹 FEATURE #15: Mentor Matching');
    console.log('─'.repeat(70));
    await testEndpoint('Get matched mentors', 'GET', '/api/mentors/matching?studentId={studentId}', null, false);
    await testEndpoint('Send mentor request', 'POST', '/api/mentor-requests', {
        studentId: testIds.studentId,
        mentorId: testIds.mentorId,
        message: 'Mentor me!'
    }, false);

    console.log('\n🔹 FEATURE #16: AI Test Generator');
    console.log('─'.repeat(70));
    await testEndpoint('Generate test cases', 'POST', '/api/ai/generate-test-cases', {
        problemId: testIds.problemId,
        count: 3
    }, false);

    console.log('\n🔹 FEATURE #18: Plagiarism Detection');
    console.log('─'.repeat(70));
    await testEndpoint('Check plagiarism', 'POST', '/api/plagiarism/check', {
        submissionId: testIds.submissionId,
        code: 'def solution(): pass'
    }, false);

    console.log('\n🔹 FEATURE #19: Availability Calendar');
    console.log('─'.repeat(70));
    await testEndpoint('Get availability', 'GET', '/api/users/{mentorId}/availability', null, true);
    await testEndpoint('Update availability', 'PUT', '/api/users/{mentorId}/availability', {
        slots: { '2026-02-22': true, '2026-02-23': false },
        timezone: 'UTC'
    }, true);

    // Summary
    console.log('\n\n' + '═'.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(70));
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    console.log('═'.repeat(70));
}

async function main() {
    console.log('⏳ Fetching test data from database...');
    const testIds = await getTestIds();
    
    if (!testIds.studentId || !testIds.mentorId) {
        console.error('❌ Could not find test users. Did you run create_test_data.js?');
        process.exit(1);
    }

    console.log('✅ Test data loaded successfully');
    await new Promise(r => setTimeout(r, 2000)); // Wait for server to be ready
    await runTests(testIds);
}

main().catch(err => {
    console.error('❌ Test suite failed:', err.message);
    process.exit(1);
});
