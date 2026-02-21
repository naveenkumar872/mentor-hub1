const http = require('http');
const https = require('https');

// Test configuration
const BASE_URL = 'http://localhost:3001';
const BEARER_TOKEN = 'test-jwt-token'; // Will be replaced with actual token

// Test data from create_test_data.js (these IDs are samples)
// You'll need to update these with actual IDs from the database
const TEST_IDS = {
    studentId: '123e4567-e89b-12d3-a456-426614174000',
    mentorId: '123e4567-e89b-12d3-a456-426614174001', 
    adminId: '123e4567-e89b-12d3-a456-426614174002',
    submissionId: '123e4567-e89b-12d3-a456-426614174100',
    problemId: '123e4567-e89b-12d3-a456-426614174200',
    reviewId: '123e4567-e89b-12d3-a456-426614174300'
};

// HTTP request helper
function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + path);
        const options = {
            hostname: url.hostname,
            port: url.port || 3001,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BEARER_TOKEN}`
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body, headers: res.headers });
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

// Test results tracker
let testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

async function testEndpoint(name, method, path, data = null, expectedStatus = 200) {
    try {
        console.log(`\n📍 Testing: ${name}`);
        console.log(`   ${method} ${path}`);
        
        const result = await makeRequest(method, path, data);
        const passed = result.status === expectedStatus;
        
        if (passed) {
            console.log(`   ✅ Status: ${result.status} (Expected: ${expectedStatus})`);
            testResults.passed++;
        } else {
            console.log(`   ❌ Status: ${result.status} (Expected: ${expectedStatus})`);
            testResults.failed++;
        }
        
        if (result.data) {
            if (typeof result.data === 'object') {
                console.log(`   Response: ${JSON.stringify(result.data).substring(0, 100)}...`);
            } else {
                console.log(`   Response: ${result.data.substring(0, 100)}...`);
            }
        }
        
        testResults.tests.push({
            name,
            method,
            path,
            status: result.status,
            expectedStatus,
            passed
        });
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        testResults.failed++;
        testResults.tests.push({
            name,
            method,
            path,
            error: error.message,
            passed: false
        });
    }
}

async function runAllTests() {
    console.log('═'.repeat(70));
    console.log('🧪 BACKEND ENDPOINT TESTING SUITE');
    console.log('═'.repeat(70));
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Test User IDs: Student=${TEST_IDS.studentId}, Mentor=${TEST_IDS.mentorId}`);
    console.log('═'.repeat(70));

    // Feature #9: Code Review Comments
    console.log('\n\n🔹 FEATURE #9: Code Review Comments');
    console.log('─'.repeat(70));
    await testEndpoint(
        'Get reviews for submission',
        'GET',
        `/api/submissions/${TEST_IDS.submissionId}/reviews`,
        null,
        200
    );
    
    await testEndpoint(
        'Add code review',
        'POST',
        `/api/submissions/${TEST_IDS.submissionId}/reviews`,
        {
            author_id: TEST_IDS.mentorId,
            line_number: 5,
            comment: 'Great implementation!',
            code_snippet: 'def solution():'
        },
        201
    );

    // Feature #10: Export Reports
    console.log('\n\n🔹 FEATURE #10: Export Reports');
    console.log('─'.repeat(70));
    await testEndpoint(
        'Export report (PDF)',
        'POST',
        '/api/reports/export',
        {
            userId: TEST_IDS.studentId,
            reportType: 'performance',
            format: 'pdf',
            dateRange: 'month'
        },
        200
    );

    // Feature #11: Advanced Search
    console.log('\n\n🔹 FEATURE #11: Advanced Search');
    console.log('─'.repeat(70));
    await testEndpoint(
        'Search with filters',
        'GET',
        '/api/search?q=two+sum&difficulty=easy&category=arrays&status=completed',
        null,
        200
    );

    // Feature #12: AI Recommendations
    console.log('\n\n🔹 FEATURE #12: AI Recommendations');
    console.log('─'.repeat(70));
    await testEndpoint(
        'Get AI recommendations',
        'GET',
        `/api/recommendations/ai?userId=${TEST_IDS.studentId}`,
        null,
        200
    );

    // Feature #13: Direct Messaging
    console.log('\n\n🔹 FEATURE #13: Direct Messaging');
    console.log('─'.repeat(70));
    await testEndpoint(
        'Get all conversations',
        'GET',
        '/api/messages/conversations',
        null,
        200
    );

    await testEndpoint(
        'Get message history with user',
        'GET',
        `/api/messages/conversations/${TEST_IDS.mentorId}`,
        null,
        200
    );

    await testEndpoint(
        'Send message',
        'POST',
        '/api/messages',
        {
            sender_id: TEST_IDS.studentId,
            receiver_id: TEST_IDS.mentorId,
            content: 'Hi, can you review my submission?'
        },
        201
    );

    // Feature #14: Skill Badges
    console.log('\n\n🔹 FEATURE #14: Skill Badges');
    console.log('─'.repeat(70));
    await testEndpoint(
        'Get user badges',
        'GET',
        `/api/users/${TEST_IDS.studentId}/badges`,
        null,
        200
    );

    // Feature #15: Mentor Matching
    console.log('\n\n🔹 FEATURE #15: Mentor Matching');
    console.log('─'.repeat(70));
    await testEndpoint(
        'Get matched mentors',
        'GET',
        `/api/mentors/matching?studentId=${TEST_IDS.studentId}`,
        null,
        200
    );

    await testEndpoint(
        'Send mentor request',
        'POST',
        '/api/mentor-requests',
        {
            student_id: TEST_IDS.studentId,
            mentor_id: TEST_IDS.mentorId,
            message: 'Can you mentor me in DSA?'
        },
        201
    );

    // Feature #16: AI Test Case Generator
    console.log('\n\n🔹 FEATURE #16: AI Test Case Generator');
    console.log('─'.repeat(70));
    await testEndpoint(
        'Generate test cases',
        'POST',
        '/api/ai/generate-test-cases',
        {
            problemId: TEST_IDS.problemId,
            count: 5,
            complexity: 'medium'
        },
        200
    );

    // Feature #18: Plagiarism Detection
    console.log('\n\n🔹 FEATURE #18: Real-time Plagiarism Detection');
    console.log('─'.repeat(70));
    await testEndpoint(
        'Check plagiarism',
        'POST',
        '/api/plagiarism/check',
        {
            submissionId: TEST_IDS.submissionId,
            code: 'def solution(): pass'
        },
        200
    );

    // Feature #19: Availability Calendar
    console.log('\n\n🔹 FEATURE #19: Availability Calendar');
    console.log('─'.repeat(70));
    await testEndpoint(
        'Get user availability',
        'GET',
        `/api/users/${TEST_IDS.mentorId}/availability`,
        null,
        200
    );

    await testEndpoint(
        'Update user availability',
        'PUT',
        `/api/users/${TEST_IDS.mentorId}/availability`,
        {
            slots: {
                '2026-02-22': true,
                '2026-02-23': true,
                '2026-02-24': false
            },
            timezone: 'UTC'
        },
        200
    );

    // Print summary
    console.log('\n\n' + '═'.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(70));
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(2)}%`);
    console.log('═'.repeat(70));

    console.log('\n📋 Test Results by Feature:');
    console.log('─'.repeat(70));
    
    const featureGroups = {};
    testResults.tests.forEach(test => {
        const feature = test.name.split(' - ')[0];
        if (!featureGroups[feature]) featureGroups[feature] = [];
        featureGroups[feature].push(test);
    });

    Object.entries(featureGroups).forEach(([feature, tests]) => {
        const passed = tests.filter(t => t.passed).length;
        const total = tests.length;
        const status = passed === total ? '✅' : '⚠️';
        console.log(`${status} ${feature}: ${passed}/${total} passed`);
    });

    console.log('═'.repeat(70));
}

// Run tests
console.log('\n⏳ Waiting for server to be ready...');
setTimeout(() => {
    runAllTests().catch(err => {
        console.error('Test suite error:', err);
        process.exit(1);
    });
}, 2000);
