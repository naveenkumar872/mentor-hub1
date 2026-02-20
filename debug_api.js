const axios = require('axios');

async function debug() {
    const studentId = 1; // Try with ID 1
    const url = `http://localhost:3000/api/analytics/student/${studentId}`;
    console.log(`Calling ${url}...`);
    try {
        const res = await axios.get(url);
        console.log('Success!', Object.keys(res.data));
    } catch (err) {
        console.error('Error Status:', err.response?.status);
        console.error('Error Data:', err.response?.data);
        console.error('Error Message:', err.message);
    }
}

debug();
