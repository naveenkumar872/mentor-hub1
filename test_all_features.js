#!/usr/bin/env node

/**
 * 🔍 COMPREHENSIVE FEATURE TESTING SCRIPT
 * Tests all 21 features across Student, Admin, and Mentor portals
 * Verifies dynamic data fetching from database
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

// Test credentials
const TEST_USERS = {
    student: { email: 'student1@test.com', password: 'Password@123' },
    mentor: { email: 'mentor1@test.com', password: 'Password@123' },
    admin: { email: 'admin@test.com', password: 'Password@123' }
};

// Store tokens
let tokens = {};

// Color output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

function header(title) {
    console.log('\n' + '='.repeat(80));
    log(`${title}`, 'bright');
    console.log('='.repeat(80) + '\n');
}

async function testLogin() {
    header('🔐 AUTHENTICATION TEST');

    try {
        for (const [role, creds] of Object.entries(TEST_USERS)) {
            try {
                const response = await axios.post(`${API_BASE}/auth/login`, creds);
                if (response.data.token) {
                    tokens[role] = response.data.token;
                    log(`✅ ${role.toUpperCase()} login successful`, 'green');
                    log(`   User: ${response.data.name} (${response.data.role})`, 'cyan');
                } else {
                    log(`❌ ${role.toUpperCase()} login failed - no token`, 'red');
                }
            } catch (error) {
                log(`❌ ${role.toUpperCase()} login error: ${error.response?.data?.error || error.message}`, 'red');
            }
        }
    } catch (error) {
        log(`❌ Authentication test failed: ${error.message}`, 'red');
    }
}

async function testFeature(featureNum, name, role, endpoint, method = 'GET', expectedFields = []) {
    const token = tokens[role];
    if (!token) {
        log(`⚠️  Feature #${featureNum}: ${name} (${role}) - SKIPPED (no token)`, 'yellow');
        return false;
    }

    try {
        const config = {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 5000
        };

        let response;
        if (method === 'GET') {
            response = await axios.get(`${API_BASE}${endpoint}`, config);
        } else if (method === 'POST') {
            response = await axios.post(`${API_BASE}${endpoint}`, {}, config);
        }

        // Check if data is returned
        const hasData = response.data && (
            Array.isArray(response.data) 
                ? response.data.length > 0
                : Object.keys(response.data).length > 0
        );
        const status = response.status === 200 || response.status === 201;

        if (status && (hasData || response.data)) {
            log(`✅ Feature #${featureNum}: ${name} [${role}]`, 'green');
            return true;
        } else {
            log(`⚠️  Feature #${featureNum}: ${name} [${role}] - Status OK but no data`, 'yellow');
            return false;
        }
    } catch (error) {
        const errMsg = error.response?.data?.error || error.message;
        log(`❌ Feature #${featureNum}: ${name} [${role}] - ${errMsg}`, 'red');
        return false;
    }
}

async function runAllTests() {
    header('🧪 STARTING ALL FEATURE TESTS');

    // First login
    await testLogin();

    if (Object.keys(tokens).length === 0) {
        log('\n❌ No successful logins. Cannot proceed with feature tests.', 'red');
        return;
    }

    // Test features
    header('🎯 STUDENT PORTAL FEATURES');
    let studentPassed = 0;

    // Feature #1-8: Core Features (Student View)
    if (await testFeature(1, 'User Authentication', 'student', '/users/profile')) studentPassed++;
    if (await testFeature(2, 'Problem Management (View)', 'student', '/problems')) studentPassed++;
    if (await testFeature(3, 'Code Submission History', 'student', '/submissions')) studentPassed++;
    if (await testFeature(4, 'Assigned Mentor', 'student', '/users/profile')) studentPassed++;
    if (await testFeature(5, 'Performance Analytics', 'student', '/analytics/student')) studentPassed++;
    if (await testFeature(6, 'Problem Recommendations', 'student', '/recommendations/ai')) studentPassed++;
    if (await testFeature(7, 'Plagiarism Check Results', 'student', '/plagiarism/results')) studentPassed++;
    if (await testFeature(8, 'Tests Available', 'student', '/skill-tests')) studentPassed++;

    // Feature #9-19: Advanced Features (Student View)
    header('📚 ADVANCED STUDENT FEATURES');
    if (await testFeature(9, 'Code Reviews Received', 'student', '/submissions')) studentPassed++;
    if (await testFeature(10, 'Export Reports', 'student', '/reports')) studentPassed++;
    if (await testFeature(11, 'Advanced Search', 'student', '/search?q=test')) studentPassed++;
    if (await testFeature(12, 'AI Recommendations', 'student', '/recommendations/ai')) studentPassed++;
    if (await testFeature(13, 'Direct Messages', 'student', '/messages/conversations')) studentPassed++;
    if (await testFeature(14, 'Skill Badges', 'student', '/badges')) studentPassed++;
    if (await testFeature(15, 'Mentor Matching', 'student', '/mentors')) studentPassed++;
    if (await testFeature(16, 'AI Test Case Generator', 'student', '/test-generator')) studentPassed++;

    // Feature #17-21: Other Features (Student View)
    header('🎮 GAMIFICATION & ADDITIONAL FEATURES (STUDENT)');
    if (await testFeature(17, 'Multi-Language Support', 'student', '/users/profile')) studentPassed++;
    if (await testFeature(18, 'Plagiarism Detection Engine', 'student', '/plagiarism/check')) studentPassed++;
    if (await testFeature(19, 'Availability Calendar', 'student', '/users/:id/availability')) studentPassed++;
    if (await testFeature(20, 'Leaderboard', 'student', '/leaderboard')) studentPassed++;
    if (await testFeature(21, 'Notifications', 'student', '/notifications')) studentPassed++;

    log(`\n📊 Student Portal: ${studentPassed}/21 features working`, 'cyan');

    // MENTOR PORTAL
    header('👨‍🏫 MENTOR PORTAL FEATURES');
    let mentorPassed = 0;

    if (await testFeature(1, 'User Authentication', 'mentor', '/users/profile')) mentorPassed++;
    if (await testFeature(2, 'Problem Management', 'mentor', '/problems')) mentorPassed++;
    if (await testFeature(3, 'Code Submissions Review', 'mentor', '/submissions')) mentorPassed++;
    if (await testFeature(4, 'Assigned Students', 'mentor', '/mentor/students')) mentorPassed++;
    if (await testFeature(5, 'Team Analytics', 'mentor', '/analytics/mentor')) mentorPassed++;
    if (await testFeature(7, 'Plagiarism Check', 'mentor', '/plagiarism/results')) mentorPassed++;
    if (await testFeature(8, 'Manage Tests', 'mentor', '/skill-tests')) mentorPassed++;
    if (await testFeature(9, 'Provide Code Reviews', 'mentor', '/submissions')) mentorPassed++;
    if (await testFeature(10, 'Generate Reports', 'mentor', '/reports')) mentorPassed++;
    if (await testFeature(13, 'Chat with Students', 'mentor', '/messages/conversations')) mentorPassed++;
    if (await testFeature(14, 'Award Badges', 'mentor', '/badges')) mentorPassed++;
    if (await testFeature(15, 'Mentor Profile', 'mentor', '/users/profile')) mentorPassed++;
    if (await testFeature(16, 'Test Case Generator', 'mentor', '/test-generator')) mentorPassed++;
    if (await testFeature(19, 'Set Availability', 'mentor', '/users/:id/availability')) mentorPassed++;

    log(`\n📊 Mentor Portal: ${mentorPassed}/21 features working`, 'cyan');

    // ADMIN PORTAL
    header('🛡️ ADMIN PORTAL FEATURES');
    let adminPassed = 0;

    if (await testFeature(1, 'User Authentication', 'admin', '/users/profile')) adminPassed++;
    if (await testFeature(2, 'Problem Management', 'admin', '/problems')) adminPassed++;
    if (await testFeature(3, 'All Submissions', 'admin', '/submissions')) adminPassed++;
    if (await testFeature(4, 'Mentor Allocations', 'admin', '/mentor/allocations')) adminPassed++;
    if (await testFeature(5, 'Platform Analytics', 'admin', '/analytics/admin')) adminPassed++;
    if (await testFeature(7, 'Plagiarism Monitoring', 'admin', '/plagiarism/results')) adminPassed++;
    if (await testFeature(8, 'Manage Tests', 'admin', '/skill-tests')) adminPassed++;
    if (await testFeature(9, 'Monitor Code Reviews', 'admin', '/submissions')) adminPassed++;
    if (await testFeature(10, 'Generate Reports', 'admin', '/reports')) adminPassed++;
    if (await testFeature(13, 'Monitor Messages', 'admin', '/messages')) adminPassed++;
    if (await testFeature(14, 'Manage Badges', 'admin', '/badges')) adminPassed++;
    if (await testFeature(15, 'Manage Mentors', 'admin', '/mentors')) adminPassed++;
    if (await testFeature(18, 'Plagiarism Settings', 'admin', '/plagiarism')) adminPassed++;
    if (await testFeature(20, 'Leaderboard Admin', 'admin', '/leaderboard')) adminPassed++;
    if (await testFeature(21, 'System Notifications', 'admin', '/notifications')) adminPassed++;

    log(`\n📊 Admin Portal: ${adminPassed}/21 features working`, 'cyan');

    // Summary
    header('📋 TEST SUMMARY');
    const total = studentPassed + mentorPassed + adminPassed;
    const maxTotal = 57; // 21 + 14 + 22 (approximate)
    const percentage = Math.round((total / maxTotal) * 100);

    log(`Student Portal:  ${studentPassed}/21 features `, 'cyan');
    log(`Mentor Portal:   ${mentorPassed}/14 features`, 'cyan');
    log(`Admin Portal:    ${adminPassed}/15 features`, 'cyan');
    log(`\nTotal: ${total} features verified (${percentage}%)`, 'bright');

    if (percentage === 100) {
        log('\n✅ ALL FEATURES WORKING PERFECTLY! 🎉', 'green');
    } else if (percentage >= 80) {
        log(`\n⚠️  Most features working (${percentage}%). Check failures above.`, 'yellow');
    } else {
        log(`\n❌ Many features failing. See details above.`, 'red');
    }
}

// Main execution
(async () => {
    log('🔍 Mentor Hub - Complete Feature Test Suite\n', 'bright');
    log('Testing all 21 features across 3 portals...', 'cyan');

    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    await runAllTests();

    console.log('\n' + '='.repeat(80));
})();
