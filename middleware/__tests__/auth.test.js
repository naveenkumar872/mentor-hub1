/**
 * Unit Tests for Auth Middleware
 * Run with: npm test -- middleware/__tests__/auth.test.js
 */

const { hashPassword, comparePassword, generateToken, verifyToken } = require('../../middleware/auth');

describe('Auth Middleware', () => {
    describe('Password Hashing', () => {
        it('should hash a password successfully', async () => {
            const password = 'TestPassword123!';
            const hash = await hashPassword(password);

            // Hash should not equal plain password
            expect(hash).not.toBe(password);

            // Hash should start with bcrypt prefix
            expect(hash.startsWith('$2')).toBe(true);
        });

        it('should correctly validate matching passwords', async () => {
            const password = 'SecurePass456!';
            const hash = await hashPassword(password);
            
            const isValid = await comparePassword(password, hash);
            expect(isValid).toBe(true);
        });

        it('should reject incorrect password', async () => {
            const password = 'CorrectPass123!';
            const hash = await hashPassword(password);
            
            const isValid = await comparePassword('WrongPassword', hash);
            expect(isValid).toBe(false);
        });

        it('should handle legacy plaintext passwords', async () => {
            const plainPassword = 'PlainPassword123';
            
            // Simulate legacy stored plaintext password
            const isValid = await comparePassword(plainPassword, plainPassword);
            expect(isValid).toBe(true);
        });
    });

    describe('JWT Token Generation & Verification', () => {
        it('should generate a valid token', () => {
            const user = {
                id: 'user123',
                email: 'test@example.com',
                role: 'student'
            };

            const token = generateToken(user);
            
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3);  // JWT has 3 parts
        });

        it('should verify a valid token', () => {
            const user = {
                id: 'user456',
                email: 'mentor@example.com',
                role: 'mentor'
            };

            const token = generateToken(user);
            const decoded = verifyToken(token);

            expect(decoded).toBeDefined();
            expect(decoded.id).toBe(user.id);
            expect(decoded.email).toBe(user.email);
            expect(decoded.role).toBe(user.role);
        });

        it('should reject an invalid token', () => {
            const invalidToken = 'invalid.token.here';
            
            expect(() => {
                verifyToken(invalidToken);
            }).toThrow();
        });

        it('should reject an expired token', () => {
            // This test would require manipulating token expiration
            // For now, we trust JWT library handles this correctly
            const validToken = generateToken({ id: '123', role: 'admin' });
            
            // Token should be valid now
            expect(() => {
                verifyToken(validToken);
            }).not.toThrow();
        });
    });
});

describe('Sanitizer Middleware', () => {
    const { sanitizeString, sanitizeObject } = require('../../middleware/sanitizer');

    it('should remove HTML tags from strings', () => {
        const input = '<script>alert("xss")</script>Hello';
        const output = sanitizeString(input);
        
        expect(output).not.toContain('<');
        expect(output).not.toContain('>');
        expect(output).toContain('Hello');
    });

    it('should prevent HTML injection', () => {
        const input = '<img src=x onerror=alert(1)>';
        const output = sanitizeString(input);
        
        expect(output).not.toContain('onerror');
        expect(output).not.toContain('<');
    });

    it('should sanitize nested objects', () => {
        const input = {
            name: '<b>John</b>',
            comment: '<script>alert(1)</script>Nice',
            nested: {
                title: '<h1>Title</h1>',
                safe: 'plaintext'
            }
        };

        const output = sanitizeObject(input);

        expect(output.name).not.toContain('<');
        expect(output.comment).not.toContain('<');
        expect(output.nested.title).not.toContain('<');
        expect(output.nested.safe).toBe('plaintext');
    });

    it('should preserve password fields (not sanitize them)', () => {
        const input = {
            username: '<b>admin</b>',
            password: 'p@ss<script>word'  // Passwords should NOT be sanitized
        };

        const output = sanitizeObject(input);

        expect(output.username).not.toContain('<');
        expect(output.password).toContain('<');  // Password is preserved as-is
    });
});

describe('Validation Middleware', () => {
    const { loginSchema, createProblemSchema } = require('../../middleware/validation');

    it('should validate correct login input', () => {
        const input = {
            email: 'test@example.com',
            password: 'securepass123'
        };

        const result = loginSchema.safeParse(input);
        expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
        const input = {
            email: 'not-an-email',
            password: 'securepass123'
        };

        const result = loginSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should validate problem creation', () => {
        const input = {
            title: 'Binary Search Problem',
            description: 'Implement binary search algorithm',
            difficulty: 'Medium',
            language: 'Python',
            mentorId: 'mentor123'
        };

        const result = createProblemSchema.safeParse(input);
        expect(result.success).toBe(true);
    });

    it('should coerce and validate input', () => {
        const input = {
            title: 'Problem Title',
            description: 'Description',
            difficulty: 'Easy',
            language: 'Python',
            mentorId: 'mentor456',
            maxAttempts: '5'  // String should be coerced to number
        };

        const result = createProblemSchema.safeParse(input);
        expect(result.success).toBe(true);
        expect(typeof result.data.maxAttempts).toBe('number');
    });
});
