#!/usr/bin/env node

const axios = require('axios');

async function testLogin() {
    try {
        console.log('Testing login endpoint...\n');
        
        const response = await axios.post('http://localhost:3000/api/auth/login', {
            email: 'student1@test.com',
            password: 'Password@123'
        }, {
            timeout: 5000,
            validateStatus: () => true // Don't throw on any status
        });

        console.log('Status:', response.status);
        console.log('Headers:', JSON.stringify(response.headers, null, 2));
        console.log('Data:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.log('Response:', error.response.data);
        }
    }
}

testLogin();
