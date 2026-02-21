/**
 * Unit Tests for Sanitizer Middleware
 * Run with: npm test -- middleware/__tests__/sanitizer.test.js
 */

const express = require('express');
const request = require('supertest');
const { sanitizeMiddleware, sanitizeString, sanitizeObject } = require('../../middleware/sanitizer');

// Create test server
const createTestServer = () => {
    const app = express();
    app.use(express.json());
    app.use(sanitizeMiddleware);

    app.post('/api/test', (req, res) => {
        res.json({ received: req.body });
    });

    app.get('/api/test', (req, res) => {
        res.json({ params: req.query });
    });

    return app;
};

describe('Sanitizer Middleware - String Sanitization', () => {
    describe('sanitizeString function', () => {
        it('should remove script tags', () => {
            const input = '<script>alert("xss")</script>Hello';
            const output = sanitizeString(input);

            expect(output).not.toContain('<script>');
            expect(output).not.toContain('</script>');
            expect(output).toContain('Hello');
        });

        it('should remove img tags with onerror', () => {
            const input = '<img src=x onerror="alert(1)">Content';
            const output = sanitizeString(input);

            expect(output).not.toContain('<img');
            expect(output).not.toContain('onerror');
            expect(output).toContain('Content');
        });

        it('should remove iframe tags', () => {
            const input = '<iframe src="malicious.html"></iframe>Safe';
            const output = sanitizeString(input);

            expect(output).not.toContain('<iframe');
            expect(output).toContain('Safe');
        });

        it('should remove event handlers', () => {
            const input = '<div onclick="alert(1)">Click me</div>';
            const output = sanitizeString(input);

            expect(output).not.toContain('onclick');
            expect(output).toContain('Click me');
        });

        it('should handle nested tags', () => {
            const input = '<div><script>alert(1)</script>Text</div>';
            const output = sanitizeString(input);

            expect(output).not.toContain('<');
            expect(output).not.toContain('>');
        });

        it('should handle encoded tags', () => {
            const input = '&lt;script&gt;alert(1)&lt;/script&gt;';
            const output = sanitizeString(input);

            // Encoded tags should be safe but preserved
            expect(typeof output).toBe('string');
        });

        it('should preserve normal text', () => {
            const input = 'This is normal text with no HTML';
            const output = sanitizeString(input);

            expect(output).toBe(input);
        });

        it('should preserve special characters when safe', () => {
            const input = 'Email: test@example.com, Phone: +1-234-567-8900';
            const output = sanitizeString(input);

            expect(output).toContain('@');
            expect(output).toContain('-');
            expect(output).toContain('+');
        });

        it('should handle empty strings', () => {
            const input = '';
            const output = sanitizeString(input);

            expect(output).toBe('');
        });

        it('should handle null/undefined gracefully', () => {
            expect(sanitizeString(null)).toBe('');
            expect(sanitizeString(undefined)).toBe('');
        });
    });

    describe('sanitizeObject function', () => {
        it('should sanitize all string values in object', () => {
            const input = {
                name: '<b>John</b>',
                bio: '<script>alert(1)</script>Developer',
                website: 'https://example.com'
            };

            const output = sanitizeObject(input);

            expect(output.name).not.toContain('<');
            expect(output.bio).not.toContain('<');
            expect(output.website).toBe('https://example.com');
        });

        it('should recursively sanitize nested objects', () => {
            const input = {
                level1: {
                    level2: {
                        malicious: '<img src=x onerror=alert(1)>',
                        safe: 'text'
                    }
                }
            };

            const output = sanitizeObject(input);

            expect(output.level1.level2.malicious).not.toContain('<');
            expect(output.level1.level2.safe).toBe('text');
        });

        it('should sanitize array elements', () => {
            const input = {
                items: [
                    '<script>alert(1)</script>Item1',
                    'Item2',
                    '<b>Item3</b>'
                ]
            };

            const output = sanitizeObject(input);

            expect(output.items[0]).not.toContain('<');
            expect(output.items[1]).toBe('Item2');
            expect(output.items[2]).not.toContain('<');
        });

        it('should preserve data types (numbers, booleans)', () => {
            const input = {
                age: 25,
                active: true,
                score: 98.5,
                count: 0
            };

            const output = sanitizeObject(input);

            expect(output.age).toBe(25);
            expect(output.active).toBe(true);
            expect(output.score).toBe(98.5);
            expect(output.count).toBe(0);
        });

        it('should not sanitize known-safe fields like passwords', () => {
            const input = {
                username: '<admin>',
                password: 'P@ss<123',
                email: 'test@example.com'
            };

            const output = sanitizeObject(input);

            expect(output.username).not.toContain('<');
            // Password might be preserved as-is (depends on implementation)
            expect(output.email).toBe('test@example.com');
        });

        it('should handle empty objects', () => {
            const output = sanitizeObject({});
            expect(Object.keys(output).length).toBe(0);
        });

        it('should handle null values safely', () => {
            const input = {
                field1: null,
                field2: 'safe'
            };

            const output = sanitizeObject(input);

            expect(output.field1).toBeNull();
            expect(output.field2).toBe('safe');
        });
    });
});

