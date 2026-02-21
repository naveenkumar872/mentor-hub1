const axios = require('axios');

async function test() {
    try {
        // Login
        const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
            email: 'admin@test.com',
            password: 'Password@123'
        });
        
        const token = loginRes.data.token;
        console.log('✅ Got token from server');
        
        // Manually add logging to server to see what happens
        // Instead, let's test the full query path
        
        const profileRes = await axios.get('http://localhost:3000/api/users/profile', {
            headers: { 'Authorization': `Bearer ${token}` },
            validateStatus: () => true  // Return any status
        });
        
        console.log('\nProfile Response:');
        console.log('Status:', profileRes.status);
        console.log('Data:', profileRes.data);
        
    } catch (error) {
        console.log('Request failed:', error.message);
    }
}

test();
