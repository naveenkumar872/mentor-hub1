const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';

const TEST_USERS = {
    student: { email: 'student1@test.com', password: 'Password@123' },
    mentor: { email: 'mentor1@test.com', password: 'Password@123' },
    admin: { email: 'admin@test.com', password: 'Password@123' }
};

let tokens = {};
let userIds = {};

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function testLogin() {
    console.log('\n🔐 AUTHENTICATION TEST\n');
    
    for (const [role, creds] of Object.entries(TEST_USERS)) {
        try {
            const response = await axios.post(`${API_BASE}/auth/login`, creds);
            if (response.data.token && response.data.user) {
                tokens[role] = response.data.token;
                userIds[role] = response.data.user.id;
                log(`✅ ${role.toUpperCase()} login successful - ID: ${userIds[role]}`, 'green');
            }
        } catch (error) {
            log(`❌ ${role.toUpperCase()} login failed`, 'red');
        }
    }
}

async function testProfile() {
    console.log('\n📋 PROFILE TEST\n');
    
    for (const [role, token] of Object.entries(tokens)) {
        try {
            const response = await axios.get(`${API_BASE}/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            log(`✅ ${role.toUpperCase()} profile: ${response.data.name || 'N/A'}`, 'green');
        } catch (error) {
            log(`❌ ${role.toUpperCase()} profile: ${error.response?.data?.error || error.message}`, 'red');
        }
    }
}

async function testLeaderboard() {
    console.log('\n🏆 LEADERBOARD TEST\n');
    
    for (const [role, token] of Object.entries(tokens)) {
        try {
            const response = await axios.get(`${API_BASE}/leaderboard?limit=10`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const count = response.data.length || 0;
            log(`✅ ${role.toUpperCase()} leaderboard: ${count} entries`, 'green');
        } catch (error) {
            log(`❌ ${role.toUpperCase()} leaderboard: ${error.response?.data?.error || error.message}`, 'red');
        }
    }
}

async function testNotifications() {
    console.log('\n🔔 NOTIFICATIONS TEST\n');
    
    for (const [role, token] of Object.entries(tokens)) {
        try {
            const response = await axios.get(`${API_BASE}/notifications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const count = Array.isArray(response.data) ? response.data.length : 0;
            log(`✅ ${role.toUpperCase()} notifications: ${count} messages`, 'green');
        } catch (error) {
            log(`❌ ${role.toUpperCase()} notifications: ${error.response?.data?.error || error.message}`, 'red');
        }
    }
}

async function testAvailability() {
    console.log('\n📅 AVAILABILITY TEST\n');
    
    for (const [role, token] of Object.entries(tokens)) {
        try {
            const userId =userIds[role];
            if (!userId) {
                log(`⚠️  ${role.toUpperCase()}: No user ID available`, 'yellow');
                continue;
            }
            const response = await axios.get(`${API_BASE}/users/${userId}/availability`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const slotCount = Object.keys(response.data.slots || {}).length;
            log(`✅ ${role.toUpperCase()} availability: ${slotCount} slots`, 'green');
        } catch (error) {
            log(`❌ ${role.toUpperCase()} availability: ${error.response?.data?.error || error.message}`, 'red');
        }
    }
}

async function runAllTests() {
    await testLogin();
    await testProfile();
    await testLeaderboard();
    await testNotifications();
    await testAvailability();
    
    log('\n✅ Diagnostic tests completed!', 'cyan');
}

runAllTests();
