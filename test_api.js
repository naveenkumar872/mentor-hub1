// Test API endpoint
const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/leaderboard',
    method: 'GET',
    timeout: 5000
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        console.log('✅ Server is running!');
        console.log('Status Code:', res.statusCode);
        console.log('Response length:', data.length, 'bytes');
        
        if (res.statusCode === 200) {
            try {
                const json = JSON.parse(data);
                console.log('Data: Array with', Array.isArray(json) ? json.length : Object.keys(json).length, 'items');
                if (Array.isArray(json) && json.length > 0) {
                    console.log('First item keys:', Object.keys(json[0]));
                }
            } catch (e) {
                console.log('Response preview:', data.substring(0, 200));
            }
        }
        process.exit(0);
    });
});

req.on('error', (error) => {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
});

req.on('timeout', () => {
    console.error('❌ Request timeout after 5s');
    req.destroy();
    process.exit(1);
});

req.end();
