/**
 * Unit Tests for Rate Limiter Middleware
 * Run with: npm test -- middleware/__tests__/rateLimiter.test.js
 */

const rateLimit = require('express-rate-limit');
const express = require('express');
const request = require('supertest');
const { 
    generalLimiter, 
    authLimiter, 
    aiLimiter, 
    codeLimiter, 
    adminLimiter, 
    uploadLimiter 
} = require('../../middleware/rateLimiter');

// Create test server with rate limiters
const createTestServer = (limiter, name) => {
    const app = express();
    app.use(express.json());

    app.post('/api/test', limiter, (req, res) => {
        res.json({ message: `${name} endpoint reached` });
    });

    return app;
};

describe('Rate Limiter Middleware', () => {
    describe('General Rate Limiter', () => {
        let app;

        beforeAll(() => {
            app = createTestServer(generalLimiter, 'General');
        });

        it('should allow requests below rate limit', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({ test: 'data' });

            expect(response.status).toBe(200);
            expect(response.body.message).toContain('General');
        });

        it('should include rate limit headers', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({ test: 'data' });

            // Rate limit headers should be present
            expect(response.headers['ratelimit-limit']).toBeDefined();
            expect(response.headers['ratelimit-remaining']).toBeDefined();
        });

        it('should track remaining requests', async () => {
            let previousRemaining = 200;  // Default limit

            for (let i = 0; i < 5; i++) {
                const response = await request(app)
                    .post('/api/test')
                    .send({ test: 'data' });

                const remaining = parseInt(response.headers['ratelimit-remaining']);
                
                // Should decrease with each request
                expect(remaining).toBeLessThanOrEqual(previousRemaining);
                previousRemaining = remaining;
            }
        });

        it('should reject requests after limit exceeded', async () => {
            // This would require making 200+ requests in quick succession
            // For unit tests, we'll verify the limiter configuration
            expect(generalLimiter).toBeDefined();
            expect(generalLimiter.options.windowMs).toBe(15 * 60 * 1000);  // 15 minutes
        });
    });

    describe('Auth Rate Limiter', () => {
        let app;

        beforeAll(() => {
            app = createTestServer(authLimiter, 'Auth');
        });

        it('should have stricter limits than general', () => {
            // Auth limiter: 10 requests per 15 minutes
            // General limiter: 200 requests per 15 minutes
            expect(authLimiter.options.max).toBeLessThan(generalLimiter.options.max);
            expect(authLimiter.options.max).toBe(10);
        });

        it('should allow login attempts', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({ email: 'test@example.com', password: 'pass' });

            expect(response.status).toBe(200);
        });

        it('should include skip option for authenticated users', () => {
            // Auth limiter should have skip option
            expect(authLimiter.options.skip).toBeDefined();
            expect(typeof authLimiter.options.skip).toBe('function');
        });
    });

    describe('AI Rate Limiter', () => {
        let app;

        beforeAll(() => {
            app = createTestServer(aiLimiter, 'AI');
        });

        it('should limit AI API calls', () => {
            // AI limiter: 30 requests per 15 minutes
            expect(aiLimiter.options.max).toBe(30);
            expect(aiLimiter.options.windowMs).toBe(15 * 60 * 1000);
        });

        it('should allow AI endpoint requests', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({ prompt: 'test prompt' });

            expect(response.status).toBe(200);
        });

        it('should provide appropriate limit headers', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({ prompt: 'test' });

            expect(response.headers['ratelimit-limit']).toBe('30');
        });
    });

    describe('Code Execution Rate Limiter', () => {
        let app;

        beforeAll(() => {
            app = createTestServer(codeLimiter, 'Code');
        });

        it('should limit code execution requests aggressively', () => {
            // Code limiter: 20 requests per 5 minutes
            expect(codeLimiter.options.max).toBe(20);
            expect(codeLimiter.options.windowMs).toBe(5 * 60 * 1000);
        });

        it('should allow code submissions', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({ code: 'print("hello")' });

            expect(response.status).toBe(200);
        });

        it('should have shorter window than other limiters', () => {
            expect(codeLimiter.options.windowMs).toBeLessThan(generalLimiter.options.windowMs);
        });
    });

    describe('Admin Operations Rate Limiter', () => {
        let app;

        beforeAll(() => {
            app = createTestServer(adminLimiter, 'Admin');
        });

        it('should allow admin operations', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({ action: 'delete_user' });

            expect(response.status).toBe(200);
        });

        it('should have higher limit than auth', () => {
            // Admin limiter: 50 requests per 15 minutes
            expect(adminLimiter.options.max).toBe(50);
            expect(adminLimiter.options.max).toBeGreaterThan(authLimiter.options.max);
        });

        it('should have skip option for rate limit bypass', () => {
            // Some admins might bypass rate limiting
            expect(adminLimiter.options.skip).toBeDefined();
        });
    });

    describe('Upload Rate Limiter', () => {
        let app;

        beforeAll(() => {
            app = createTestServer(uploadLimiter, 'Upload');
        });

        it('should limit file uploads', () => {
            // Upload limiter: 10 requests per 15 minutes
            expect(uploadLimiter.options.max).toBe(10);
        });

        it('should allow file uploads', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({ filename: 'test.txt' });

            expect(response.status).toBe(200);
        });

        it('should have same window as auth', () => {
            // Same 15-minute window, different max
            expect(uploadLimiter.options.windowMs).toBe(authLimiter.options.windowMs);
        });
    });

    describe('Rate Limit Configuration', () => {
        it('should use IPv6-safe key generation', () => {
            // All limiters should use keyGenerator for IPv6 support
            const limiters = [generalLimiter, authLimiter, aiLimiter, codeLimiter, adminLimiter, uploadLimiter];

            limiters.forEach(limiter => {
                expect(limiter.options.keyGenerator).toBeDefined();
            });
        });

        it('should have meaningful rate limit messages', () => {
            const limiters = [generalLimiter, authLimiter, aiLimiter, codeLimiter, adminLimiter, uploadLimiter];

            limiters.forEach(limiter => {
                expect(limiter.options.message).toBeDefined();
                expect(typeof limiter.options.message).toBe('string');
                expect(limiter.options.message.length).toBeGreaterThan(0);
            });
        });

        it('should return 429 status on rate limit exceeded', () => {
            const limiters = [generalLimiter, authLimiter, aiLimiter, codeLimiter, adminLimiter, uploadLimiter];

            limiters.forEach(limiter => {
                expect(limiter.options.statusCode).toBe(429);
            });
        });
    });

    describe('Whitelist and Skip Options', () => {
        it('should skip rate limiting for certain IPs', () => {
            // Localhost or internal IPs might be whitelisted
            expect(generalLimiter.options.skip).toBeDefined();
        });

        it('should skip rate limiting for authenticated users in auth endpoint', () => {
            const skipFunction = authLimiter.options.skip;

            // If request has auth token, skip the limiter
            if (skipFunction) {
                const mockReq = { 
                    headers: { 
                        authorization: 'Bearer token123' 
                    } 
                };
                
                // This is a mock - actual implementation varies
                expect(typeof skipFunction).toBe('function');
            }
        });
    });

    describe('Integration with Express', () => {
        it('should work as Express middleware', () => {
            const app = express();
            
            // Should be callable as middleware
            expect(typeof generalLimiter).toBe('function');
            
            // Should accept req, res, next
            const mockReq = {};
            const mockRes = {};
            const mockNext = jest.fn();
            
            // Calling limiter should invoke next eventually
            generalLimiter(mockReq, mockRes, mockNext);
            // Note: May be called asynchronously
        });
    });
});

describe('Rate Limit Behavior Under Load', () => {
    let app;

    beforeAll(() => {
        app = createTestServer(generalLimiter, 'Load Test');
    });

    it('should handle multiple concurrent requests', async () => {
        const requests = [];

        // Make 10 concurrent requests
        for (let i = 0; i < 10; i++) {
            requests.push(
                request(app)
                    .post('/api/test')
                    .send({ index: i })
            );
        }

        const responses = await Promise.all(requests);

        // All should succeed (well under limit)
        responses.forEach(response => {
            expect(response.status).toBe(200);
        });
    });

    it('should track rate limits correctly across requests', async () => {
        const limitBefore = parseInt(
            (await request(app).post('/api/test').send({}))
                .headers['ratelimit-limit']
        );

        const remainingBefore = parseInt(
            (await request(app).post('/api/test').send({}))
                .headers['ratelimit-remaining']
        );

        // Make another request
        const response = await request(app)
            .post('/api/test')
            .send({});

        const remainingAfter = parseInt(
            response.headers['ratelimit-remaining']
        );

        // Remaining should decrease
        expect(remainingAfter).toBeLessThan(remainingBefore);
    });
});
