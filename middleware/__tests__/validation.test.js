/**
 * Unit Tests for Validation Middleware (Zod Schemas)
 * Run with: npm test -- middleware/__tests__/validation.test.js
 */

const {
    loginSchema,
    registerSchema,
    createProblemSchema,
    createAptitudeSchema,
    aptitudeSubmitSchema,
    globalTestSubmitSchema
} = require('../../middleware/validation');

describe('Login Schema Validation', () => {
    it('should validate correct login input', () => {
        const input = {
            email: 'user@example.com',
            password: 'SecurePassword123!'
        };

        const result = loginSchema.safeParse(input);
        expect(result.success).toBe(true);
        expect(result.data.email).toBe(input.email);
    });

    it('should reject invalid email format', () => {
        const input = {
            email: 'not-an-email',
            password: 'SecurePassword123!'
        };

        const result = loginSchema.safeParse(input);
        expect(result.success).toBe(false);
        expect(result.error.issues[0].path[0]).toBe('email');
    });

    it('should reject missing password', () => {
        const input = {
            email: 'user@example.com'
        };

        const result = loginSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
        const input = {
            email: 'user@example.com',
            password: ''
        };

        const result = loginSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should trim whitespace from email', () => {
        const input = {
            email: '  user@example.com  ',
            password: 'SecurePassword123!'
        };

        const result = loginSchema.safeParse(input);
        expect(result.success).toBe(true);
        expect(result.data.email).toBe('user@example.com');
    });
});

describe('Register Schema Validation', () => {
    it('should validate complete registration input', () => {
        const input = {
            name: 'John Doe',
            email: 'john@example.com',
            password: 'SecurePass123!',
            confirmPassword: 'SecurePass123!',
            role: 'student'
        };

        const result = registerSchema.safeParse(input);
        expect(result.success).toBe(true);
    });

    it('should reject mismatched passwords', () => {
        const input = {
            name: 'John Doe',
            email: 'john@example.com',
            password: 'SecurePass123!',
            confirmPassword: 'DifferentPass456!',
            role: 'student'
        };

        const result = registerSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject weak passwords', () => {
        const inputs = [
            { password: '123', confirmPassword: '123' },  // Too short
            { password: 'password', confirmPassword: 'password' },  // No special char
            { password: 'ALLUPPER123!', confirmPassword: 'ALLUPPER123!' }  // No lowercase
        ];

        inputs.forEach(input => {
            const fullInput = {
                name: 'John Doe',
                email: 'john@example.com',
                role: 'student',
                ...input
            };

            const result = registerSchema.safeParse(fullInput);
            // Should fail password requirements
            expect(result.success).toBe(false);
        });
    });

    it('should reject invalid roles', () => {
        const input = {
            name: 'John Doe',
            email: 'john@example.com',
            password: 'SecurePass123!',
            confirmPassword: 'SecurePass123!',
            role: 'superuser'  // Invalid role
        };

        const result = registerSchema.safeParse(input);
        expect(result.success).toBe(false);
    });
});

describe('Create Problem Schema Validation', () => {
    it('should validate complete problem creation', () => {
        const input = {
            title: 'Binary Search Implementation',
            description: 'Implement a binary search algorithm',
            difficulty: 'Medium',
            language: 'Python',
            mentorId: 'mentor123',
            maxAttempts: 3,
            timeLimit: 60
        };

        const result = createProblemSchema.safeParse(input);
        expect(result.success).toBe(true);
        expect(result.data.maxAttempts).toBe(3);
    });

    it('should coerce string numbers to integers', () => {
        const input = {
            title: 'Problem Title',
            description: 'Description',
            difficulty: 'Easy',
            language: 'Python',
            mentorId: 'mentor123',
            maxAttempts: '5',
            timeLimit: '120'
        };

        const result = createProblemSchema.safeParse(input);
        expect(result.success).toBe(true);
        expect(typeof result.data.maxAttempts).toBe('number');
        expect(result.data.maxAttempts).toBe(5);
    });

    it('should reject invalid difficulty levels', () => {
        const input = {
            title: 'Problem',
            description: 'Desc',
            difficulty: 'VeryHard',  // Invalid
            language: 'Python',
            mentorId: 'mentor123'
        };

        const result = createProblemSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject negative max attempts', () => {
        const input = {
            title: 'Problem',
            description: 'Desc',
            difficulty: 'Hard',
            language: 'Python',
            mentorId: 'mentor123',
            maxAttempts: -1
        };

        const result = createProblemSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should accept valid languages', () => {
        const validLanguages = ['Python', 'JavaScript', 'Java', 'C++', 'C#', 'Ruby', 'PHP', 'Go', 'Rust', 'Swift'];

        validLanguages.forEach(lang => {
            const input = {
                title: 'Problem',
                description: 'Desc',
                difficulty: 'Easy',
                language: lang,
                mentorId: 'mentor123'
            };

            const result = createProblemSchema.safeParse(input);
            expect(result.success).toBe(true);
        });
    });
});

