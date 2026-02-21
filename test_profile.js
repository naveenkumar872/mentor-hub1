const axios = require('axios');

async function test() {
    try {
        // First login
        const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
            email: 'student1@test.com',
            password: 'Password@123'
        });
        
        const token = loginRes.data.token;
        console.log('✅ Got token');
        
        // Then test /users/profile
        const profileRes = await axios.get('http://localhost:3000/api/users/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('✅ /users/profile:', JSON.stringify(profileRes.data, null, 2));
    } catch (error) {
        console.log('❌ ERROR:');
        console.log('Status:', error.response?.status);
        console.log('Data:', error.response?.data);
        console.log('Message:', error.message);
    }
}

test();
