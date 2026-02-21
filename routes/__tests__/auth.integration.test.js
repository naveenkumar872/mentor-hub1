/**
 * Integration Tests for Critical API Endpoints
 * Run with: npm test -- routes/__tests__/auth.integration.test.js
 * 
 * Tests authentication flow, JWT token validation, and error handling
 */

const request = require('supertest');
const express = require('express');
const { generateToken, authenticate } = require('../../middleware/auth');

// Mock Express server for testing
const createTestServer = () => {
    const app = express();
    app.use(express.json());

    // Mock database
    const users = [
        {
            id: '1',
            email: 'student@test.com',
            role: 'student',
            password: 'hashedpass123'
        }
    ];

    // Test endpoints
    app.post('/api/auth/login', (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Simple mock validation (in real app, would hash password)
        if (email === 'student@test.com' && password === 'password123') {
            const token = generateToken({
                id: '1',
                email: 'student@test.com',
                role: 'student'
            });

            return res.json({ token, user: { id: '1', email } });
        }

        res.status(401).json({ error: 'Invalid credentials' });
    });

    app.post('/api/protected', authenticate, (req, res) => {
        res.json({ message: 'Protected resource', user: req.user });
    });

    app.post('/api/admin-only', authenticate, (req, res) => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        res.json({ message: 'Admin resource' });
    });

    return app;
};

describe('Authentication Integration Tests', () => {
    let app;

    beforeAll(() => {
        app = createTestServer();
    });

    describe('POST /api/auth/login', () => {
        it('should login with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'student@test.com',
                    password: 'password123'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user.email).toBe('student@test.com');
        });

        it('should reject login with invalid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'student@test.com',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error');
        });

        it('should reject login with missing email', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    password: 'password123'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('Email');
        });

        it('should reject login with missing password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'student@test.com'
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('password');
        });
    });

    describe('Protected Routes with JWT', () => {
        it('should access protected route with valid token', async () => {
            const token = generateToken({
                id: '1',
                email: 'student@test.com',
                role: 'student'
            });

            const response = await request(app)
                .post('/api/protected')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.message).toBe('Protected resource');
        });

        it('should reject protected route without token', async () => {
            const response = await request(app)
                .post('/api/protected');

            expect(response.status).toBe(401);
        });

        it('should reject protected route with invalid token', async () => {
            const response = await request(app)
                .post('/api/protected')
                .set('Authorization', 'Bearer invalid.token.here');

            expect(response.status).toBe(401);
        });

        it('should reject protected route with malformed authorization header', async () => {
            const response = await request(app)
                .post('/api/protected')
                .set('Authorization', 'NotBearer token');

            expect(response.status).toBe(401);
        });
    });

    describe('Role-Based Access Control', () => {
        it('should reject admin route for non-admin user', async () => {
            const token = generateToken({
                id: '1',
                email: 'student@test.com',
                role: 'student'
            });

            const response = await request(app)
                .post('/api/admin-only')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(403);
            expect(response.body.error).toContain('Admin');
        });

        it('should accept admin route for admin user', async () => {
            const token = generateToken({
                id: '2',
                email: 'admin@test.com',
                role: 'admin'
            });

            const response = await request(app)
                .post('/api/admin-only')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
        });
    });
});

describe('Input Validation Integration', () => {
    let app;

    beforeAll(() => {
        app = createTestServer();
    });

    it('should handle SQL injection attempts gracefully', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: "' OR '1'='1",
                password: "' OR '1'='1"
            });

        // Should not crash, just return 401
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
    });

    it('should handle XSS attempts in input', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: '<script>alert("xss")</script>',
                password: '<img src=x onerror=alert(1)>'
            });

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
    });
});
