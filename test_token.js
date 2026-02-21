const jwt = require('jsonwebtoken');

const JWT_SECRET = 'mentor-hub-secret-key';

// Test token verification
const testToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImJmNjc2NTUzLTY4YjYtNGUzMC05ZWIyLTA4YTRlOTI2OTllMCIsImVtYWlsIjoiYWRtaW5AdGVzdC5jb20iLCJyb2xlIjoiYWRtaW4iLCJuYW1lIjoiVGVzdCBBZG1pbiIsImlhdCI6MTc3MTY4MjI2NiwiZXhwIjoxNzcxNzY4NjY2fQ.UqvPPYRg9Y6wCF7gKX_9_KmkYLuVwGqDvjAzUFjXDBk';

try {
    const decoded = jwt.verify(testToken, JWT_SECRET);
    console.log('✅ Token decoded successfully:');
    console.log(JSON.stringify(decoded, null, 2));
    console.log('\nUser ID from token:', decoded.id);
} catch (error) {
    console.log('❌ Token verification failed:');
    console.log('Error:', error.message);
}