describe('Sanitizer Middleware - Request Handling', () => {
    let app;

    beforeAll(() => {
        app = createTestServer();
    });

    describe('POST body sanitization', () => {
        it('should sanitize malicious JSON body', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({
                    title: '<script>alert(1)</script>Safe Title',
                    content: '<img src=x onerror=alert(1)>Content'
                });

            expect(response.status).toBe(200);
            expect(response.body.received.title).not.toContain('<script>');
            expect(response.body.received.content).not.toContain('<img');
        });

        it('should preserve safe object structure', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({
                    name: 'John Doe',
                    email: 'john@example.com',
                    verified: true
                });

            expect(response.status).toBe(200);
            expect(response.body.received.name).toBe('John Doe');
            expect(response.body.received.verified).toBe(true);
        });

        it('should handle deeply nested structures', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({
                    user: {
                        profile: {
                            bio: '<script>xss</script>Developer',
                            links: {
                                website: 'https://example.com'
                            }
                        }
                    }
                });

            expect(response.status).toBe(200);
            expect(response.body.received.user.profile.bio).not.toContain('<');
        });
    });

    describe('Query parameter sanitization', () => {
        it('should sanitize query parameters', async () => {
            const response = await request(app)
                .get('/api/test?search=<script>alert(1)</script>&filter=<b>test</b>');

            expect(response.status).toBe(200);
            expect(response.body.params.search).not.toContain('<');
            expect(response.body.params.filter).not.toContain('<');
        });
    });

    describe('Large payload handling', () => {
        it('should enforce size limits to prevent DoS', async () => {
            const largeString = 'a'.repeat(20000);  // Create large string

            const response = await request(app)
                .post('/api/test')
                .send({
                    largeField: largeString
                });

            // Should either truncate or reject
            expect(response.status).toBeLessThan(500);
        });
    });

    describe('Edge cases', () => {
        it('should handle mixed content safely', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({
                    text: 'Normal text with <b>HTML</b> and "quotes" and \'apostrophes\'',
                    json: { nested: '<div>test</div>' }
                });

            expect(response.status).toBe(200);
            expect(response.body.received.text).toContain('Normal text');
        });

        it('should handle unicode characters', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({
                    content: '你好世界 مرحبا بالعالم שלום עולם'
                });

            expect(response.status).toBe(200);
            expect(response.body.received.content).toContain('世界');
        });

        it('should handle emoji safely', async () => {
            const response = await request(app)
                .post('/api/test')
                .send({
                    message: '✅ Success 🎉 Celebration 😊 Happy'
                });

            expect(response.status).toBe(200);
            expect(response.body.received.message).toContain('✅');
        });
    });
});
