/**
 * REFACTORING GUIDE: Monolithic Server.js → Modular Structure
 * 
 * Current: 8700+ lines in one file
 * Proposed: Split into route files + controllers
 * 
 * Directory Structure:
 * 
 * routes/
 * ├── auth.js           (Login, register, password reset)
 * ├── problems.js       (CRUD problems)
 * ├── submissions.js    (Code/task submissions)
 * ├── tasks.js          (CRUD tasks)
 * ├── tests.js          (Aptitude & Global tests)
 * ├── messages.js       (Messaging system)
 * ├── plagiarism.js     (Plagiarism detection)
 * ├── analytics.js      (Analytics endpoints)
 * ├── admin.js          (Admin operations)
 * └── proctoring.js     (Proctoring settings)
 * 
 * controllers/
 * ├── authController.js
 * ├── problemController.js
 * ├── submissionController.js
 * ├── ... etc
 * 
 * services/
 * ├── authService.js    (JWT, password hashing)
 * ├── aiService.js      (AI integration)
 * ├── plagiarismService.js
 * ├── analyticsService.js
 * └── ... (existing services)
 * 
 * ==================== EXAMPLE: Auth Routes ====================
 */

const express = require('express');
const { z } = require('zod');
const logger = require('../utils/logger');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, hashPassword, comparePassword, generateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

function authRoutes(app, pool) {
    const router = express.Router();

    /**
     * POST /auth/login
     * Public endpoint - login user
     */
    router.post('/auth/login', authLimiter, async (req, res) => {
        try {
            const { email, password } = req.body;

            // Validate input
            const schema = z.object({
                email: z.string().email(),
                password: z.string().min(1)
            });
            const validated = schema.safeParse({ email, password });
            if (!validated.success) {
                return res.status(400).json({ error: 'Invalid input' });
            }

            // Find user
            const [users] = await pool.query(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (users.length === 0) {
                logger.warn('Login attempt with non-existent email', { email });
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const user = users[0];

            // Verify password
            const isValid = await comparePassword(password, user.password);
            if (!isValid) {
                logger.warn('Login attempt with incorrect password', { email });
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            // Generate token
            const token = generateToken({
                id: user.id,
                email: user.email,
                role: user.role
            });

            logger.info('User logged in successfully', { userId: user.id, email });

            res.json({
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });

        } catch (error) {
            logger.error('Login error', { error: error.message });
            res.status(500).json({ error: 'Login failed' });
        }
    });

    /**
     * POST /auth/logout
     * Protected endpoint - logout user
     */
    router.post('/auth/logout', authenticate, (req, res) => {
        // In this implementation, logout is handled client-side (remove token)
        // But we could track logout events for security
        logger.info('User logged out', { userId: req.user.id });
        res.json({ message: 'Logged out successfully' });
    });

    /**
     * POST /auth/refresh-token
     * Protected endpoint - refresh JWT token
     */
    router.post('/auth/refresh-token', authenticate, (req, res) => {
        try {
            const { generateToken } = require('../middleware/auth');
            
            const newToken = generateToken({
                id: req.user.id,
                email: req.user.email,
                role: req.user.role
            });

            res.json({ token: newToken });
        } catch (error) {
            logger.error('Token refresh error', { error: error.message });
            res.status(500).json({ error: 'Token refresh failed' });
        }
    });

    return router;
}

/**
 * ==================== HOW TO USE ====================
 * 
 * In server.js:
 * 
 * const authRoutes = require('./routes/auth');
 * app.use('/api', authRoutes(app, pool));
 * 
 * Benefits of modularization:
 * 1. Smaller files (200-400 lines vs 8700)
 * 2. Easier to test (can unit test individual routes)
 * 3. Better maintainability
 * 4. Reusable middleware and controllers
 * 5. Clear separation of concerns
 * 6. Easier to onboard new developers
 * 
 * Next steps:
 * 1. Extract auth routes (20 routes → 500 lines)
 * 2. Extract problems routes (15 routes → 400 lines)
 * 3. Extract submissions routes (20 routes → 600 lines)
 * 4. Extract admin routes (30 routes → 500 lines)
 * 5. Extract tests routes (20 routes → 400 lines)
 * 6. Extract other routes
 * 7. Create controllers directory
 * 8. Add comprehensive error handling
 * 9. Add request/response logging
 */

module.exports = authRoutes;
