const axios = require('axios');

async function testLogin() {
    try {
        const response = await axios.post('http://localhost:3000/api/auth/login', {
            email: 'student1@test.com',
            password: 'Password@123'
        });
        console.log('✅ LOGIN SUCCESSFUL:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.log('❌ LOGIN FAILED');
        console.log('Status:', error.response?.status);
        console.log('Error:', error.response?.data);
        console.log('Message:', error.message);
    }
}

testLogin();
