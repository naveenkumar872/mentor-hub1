const http = require('http');

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

(async () => {
    try {
        console.log('📊 Testing Proctoring Analytics Endpoints...\n');

        console.log('1️⃣ Overall Analytics:');
        const analytics = await makeRequest('/api/proctoring/analytics');
        console.log(JSON.stringify(analytics, null, 2));

        console.log('\n2️⃣  Student Analytics:');
        const students = await makeRequest('/api/proctoring/analytics/by-student');
        console.log(JSON.stringify(students, null, 2));

    } catch(e) {
        console.error('❌ Error:', e.message);
        console.error('\n⚠️ Make sure server is running: node server.js');
    }
    process.exit(0);
})();
