const axios = require('axios');

async function test() {
    try {
        // First login
        const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
            email: 'admin@test.com',
            password: 'Password@123'
        });
        
        const token = loginRes.data.token;
        const userId = loginRes.data.user.id;
        console.log('✅ Logged in as:', loginRes.data.user.name);
        console.log('   Token:', token.substring(0, 30) + '...');
        console.log('   User ID:', userId);
        
        // Then test /users/profile
        const profileRes = await axios.get('http://localhost:3000/api/users/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('\n✅ /users/profile response:');
        console.log(JSON.stringify(profileRes.data, null, 2));
    } catch (error) {
        console.log('❌ ERROR:');
        console.log('Status:', error.response?.status);
        console.log('Data:', error.response?.data);
    }
}

test();