describe('Aptitude Test Schema Validation', () => {
    it('should validate aptitude submission', () => {
        const input = {
            testId: 'test123',
            studentId: 'student456',
            answers: [
                { questionId: 'q1', selectedAnswer: 'A', timeSpent: 30 },
                { questionId: 'q2', selectedAnswer: 'B', timeSpent: 45 }
            ],
            totalTime: 75
        };

        const result = aptitudeSubmitSchema.safeParse(input);
        expect(result.success).toBe(true);
    });

    it('should coerce timeSpent to numbers', () => {
        const input = {
            testId: 'test123',
            studentId: 'student456',
            answers: [
                { questionId: 'q1', selectedAnswer: 'A', timeSpent: '30' }
            ],
            totalTime: '75'
        };

        const result = aptitudeSubmitSchema.safeParse(input);
        expect(result.success).toBe(true);
        expect(typeof result.data.answers[0].timeSpent).toBe('number');
    });

    it('should reject empty answers array', () => {
        const input = {
            testId: 'test123',
            studentId: 'student456',
            answers: [],
            totalTime: 0
        };

        const result = aptitudeSubmitSchema.safeParse(input);
        expect(result.success).toBe(false);
    });

    it('should reject negative time values', () => {
        const input = {
            testId: 'test123',
            studentId: 'student456',
            answers: [
                { questionId: 'q1', selectedAnswer: 'A', timeSpent: -10 }
            ],
            totalTime: 20
        };

        const result = aptitudeSubmitSchema.safeParse(input);
        expect(result.success).toBe(false);
    });
});

describe('Global Test Submit Schema Validation', () => {
    it('should validate global test submission', () => {
        const input = {
            testId: 'global123',
            studentId: 'student789',
            submissions: [
                { 
                    problemId: 'prob1', 
                    code: 'def solution(): pass',
                    language: 'Python',
                    passed: true
                }
            ],
            score: 85
        };

        const result = globalTestSubmitSchema.safeParse(input);
        expect(result.success).toBe(true);
    });

    it('should coerce score to number', () => {
        const input = {
            testId: 'global123',
            studentId: 'student789',
            submissions: [
                { 
                    problemId: 'prob1', 
                    code: 'code here',
                    language: 'Python',
                    passed: true
                }
            ],
            score: '92'
        };

        const result = globalTestSubmitSchema.safeParse(input);
        expect(result.success).toBe(true);
        expect(typeof result.data.score).toBe('number');
    });

    it('should validate score range 0-100', () => {
        const invalidScores = [-10, 101, 200];

        invalidScores.forEach(score => {
            const input = {
                testId: 'global123',
                studentId: 'student789',
                submissions: [
                    { 
                        problemId: 'prob1', 
                        code: 'code',
                        language: 'Python',
                        passed: true
                    }
                ],
                score
            };

            const result = globalTestSubmitSchema.safeParse(input);
            expect(result.success).toBe(false);
        });
    });
});

describe('Error Messages', () => {
    it('should provide clear error messages for invalid input', () => {
        const input = {
            email: 'invalid-email',
            password: ''
        };

        const result = loginSchema.safeParse(input);
        
        expect(result.success).toBe(false);
        expect(result.error.issues.length).toBeGreaterThan(0);
        expect(typeof result.error.issues[0].message).toBe('string');
    });

    it('should show all validation errors', () => {
        const input = {
            email: 'not-email',
            password: ''
        };

        const result = loginSchema.safeParse(input);
        
        expect(result.success).toBe(false);
        // Should have multiple issues
        const emailError = result.error.issues.find(i => i.path[0] === 'email');
        const passwordError = result.error.issues.find(i => i.path[0] === 'password');
        
        expect(emailError).toBeDefined();
        expect(passwordError).toBeDefined();
    });
});
