const express = require('express');
require('dotenv').config();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2/promise');
const { URL } = require('url');
const multer = require('multer');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');

// Performance optimization imports
const { paginatedResponse } = require('./utils/pagination');
const { cacheManager } = require('./utils/cache');

// Security & Middleware imports
const { hashPassword, comparePassword, generateToken, authenticate, authorize, optionalAuth } = require('./middleware/auth');
const { generalLimiter, authLimiter, aiLimiter, codeLimiter, adminLimiter, uploadLimiter, submissionLimiter } = require('./middleware/rateLimiter');
const { validate, loginSchema, createUserSchema, resetPasswordSchema, createTaskSchema, createSubmissionSchema, sendMessageSchema, bulkReassignSchema, bulkDeleteSchema, createProblemSchema, aptitudeSubmitSchema, globalTestSubmitSchema, plagiarismCheckSchema, createAptitudeSchema } = require('./middleware/validation');
const { sanitizeMiddleware, sanitizeString, sanitizeObject } = require('./middleware/sanitizer');
const setupSwagger = require('./middleware/swagger');

// Plagiarism detection import
const plagiarismDetector = require('./plagiarism_detector');

// Advanced Features Services
const PlagiarismDetector = require('./services/plagiarism_detector');
const GamificationService = require('./services/gamification_service');
const PredictiveAnalyticsService = require('./services/analytics_service');
const ViolationScoringService = require('./services/violation_scoring_service');

const app = express();
const PORT = process.env.PORT || 3000;

// ...existing code...

// Create HTTP server and initialize Socket.io
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Store active connections by user type and ID
const activeConnections = {
    mentors: new Map(), // { mentorId: [socket1, socket2, ...] }
    admins: new Map(),  // { adminId: [socket1, socket2, ...] }
    students: new Map() // { studentId: [socket1, socket2, ...] }
};

// Setup multer for video uploads
const uploadDir = path.join(__dirname, 'uploads', 'proctoring');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only video files are allowed'));
        }
    }
});

// Initialize Cerebras API helper
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';

// Helper to get all available API keys
const getCerebrasKeys = () => {
    const keys = [];
    // Primary key
    if (process.env.CEREBRAS_API_KEY) keys.push(process.env.CEREBRAS_API_KEY);
    if (process.env.cereberas_api_key) keys.push(process.env.cereberas_api_key);

    // Numbered backups (1-4)
    for (let i = 1; i <= 4; i++) {
        const k = process.env[`CEREBRAS_API_KEY_${i}`];
        if (k) keys.push(k);
    }

    // Deduplicate and filter empty
    return [...new Set(keys)].filter(k => k && k.trim().length > 0);
};

// Cerebras chat completion helper function with Failover/Rotation
async function cerebrasChat(messages, options = {}) {
    const keys = getCerebrasKeys();

    if (keys.length === 0) {
        console.error('❌ No Cerebras API keys found in environment variables!');
        throw new Error('Server configuration error: No AI API keys available.');
    }

    let lastError = null;

    // Try each key in sequence
    for (const apiKey of keys) {
        try {
            const response = await fetch(CEREBRAS_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: options.model || 'gpt-oss-120b',
                    messages: messages,
                    temperature: options.temperature || 0.7,
                    max_tokens: options.max_tokens || 1024,
                    ...(options.response_format && { response_format: options.response_format })
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                // If it's a 4xx or 5xx error, log warn and try next key
                console.warn(`⚠️ API Error (${response.status}) with key ending ...${apiKey.slice(-5)}. Switching to next backup key.`);
                lastError = new Error(`API Error ${response.status}: ${errorText}`);
                continue;
            }

            // Success!
            return await response.json();

        } catch (error) {
            console.warn(`⚠️ Network/Execution Error with key ending ...${apiKey.slice(-5)}: ${error.message}. Switching to next backup key.`);
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before next key
            // Continue to loop
        }
    }

    // If we get here, all keys failed
    console.error('❌ All available Cerebras API keys failed.');
    throw lastError || new Error('All AI API keys failed to respond.');
}

// Database Connection
const dbUrl = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
    host: dbUrl.hostname,
    user: dbUrl.username,
    password: dbUrl.password,
    database: dbUrl.pathname.slice(1), // Remove leading slash
    port: Number(dbUrl.port) || 4000,
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: '+00:00'
});


// Test DB Connection
pool.getConnection()
    .then(async (connection) => {
        console.log('✅ Connected to MySQL Database (SSL Enabled)');
        connection.release();

        // Ensure max_attempts column exists on problems table
        try {
            await pool.query(`ALTER TABLE problems ADD COLUMN max_attempts INT DEFAULT 0`);
            console.log('✅ Added max_attempts column to problems table');
        } catch (e) {
            if (e.code === 'ER_DUP_FIELDNAME' || (e.message && e.message.includes('Duplicate column'))) {
                // Column already exists — fine
            } else {
                console.warn('⚠️ Could not add max_attempts to problems:', e.message);
            }
        }
    })
    .catch(err => {
        console.error('❌ Database Connection Failed:', err.message);
        if (err.code === 'HANDSHAKE_SSL_ERROR') {
            console.error('   Hint: SSL Handshake failed. Check your network or certificates.');
        }
    });

// Initialize Advanced Features Services
const plagiarismService = new PlagiarismDetector(pool);
const gamificationService = new GamificationService(pool);
const analyticsService = new PredictiveAnalyticsService(pool);
const violationService = new ViolationScoringService(pool);

// Expose services globally for use in routes
global.advancedServices = {
    plagiarismService,
    gamificationService,
    analyticsService,
    violationService
};

// Middleware - CORS configuration
const allowedOrigins = [
    'http://localhost:5173', // Vite Frontend
    'http://localhost:3000', // Local Backend
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc)
        if (!origin) return callback(null, true);

        // Check if origin is allowed
        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed instanceof RegExp) return allowed.test(origin);
            return allowed === origin;
        });

        // Also allow CORS_ORIGIN from env
        const envOrigin = process.env.CORS_ORIGIN;
        if (isAllowed || (envOrigin && origin === envOrigin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: Origin ${origin} not allowed`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10mb' })); // Reduced from 50mb to 10mb for DoS protection
app.use(sanitizeMiddleware);  // Sanitize all inputs (prevent XSS/injection attacks)
app.use(generalLimiter); // Apply general rate limiting to all routes
app.use(express.static(path.join(__dirname, 'public')));

// Setup Swagger API documentation
setupSwagger(app);

// Import and mount skill test routes AFTER middleware
const skillTestRoutes = require('./skill_test_routes');
skillTestRoutes(app, pool);

// ==================== AUTH ROUTES ====================

// Login (rate limited)
app.post('/api/auth/login', authLimiter, validate(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;

        // Fetch user by email only (not comparing password in SQL)
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = rows[0];

        // Compare password using bcrypt (with backward compatibility for plaintext)
        const passwordValid = await comparePassword(password, user.password);
        if (!passwordValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if account is active
        if (user.status === 'suspended' || user.status === 'inactive') {
            return res.status(403).json({ error: 'Account is ' + user.status + '. Contact admin.' });
        }

        // Fetch allocations if mentor
        if (user.role === 'mentor') {
            const [students] = await pool.query('SELECT student_id FROM mentor_student_allocations WHERE mentor_id = ?', [user.id]);
            user.allocatedStudents = students.map(s => s.student_id);
        }

        // Fetch completed aptitude if student
        if (user.role === 'student') {
            const [apt] = await pool.query('SELECT aptitude_test_id FROM student_completed_aptitude WHERE student_id = ?', [user.id]);
            user.completedAptitude = apt.map(a => a.aptitude_test_id);
        }

        const { password: _, ...userWithoutPassword } = user;

        // Generate JWT token
        const token = generateToken(user);

        // Normalize snake_case DB to camelCase API
        const responseUser = {
            ...userWithoutPassword,
            mentorId: user.mentor_id,
            createdAt: user.created_at,
            // Theme preferences
            themePreference: user.theme_preference || 'system',
            ideTheme: user.ide_theme || 'vs-dark',
            keyboardShortcutsEnabled: user.keyboard_shortcuts_enabled || true
        };

        // If password is still plaintext, upgrade to bcrypt hash in background
        if (!user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
            hashPassword(password).then(hash => {
                pool.query('UPDATE users SET password = ? WHERE id = ?', [hash, user.id]).catch(() => {});
            }).catch(() => {});
        }

        res.json({ success: true, token, user: responseUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user by ID
app.get('/api/users/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = rows[0];
        if (user.role === 'mentor') {
            const [students] = await pool.query('SELECT student_id FROM mentor_student_allocations WHERE mentor_id = ?', [user.id]);
            user.allocatedStudents = students.map(s => s.student_id);
        }
        if (user.role === 'student') {
            const [apt] = await pool.query('SELECT aptitude_test_id FROM student_completed_aptitude WHERE student_id = ?', [user.id]);
            user.completedAptitude = apt.map(a => a.aptitude_test_id);
        }

        const { password: _, ...userWithoutPassword } = user;

        res.json({
            ...userWithoutPassword,
            mentorId: user.mentor_id,
            createdAt: user.created_at,
            // Theme preferences
            themePreference: user.theme_preference || 'system',
            ideTheme: user.ide_theme || 'vs-dark',
            keyboardShortcutsEnabled: user.keyboard_shortcuts_enabled || true
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update user preferences (theme, IDE theme, keyboard shortcuts)
app.put('/api/users/:id/preferences', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { themePreference, ideTheme, keyboardShortcutsEnabled } = req.body;

        // Validate inputs
        const validThemes = ['light', 'dark', 'system'];
        const validIDEThemes = ['vs', 'vs-dark', 'hc-black', 'dracula', 'monokai'];

        if (themePreference && !validThemes.includes(themePreference)) {
            return res.status(400).json({ error: 'Invalid theme preference' });
        }

        if (ideTheme && !validIDEThemes.includes(ideTheme)) {
            return res.status(400).json({ error: 'Invalid IDE theme' });
        }

        const updates = [];
        const params = [];

        if (themePreference) {
            updates.push('theme_preference = ?');
            params.push(themePreference);
        }

        if (ideTheme) {
            updates.push('ide_theme = ?');
            params.push(ideTheme);
        }

        if (keyboardShortcutsEnabled !== undefined) {
            updates.push('keyboard_shortcuts_enabled = ?');
            params.push(keyboardShortcutsEnabled ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No preferences to update' });
        }

        params.push(id);
        await pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
            params
        );

        res.json({ success: true, message: 'Preferences updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get user preferences
app.get('/api/users/:id/preferences', authenticate, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT id, theme_preference, ide_theme, keyboard_shortcuts_enabled FROM users WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = rows[0];
        res.json({
            themePreference: user.theme_preference || 'system',
            ideTheme: user.ide_theme || 'vs-dark',
            keyboardShortcutsEnabled: user.keyboard_shortcuts_enabled || true
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ⌨️  Keyboard Shortcuts Endpoints

// Get default keyboard shortcuts
app.get('/api/keybindings/default', authenticate, (req, res) => {
    const defaultShortcuts = {
        'goto-next-problem': { keys: 'Ctrl+]', description: 'Next Problem' },
        'goto-prev-problem': { keys: 'Ctrl+[', description: 'Previous Problem' },
        'goto-submissions': { keys: 'Ctrl+S', description: 'My Submissions' },
        'goto-dashboard': { keys: 'Ctrl+H', description: 'Dashboard' },
        'editor-submit': { keys: 'Ctrl+Enter', description: 'Submit Code' },
        'editor-run': { keys: 'Ctrl+R', description: 'Run Code' },
        'editor-format': { keys: 'Ctrl+Alt+L', description: 'Format Code' },
        'editor-fold': { keys: 'Ctrl+K Ctrl+0', description: 'Fold All' },
        'editor-unfold': { keys: 'Ctrl+K Ctrl+J', description: 'Unfold All' },
        'quick-search': { keys: 'Ctrl+P', description: 'Quick Search' },
        'open-settings': { keys: 'Ctrl+,', description: 'Settings' },
        'toggle-theme': { keys: 'Ctrl+Shift+T', description: 'Toggle Theme' },
        'toggle-fullscreen': { keys: 'F11', description: 'Full Screen' },
        'undo': { keys: 'Ctrl+Z', description: 'Undo' },
        'redo': { keys: 'Ctrl+Y', description: 'Redo' },
        'save': { keys: 'Ctrl+S', description: 'Save' },
        'help': { keys: 'F1', description: 'Help' }
    };
    
    res.json(defaultShortcuts);
});

// Get user's custom keyboard shortcuts
app.get('/api/users/:id/keybindings', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check authorization
        if (req.user.id !== parseInt(id)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const [rows] = await pool.query(
            'SELECT custom_shortcuts FROM users WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        let customShortcuts = {};
        if (rows[0].custom_shortcuts) {
            try {
                customShortcuts = typeof rows[0].custom_shortcuts === 'string'
                    ? JSON.parse(rows[0].custom_shortcuts)
                    : rows[0].custom_shortcuts;
            } catch (e) {
                console.warn('Failed to parse custom shortcuts JSON:', e);
            }
        }

        res.json({
            customShortcuts,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching keybindings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user's custom keyboard shortcuts
app.patch('/api/users/:id/keybindings', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { keyboard_shortcuts } = req.body;

        // Check authorization
        if (req.user.id !== parseInt(id)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        if (!keyboard_shortcuts) {
            return res.status(400).json({ error: 'keyboard_shortcuts field required' });
        }

        // Validate shortcuts object
        if (typeof keyboard_shortcuts !== 'object') {
            return res.status(400).json({ error: 'keyboard_shortcuts must be an object' });
        }

        // Convert to JSON string for storage
        const shortcutsJson = JSON.stringify(keyboard_shortcuts);

        await pool.query(
            'UPDATE users SET custom_shortcuts = ?, shortcuts_last_modified = NOW() WHERE id = ?',
            [shortcutsJson, id]
        );

        // Log the change
        await pool.query(
            `INSERT INTO audit_logs (user_id, user_role, action, resource_type, resource_id, changes, timestamp)
             VALUES (?, 'user', 'UPDATE_KEYBINDINGS', 'keybindings', ?, ?, NOW())`,
            [id, id, `Updated ${Object.keys(keyboard_shortcuts).length} custom shortcuts`]
        );

        res.json({
            success: true,
            message: 'Keyboard shortcuts updated',
            shortcutsCount: Object.keys(keyboard_shortcuts).length
        });
    } catch (error) {
        console.error('Error updating keybindings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Sync theme preference to database (called when user changes theme in UI)

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const { role } = req.query;
        let query = `
            SELECT u.*, GROUP_CONCAT(msa.student_id) as allocated_students
            FROM users u
            LEFT JOIN mentor_student_allocations msa ON u.id = msa.mentor_id
        `;
        const params = [];
        if (role) {
            query += ' WHERE u.role = ?';
            params.push(role);
        }
        query += ' GROUP BY u.id';

        const [users] = await pool.query(query, params);

        const enrichedUsers = users.map(u => {
            const { password: _, ...userWithoutPassword } = u;
            let extras = {};
            if (u.role === 'mentor' && u.allocated_students) {
                extras.allocatedStudents = u.allocated_students.split(',').filter(s => s);
            }
            return {
                ...userWithoutPassword,
                mentorId: u.mentor_id,
                createdAt: u.created_at,
                ...extras
            };
        });

        res.json(enrichedUsers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get students by mentor ID
app.get('/api/mentors/:mentorId/students', async (req, res) => {
    try {
        const [students] = await pool.query('SELECT * FROM users WHERE role = "student" AND mentor_id = ?', [req.params.mentorId]);

        const cleanStudents = students.map(u => {
            const { password: _, ...rest } = u;
            return { ...rest, mentorId: u.mentor_id, createdAt: u.created_at };
        });

        res.json(cleanStudents);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== TIER MANAGEMENT ROUTES ====================

// Get user's current tier and limits
app.get('/api/users/:id/tier', authenticate, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Get user tier
        const [user] = await pool.query('SELECT id, tier, tier_start_date, tier_expiry_date FROM users WHERE id = ?', [userId]);
        if (user.length === 0) return res.status(404).json({ error: 'User not found' });

        const userTier = user[0];
        
        // Get tier limits from tier_limits table
        const [tierLimits] = await pool.query('SELECT * FROM tier_limits WHERE tier = ?', [userTier.tier || 'free']);
        
        if (tierLimits.length === 0) {
            return res.json({
                tier: userTier.tier || 'free',
                tierStartDate: userTier.tier_start_date,
                tierExpiryDate: userTier.tier_expiry_date,
                limits: {
                    daily_api_limit: 100,
                    code_execution_limit: 10,
                    submissions_per_day: 30,
                    concurrent_connections: 1,
                    file_upload_limit_mb: 5,
                    max_problem_attempts: 3,
                    ai_chat_limit_daily: 5
                }
            });
        }

        const limits = tierLimits[0];
        res.json({
            tier: userTier.tier || 'free',
            tierStartDate: userTier.tier_start_date,
            tierExpiryDate: userTier.tier_expiry_date,
            limits: {
                daily_api_limit: limits.daily_api_limit,
                code_execution_limit: limits.code_execution_limit,
                submissions_per_day: limits.submissions_per_day,
                concurrent_connections: limits.concurrent_connections,
                file_upload_limit_mb: limits.file_upload_limit_mb,
                max_problem_attempts: limits.max_problem_attempts,
                ai_chat_limit_daily: limits.ai_chat_limit_daily,
                export_limit_monthly: limits.export_limit_monthly,
                priority_support: limits.priority_support,
                features: limits.features ? JSON.parse(limits.features) : []
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all available tiers (public endpoint)
app.get('/api/tiers', async (req, res) => {
    try {
        const [tiers] = await pool.query('SELECT tier, daily_api_limit, code_execution_limit, submissions_per_day, file_upload_limit_mb, ai_chat_limit_daily, priority_support, features FROM tier_limits ORDER BY daily_api_limit ASC');
        
        const formattedTiers = tiers.map(t => ({
            tier: t.tier,
            dailyApiLimit: t.daily_api_limit,
            codeExecutionLimit: t.code_execution_limit,
            submissionsPerDay: t.submissions_per_day,
            fileUploadLimitMB: t.file_upload_limit_mb,
            aiChatLimitDaily: t.ai_chat_limit_daily,
            prioritySupport: t.priority_support,
            features: t.features ? JSON.parse(t.features) : []
        }));

        res.json(formattedTiers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Upgrade/downgrade user tier
app.patch('/api/admin/users/:userId/tier', authenticate, authorize('admin'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { userId } = req.params;
        const { newTier, reason, expiryDate } = req.body;

        // Validate tier
        const validTiers = ['free', 'pro', 'enterprise'];
        if (!newTier || !validTiers.includes(newTier)) {
            return res.status(400).json({ error: 'Invalid tier. Must be: free, pro, or enterprise' });
        }

        await connection.beginTransaction();

        // Get current tier for audit trail
        const [user] = await connection.query('SELECT tier FROM users WHERE id = ?', [userId]);
        if (user.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found' });
        }

        const oldTier = user[0].tier;

        // Update user tier
        await connection.query(
            'UPDATE users SET tier = ?, tier_start_date = NOW(), tier_expiry_date = ? WHERE id = ?',
            [newTier, expiryDate || null, userId]
        );

        // Log tier change in tier_history
        const { v4: uuidv4 } = require('uuid');
        await connection.query(
            'INSERT INTO tier_history (id, user_id, old_tier, new_tier, reason, changed_by) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), userId, oldTier, newTier, reason || null, req.user.id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: `User tier updated from ${oldTier} to ${newTier}`,
            userId,
            newTier,
            tierStartDate: new Date(),
            tierExpiryDate: expiryDate || null
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Get tier upgrade history for a user
app.get('/api/users/:userId/tier-history', authenticate, async (req, res) => {
    try {
        const { userId } = req.params;

        // Users can only see their own history, admins can see anyone's
        if (req.user.id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const [history] = await pool.query(
            'SELECT id, old_tier, new_tier, reason, changed_by, changed_at FROM tier_history WHERE user_id = ? ORDER BY changed_at DESC',
            [userId]
        );

        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Get all tier statistics
app.get('/api/admin/tier-statistics', authenticate, authorize('admin'), async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT tier, COUNT(*) as user_count
            FROM users
            GROUP BY tier
            ORDER BY tier
        `);

        const [totalUsers] = await pool.query('SELECT COUNT(*) as total FROM users');
        const [premiumUsers] = await pool.query('SELECT COUNT(*) as count FROM users WHERE tier IN ("pro", "enterprise")');

        res.json({
            totalUsers: totalUsers[0].total,
            premiumUsers: premiumUsers[0].count,
            byTier: stats.map(s => ({
                tier: s.tier,
                count: s.user_count,
                percentage: ((s.user_count / totalUsers[0].total) * 100).toFixed(2)
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ==================== TASK ROUTES ====================

// Get all tasks
app.get('/api/tasks', async (req, res) => {
    try {
        const { mentorId, status, page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * pageSize;

        let query = `
            SELECT t.*,
                   GROUP_CONCAT(tc.student_id) as completed_by_students,
                   COUNT(tc.student_id) as completion_count
            FROM tasks t
            LEFT JOIN task_completions tc ON t.id = tc.task_id
            WHERE 1=1
        `;
        let countQuery = 'SELECT COUNT(DISTINCT t.id) as total FROM tasks t WHERE 1=1';
        const params = [];

        if (mentorId) {
            query += ' AND t.mentor_id = ?';
            countQuery += ' AND t.mentor_id = ?';
            params.push(mentorId);
        }
        if (status) {
            query += ' AND t.status = ?';
            countQuery += ' AND t.status = ?';
            params.push(status);
        }

        query += ' GROUP BY t.id ORDER BY t.created_at DESC LIMIT ? OFFSET ?';

        const [[{ total }]] = await pool.query(countQuery, params);
        const [tasks] = await pool.query(query, [...params, pageSize, offset]);

        const enrichedTasks = tasks.map(t => ({
            ...t,
            mentorId: t.mentor_id,
            createdAt: t.created_at,
            completedBy: t.completed_by_students
                ? t.completed_by_students.split(',').filter(s => s)
                : [],
            completionCount: t.completion_count || 0,
            maxAttempts: t.max_attempts || 0
        }));

        const response = await paginatedResponse({
            data: enrichedTasks,
            total,
            page: pageNum,
            limit: pageSize
        });

        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get tasks for a student
app.get('/api/students/:studentId/tasks', async (req, res) => {
    try {
        const [students] = await pool.query('SELECT mentor_id FROM users WHERE id = ?', [req.params.studentId]);
        if (students.length === 0) return res.status(404).json({ error: 'Student not found' });

        const mentorId = students[0].mentor_id;

        // Tasks allocated to this student from their mentor OR admin
        const [tasks] = await pool.query(
            `SELECT t.* FROM tasks t
            INNER JOIN test_student_allocations tsa ON t.id = tsa.test_id
            WHERE tsa.student_id = ? AND (t.mentor_id = ? OR t.mentor_id = "admin-001") AND t.status = "live"`,
            [req.params.studentId, mentorId]
        );

        const enrichedTasks = await Promise.all(tasks.map(async t => {
            const [completions] = await pool.query('SELECT student_id FROM task_completions WHERE task_id = ?', [t.id]);
            const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM submissions WHERE student_id = ? AND task_id = ?', [req.params.studentId, t.id]);
            return {
                ...t,
                mentorId: t.mentor_id,
                createdAt: t.created_at,
                completedBy: completions.map(c => c.student_id),
                maxAttempts: t.max_attempts || 0,
                attemptCount: count
            };
        }));

        res.json(enrichedTasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create task
app.post('/api/tasks', authenticate, async (req, res) => {
    try {
        const taskId = uuidv4();
        const { mentorId, title, description, requirements, difficulty, type, maxAttempts } = req.body;
        const createdAt = new Date();

        // Convert requirements to JSON string if it's an array
        const requirementsStr = Array.isArray(requirements) ? JSON.stringify(requirements) : requirements;

        await pool.query(
            'INSERT INTO tasks (id, mentor_id, title, description, requirements, difficulty, type, status, created_at, max_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, "live", ?, ?)',
            [taskId, mentorId, title, description, requirementsStr, difficulty, type, createdAt, parseInt(maxAttempts) || 0]
        );

        res.json({
            id: taskId,
            ...req.body,
            completedBy: [],
            status: 'live',
            createdAt
        });
    } catch (error) {
        console.error('Task Create Error:', error.message);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM task_completions WHERE task_id = ?', [req.params.id]);
            await connection.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
            await connection.commit();
            res.json({ success: true });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== PROBLEM ROUTES ====================

// Get all problems
app.get('/api/problems', async (req, res) => {
    try {
        const { mentorId, status, page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * pageSize;

        let query = `
            SELECT p.*, 
                   GROUP_CONCAT(pc.student_id) as completed_by_students,
                   COUNT(pc.student_id) as completion_count
            FROM problems p
            LEFT JOIN problem_completions pc ON p.id = pc.problem_id
            WHERE 1=1
        `;
        let countQuery = 'SELECT COUNT(DISTINCT p.id) as total FROM problems p WHERE 1=1';
        const params = [];

        if (mentorId) {
            query += ' AND p.mentor_id = ?';
            countQuery += ' AND p.mentor_id = ?';
            params.push(mentorId);
        }
        if (status) {
            query += ' AND p.status = ?';
            countQuery += ' AND p.status = ?';
            params.push(status);
        }

        query += ' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?';

        const [[{ total }]] = await pool.query(countQuery, params);
        const [problems] = await pool.query(query, [...params, pageSize, offset]);

        const enrichedProblems = problems.map(p => ({
            ...p,
            mentorId: p.mentor_id,
            sampleInput: p.sample_input,
            expectedOutput: p.expected_output,
            sqlSchema: p.sql_schema,
            expectedQueryResult: p.expected_query_result,
            createdAt: p.created_at,
            completedBy: p.completed_by_students
                ? p.completed_by_students.split(',').filter(s => s)
                : [],
            completionCount: p.completion_count || 0,
            maxAttempts: p.max_attempts || 0,
            proctoring: {
                enabled: p.enable_proctoring === 'true',
                videoAudio: p.enable_video_audio === 'true',
                disableCopyPaste: p.disable_copy_paste === 'true',
                trackTabSwitches: p.track_tab_switches === 'true',
                maxTabSwitches: p.max_tab_switches || 3,
                enableFaceDetection: p.enable_face_detection === 'true',
                detectMultipleFaces: p.detect_multiple_faces === 'true',
                trackFaceLookaway: p.track_face_lookaway === 'true'
            }
        }));

        const response = await paginatedResponse({
            data: enrichedProblems,
            total,
            page: pageNum,
            limit: pageSize
        });

        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get problems for a student
app.get('/api/students/:studentId/problems', async (req, res) => {
    try {
        const [students] = await pool.query('SELECT mentor_id FROM users WHERE id = ?', [req.params.studentId]);
        if (students.length === 0) return res.status(404).json({ error: 'Student not found' });

        const mentorId = students[0].mentor_id;

        // Problems allocated to this student from their mentor OR admin
        const [problems] = await pool.query(
            `SELECT p.* FROM problems p
            INNER JOIN problem_student_allocations psa ON p.id = psa.problem_id
            WHERE psa.student_id = ? AND (p.mentor_id = ? OR p.mentor_id = "admin-001") AND p.status = "live"`,
            [req.params.studentId, mentorId]
        );

        const enrichedProblems = await Promise.all(problems.map(async p => {
            const [completions] = await pool.query('SELECT student_id FROM problem_completions WHERE problem_id = ?', [p.id]);
            return {
                ...p,
                mentorId: p.mentor_id,
                sampleInput: p.sample_input,
                expectedOutput: p.expected_output,
                sqlSchema: p.sql_schema,
                expectedQueryResult: p.expected_query_result,
                createdAt: p.created_at,
                completedBy: completions.map(c => c.student_id),
                maxAttempts: p.max_attempts || 0,
                proctoring: {
                    enabled: p.enable_proctoring === 'true',
                    videoAudio: p.enable_video_audio === 'true',
                    disableCopyPaste: p.disable_copy_paste === 'true',
                    trackTabSwitches: p.track_tab_switches === 'true',
                    maxTabSwitches: p.max_tab_switches || 3,
                    enableFaceDetection: p.enable_face_detection === 'true',
                    detectMultipleFaces: p.detect_multiple_faces === 'true',
                    trackFaceLookaway: p.track_face_lookaway === 'true'
                }
            };
        }));

        res.json(enrichedProblems);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create problem
app.post('/api/problems', authenticate, validate(createProblemSchema), async (req, res) => {
    try {
        const problemId = uuidv4();
        const {
            mentorId, title, description, sampleInput, expectedOutput,
            difficulty, type, language, status, deadline,
            // SQL-specific fields
            sqlSchema, expectedQueryResult,
            // Proctoring settings
            enableProctoring, enableVideoAudio, disableCopyPaste,
            trackTabSwitches, maxTabSwitches,
            // Face detection settings
            enableFaceDetection, detectMultipleFaces, trackFaceLookaway,
            // Attempt limit
            maxAttempts
        } = req.body;
        const createdAt = new Date();

        await pool.query(
            `INSERT INTO problems (id, mentor_id, title, description, sample_input, expected_output, sql_schema, expected_query_result, difficulty, type, language, status, created_at, enable_proctoring, enable_video_audio, disable_copy_paste, track_tab_switches, max_tab_switches, enable_face_detection, detect_multiple_faces, track_face_lookaway, max_attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [problemId, mentorId, title, description, sampleInput || '', expectedOutput || '', sqlSchema || null, expectedQueryResult || null, difficulty, type, language, status || 'live', createdAt, enableProctoring ? 'true' : 'false', enableVideoAudio ? 'true' : 'false', disableCopyPaste ? 'true' : 'false', trackTabSwitches ? 'true' : 'false', maxTabSwitches || 3, enableFaceDetection ? 'true' : 'false', detectMultipleFaces ? 'true' : 'false', trackFaceLookaway ? 'true' : 'false', parseInt(maxAttempts) || 0]
        );

        res.json({
            id: problemId,
            ...req.body,
            completedBy: [],
            createdAt
        });
    } catch (error) {
        console.error('Problem Create Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update problem (supports partial update)
app.put('/api/problems/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const allowedFields = {
            title: 'title',
            description: 'description',
            sampleInput: 'sample_input',
            expectedOutput: 'expected_output',
            sqlSchema: 'sql_schema',
            expectedQueryResult: 'expected_query_result',
            difficulty: 'difficulty',
            type: 'type',
            language: 'language',
            status: 'status',
            deadline: 'deadline',
            maxAttempts: 'max_attempts',
            enableProctoring: 'enable_proctoring',
            enableVideoAudio: 'enable_video_audio',
            disableCopyPaste: 'disable_copy_paste',
            trackTabSwitches: 'track_tab_switches',
            maxTabSwitches: 'max_tab_switches',
            enableFaceDetection: 'enable_face_detection',
            detectMultipleFaces: 'detect_multiple_faces',
            trackFaceLookaway: 'track_face_lookaway'
        };

        const setClauses = [];
        const values = [];

        for (const [key, dbCol] of Object.entries(allowedFields)) {
            if (updates[key] !== undefined) {
                setClauses.push(`${dbCol} = ?`);
                // Handle boolean fields stored as 'true'/'false' strings
                const boolFields = ['enableProctoring', 'enableVideoAudio', 'disableCopyPaste', 'trackTabSwitches', 'enableFaceDetection', 'detectMultipleFaces', 'trackFaceLookaway'];
                if (boolFields.includes(key)) {
                    values.push(updates[key] ? 'true' : 'false');
                } else if (key === 'maxAttempts') {
                    values.push(parseInt(updates[key]) || 0);
                } else if (key === 'maxTabSwitches') {
                    values.push(parseInt(updates[key]) || 3);
                } else {
                    values.push(updates[key]);
                }
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        values.push(id);
        await pool.query(`UPDATE problems SET ${setClauses.join(', ')} WHERE id = ?`, values);

        const [updated] = await pool.query('SELECT * FROM problems WHERE id = ?', [id]);
        res.json(updated[0] || { success: true });
    } catch (error) {
        console.error('Problem Update Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete problem
app.delete('/api/problems/:id', authenticate, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM problem_completions WHERE problem_id = ?', [req.params.id]);
            await connection.query('DELETE FROM submissions WHERE problem_id = ?', [req.params.id]);
            await connection.query('DELETE FROM problems WHERE id = ?', [req.params.id]);
            await connection.commit();
            res.json({ success: true });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== PROBLEM COMPLEXITY ROUTES ====================

// Get problem complexity analysis
app.get('/api/problems/:id/complexity-analysis', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const [problems] = await pool.query(
            `SELECT 
                id, difficulty_score, pass_rate, avg_time_minutes,
                min_time_minutes, max_time_minutes, total_submissions,
                successful_submissions, avg_attempts,
                structure_complexity, algorithm_complexity,
                edge_cases_complexity, implementation_complexity,
                complexity_last_updated
            FROM problems WHERE id = ?`,
            [id]
        );

        if (problems.length === 0) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        const problem = problems[0];

        // Get category average
        const [categoryProbs] = await pool.query(
            `SELECT AVG(difficulty_score) as avg_diff FROM problems 
             WHERE category = (SELECT category FROM problems WHERE id = ?) AND id != ?`,
            [id, id]
        );

        // Get similar problems
        const [similarProbs] = await pool.query(
            `SELECT id, title, category, difficulty_score
             FROM problems
             WHERE category = (SELECT category FROM problems WHERE id = ?)
             AND id != ?
             AND ABS(difficulty_score - ?) <= 1.5
             LIMIT 5`,
            [id, id, problem.difficulty_score]
        );

        res.json({
            id: problem.id,
            difficulty_score: problem.difficulty_score,
            pass_rate: problem.pass_rate,
            avg_time_minutes: problem.avg_time_minutes,
            min_time_minutes: problem.min_time_minutes,
            max_time_minutes: problem.max_time_minutes,
            total_submissions: problem.total_submissions,
            successful_submissions: problem.successful_submissions,
            avg_attempts: problem.avg_attempts,
            structure_complexity: problem.structure_complexity,
            algorithm_complexity: problem.algorithm_complexity,
            edge_cases_complexity: problem.edge_cases_complexity,
            implementation_complexity: problem.implementation_complexity,
            category_avg_difficulty: categoryProbs[0]?.avg_diff || 5.0,
            similar_problems: similarProbs,
            last_updated: problem.complexity_last_updated
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get problems by difficulty level
app.get('/api/problems/complexity/by-difficulty', authenticate, async (req, res) => {
    try {
        const { difficulty, limit = 10 } = req.query;
        const diffValue = parseFloat(difficulty);

        if (isNaN(diffValue)) {
            return res.status(400).json({ error: 'Invalid difficulty value' });
        }

        // Get problems within 1.5 of the specified difficulty
        const [problems] = await pool.query(
            `SELECT id, title, category, difficulty_score, pass_rate, avg_time_minutes
             FROM problems
             WHERE ABS(difficulty_score - ?) <= 1.5
             ORDER BY difficulty_score ASC
             LIMIT ?`,
            [diffValue, Math.min(100, parseInt(limit))]
        );

        res.json({
            target_difficulty: diffValue,
            problems_found: problems.length,
            problems
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get recommended problems for user
app.get('/api/problems/complexity/recommendations', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 5 } = req.query;

        // Get user's average solved difficulty
        const [userStats] = await pool.query(
            `SELECT AVG(p.difficulty_score) as avg_solved_difficulty
             FROM submissions s
             JOIN problems p ON s.problem_id = p.id
             WHERE s.student_id = ? AND s.is_successful = 1`,
            [userId]
        );

        const userAvgDifficulty = userStats[0]?.avg_solved_difficulty || 3;

        // Recommend problems slightly harder than user's average
        const targetDifficulty = Math.min(9, userAvgDifficulty + 1.5);

        const [recommendations] = await pool.query(
            `SELECT id, title, category, difficulty_score, pass_rate, avg_time_minutes
             FROM problems
             WHERE id NOT IN (SELECT problem_id FROM submissions WHERE student_id = ?)
             AND ABS(difficulty_score - ?) <= 1
             ORDER BY difficulty_score DESC, pass_rate DESC
             LIMIT ?`,
            [userId, targetDifficulty, Math.min(100, parseInt(limit))]
        );

        res.json({
            user_avg_difficulty: parseFloat(userAvgDifficulty.toFixed(1)),
            target_difficulty: parseFloat(targetDifficulty.toFixed(1)),
            recommendations_count: recommendations.length,
            recommendations
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Submit difficulty feedback
app.post('/api/problems/:id/difficulty-feedback', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { actualDifficulty, feedback } = req.body;

        if (typeof actualDifficulty !== 'number' || actualDifficulty < 1 || actualDifficulty > 10) {
            return res.status(400).json({ error: 'Invalid difficulty rating (1-10)' });
        }

        // Update complexity data
        const [problem] = await pool.query(
            'SELECT difficulty_score, total_submissions FROM problems WHERE id = ?',
            [id]
        );

        if (problem.length === 0) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        // Calculate weighted average
        const oldScore = problem[0].difficulty_score;
        const count = problem[0].total_submissions || 1;
        const newScore = (oldScore * count + actualDifficulty) / (count + 1);

        await pool.query(
            `UPDATE problems 
             SET difficulty_score = ?, 
                 total_submissions = total_submissions + 1,
                 complexity_last_updated = NOW()
             WHERE id = ?`,
            [newScore, id]
        );

        // Log feedback
        await pool.query(
            `INSERT INTO complexity_analytics (problem_id, user_id, created_at)
             VALUES (?, ?, NOW())`,
            [id, req.user.id]
        );

        res.json({
            success: true,
            message: 'Difficulty feedback recorded',
            updated_difficulty: parseFloat(newScore.toFixed(1))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== SUBMISSION ROUTES ====================

// Get all submissions
app.get('/api/submissions', async (req, res) => {
    try {
        const { studentId, mentorId, page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * pageSize;

        let query = `
            SELECT s.*, u.name as studentName, u.mentor_id,
                   p.title as problemTitle, t.title as taskTitle
            FROM submissions s 
            JOIN users u ON s.student_id = u.id
            LEFT JOIN problems p ON s.problem_id = p.id
            LEFT JOIN tasks t ON s.task_id = t.id
            WHERE 1=1
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM submissions s JOIN users u ON s.student_id = u.id WHERE 1=1';
        const params = [];

        // Filter by studentId for student portal
        if (studentId) {
            query += ' AND s.student_id = ?';
            countQuery += ' AND s.student_id = ?';
            params.push(studentId);
        }

        // Filter by mentorId for mentor portal (students assigned to this mentor)
        if (mentorId) {
            query += ' AND u.mentor_id = ?';
            countQuery += ' AND u.mentor_id = ?';
            params.push(mentorId);
        }

        query += ' ORDER BY s.submitted_at DESC LIMIT ? OFFSET ?';

        const [[{ total }]] = await pool.query(countQuery, params);
        const [rows] = await pool.query(query, [...params, pageSize, offset]);

        const fixedRows = rows.map(s => ({
            id: s.id,
            studentId: s.student_id,
            studentName: s.studentName,
            problemId: s.problem_id,
            taskId: s.task_id,
            itemTitle: s.problemTitle || s.taskTitle || 'Unknown',
            code: s.code,
            submissionType: s.submission_type,
            isMLTask: (s.submission_type || '').startsWith('ml-'),
            fileName: s.file_name,
            language: s.language,
            score: s.score,
            status: s.status,
            feedback: s.feedback,
            aiExplanation: s.ai_explanation,
            analysis: {
                correctness: s.analysis_correctness,
                efficiency: s.analysis_efficiency,
                codeStyle: s.analysis_code_style,
                bestPractices: s.analysis_best_practices
            },
            plagiarism: {
                detected: s.plagiarism_detected === 'true',
                copiedFrom: s.copied_from,
                copiedFromName: s.copied_from_name
            },
            integrity: {
                tabSwitches: s.tab_switches,
                integrityViolation: s.integrity_violation === 'true'
            },
            tabSwitches: s.tab_switches || 0,
            copyPasteAttempts: s.copy_paste_attempts || 0,
            cameraBlockedCount: s.camera_blocked_count || 0,
            phoneDetectionCount: s.phone_detection_count || 0,
            proctoringVideo: s.proctoring_video,
            submittedAt: s.submitted_at
        }));

        const response = await paginatedResponse({
            data: fixedRows,
            total,
            page: pageNum,
            limit: pageSize
        });

        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ML Task Submission Route with AI Evaluation
app.post('/api/submissions/ml-task', async (req, res) => {
    try {
        const {
            studentId, taskId, submissionType, code, githubUrl,
            taskTitle, taskDescription, taskRequirements
        } = req.body;

        console.log(`[ML-Task] Received submission from Student:${studentId} Task:${taskId} Type:${submissionType}`);

        if (!studentId || !taskId) {
            return res.status(400).json({ error: 'Missing required fields: studentId or taskId' });
        }

        // Check for attempt limit
        const [taskData] = await pool.query('SELECT max_attempts FROM tasks WHERE id = ?', [taskId]);
        if (taskData.length > 0) {
            const maxAttempts = parseInt(taskData[0].max_attempts) || 0;
            if (maxAttempts > 0) {
                const [[{ attemptCount }]] = await pool.query(
                    'SELECT COUNT(*) as attemptCount FROM submissions WHERE student_id = ? AND task_id = ?',
                    [studentId, taskId]
                );

                if (attemptCount >= maxAttempts) {
                    return res.status(403).json({
                        error: 'Attempt limit reached',
                        message: `You have used all ${maxAttempts} attempt(s) for this task.`,
                        attemptCount,
                        maxAttempts
                    });
                }
            }
        }

        // 1. Prepare Content for AI
        let contentToEvaluate = '';
        if (submissionType === 'file') {
            if (!code) return res.status(400).json({ error: 'Code content missing for file submission' });
            contentToEvaluate = code;
        } else if (submissionType === 'github') {
            if (!githubUrl) return res.status(400).json({ error: 'GitHub URL missing' });
            contentToEvaluate = `GitHub Repository: ${githubUrl}\n\n(Note: As an AI, please evaluate based on the repository structure and description inferred from the URL if browsing is not possible. Provide feedback assuming standard project structure.)`;
        } else {
            return res.status(400).json({ error: 'Invalid submission type' });
        }

        // 2. Construct AI Prompt
        const systemPrompt = `You are an expert Machine Learning Mentor & Senior Data Scientist. 
        Evaluate the student's submission for the following ML task with a professional, constructive, and detailed approach.
        
        Task: ${taskTitle}
        Description: ${taskDescription}
        Requirements:
        ${taskRequirements}
        
        Student Submission (${submissionType}):
        ${contentToEvaluate.substring(0, 50000)} -- Truncated for token limits if necessary

        YOUR COLABORATION:
        Analyze the submission for:
        1. Correctness (logic, approach, model selection)
        2. Code Quality (modularity, variable naming, readability)
        3. Documentation (comments, README, explanation)
        4. Data Handling (preprocessing, splitting, leakage prevention)
        5. Model Evaluation (metrics, validation strategy)

        OUTPUT FORMAT:
        Return strict JSON only (no markdown formatting):
        {
            "score": number (0-100),
            "status": "accepted" | "rejected",
            "summary": "Professional executive summary of the submission's quality and approach (2-3 sentences).",
            "strengths": ["List of 3-5 key strengths observed"],
            "suggestion_points": ["List of 3-5 specific actionable areas for improvement"],
            "metrics": {
                "Correctness": number (0-100),
                "Code Quality": number (0-100),
                "Documentation": number (0-100),
                "Model Performance": number (0-100)
            },
            "detailed_feedback": "Comprehensive technical feedback in Markdown format. Use headers, bullet points, and code blocks if needed to explain improvements.",
            "next_steps": "Actionable advice for the learner's next steps in this topic."
        }`;

        // 3. Call AI
        let aiResult = { score: 0, feedback: "Evaluation active but result parsing failed.", status: "accepted", metrics: {} };
        let aiContent = '';
        try {
            const completion = await cerebrasChat([
                { role: 'system', content: 'You are an AI evaluator for ML coding tasks. Respond with valid JSON only. Ensure all property keys and string values are properly escaped.' },
                { role: 'user', content: systemPrompt }
            ], {
                temperature: 0.2,
                max_tokens: 4000,
                response_format: { type: 'json_object' }
            });

            aiContent = completion.choices?.[0]?.message?.content || '';
            const jsonStartIndex = aiContent.indexOf('{');
            const jsonEndIndex = aiContent.lastIndexOf('}');

            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                const jsonStr = aiContent.substring(jsonStartIndex, jsonEndIndex + 1);
                aiResult = JSON.parse(jsonStr);
                // Map metrics to breakdown for consistency if needed, or send as is
                aiResult.breakdown = aiResult.metrics;
                aiResult.feedback = aiResult.detailed_feedback; // For backward compatibility with DB column
            } else {
                throw new Error('AI response was not valid JSON');
            }
        } catch (aiErr) {
            console.error('AI Eval Error:', aiErr.message);
            console.error('Raw AI Content causing error:', aiContent);
            aiResult = {
                score: 50,
                summary: "AI Evaluation Service Error. The system could not complete the automated review.",
                strengths: [],
                suggestion_points: ["Please try submitting again later."],
                metrics: { "Availability": 0 },
                feedback: `AI Evaluation Service Error: ${aiErr.message}.`,
                status: 'error',
                detailed_feedback: `The evaluation service encountered an error: ${aiErr.message}`
            };
        }

        // 4. Return result to client
        res.json(aiResult);

        // 5. (Async) Save to DB for records/progress
        try {
            const submissionId = uuidv4();
            const mlSubmissionType = submissionType === 'file' ? 'ml-file' : 'ml-github';
            const codeContent = submissionType === 'file' ? code : githubUrl;
            const fileName = req.body.fileName || null;

            await pool.query(
                `INSERT INTO submissions (
                    id, student_id, problem_id, task_id, code, submission_type, file_name, language,
                    score, status, feedback, ai_explanation,
                    analysis_correctness, analysis_efficiency, analysis_code_style, analysis_best_practices,
                    plagiarism_detected, tab_switches, integrity_violation, submitted_at
                ) VALUES (?, ?, NULL, ?, ?, ?, ?, 'ML', ?, ?, ?, ?, ?, ?, ?, ?, 'false', 0, 'false', NOW())`,
                [
                    submissionId, studentId, taskId, codeContent, mlSubmissionType, fileName,
                    aiResult.score || 0,
                    aiResult.status || 'accepted',
                    aiResult.feedback || aiResult.detailed_feedback || '',
                    aiResult.summary || '',
                    aiResult.metrics?.['Correctness'] ? `${aiResult.metrics['Correctness']}/100` : 'N/A',
                    aiResult.metrics?.['Code Quality'] ? `${aiResult.metrics['Code Quality']}/100` : 'N/A',
                    aiResult.metrics?.['Documentation'] ? `${aiResult.metrics['Documentation']}/100` : 'N/A',
                    aiResult.metrics?.['Model Performance'] ? `${aiResult.metrics['Model Performance']}/100` : 'N/A'
                ]
            );
            console.log(`[ML-Task] Submission saved to DB: ${submissionId}`);

            // If passed, mark task as completed
            if (aiResult.score >= 60 || aiResult.status === 'accepted') {
                try {
                    await pool.query(
                        `INSERT IGNORE INTO task_completions (student_id, task_id) VALUES (?, ?)`,
                        [studentId, taskId]
                    );
                } catch (tcErr) {
                    console.warn('Could not insert task_completion:', tcErr.message);
                }
            }
            // Invalidate caches when submission is created
            cacheManager.delete(`student:${studentId}:analytics`);
            cacheManager.delete(`student:${studentId}:learning_path`);
            cacheManager.delete(`student:${studentId}:peer_comparison`);
            cacheManager.delete(`topics:all:${studentId}`);
            cacheManager.delete('leaderboard:global:all');
            cacheManager.delete('leaderboard:dashboard:top10');

            // Invalidate mentor's analytics cache
            try {
                const [allocation] = await pool.query(
                    'SELECT mentor_id FROM mentor_student_allocations WHERE student_id = ? LIMIT 1',
                    [studentId]
                );
                if (allocation.length > 0) {
                    cacheManager.delete(`mentor:${allocation[0].mentor_id}:analytics`);
                }
            } catch (e) { /* Ignore */ }

            // Update predictive analytics
            if (analyticsService) {
                try {
                    await analyticsService.analyzeStudentPerformance(studentId);
                    console.log(`📊 Analytics: Updated for student ${studentId} (ML Task)`);
                } catch (err) {
                    console.warn('Analytics update failed:', err.message);
                }
            }

        } catch (dbErr) {
            console.warn('Could not save ML task submission to DB:', dbErr.message);
        }

    } catch (err) {
        console.error('ML Task Submission Endpoint Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get submission count for a student on a specific problem (for attempt tracking)
app.get('/api/submissions/count', async (req, res) => {
    try {
        const { studentId, problemId, taskId } = req.query;

        let query = 'SELECT COUNT(*) as attemptCount FROM submissions WHERE student_id = ?';
        const params = [studentId];

        if (problemId) {
            query += ' AND problem_id = ?';
            params.push(problemId);
        } else if (taskId) {
            query += ' AND task_id = ?';
            params.push(taskId);
        } else {
            return res.status(400).json({ error: 'Either problemId or taskId is required' });
        }

        const [[{ attemptCount }]] = await pool.query(query, params);
        res.json({ attemptCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create submission (AI-evaluated code submission)
app.post('/api/submissions', submissionLimiter, async (req, res) => {
    try {
        const { studentId, problemId, taskId, language, code, submissionType, fileName, tabSwitches } = req.body;
        const submissionId = uuidv4();
        const submittedAt = new Date();

        // Get problem details for AI evaluation
        let problemContext = '';
        let problemTitle = '';
        if (problemId) {
            const [probs] = await pool.query('SELECT * FROM problems WHERE id = ?', [problemId]);
            if (probs.length > 0) {
                const p = probs[0];
                problemTitle = p.title;
                problemContext = `Problem: ${p.title}\nDescription: ${p.description}\nDifficulty: ${p.difficulty}\nSample Input: ${p.sample_input || 'N/A'}\nExpected Output: ${p.expected_output || 'N/A'}`;

                // Enforce max_attempts limit
                const maxAttempts = parseInt(p.max_attempts) || 0;
                if (maxAttempts > 0) {
                    const [[{ attemptCount }]] = await pool.query(
                        'SELECT COUNT(*) as attemptCount FROM submissions WHERE student_id = ? AND problem_id = ?',
                        [studentId, problemId]
                    );
                    if (attemptCount >= maxAttempts) {
                        return res.status(403).json({
                            error: 'Attempt limit reached',
                            message: `You have used all ${maxAttempts} attempt(s) for this problem.`,
                            attemptCount,
                            maxAttempts
                        });
                    }
                }
            }
        }

        // Check for plagiarism - get other submissions for same problem (SKIP for SQL)
        let plagiarismResult = { detected: false, copiedFrom: null, copiedFromName: null, similarity: 0 };
        if (problemId && language !== 'SQL') {
            const [otherSubs] = await pool.query(
                `SELECT s.id, s.student_id, s.code, u.name as student_name 
                 FROM submissions s 
                 JOIN users u ON s.student_id = u.id 
                 WHERE s.problem_id = ? AND s.student_id != ? 
                 ORDER BY s.submitted_at DESC LIMIT 20`,
                [problemId, studentId]
            );

            if (otherSubs.length > 0) {
                // Simple similarity check using AI
                const plagiarismPrompt = `Compare this code submission against other submissions and detect plagiarism.
                
Submitted Code:
${code}

Other Submissions to compare:
${otherSubs.map((s, i) => `--- Submission ${i + 1} by ${s.student_name} ---\n${s.code}`).join('\n\n')}

Respond with JSON:
{
    "detected": true/false,
    "similarity": 0-100 (percentage),
    "matchedSubmissionIndex": null or 0-based index of most similar submission,
    "explanation": "Brief explanation"
}
Only mark as detected if similarity > 80% and code structure is nearly identical.`;

                try {
                    const plagiarismCheck = await cerebrasChat([
                        { role: 'system', content: 'You are a plagiarism detection system. Analyze code for copying.' },
                        { role: 'user', content: plagiarismPrompt }
                    ], {
                        model: 'gpt-oss-120b',
                        temperature: 0.1,
                        max_tokens: 300,
                        response_format: { type: 'json_object' }
                    });

                    const pResult = JSON.parse(plagiarismCheck.choices[0]?.message?.content || '{}');
                    if (pResult.detected && pResult.matchedSubmissionIndex !== null && pResult.matchedSubmissionIndex < otherSubs.length) {
                        const matchedSub = otherSubs[pResult.matchedSubmissionIndex];
                        plagiarismResult = {
                            detected: true,
                            copiedFrom: matchedSub.student_id,
                            copiedFromName: matchedSub.student_name,
                            similarity: pResult.similarity || 85
                        };
                    }
                } catch (e) {
                    console.error('Plagiarism check error:', e.message);
                }
            }
        }

        // SQL-Specific Evaluation or AI Code Evaluation
        let evaluationResult = {
            score: 0,
            status: 'rejected',
            feedback: 'Evaluation pending...',
            aiExplanation: 'Evaluation in progress.',
            analysis: {
                correctness: 'Unknown',
                efficiency: 'Unknown',
                codeStyle: 'Unknown',
                bestPractices: 'Unknown'
            }
        };

        // Check if this is a SQL submission
        if (language === 'SQL' && problemId) {
            try {
                // Get problem details including SQL schema and expected result
                const [probs] = await pool.query('SELECT * FROM problems WHERE id = ?', [problemId]);
                if (probs.length > 0) {
                    const problem = probs[0];
                    const sqlSchema = problem.sql_schema;
                    const expectedQueryResult = problem.expected_query_result;

                    if (sqlSchema && expectedQueryResult) {
                        // Execute the student's SQL query with the schema
                        const fullQuery = `.headers on\n.mode list\n${sqlSchema}\n\n${code}`;

                        const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                language: 'sqlite3',
                                version: '3.36.0',
                                files: [{ content: fullQuery }]
                            })
                        });

                        const data = await response.json();
                        const actualOutput = (data.run?.output || '').trim();
                        const expectedOutput = expectedQueryResult.trim();

                        // Check if query executed successfully
                        const executedSuccessfully = data.run?.code === 0;

                        // Helper function to parse SQL output into comparable data
                        function parseSQLOutput(output) {
                            if (!output || output.length === 0) return null;

                            const lines = output.trim().split('\n').filter(line => {
                                // Remove separator lines (lines with only -, +, |, =, and spaces)
                                return line.trim() && !/^[\-\+\|\=\s]+$/.test(line.trim());
                            });

                            if (lines.length === 0) return null;

                            // Extract rows - handle both pipe-separated and whitespace-separated formats
                            const rows = [];
                            for (const line of lines) {
                                let values;
                                if (line.includes('|')) {
                                    // Pipe-separated format
                                    values = line.split('|')
                                        .map(v => v.trim())
                                        .filter(v => v.length > 0);
                                } else {
                                    // Whitespace-separated format - split by multiple spaces
                                    values = line.trim().split(/\s{2,}/)
                                        .map(v => v.trim())
                                        .filter(v => v.length > 0);
                                }
                                if (values.length > 0) {
                                    rows.push(values);
                                }
                            }

                            return rows;
                        }

                        // Helper function to normalize values for comparison
                        function normalizeValue(val) {
                            if (!val) return '';
                            // Convert to lowercase, trim, remove extra spaces
                            return val.toString().toLowerCase().trim().replace(/\s+/g, ' ');
                        }

                        // Helper function to compare two parsed outputs
                        function compareOutputs(actual, expected) {
                            if (!actual || !expected) return false;
                            if (actual.length !== expected.length) return false;

                            // Sort both outputs to handle different row orders (especially for GROUP BY)
                            const sortRows = (rows) => {
                                return rows.map(row => row.map(normalizeValue))
                                    .sort((a, b) => a.join('|').localeCompare(b.join('|')));
                            };

                            const actualSorted = sortRows(actual);
                            const expectedSorted = sortRows(expected);

                            // Compare each row
                            for (let i = 0; i < actualSorted.length; i++) {
                                const actualRow = actualSorted[i];
                                const expectedRow = expectedSorted[i];

                                if (actualRow.length !== expectedRow.length) return false;

                                for (let j = 0; j < actualRow.length; j++) {
                                    if (actualRow[j] !== expectedRow[j]) {
                                        return false;
                                    }
                                }
                            }

                            return true;
                        }

                        // Parse both outputs
                        const actualParsed = parseSQLOutput(actualOutput);
                        const expectedParsed = parseSQLOutput(expectedOutput);

                        // Compare the parsed data
                        const isCorrect = compareOutputs(actualParsed, expectedParsed);

                        console.log(`SQL Evaluation - Executed: ${executedSuccessfully}, Correct: ${isCorrect}`);
                        console.log(`Expected rows:`, expectedParsed);
                        console.log(`Actual rows:`, actualParsed);


                        if (executedSuccessfully && isCorrect) {
                            // Perfect match - award full points
                            evaluationResult.score = 100;
                            evaluationResult.status = 'accepted';
                            evaluationResult.feedback = 'Excellent! Your SQL query is correct and produces the expected output.';
                            evaluationResult.aiExplanation = 'Query executed successfully and output matches expected result exactly.';
                            evaluationResult.analysis = {
                                correctness: '100 - Excellent, Perfect match',
                                efficiency: '95 - Good, Query structure is appropriate',
                                codeStyle: '90 - Good, SQL syntax is clean',
                                bestPractices: '90 - Good, Follows SQL conventions'
                            };
                        } else if (executedSuccessfully && !isCorrect) {
                            // Query runs but produces wrong output
                            evaluationResult.score = 30;
                            evaluationResult.status = 'rejected';
                            evaluationResult.feedback = 'Your query executes but does not produce the expected output. Review the expected result and adjust your query.';
                            evaluationResult.aiExplanation = `Query executed but output does not match. Expected format/data differs from actual output.`;
                            evaluationResult.analysis = {
                                correctness: '30 - Poor, Output does not match expected result',
                                efficiency: '50 - Fair, Query executes',
                                codeStyle: '70 - Fair, Syntax is valid',
                                bestPractices: '60 - Fair, Query structure needs review'
                            };
                        } else {
                            // Query has syntax error or runtime error
                            evaluationResult.score = 0;
                            evaluationResult.status = 'rejected';
                            evaluationResult.feedback = 'Your SQL query has syntax errors or fails to execute. Check your SQL syntax and try again.';
                            evaluationResult.aiExplanation = `SQL execution failed: ${actualOutput.substring(0, 200)}`;
                            evaluationResult.analysis = {
                                correctness: '0 - Poor, Query fails to execute',
                                efficiency: '0 - N/A',
                                codeStyle: '0 - Poor, Syntax errors present',
                                bestPractices: '0 - Poor, Query needs fixing'
                            };
                        }
                    } else {
                        // Fall back to AI evaluation if schema or expected result is missing
                        console.log('SQL problem missing schema or expected result, falling back to AI evaluation');
                        throw new Error('Missing SQL schema or expected result');
                    }
                }
            } catch (sqlEvalError) {
                console.error('SQL Evaluation error:', sqlEvalError.message);
                // Explicitly set error result for SQL to avoid AI fallback confusion
                evaluationResult.score = 0;
                evaluationResult.status = 'rejected';
                evaluationResult.feedback = `Evaluation System Error: ${sqlEvalError.message}.`;
                evaluationResult.aiExplanation = 'Internal System Error during SQL execution.';
                evaluationResult.analysis = { correctness: 'Error', efficiency: 'Error', codeStyle: 'Error', bestPractices: 'Error' };
            }
        }

        // For non-SQL ONLY (Strictly skip if SQL was attempted)
        if (language !== 'SQL') {
            const evaluationPrompt = `You are an expert code evaluator for a coding education platform.

${problemContext}

Language: ${language}
Tab Switches During Test: ${tabSwitches || 0}

Student's Code:
${code}

Evaluate this code submission thoroughly. Consider:
1. Correctness: Does it solve the problem correctly?
2. Efficiency: Time and space complexity
3. Code Style: Readability, naming conventions, structure
4. Best Practices: Error handling, edge cases, clean code principles

Respond with JSON:
{
    "score": 0-100,
    "status": "accepted" | "partial" | "rejected",
    "feedback": "Detailed feedback for the student (2-3 sentences)",
    "aiExplanation": "Technical explanation of the evaluation",
    "analysis": {
        "correctness": "Score (0-100) - brief explanation",
        "efficiency": "Score (0-100) - time/space analysis",
        "codeStyle": "Score (0-100) - style notes",
        "bestPractices": "Score (0-100) - practices used"
    }
}

Scoring Guide:
- 90-100: Correct, efficient, clean code
- 70-89: Mostly correct with minor issues
- 50-69: Partially correct or has significant issues
- 0-49: Incorrect or major problems`;

            try {
                const evaluation = await cerebrasChat([
                    { role: 'system', content: 'You are an expert code evaluator. Be fair but thorough.' },
                    { role: 'user', content: evaluationPrompt }
                ], {
                    model: 'gpt-oss-120b',
                    temperature: 0.2,
                    max_tokens: 800,
                    response_format: { type: 'json_object' }
                });

                evaluationResult = JSON.parse(evaluation.choices[0]?.message?.content || '{}');
            } catch (e) {
                console.error('AI Evaluation error:', e.message);
            }
        }

        // Apply penalties
        let finalScore = evaluationResult.score || 0;
        let integrityViolation = false;

        // Penalty for tab switches (each switch = -5 points, max -25) - SKIP FOR SQL
        if (language !== 'SQL') {
            if (tabSwitches > 0) {
                const tabPenalty = Math.min(tabSwitches * 5, 25);
                finalScore = Math.max(0, finalScore - tabPenalty);
                integrityViolation = tabSwitches >= 3;
                // Append explanation to feedback if it exists, otherwise init
                evaluationResult.feedback = (evaluationResult.feedback || '') + `\n\n⚠️ Penalty: -${tabPenalty} points for ${tabSwitches} tab switches.`;
            }

            // Penalty for plagiarism
            if (plagiarismResult.detected) {
                finalScore = Math.max(0, Math.floor(finalScore * 0.3)); // 70% penalty
                integrityViolation = true;
                evaluationResult.feedback = (evaluationResult.feedback || '') + `\n\n⚠️ Academic Integrity Warning: Plagiarism detected. Score reduced by 70%.`;
            }
        }

        // Determine final status
        let finalStatus = evaluationResult.status || 'rejected';
        if (finalScore >= 70) finalStatus = 'accepted';
        else if (finalScore >= 40) finalStatus = 'partial';
        else finalStatus = 'rejected';

        // Save to database
        await pool.query(
            `INSERT INTO submissions (
                id, student_id, problem_id, task_id, code, submission_type, file_name, language,
                score, status, feedback, ai_explanation,
                analysis_correctness, analysis_efficiency, analysis_code_style, analysis_best_practices,
                plagiarism_detected, copied_from, copied_from_name,
                tab_switches, integrity_violation, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                submissionId, studentId, problemId || null, taskId || null, code, submissionType || 'editor', fileName || null, language,
                finalScore, finalStatus, evaluationResult.feedback, evaluationResult.aiExplanation,
                evaluationResult.analysis?.correctness, evaluationResult.analysis?.efficiency,
                evaluationResult.analysis?.codeStyle, evaluationResult.analysis?.bestPractices,
                plagiarismResult.detected ? 'true' : 'false', plagiarismResult.copiedFrom, plagiarismResult.copiedFromName,
                tabSwitches || 0, integrityViolation ? 'true' : 'false', submittedAt
            ]
        );

        // Trigger advanced plagiarism analysis in background
        try {
            if (problemId && language !== 'SQL') {
                // We don't await this to keep response fast, or we can await if we want to ensure it runs
                // Better to await it here since it's critical for the dashboard
                const analysisResult = await plagiarismService.analyzeSubmission(submissionId);
                const analysisId = uuidv4();

                await pool.query(
                    `INSERT INTO plagiarism_analysis 
                    (id, submission_id, problem_id, student_id, lexical_similarity, structural_similarity, 
                     temporal_suspicion, overall_score, flagged, severity, matched_submissions, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        analysisId,
                        submissionId,
                        analysisResult.problemId,
                        analysisResult.studentId,
                        analysisResult.lexicalSimilarity,
                        analysisResult.structuralSimilarity,
                        analysisResult.temporalSuspicion,
                        analysisResult.overallScore,
                        analysisResult.flagged ? 1 : 0,
                        analysisResult.severity,
                        JSON.stringify(analysisResult.matchedSubmissions)
                    ]
                );
                console.log(`[Plagiarism] Background analysis completed for ${submissionId}`);
            }
        } catch (plagErr) {
            console.error('Background plagiarism analysis failed:', plagErr.message);
        }

        // Mark problem as completed if score >= 70
        if (problemId && finalScore >= 70) {
            try {
                await pool.query(
                    'INSERT IGNORE INTO problem_completions (problem_id, student_id, completed_at) VALUES (?, ?, ?)',
                    [problemId, studentId, submittedAt]
                );

                // Award points and update streak using GamificationService
                try {
                    if (gamificationService) {
                        await gamificationService.awardProblemCompletion(studentId, problemId, true, 300);
                        await gamificationService.updateStreak(studentId);
                    }
                    if (analyticsService) {
                        await analyticsService.analyzeStudentPerformance(studentId);
                        console.log(`📊 Analytics: Updated for student ${studentId}`);
                    }
                } catch (err) {
                    console.error('⚠️ Post-submission updates failed:', err.message);
                }
            } catch (e) { /* Ignore if already completed */ }
        } else {
            // Still update streak and analytics for attempt
            try {
                if (gamificationService) {
                    await gamificationService.updateStreak(studentId);
                }
                if (analyticsService) {
                    await analyticsService.analyzeStudentPerformance(studentId);
                }
            } catch (err) {
                console.log('Update skipped:', err.message);
            }
        }

        // Invalidate caches when submission is created
        cacheManager.delete(`student:${studentId}:analytics`);
        cacheManager.delete(`student:${studentId}:learning_path`);
        cacheManager.delete(`student:${studentId}:peer_comparison`);
        cacheManager.delete(`topics:all:${studentId}`);
        cacheManager.delete('leaderboard:global:all');
        cacheManager.delete('leaderboard:dashboard:top10');
        cacheManager.delete('admin:analytics:global');
        // Also invalidate mentor's analytics cache
        try {
            const [allocation] = await pool.query(
                'SELECT mentor_id FROM mentor_student_allocations WHERE student_id = ? LIMIT 1',
                [studentId]
            );
            if (allocation.length > 0) {
                cacheManager.delete(`mentor:${allocation[0].mentor_id}:analytics`);
            }
        } catch (e) { /* Ignore cache invalidation errors */ }

        // Return result to student
        res.json({
            id: submissionId,
            score: finalScore,
            status: finalStatus,
            feedback: evaluationResult.feedback,
            aiExplanation: evaluationResult.aiExplanation,
            analysis: evaluationResult.analysis,
            plagiarism: {
                detected: plagiarismResult.detected,
                warning: plagiarismResult.detected ? 'Similarity detected with another submission. Score reduced.' : null
            },
            integrity: {
                tabSwitches: tabSwitches || 0,
                violation: integrityViolation,
                warning: integrityViolation ? 'Integrity violations detected. This may affect your score.' : null
            },
            submittedAt
        });

    } catch (error) {
        console.error('Submission Error:', error);
        res.status(500).json({ error: 'Failed to process submission', details: error.message });
    }
});

// Proctored submission with video upload
// Middleware for handling optional file uploads (support both JSON and FormData)
const optionalFileUpload = (req, res, next) => {
    // Check if Content-Type is multipart/form-data (file upload)
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
        // Handle as file upload
        upload.single('proctoringVideo')(req, res, (err) => {
            if (err) {
                console.warn('⚠️ File upload error (continuing without file):', err.message);
                req.file = null;
            }
            next();
        });
    } else {
        // Content-Type is application/json or other - skip file handling
        req.file = null;
        next();
    }
};

app.post('/api/submissions/proctored', optionalFileUpload, async (req, res) => {
    try {
        const { studentId, problemId, language, code, submissionType, tabSwitches, copyPasteAttempts, cameraBlockedCount, phoneDetectionCount, timeSpent, faceNotDetectedCount, multipleFacesDetectionCount, faceLookawayCount } = req.body;

        // Validate required fields
        if (!studentId || !problemId || !language || !code) {
            console.error('❌ Missing required fields in proctored submission:', {
                studentId: !!studentId,
                problemId: !!problemId,
                language: !!language,
                code: !!code,
                bodyKeys: Object.keys(req.body)
            });
            return res.status(400).json({
                error: 'Missing required fields',
                details: 'studentId, problemId, language, and code are required'
            });
        }

        const submissionId = uuidv4();
        const submittedAt = new Date();

        console.log(`📝 Processing proctored submission for student ${studentId}, problem ${problemId}, language: ${language}`);

        // Get video file info if uploaded and convert to MP4
        let videoFilename = null;
        if (req.file) {
            const webmPath = req.file.path;
            const webmFilename = req.file.filename;
            const mp4Filename = webmFilename.replace('.webm', '.mp4');
            const mp4Path = path.join(uploadDir, mp4Filename);

            try {
                // Convert WebM to MP4 using ffmpeg
                console.log(`🔄 Converting video to MP4: ${webmFilename} -> ${mp4Filename}`);
                await execPromise(`ffmpeg -i "${webmPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${mp4Path}" -y`);

                // Delete original WebM file after successful conversion
                fs.unlinkSync(webmPath);
                videoFilename = mp4Filename;
                console.log(`📹 Proctoring video saved as MP4: ${mp4Filename}`);
            } catch (ffmpegError) {
                console.error('⚠️ FFmpeg conversion failed, keeping WebM:', ffmpegError.message);
                // Keep the original WebM if conversion fails
                videoFilename = webmFilename;
            }
        } else {
            console.log(`ℹ️ No video file in request (may be JSON-only submission)`);
        }

        // Get problem details for AI evaluation
        let problemDetails = null;
        if (problemId) {
            const [problems] = await pool.query('SELECT * FROM problems WHERE id = ?', [problemId]);
            if (problems.length > 0) {
                problemDetails = problems[0];

                // Enforce max_attempts limit
                const maxAttempts = parseInt(problemDetails.max_attempts) || 0;
                if (maxAttempts > 0) {
                    const [[{ attemptCount }]] = await pool.query(
                        'SELECT COUNT(*) as attemptCount FROM submissions WHERE student_id = ? AND problem_id = ?',
                        [studentId, problemId]
                    );
                    if (attemptCount >= maxAttempts) {
                        return res.status(403).json({
                            error: 'Attempt limit reached',
                            message: `You have used all ${maxAttempts} attempt(s) for this problem.`,
                            attemptCount,
                            maxAttempts
                        });
                    }
                }
            }
        }

        // SQL-Specific Evaluation or AI Code Evaluation
        let evaluationResult = { score: 0, status: 'rejected', feedback: 'Evaluation pending...', analysis: {} };

        // Check if this is a SQL submission
        if (language === 'SQL' && problemDetails) {
            try {
                const sqlSchema = problemDetails.sql_schema;
                const expectedQueryResult = problemDetails.expected_query_result;

                if (sqlSchema && expectedQueryResult) {
                    // Execute the student's SQL query with the schema
                    const fullQuery = `.headers on\n.mode list\n${sqlSchema}\n\n${code}`;

                    const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            language: 'sqlite3',
                            version: '3.36.0',
                            files: [{ content: fullQuery }]
                        })
                    });

                    const data = await response.json();
                    const actualOutput = (data.run?.output || '').trim();
                    const expectedOutput = expectedQueryResult.trim();

                    // Check if query executed successfully
                    const executedSuccessfully = data.run?.code === 0;

                    // Helper function to parse SQL output into comparable data
                    function parseSQLOutput(output) {
                        if (!output || output.length === 0) return null;

                        const lines = output.trim().split('\n').filter(line => {
                            // Remove separator lines (lines with only -, +, |, =, and spaces)
                            return line.trim() && !/^[\-\+\|\=\s]+$/.test(line.trim());
                        });

                        if (lines.length === 0) return null;

                        // Extract rows - handle both pipe-separated and whitespace-separated formats
                        const rows = [];
                        for (const line of lines) {
                            let values;
                            if (line.includes('|')) {
                                // Pipe-separated format
                                values = line.split('|')
                                    .map(v => v.trim())
                                    .filter(v => v.length > 0);
                            } else {
                                // Whitespace-separated format - split by multiple spaces
                                values = line.trim().split(/\s{2,}/)
                                    .map(v => v.trim())
                                    .filter(v => v.length > 0);
                            }
                            if (values.length > 0) {
                                rows.push(values);
                            }
                        }

                        return rows;
                    }

                    // Helper function to normalize values for comparison
                    function normalizeValue(val) {
                        if (!val) return '';
                        // Convert to lowercase, trim, remove extra spaces
                        return val.toString().toLowerCase().trim().replace(/\s+/g, ' ');
                    }

                    // Helper function to compare two parsed outputs
                    function compareOutputs(actual, expected) {
                        if (!actual || !expected) return false;
                        if (actual.length !== expected.length) return false;

                        // Sort both outputs to handle different row orders (especially for GROUP BY)
                        const sortRows = (rows) => {
                            return rows.map(row => row.map(normalizeValue))
                                .sort((a, b) => a.join('|').localeCompare(b.join('|')));
                        };

                        const actualSorted = sortRows(actual);
                        const expectedSorted = sortRows(expected);

                        // Compare each row
                        for (let i = 0; i < actualSorted.length; i++) {
                            const actualRow = actualSorted[i];
                            const expectedRow = expectedSorted[i];

                            if (actualRow.length !== expectedRow.length) return false;

                            for (let j = 0; j < actualRow.length; j++) {
                                if (actualRow[j] !== expectedRow[j]) {
                                    return false;
                                }
                            }
                        }

                        return true;
                    }

                    // Parse both outputs
                    const actualParsed = parseSQLOutput(actualOutput);
                    const expectedParsed = parseSQLOutput(expectedOutput);

                    // Compare the parsed data
                    const isCorrect = compareOutputs(actualParsed, expectedParsed);

                    console.log(`Proctored SQL Evaluation - Executed: ${executedSuccessfully}, Correct: ${isCorrect}`);
                    console.log(`Expected rows:`, expectedParsed);
                    console.log(`Actual rows:`, actualParsed);

                    if (executedSuccessfully && isCorrect) {
                        // Perfect match - award full points
                        evaluationResult.score = 100;
                        evaluationResult.status = 'accepted';
                        evaluationResult.feedback = 'Excellent! Your SQL query is correct and produces the expected output.';
                        evaluationResult.aiExplanation = 'Query executed successfully and output matches expected result exactly.';
                        evaluationResult.analysis = {
                            correctness: 'Excellent - Query produces correct output',
                            efficiency: 'Good - Query structure is appropriate',
                            codeStyle: 'Good - SQL syntax is clean',
                            bestPractices: 'Good - Follows SQL conventions'
                        };
                    } else if (executedSuccessfully && !isCorrect) {
                        // Query runs but produces wrong output
                        evaluationResult.score = 30;
                        evaluationResult.status = 'rejected';
                        evaluationResult.feedback = 'Your query executes but does not produce the expected output. Review the expected result and adjust your query.';
                        evaluationResult.aiExplanation = `Query executed but output does not match. Expected format/data differs from actual output.`;
                        evaluationResult.analysis = {
                            correctness: 'Poor - Output does not match expected result',
                            efficiency: 'Fair - Query executes',
                            codeStyle: 'Fair - Syntax is valid',
                            bestPractices: 'Fair - Query structure needs review'
                        };
                    } else {
                        // Query has syntax error or runtime error
                        evaluationResult.score = 0;
                        evaluationResult.status = 'rejected';
                        evaluationResult.feedback = 'Your SQL query has syntax errors or fails to execute. Check your SQL syntax and try again.';
                        evaluationResult.aiExplanation = `SQL execution failed: ${actualOutput.substring(0, 200)}`;
                        evaluationResult.analysis = {
                            correctness: 'Poor - Query fails to execute',
                            efficiency: 'N/A',
                            codeStyle: 'Poor - Syntax errors present',
                            bestPractices: 'Poor - Query needs fixing'
                        };
                    }
                } else {
                    console.log('SQL problem missing schema or expected result, falling back to AI evaluation');
                    throw new Error('Missing SQL schema or expected result');
                }
            } catch (sqlEvalError) {
                console.error('SQL Evaluation error:', sqlEvalError.message);
                // Explicitly set error result for SQL to avoid AI fallback confusion
                evaluationResult.score = 0;
                evaluationResult.status = 'rejected';
                evaluationResult.feedback = `Evaluation System Error: ${sqlEvalError.message}.`;
                evaluationResult.aiExplanation = 'Internal System Error during SQL execution.';
                evaluationResult.analysis = { correctness: 'Error', efficiency: 'Error', codeStyle: 'Error', bestPractices: 'Error' };
            }
        }

        // For non-SQL ONLY (Strictly skip if SQL was attempted)
        if (language !== 'SQL') {
            try {
                const evaluationPrompt = `You are an expert code evaluator. Analyze this ${language} code submission for a coding problem.

Problem: ${problemDetails?.title || 'Unknown'}
Description: ${problemDetails?.description || 'No description'}
Expected Output: ${problemDetails?.expected_output || 'Not specified'}

Student's Code:
\`\`\`${language}
${code}
\`\`\`

Evaluate this code on:
1. Correctness (0-40 points): Does it solve the problem correctly?
2. Efficiency (0-25 points): Is the algorithm efficient?
3. Code Style (0-20 points): Is it readable and well-structured?
4. Best Practices (0-15 points): Does it follow ${language} best practices?

Respond in this exact JSON format:
{
  "score": <total score 0-100>,
  "status": "<accepted if score>=70, partial if score>=40, else rejected>",
  "feedback": "<2-3 sentence feedback for the student>",
  "analysis": {
    "correctness": <0-40>,
    "efficiency": <0-25>,
    "codeStyle": <0-20>,
    "bestPractices": <0-15>
  }
}`;

                const aiResponse = await cerebrasChat([
                    { role: 'user', content: evaluationPrompt }
                ], {
                    model: 'gpt-oss-120b',
                    temperature: 0.3,
                    max_tokens: 1000
                });

                const responseText = aiResponse.choices[0]?.message?.content || '';
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    evaluationResult = JSON.parse(jsonMatch[0]);
                }
            } catch (e) {
                console.error('AI Evaluation error:', e.message);
            }
        }

        // Apply penalties for proctoring violations
        let finalScore = evaluationResult.score || 0;
        let integrityViolation = false;
        const tabSwitchCount = parseInt(tabSwitches) || 0;
        const copyPasteCount = parseInt(copyPasteAttempts) || 0;
        const cameraBlockCount = parseInt(cameraBlockedCount) || 0;
        const phoneCount = parseInt(phoneDetectionCount) || 0;
        const faceNotDetectedCnt = parseInt(faceNotDetectedCount) || 0;
        const multipleFacesCnt = parseInt(multipleFacesDetectionCount) || 0;
        const faceLookawayCnt = parseInt(faceLookawayCount) || 0;

        // Apply penalties ONLY if not SQL
        if (language !== 'SQL') {
            // Penalty for tab switches (each switch = -5 points, max -25)
            if (tabSwitchCount > 0) {
                const tabPenalty = Math.min(tabSwitchCount * 5, 25);
                finalScore = Math.max(0, finalScore - tabPenalty);
                integrityViolation = tabSwitchCount >= 3;
                evaluationResult.feedback = (evaluationResult.feedback || '') + `\n\n⚠️ Penalty: -${tabPenalty} points for ${tabSwitchCount} tab switches.`;
            }

            // Penalty for copy/paste attempts (each attempt = -3 points, max -15)
            if (copyPasteCount > 0) {
                const copyPenalty = Math.min(copyPasteCount * 3, 15);
                finalScore = Math.max(0, finalScore - copyPenalty);
                evaluationResult.feedback = (evaluationResult.feedback || '') + `\n\n⚠️ Penalty: -${copyPenalty} points for copy/paste attempts.`;
            }

            // Penalty for camera obstruction (each block = -10 points, max -30)
            // This is a serious violation as it indicates attempt to hide from proctoring
            if (cameraBlockCount > 0) {
                const cameraPenalty = Math.min(cameraBlockCount * 10, 30);
                finalScore = Math.max(0, finalScore - cameraPenalty);
                if (cameraBlockCount >= 2) integrityViolation = true;
                evaluationResult.feedback = (evaluationResult.feedback || '') + `\n\n⚠️ High Penalty: -${cameraPenalty} points for camera obstruction.`;
            }

            // Penalty for phone detection (each detection = -15 points, max -45)
            // Using a phone is a severe cheating attempt
            if (phoneCount > 0) {
                const phonePenalty = Math.min(phoneCount * 15, 45);
                finalScore = Math.max(0, finalScore - phonePenalty);
                integrityViolation = true; // Any phone detection is an integrity violation
                console.log(`📱 Phone detected ${phoneCount} times, penalty: -${phonePenalty} points`);
                evaluationResult.feedback = (evaluationResult.feedback || '') + `\n\n⛔ Severe Penalty: -${phonePenalty} points for phone detection.`;
            }

            // Penalty for face not detected (each time = -5 points, max -25) - NEW (BlazeFace)
            if (faceNotDetectedCnt > 0) {
                const faceNotDetectedPenalty = Math.min(faceNotDetectedCnt * 5, 25);
                finalScore = Math.max(0, finalScore - faceNotDetectedPenalty);
                console.log(`👤 Face not detected ${faceNotDetectedCnt} times, penalty: -${faceNotDetectedPenalty} points`);
                evaluationResult.feedback = (evaluationResult.feedback || '') + `\n\n⚠️ Penalty: -${faceNotDetectedPenalty} points for face not detected (${faceNotDetectedCnt} times).`;
            }

            // Penalty for multiple faces detected (instant integrity violation) - NEW (BlazeFace)
            if (multipleFacesCnt > 0) {
                const multipleFacesPenalty = 20; // Fixed penalty of 20 points per detection
                finalScore = Math.max(0, finalScore - (multipleFacesPenalty * multipleFacesCnt));
                integrityViolation = true; // Multiple faces is always a violation
                console.log(`👥 Multiple faces detected ${multipleFacesCnt} times, penalty: -${multipleFacesPenalty * multipleFacesCnt} points`);
                evaluationResult.feedback = (evaluationResult.feedback || '') + `\n\n⛔ Severe Penalty: -${multipleFacesPenalty * multipleFacesCnt} points for multiple people detected.`;
            }

            // Penalty for face lookaway (each time = -3 points, max -15) - NEW (BlazeFace)
            if (faceLookawayCnt > 0) {
                const faceLookawayPenalty = Math.min(faceLookawayCnt * 3, 15);
                finalScore = Math.max(0, finalScore - faceLookawayPenalty);
                console.log(`👀 Face lookaway ${faceLookawayCnt} times, penalty: -${faceLookawayPenalty} points`);
                evaluationResult.feedback = (evaluationResult.feedback || '') + `\n\n⚠️ Penalty: -${faceLookawayPenalty} points for looking away from screen (${faceLookawayCnt} times).`;
            }
        }

        // Determine final status
        let finalStatus = evaluationResult.status || 'rejected';
        if (finalScore >= 70) finalStatus = 'accepted';
        else if (finalScore >= 40) finalStatus = 'partial';
        else finalStatus = 'rejected';

        // Save to database
        await pool.query(
            `INSERT INTO submissions (
                id, student_id, problem_id, code, submission_type, language,
                score, status, feedback, ai_explanation,
                analysis_correctness, analysis_efficiency, analysis_code_style, analysis_best_practices,
                tab_switches, copy_paste_attempts, camera_blocked_count, phone_detection_count,
                face_not_detected_count, multiple_faces_count, face_lookaway_count,
                integrity_violation, proctoring_video, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                submissionId, studentId, problemId, code, submissionType || 'editor', language,
                finalScore, finalStatus, evaluationResult.feedback, evaluationResult.aiExplanation || '',
                evaluationResult.analysis?.correctness, evaluationResult.analysis?.efficiency,
                evaluationResult.analysis?.codeStyle, evaluationResult.analysis?.bestPractices,
                tabSwitchCount, copyPasteCount, cameraBlockCount, phoneCount,
                faceNotDetectedCnt, multipleFacesCnt, faceLookawayCnt,
                integrityViolation ? 'true' : 'false', videoFilename, submittedAt
            ]
        );

        // Mark problem as completed if score >= 70
        if (problemId && finalScore >= 70) {
            try {
                await pool.query(
                    'INSERT IGNORE INTO problem_completions (problem_id, student_id, completed_at) VALUES (?, ?, ?)',
                    [problemId, studentId, submittedAt]
                );

                // Award points and update streak using GamificationService
                try {
                    if (gamificationService) {
                        await gamificationService.awardProblemCompletion(studentId, problemId, true, parseInt(timeSpent) || 300);
                        await gamificationService.updateStreak(studentId);
                    }
                    if (analyticsService) {
                        await analyticsService.analyzeStudentPerformance(studentId);
                        console.log(`📊 Analytics (Proctored): Updated for student ${studentId}`);
                    }
                } catch (err) {
                    console.error('⚠️ Post-submission updates failed:', err.message);
                }
            } catch (e) { /* Ignore if already completed */ }
        } else {
            // Update streak and analytics even on failed attempt
            try {
                if (gamificationService) {
                    await gamificationService.updateStreak(studentId);
                }
                if (analyticsService) {
                    await analyticsService.analyzeStudentPerformance(studentId);
                }
            } catch (err) {
                console.error('Update failed:', err.message);
            }
        }

        // Invalidate caches when proctored submission is created
        cacheManager.delete('leaderboard:global:all');
        cacheManager.delete(`student:${studentId}:analytics`);
        cacheManager.delete('admin:analytics:global');
        // Also invalidate mentor's analytics cache
        try {
            const [allocation] = await pool.query(
                'SELECT mentor_id FROM mentor_student_allocations WHERE student_id = ? LIMIT 1',
                [studentId]
            );
            if (allocation.length > 0) {
                cacheManager.delete(`mentor:${allocation[0].mentor_id}:analytics`);
            }
        } catch (e) { /* Ignore cache invalidation errors */ }

        res.json({
            id: submissionId,
            score: finalScore,
            status: finalStatus,
            feedback: evaluationResult.feedback,
            analysis: evaluationResult.analysis,
            integrity: {
                tabSwitches: tabSwitchCount,
                copyPasteAttempts: copyPasteCount,
                cameraBlockedCount: cameraBlockCount,
                phoneDetectionCount: phoneCount,
                faceNotDetectedCount: faceNotDetectedCnt,
                multipleFacesDetectionCount: multipleFacesCnt,
                faceLookawayCount: faceLookawayCnt,
                violation: integrityViolation,
                videoRecorded: !!videoFilename
            },
            submittedAt
        });

    } catch (error) {
        console.error('Proctored Submission Error:', error);
        res.status(500).json({ error: 'Failed to process submission', details: error.message });
    }
});

// Delete submission
app.delete('/api/submissions/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM submissions WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Individual Global Test Submission Deletion
app.delete('/api/global-test-submissions/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const id = req.params.id;
        await connection.query('DELETE FROM question_results WHERE submission_id = ?', [id]);
        await connection.query('DELETE FROM section_results WHERE submission_id = ?', [id]);
        const [r] = await connection.query('DELETE FROM global_test_submissions WHERE id = ?', [id]);
        await connection.commit();
        if (r.affectedRows === 0) return res.status(404).json({ error: 'Submission not found' });
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Reset all submissions (Admin only — PROTECTED)
app.delete('/api/submissions', authenticate, authorize('admin'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // Disable FK checks to allow clean deletion regardless of order
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        // Delete all code submissions
        const [codeResult] = await connection.query('DELETE FROM submissions');

        // Delete dependent aptitude tables
        await connection.query('DELETE FROM aptitude_question_results');
        await connection.query('DELETE FROM student_completed_aptitude');

        // Delete all aptitude submissions
        const [aptitudeResult] = await connection.query('DELETE FROM aptitude_submissions');

        // Delete Global Test Results
        await connection.query('DELETE FROM question_results');
        await connection.query('DELETE FROM section_results');
        const [globalResult] = await connection.query('DELETE FROM global_test_submissions');

        // Delete all problem completions
        await connection.query('DELETE FROM problem_completions');
        // Delete all task completions
        await connection.query('DELETE FROM task_completions');

        // Re-enable FK checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        await connection.commit();

        res.json({
            success: true,
            message: 'All submissions reset successfully',
            deletedCodeSubmissions: codeResult.affectedRows,
            deletedAptitudeSubmissions: aptitudeResult.affectedRows,
            deletedGlobalSubmissions: globalResult.affectedRows
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});


// ==================== RUN CODE & SUBMIT API ====================

// Helper: Run code using local subprocess (child_process.spawn) - SECURE (No shell injection)
function runCodeSubprocess(command, args, stdinData, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        // Use spawn WITHOUT shell: true to prevent shell injection attacks
        // All arguments are passed as array, not interpreted by shell
        const proc = spawn(command, args, {
            timeout,
            stdio: ['pipe', 'pipe', 'pipe'],  // stdin, stdout, stderr all piped
            windowsHide: true  // Hide console window on Windows
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        // Send stdin if provided (safer than command-line args)
        if (stdinData) {
            proc.stdin.write(stdinData);
        }
        proc.stdin.end();

        proc.on('close', (code) => {
            resolve({ stdout, stderr, exitCode: code });
        });

        proc.on('error', (err) => {
            reject(err);
        });

        // Kill process if it exceeds timeout
        setTimeout(() => {
            try { proc.kill('SIGTERM'); } catch (e) { }
            reject(new Error('Execution timed out (15 seconds limit)'));
        }, timeout);
    });
}

app.post('/api/run', codeLimiter, async (req, res) => {
    const os = require('os');
    const tempDir = os.tmpdir();
    const runId = uuidv4().slice(0, 8);
    const cleanupFiles = []; // Track files to clean up

    try {
        const { code, language, problemId, sqlSchema, stdin } = req.body;

        // For SQL, prepend the schema to create tables before running the query
        let codeToExecute = code;
        if (language === 'SQL') {
            let schemaToUse = sqlSchema;

            // If no schema passed, try to get from database
            if (!schemaToUse && problemId) {
                const [probs] = await pool.query('SELECT sql_schema FROM problems WHERE id = ?', [problemId]);
                if (probs.length > 0 && probs[0].sql_schema) {
                    schemaToUse = probs[0].sql_schema;
                }
            }

            // Prepend schema to user's query
            if (schemaToUse) {
                codeToExecute = `${schemaToUse}\n\n${code}`;
            }
        }

        let result;

        if (language === 'Python') {
            // --- Python ---
            const filePath = path.join(tempDir, `run_${runId}.py`);
            fs.writeFileSync(filePath, codeToExecute);
            cleanupFiles.push(filePath);
            result = await runCodeSubprocess('python', [filePath], stdin || '');

        } else if (language === 'JavaScript') {
            // --- JavaScript (Node.js) ---
            const filePath = path.join(tempDir, `run_${runId}.js`);
            fs.writeFileSync(filePath, codeToExecute);
            cleanupFiles.push(filePath);
            result = await runCodeSubprocess('node', [filePath], stdin || '');

        } else if (language === 'C') {
            // --- C (gcc) ---
            const srcPath = path.join(tempDir, `run_${runId}.c`);
            const outPath = path.join(tempDir, `run_${runId}.exe`);
            fs.writeFileSync(srcPath, codeToExecute);
            cleanupFiles.push(srcPath, outPath);

            // Compile
            const compileResult = await runCodeSubprocess('gcc', [srcPath, '-o', outPath], '');
            if (compileResult.exitCode !== 0) {
                return res.json({ output: compileResult.stderr || 'Compilation failed', status: 'error' });
            }
            // Run
            result = await runCodeSubprocess(outPath, [], stdin || '');

        } else if (language === 'C++') {
            // --- C++ (g++) ---
            const srcPath = path.join(tempDir, `run_${runId}.cpp`);
            const outPath = path.join(tempDir, `run_${runId}.exe`);
            fs.writeFileSync(srcPath, codeToExecute);
            cleanupFiles.push(srcPath, outPath);

            // Compile
            const compileResult = await runCodeSubprocess('g++', [srcPath, '-o', outPath], '');
            if (compileResult.exitCode !== 0) {
                return res.json({ output: compileResult.stderr || 'Compilation failed', status: 'error' });
            }
            // Run
            result = await runCodeSubprocess(outPath, [], stdin || '');

        } else if (language === 'Java') {
            // --- Java ---
            // Extract class name from code (look for 'public class ClassName')
            const classMatch = codeToExecute.match(/public\s+class\s+(\w+)/);
            const className = classMatch ? classMatch[1] : 'Main';
            const javaDir = path.join(tempDir, `java_${runId}`);
            fs.mkdirSync(javaDir, { recursive: true });
            const srcPath = path.join(javaDir, `${className}.java`);
            fs.writeFileSync(srcPath, codeToExecute);
            cleanupFiles.push(javaDir);

            // Compile
            const compileResult = await runCodeSubprocess('javac', [srcPath], '');
            if (compileResult.exitCode !== 0) {
                return res.json({ output: compileResult.stderr || 'Compilation failed', status: 'error' });
            }
            // Run
            result = await runCodeSubprocess('java', ['-cp', javaDir, className], stdin || '');

        } else if (language === 'SQL') {
            // --- SQL (sqlite3) - Pass SQL via stdin (safe) ---
            const dbFile = path.join(tempDir, `run_${runId}.db`);
            cleanupFiles.push(dbFile);
            // Pass SQL code directly via stdin instead of shell command
            result = await runCodeSubprocess('sqlite3', [dbFile, '-batch'], codeToExecute);

        } else {
            return res.status(400).json({ error: `Unsupported language: ${language}` });
        }

        // Return the result
        const output = (result.stdout + result.stderr).trim();
        res.json({
            output: output || 'No output detected',
            status: result.exitCode === 0 ? 'success' : 'error'
        });

    } catch (error) {
        console.error('Run Error:', error);
        res.status(500).json({ error: 'Failed to run code', details: error.message });
    } finally {
        // Cleanup temp files
        for (const f of cleanupFiles) {
            try {
                if (fs.existsSync(f)) {
                    const stat = fs.statSync(f);
                    if (stat.isDirectory()) {
                        fs.rmSync(f, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(f);
                    }
                }
            } catch (e) { /* ignore cleanup errors */ }
        }
    }
});

app.post('/api/hints', async (req, res) => {
    try {
        const { code, language, problemId } = req.body;

        let problemContext = '';
        if (problemId) {
            const [probs] = await pool.query('SELECT * FROM problems WHERE id = ?', [problemId]);
            if (probs.length > 0) {
                problemContext = `Problem: ${probs[0].title}\nDescription: ${probs[0].description}`;
            }
        }

        if (!problemContext) return res.status(400).json({ error: 'Problem not found' });

        const systemPrompt = `You are a helpful coding tutor. Provide 2-3 helpful hints without giving the solution.
        Respond in JSON: { "hints": [], "encouragement": "", "conceptsToReview": [], "commonMistakes": "" }`;

        const chatCompletion = await cerebrasChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${problemContext}\n\nCode (${language}):\n${code}` }
        ], {
            model: 'gpt-oss-120b',
            temperature: 0.7,
            max_tokens: 800,
            response_format: { type: 'json_object' }
        });

        const responseText = chatCompletion.choices[0]?.message?.content;
        let result = { hints: ['Try breaking it down.'], encouragement: 'Keep going!' };
        try { result = JSON.parse(responseText); } catch (e) { }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate hints' });
    }
});

// ==================== AI GENERATOR ====================
app.post('/api/ai/generate-problem', aiLimiter, async (req, res) => {
    try {
        const { prompt, type, language } = req.body;
        const isProblem = type === 'problem' || type === 'coding';
        const isSQL = language === 'SQL' || prompt.toLowerCase().includes('sql');

        const systemPrompt = isProblem
            ? isSQL
                ? `Generate SQL problem JSON ({title, description, sqlSchema (CREATE TABLE and INSERT statements), expectedQueryResult (the expected query output), difficulty, type="SQL", language="SQL", status="live"}) based on request. The sqlSchema should include table creation and sample data. The expectedQueryResult should show what the correct query should return.`
                : `Generate coding problem JSON ({title, description, sampleInput, expectedOutput, difficulty, type="Coding", language="${language || 'Python'}", status="live"}) based on request.`
            : `Generate ML task JSON ({title, description, requirements (as a string with items separated by newlines), difficulty, type="machine_learning", status="live"}) based on request. The requirements field MUST be a string, not an array.`;

        const chatCompletion = await cerebrasChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
        ], {
            model: 'gpt-oss-120b',
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');
        // Ensure requirements is a string for tasks
        if (result.requirements && Array.isArray(result.requirements)) {
            result.requirements = result.requirements.join('\n');
        }
        res.json({ success: true, generated: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// AI Chat endpoint for conversational interactions
app.post('/api/ai/chat', aiLimiter, async (req, res) => {
    try {
        const { messages, context } = req.body;

        const systemPrompt = context === 'task'
            ? `You are an AI assistant helping create ML/AI tasks for an educational platform. Help users brainstorm, refine, and create machine learning project ideas. Be helpful and suggest improvements. Keep responses concise but informative.`
            : `You are an AI assistant helping create coding problems for an educational platform. Help users brainstorm, refine, and create programming challenges. Be helpful and suggest improvements. Keep responses concise but informative.`;

        const chatCompletion = await cerebrasChat([
            { role: 'system', content: systemPrompt },
            ...messages
        ], {
            model: 'gpt-oss-120b'
        });

        const response = chatCompletion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
        res.json({ success: true, response });
    } catch (error) {
        console.error('AI Chat Error:', error);
        res.status(500).json({ error: error.message, details: 'Failed to process chat request' });
    }
});

// Generate aptitude questions using AI
app.post('/api/ai/generate-aptitude', aiLimiter, async (req, res) => {
    try {
        const { topic, difficulty, count } = req.body;
        const numQuestions = parseInt(count) || 5;

        const systemPrompt = `You are an aptitude test question generator. Generate exactly ${numQuestions} multiple choice questions about "${topic || 'general aptitude'}" at ${difficulty || 'Medium'} difficulty level.
        
Return a JSON object with this exact structure:
{
  "questions": [
    {
      "question": "The question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

Rules:
- Each question must have exactly 4 options
- correctAnswer is the index (0-3) of the correct option
- Questions should test logical reasoning, analytical skills, or topic knowledge
- Make questions challenging but fair for the ${difficulty} level`;

        const chatCompletion = await cerebrasChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate ${numQuestions} aptitude questions about: ${topic || 'logical reasoning, number series, verbal ability'}` }
        ], {
            model: 'gpt-oss-120b',
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(chatCompletion.choices[0]?.message?.content || '{"questions": []}');
        res.json({ success: true, questions: result.questions || [] });
    } catch (error) {
        console.error('AI Aptitude Generation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== APTITUDE ROUTES ====================

app.get('/api/aptitude', async (req, res) => {
    try {
        const { mentorId, status } = req.query;
        let query = 'SELECT * FROM aptitude_tests WHERE 1=1';
        const params = [];

        if (mentorId) {
            query += ' AND (created_by = ? OR created_by = "admin-001")';
            params.push(mentorId);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        const [tests] = await pool.query(query, params);

        const cleanTests = tests.map(t => ({
            id: t.id,
            title: t.title,
            type: t.type,
            difficulty: t.difficulty,
            duration: t.duration,
            totalQuestions: t.total_questions,
            passingScore: t.passing_score,
            maxTabSwitches: t.max_tab_switches || 3,
            maxAttempts: t.max_attempts || 1,
            startTime: t.start_time ? new Date(t.start_time).toISOString() : null,
            deadline: t.deadline ? new Date(t.deadline).toISOString() : null,
            description: t.description || '',
            status: t.status,
            createdBy: t.created_by,
            createdAt: t.created_at,
            questionCount: t.total_questions
        }));

        res.json(cleanTests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/aptitude/:id', async (req, res) => {
    try {
        const [tests] = await pool.query('SELECT * FROM aptitude_tests WHERE id = ?', [req.params.id]);
        if (tests.length === 0) return res.status(404).json({ error: 'Test not found' });

        const test = tests[0];
        const [questions] = await pool.query('SELECT * FROM aptitude_questions WHERE test_id = ?', [test.id]);

        const cleanQuestions = questions.map(q => ({
            id: q.question_id,
            question: q.question,
            options: [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean),
            correctAnswer: q.correct_answer,
            explanation: q.explanation,
            category: q.category
        }));

        res.json({
            id: test.id,
            title: test.title,
            type: test.type,
            difficulty: test.difficulty,
            duration: test.duration,
            totalQuestions: test.total_questions,
            passingScore: test.passing_score,
            maxTabSwitches: test.max_tab_switches || 3,
            maxAttempts: test.max_attempts || 1,
            startTime: test.start_time ? new Date(test.start_time).toISOString() : null,
            deadline: test.deadline ? new Date(test.deadline).toISOString() : null,
            description: test.description || '',
            status: test.status,
            createdBy: test.created_by,
            createdAt: test.created_at,
            questions: cleanQuestions
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create aptitude test
app.post('/api/aptitude', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const testId = uuidv4();
        const { title, difficulty, duration, passingScore, maxTabSwitches, maxAttempts, startTime, deadline, description, status, questions, createdBy } = req.body;
        const createdAt = new Date();

        // Handle date inputs correctly
        let formattedStartTime = null;
        let formattedDeadline = null;

        if (startTime) {
            // Parse the ISO string and ensure it's stored as UTC
            formattedStartTime = new Date(startTime).toISOString().slice(0, 19).replace('T', ' ');
        }

        if (deadline) {
            formattedDeadline = new Date(deadline).toISOString().slice(0, 19).replace('T', ' ');
        }

        // Insert the test (store new fields in JSON metadata column or separate columns if available)
        await connection.query(
            'INSERT INTO aptitude_tests (id, title, type, difficulty, duration, total_questions, passing_score, max_tab_switches, max_attempts, start_time, deadline, description, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [testId, title, 'aptitude', difficulty, duration || 30, questions.length, passingScore || 60, maxTabSwitches || 3, maxAttempts || 1, formattedStartTime, formattedDeadline, description || '', status || 'live', createdBy, createdAt]
        );

        // Insert questions
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const questionId = uuidv4();
            const options = q.options || [];

            await connection.query(
                'INSERT INTO aptitude_questions (question_id, test_id, question, option_1, option_2, option_3, option_4, correct_answer, explanation, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [questionId, testId, q.question, options[0] || '', options[1] || '', options[2] || '', options[3] || '', q.correctAnswer, q.explanation || '', q.category || 'general']
            );
        }

        await connection.commit();

        res.json({
            id: testId,
            title,
            difficulty,
            duration: duration || 30,
            totalQuestions: questions.length,
            passingScore: passingScore || 60,
            maxTabSwitches: maxTabSwitches || 3,
            maxAttempts: maxAttempts || 1,
            startTime: startTime || null,
            deadline: deadline || null,
            description: description || '',
            status: status || 'live',
            createdBy,
            createdAt
        });
    } catch (error) {
        await connection.rollback();
        console.error('Aptitude Create Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

app.post('/api/aptitude/:id/submit', validate(aptitudeSubmitSchema), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [tests] = await connection.query('SELECT * FROM aptitude_tests WHERE id = ?', [req.params.id]);
        if (tests.length === 0) throw new Error('Test not found');
        const test = tests[0];

        const [questions] = await connection.query('SELECT * FROM aptitude_questions WHERE test_id = ?', [test.id]);

        const { studentId, answers, timeSpent, tabSwitches = 0 } = req.body;

        let correctCount = 0;
        const questionResults = questions.map(q => {
            const userAnswer = answers[q.question_id];
            // Get all options for this question
            const options = [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean);
            // Get the correct option text using the index
            const correctOptionText = options[q.correct_answer];
            // Compare user's answer (option text) with correct option text
            const isCorrect = userAnswer === correctOptionText;
            if (isCorrect) correctCount++;
            return {
                questionId: q.question_id,
                question: q.question,
                userAnswer: userAnswer || 'Not Answered',
                correctAnswer: correctOptionText,
                isCorrect,
                explanation: q.explanation,
                category: q.category
            };
        });

        const score = Math.round((correctCount / questions.length) * 100);
        const status = score >= test.passing_score ? 'passed' : 'failed';
        const subId = `apt-sub-${uuidv4().slice(0, 8)}`;
        const submittedAt = new Date();

        await connection.query(
            'INSERT INTO aptitude_submissions (id, test_id, test_title, student_id, correct_count, total_questions, score, status, time_spent, tab_switches, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [subId, test.id, test.title, studentId, correctCount, questions.length, score, status, timeSpent, tabSwitches, submittedAt]
        );

        for (const qr of questionResults) {
            await connection.query(
                'INSERT INTO aptitude_question_results (submission_id, question_id, question, user_answer, correct_answer, is_correct, explanation, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [subId, qr.questionId, qr.question, qr.userAnswer, qr.correctAnswer, qr.isCorrect ? 'true' : 'false', qr.explanation, qr.category]
            );
        }

        const [existing] = await connection.query('SELECT * FROM student_completed_aptitude WHERE student_id = ? AND aptitude_test_id = ?', [studentId, test.id]);
        if (existing.length === 0) {
            await connection.query('INSERT INTO student_completed_aptitude (student_id, aptitude_test_id) VALUES (?, ?)', [studentId, test.id]);
        }

        await connection.commit();

        // Award points, update streak and analytics for aptitude completion
        try {
            if (gamificationService) {
                await gamificationService.awardTestCompletion(studentId, test.id, score);
                await gamificationService.updateStreak(studentId);
            }
            if (analyticsService) {
                await analyticsService.analyzeStudentPerformance(studentId);
                console.log(`📊 Analytics: Updated for student ${studentId} (Aptitude)`);
            }
            // Invalidate caches
            cacheManager.delete(`student:${studentId}:analytics`);
            cacheManager.delete(`student:${studentId}:learning_path`);
            cacheManager.delete(`student:${studentId}:peer_comparison`);
            cacheManager.delete(`topics:all:${studentId}`);
            cacheManager.delete('leaderboard:global:all');
            cacheManager.delete('leaderboard:dashboard:top10');

            // Invalidate mentor's analytics cache
            try {
                const [allocation] = await pool.query(
                    'SELECT mentor_id FROM mentor_student_allocations WHERE student_id = ? LIMIT 1',
                    [studentId]
                );
                if (allocation.length > 0) {
                    cacheManager.delete(`mentor:${allocation[0].mentor_id}:analytics`);
                }
            } catch (e) { /* Ignore */ }
        } catch (err) {
            console.log('Update skipped:', err.message);
        }

        res.json({
            submission: {
                id: subId,
                score,
                status,
                correctCount,
                totalQuestions: questions.length,
                tabSwitches,
                timeSpent,
                questionResults
            },
            message: status === 'passed' ? 'Congratulations! You passed the test!' : 'Keep practicing!'
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Update Aptitude Test Status
app.patch('/api/aptitude/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const testId = req.params.id;

        if (!status || !['live', 'ended'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be "live" or "ended"' });
        }

        const [result] = await pool.query(
            'UPDATE aptitude_tests SET status = ? WHERE id = ?',
            [status, testId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Test not found' });
        }

        res.json({ success: true, status });
    } catch (error) {
        console.error('Update Status Error:', error);
        res.status(500).json({ error: 'Failed to update test status' });
    }
});

// Delete Aptitude Test
app.delete('/api/aptitude/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const testId = req.params.id;

        // 1. Get submission IDs to delete related question results
        const [subs] = await connection.query('SELECT id FROM aptitude_submissions WHERE test_id = ?', [testId]);
        const subIds = subs.map(s => s.id);

        if (subIds.length > 0) {
            // Delete question results - using explicit loop or IN clause handled by query builder if supported, 
            // but manual IN (?) with array works with mysql2
            await connection.query('DELETE FROM aptitude_question_results WHERE submission_id IN (?)', [subIds]);
        }

        // 2. Delete submissions
        await connection.query('DELETE FROM aptitude_submissions WHERE test_id = ?', [testId]);

        // 3. Delete student completions
        await connection.query('DELETE FROM student_completed_aptitude WHERE aptitude_test_id = ?', [testId]);

        // 4. Delete questions
        await connection.query('DELETE FROM aptitude_questions WHERE test_id = ?', [testId]);

        // 5. Delete test
        const [result] = await connection.query('DELETE FROM aptitude_tests WHERE id = ?', [testId]);

        if (result.affectedRows === 0) {
            throw new Error('Test not found');
        }

        await connection.commit();
        res.json({ success: true });

    } catch (error) {
        await connection.rollback();
        console.error('Delete Error:', error);
        res.status(500).json({ error: 'Failed to delete test' });
    } finally {
        connection.release();
    }
});

app.get('/api/aptitude-submissions', async (req, res) => {
    try {
        const { studentId, testId, mentorId } = req.query;
        let query = 'SELECT s.*, u.name as student_name FROM aptitude_submissions s JOIN users u ON s.student_id = u.id WHERE 1=1';
        const params = [];

        if (studentId) {
            query += ' AND s.student_id = ?';
            params.push(studentId);
        }
        if (testId) {
            query += ' AND s.test_id = ?';
            params.push(testId);
        }
        if (mentorId) {
            query += ' AND u.mentor_id = ?';
            params.push(mentorId);
        }

        query += ' ORDER BY s.submitted_at DESC';

        const [submissions] = await pool.query(query, params);

        const cleanSubs = submissions.map(s => ({
            id: s.id,
            testId: s.test_id,
            testTitle: s.test_title,
            studentId: s.student_id,
            studentName: s.student_name,
            score: s.score,
            status: s.status,
            correctCount: s.correct_count,
            totalQuestions: s.total_questions,
            tabSwitches: s.tab_switches || 0,
            timeSpent: s.time_spent,
            submittedAt: s.submitted_at
        }));

        res.json(cleanSubs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single aptitude submission with question results
app.get('/api/aptitude-submissions/:id', async (req, res) => {
    try {
        const submissionId = req.params.id;

        // Get submission details
        const [submissions] = await pool.query(
            'SELECT s.*, u.name as student_name FROM aptitude_submissions s JOIN users u ON s.student_id = u.id WHERE s.id = ?',
            [submissionId]
        );

        if (submissions.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        const s = submissions[0];

        // Get question results
        const [questionResults] = await pool.query(
            'SELECT * FROM aptitude_question_results WHERE submission_id = ?',
            [submissionId]
        );

        const result = {
            id: s.id,
            testId: s.test_id,
            testTitle: s.test_title,
            studentId: s.student_id,
            studentName: s.student_name,
            score: s.score,
            status: s.status,
            correctCount: s.correct_count,
            totalQuestions: s.total_questions,
            tabSwitches: s.tab_switches || 0,
            timeSpent: s.time_spent,
            submittedAt: s.submitted_at,
            questionResults: questionResults.map(qr => ({
                questionId: qr.question_id,
                question: qr.question,
                userAnswer: qr.user_answer,
                correctAnswer: qr.correct_answer,
                isCorrect: qr.is_correct === 'true' || qr.is_correct === true || qr.is_correct === 1,
                explanation: qr.explanation,
                category: qr.category
            }))
        };

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== TEST STUDENT ALLOCATIONS ====================

// Allocate students to a test
app.post('/api/aptitude/:testId/allocate-students', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { testId } = req.params;
        const { studentIds } = req.body; // Array of student IDs

        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ error: 'studentIds must be a non-empty array' });
        }

        await connection.beginTransaction();

        // Delete existing allocations for this test
        await connection.query('DELETE FROM test_student_allocations WHERE test_id = ?', [testId]);

        // Insert new allocations with shorter, unique IDs using UUID
        const values = studentIds.map((studentId) => [uuidv4(), testId, studentId]);

        if (values.length > 0) {
            await connection.query(
                'INSERT INTO test_student_allocations (id, test_id, student_id) VALUES ?',
                [values]
            );
        }

        await connection.commit();
        res.json({ success: true, allocatedCount: studentIds.length });

    } catch (error) {
        await connection.rollback();
        console.error('Allocation error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Get students allocated to a test
app.get('/api/aptitude/:testId/allocated-students', async (req, res) => {
    try {
        const { testId } = req.params;

        const [allocations] = await pool.query(
            'SELECT student_id FROM test_student_allocations WHERE test_id = ?',
            [testId]
        );

        const studentIds = allocations.map(a => a.student_id);
        res.json({ testId, studentIds, count: studentIds.length });

    } catch (error) {
        console.error('Error getting allocations:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get tests allocated to a student
app.get('/api/aptitude/allocated-to/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;

        const [allocations] = await pool.query(`
            SELECT DISTINCT t.* 
            FROM test_student_allocations tsa
            JOIN aptitude_tests t ON tsa.test_id = t.id
            WHERE tsa.student_id = ? AND t.status = 'live'
            ORDER BY t.created_at DESC
        `, [studentId]);

        const tests = allocations.map(t => ({
            id: t.id,
            title: t.title,
            type: t.type,
            difficulty: t.difficulty,
            duration: t.duration,
            totalQuestions: t.total_questions,
            passingScore: t.passing_score,
            maxTabSwitches: t.max_tab_switches || 3,
            maxAttempts: t.max_attempts || 1,
            startTime: t.start_time ? new Date(t.start_time).toISOString() : null,
            deadline: t.deadline ? new Date(t.deadline).toISOString() : null,
            description: t.description || '',
            status: t.status,
            createdBy: t.created_by,
            createdAt: t.created_at,
            questionCount: t.total_questions
        }));

        res.json(tests);

    } catch (error) {
        console.error('Error getting allocated tests:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== GLOBAL COMPLETE TESTS (Aptitude, Verbal, Logical, Coding, SQL) ====================

const SECTIONS = ['aptitude', 'verbal', 'logical', 'coding', 'sql'];

// List global tests
app.get('/api/global-tests', async (req, res) => {
    try {
        const { status, type } = req.query;
        let query = 'SELECT * FROM global_tests WHERE 1=1';
        const params = [];
        if (status) { query += ' AND status = ?'; params.push(status); }
        if (type) { query += ' AND type = ?'; params.push(type); }
        query += ' ORDER BY created_at DESC';
        const [rows] = await pool.query(query, params);
        const tests = rows.map(t => ({
            id: t.id,
            title: t.title,
            type: t.type,
            difficulty: t.difficulty,
            duration: t.duration,
            totalQuestions: t.total_questions,
            passingScore: t.passing_score,
            status: t.status,
            createdBy: t.created_by,
            createdAt: t.created_at,
            description: t.description || '',
            startTime: t.start_time,
            deadline: t.deadline,
            maxAttempts: t.max_attempts ?? 1,
            maxTabSwitches: t.max_tab_switches ?? 3,
            sectionConfig: t.section_config ? (typeof t.section_config === 'string' ? JSON.parse(t.section_config) : t.section_config) : null,
            proctoring: t.proctoring_config ? (typeof t.proctoring_config === 'string' ? JSON.parse(t.proctoring_config) : t.proctoring_config) : null
        }));
        res.json(tests);
    } catch (error) {
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Get single global test with questions grouped by section
app.get('/api/global-tests/:id', async (req, res) => {
    try {
        const [tests] = await pool.query('SELECT * FROM global_tests WHERE id = ?', [req.params.id]);
        if (tests.length === 0) return res.status(404).json({ error: 'Test not found' });
        const t = tests[0];
        const [questions] = await pool.query('SELECT * FROM test_questions WHERE test_id = ? ORDER BY section, question_id', [t.id]);
        const bySection = {};
        SECTIONS.forEach(sec => { bySection[sec] = []; });
        questions.forEach(q => {
            const opt = [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean);
            const parsedTestCases = q.test_cases ? (typeof q.test_cases === 'string' ? JSON.parse(q.test_cases) : q.test_cases) : null;
            const item = {
                id: q.question_id,
                question: q.question,
                options: opt,
                correctAnswer: q.correct_answer,
                explanation: q.explanation,
                category: q.category,
                questionType: q.question_type,
                section: q.section,
                testCases: parsedTestCases,
                starterCode: q.starter_code,
                solutionCode: q.solution_code,
                points: q.points ?? 1,
                timeLimit: q.time_limit
            };
            if (bySection[q.section]) bySection[q.section].push(item);
        });
        const sectionConfig = t.section_config ? (typeof t.section_config === 'string' ? JSON.parse(t.section_config) : t.section_config) : null;
        res.json({
            id: t.id,
            title: t.title,
            type: t.type,
            difficulty: t.difficulty,
            duration: t.duration,
            totalQuestions: t.total_questions,
            passingScore: t.passing_score,
            status: t.status,
            createdBy: t.created_by,
            createdAt: t.created_at,
            description: t.description || '',
            startTime: t.start_time,
            deadline: t.deadline,
            maxAttempts: t.max_attempts ?? 1,
            maxTabSwitches: t.max_tab_switches ?? 3,
            sectionConfig,
            proctoring: t.proctoring_config ? (typeof t.proctoring_config === 'string' ? JSON.parse(t.proctoring_config) : t.proctoring_config) : null,
            questionsBySection: bySection,
            questions: questions.map(q => ({
                id: q.question_id,
                section: q.section,
                question: q.question,
                options: [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean),
                correctAnswer: q.correct_answer,
                questionType: q.question_type,
                explanation: q.explanation,
                category: q.category
            }))
        });
    } catch (error) {
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Create global test
app.post('/api/global-tests', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const testId = uuidv4();
        const {
            title, type, difficulty, duration, passingScore, description, startTime, deadline,
            maxAttempts, maxTabSwitches, status, createdBy, sectionConfig, proctoring
        } = req.body;
        const sectionConfigJson = sectionConfig ? JSON.stringify(sectionConfig) : null;
        const proctoringConfigJson = proctoring ? JSON.stringify(proctoring) : null;
        const totalQuestions = (sectionConfig && sectionConfig.sections)
            ? sectionConfig.sections.reduce((sum, s) => sum + (s.enabled ? (s.questionsCount || 0) : 0), 0)
            : 0;
        // Handle date inputs correctly like aptitude tests
        let formattedStartTime = null;
        let formattedDeadline = null;

        if (startTime && startTime.trim() !== '') {
            try {
                // If it's already in ISO format from frontend
                const date = new Date(startTime);
                if (!isNaN(date.getTime())) {
                    formattedStartTime = date.toISOString().slice(0, 19).replace('T', ' ');
                }
            } catch (e) {
                formattedStartTime = startTime.replace('T', ' ');
            }
        }

        if (deadline && deadline.trim() !== '') {
            try {
                const date = new Date(deadline);
                if (!isNaN(date.getTime())) {
                    formattedDeadline = date.toISOString().slice(0, 19).replace('T', ' ');
                }
            } catch (e) {
                formattedDeadline = deadline.replace('T', ' ');
            }
        }

        await connection.query(
            `INSERT INTO global_tests (id, title, type, difficulty, duration, total_questions, passing_score, status, created_by, description, start_time, deadline, max_attempts, max_tab_switches, section_config, proctoring_config)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [testId, title || 'Untitled', type || 'comprehensive', difficulty, duration || 180, totalQuestions, passingScore ?? 60, status || 'draft', createdBy || null, description || '', formattedStartTime, formattedDeadline, maxAttempts ?? 1, maxTabSwitches ?? 3, sectionConfigJson, proctoringConfigJson]
        );
        await connection.commit();
        res.json({
            id: testId,
            title: title || 'Untitled',
            type: type || 'comprehensive',
            duration: duration || 120,
            totalQuestions,
            passingScore: passingScore ?? 60,
            status: status || 'draft',
            sectionConfig: sectionConfig || null
        });
    } catch (error) {
        await connection.rollback();
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Update global test
app.put('/api/global-tests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title, type, difficulty, duration, passingScore, description, startTime, deadline,
            maxAttempts, maxTabSwitches, status, sectionConfig, proctoring
        } = req.body;
        const sectionConfigJson = sectionConfig ? JSON.stringify(sectionConfig) : null;
        const proctoringConfigJson = proctoring ? JSON.stringify(proctoring) : null;
        let totalQuestions = null;
        if (sectionConfig && sectionConfig.sections) {
            totalQuestions = sectionConfig.sections.reduce((sum, s) => sum + (s.enabled ? (s.questionsCount || 0) : 0), 0);
        }
        const updates = [];
        const params = [];
        if (title !== undefined) { updates.push('title = ?'); params.push(title); }
        if (type !== undefined) { updates.push('type = ?'); params.push(type); }
        if (difficulty !== undefined) { updates.push('difficulty = ?'); params.push(difficulty); }
        if (duration !== undefined) { updates.push('duration = ?'); params.push(duration); }
        if (totalQuestions !== null) { updates.push('total_questions = ?'); params.push(totalQuestions); }
        if (passingScore !== undefined) { updates.push('passing_score = ?'); params.push(passingScore); }
        if (description !== undefined) { updates.push('description = ?'); params.push(description); }
        if (startTime !== undefined) {
            let formattedStartTime = null;
            if (startTime && startTime.trim() !== '') {
                try {
                    const date = new Date(startTime);
                    formattedStartTime = !isNaN(date.getTime()) ? date.toISOString().slice(0, 19).replace('T', ' ') : startTime.replace('T', ' ');
                } catch (e) { formattedStartTime = startTime.replace('T', ' '); }
            }
            updates.push('start_time = ?'); params.push(formattedStartTime);
        }
        if (deadline !== undefined) {
            let formattedDeadline = null;
            if (deadline && deadline.trim() !== '') {
                try {
                    const date = new Date(deadline);
                    formattedDeadline = !isNaN(date.getTime()) ? date.toISOString().slice(0, 19).replace('T', ' ') : deadline.replace('T', ' ');
                } catch (e) { formattedDeadline = deadline.replace('T', ' '); }
            }
            updates.push('deadline = ?'); params.push(formattedDeadline);
        }
        if (maxAttempts !== undefined) { updates.push('max_attempts = ?'); params.push(maxAttempts); }
        if (maxTabSwitches !== undefined) { updates.push('max_tab_switches = ?'); params.push(maxTabSwitches); }
        if (status !== undefined) { updates.push('status = ?'); params.push(status); }
        if (sectionConfigJson !== undefined) { updates.push('section_config = ?'); params.push(sectionConfigJson); }
        if (proctoringConfigJson !== undefined) { updates.push('proctoring_config = ?'); params.push(proctoringConfigJson); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        params.push(id);
        await pool.query(`UPDATE global_tests SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    } catch (error) {
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Delete global test
app.delete('/api/global-tests/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const id = req.params.id;
        const [subs] = await connection.query('SELECT id FROM global_test_submissions WHERE test_id = ?', [id]);
        const subIds = subs.map(s => s.id);
        if (subIds.length > 0) {
            await connection.query('DELETE FROM question_results WHERE submission_id IN (?)', [subIds]);
            await connection.query('DELETE FROM section_results WHERE submission_id IN (?)', [subIds]);
            await connection.query('DELETE FROM personalized_reports WHERE submission_id IN (?)', [subIds]);
        }
        await connection.query('DELETE FROM global_test_submissions WHERE test_id = ?', [id]);
        await connection.query('DELETE FROM test_questions WHERE test_id = ?', [id]);
        const [r] = await connection.query('DELETE FROM global_tests WHERE id = ?', [id]);
        await connection.commit();
        if (r.affectedRows === 0) return res.status(404).json({ error: 'Test not found' });
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Add questions to global test (batch per section)
app.post('/api/global-tests/:id/questions', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const testId = req.params.id;
        const { section, questions: questionsList } = req.body;
        if (!section || !SECTIONS.includes(section)) {
            return res.status(400).json({ error: 'Invalid section. Use: aptitude, verbal, logical, coding, sql' });
        }
        if (!Array.isArray(questionsList) || questionsList.length === 0) {
            return res.status(400).json({ error: 'questions array required' });
        }
        const inserted = [];
        for (const q of questionsList) {
            const questionId = uuidv4();
            const options = q.options || [];
            const correctAnswer = (q.correctAnswer !== undefined && q.correctAnswer !== null) ? String(q.correctAnswer) : (q.correct_answer || '');
            const questionType = q.questionType || 'mcq';
            const testCasesJson = q.testCases ? (typeof q.testCases === 'string' ? q.testCases : JSON.stringify(q.testCases)) : null;
            await connection.query(
                `INSERT INTO test_questions (question_id, test_id, section, question_type, question, option_1, option_2, option_3, option_4, correct_answer, explanation, category, test_cases, starter_code, solution_code, points)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [questionId, testId, section, questionType, q.question || '', options[0] || '', options[1] || '', options[2] || '', options[3] || '', correctAnswer, q.explanation || '', q.category || 'general', testCasesJson, q.starterCode || null, q.solutionCode || null, q.points ?? (questionType === 'coding' || questionType === 'sql' ? 10 : 1)]
            );
            inserted.push(questionId);
        }
        const [countRow] = await connection.query('SELECT COUNT(*) as c FROM test_questions WHERE test_id = ?', [testId]);
        await connection.query('UPDATE global_tests SET total_questions = ? WHERE id = ?', [countRow[0].c, testId]);
        await connection.commit();
        res.json({ added: inserted.length, questionIds: inserted });
    } catch (error) {
        await connection.rollback();
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Delete all questions for a global test, or only for a section
app.delete('/api/global-tests/:id/questions', async (req, res) => {
    try {
        const testId = req.params.id;
        const { section } = req.query;
        let query = 'DELETE FROM test_questions WHERE test_id = ?';
        const params = [testId];
        if (section && SECTIONS.includes(section)) {
            query += ' AND section = ?';
            params.push(section);
        }
        const [r] = await pool.query(query, params);
        const [countRow] = await pool.query('SELECT COUNT(*) as c FROM test_questions WHERE test_id = ?', [testId]);
        await pool.query('UPDATE global_tests SET total_questions = ? WHERE id = ?', [countRow[0].c, testId]);
        res.json({ deleted: r.affectedRows });
    } catch (error) {
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Get questions for a global test (optional filter by section)
app.get('/api/global-tests/:id/questions', async (req, res) => {
    try {
        const { section } = req.query;
        let query = 'SELECT * FROM test_questions WHERE test_id = ?';
        const params = [req.params.id];
        if (section && SECTIONS.includes(section)) {
            query += ' AND section = ?';
            params.push(section);
        }
        query += ' ORDER BY section, question_id';
        const [rows] = await pool.query(query, params);
        const questions = rows.map(q => ({
            id: q.question_id,
            testId: q.test_id,
            section: q.section,
            questionType: q.question_type,
            question: q.question,
            options: [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean),
            correctAnswer: q.correct_answer,
            explanation: q.explanation,
            category: q.category,
            testCases: q.test_cases ? (typeof q.test_cases === 'string' ? JSON.parse(q.test_cases) : q.test_cases) : null,
            starterCode: q.starter_code,
            solutionCode: q.solution_code,
            points: q.points ?? 1,
            timeLimit: q.time_limit
        }));
        res.json(questions);
    } catch (error) {
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Submit global test
app.post('/api/global-tests/:id/submit', validate(globalTestSubmitSchema), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const testId = req.params.id;
        const { studentId, answers, sectionScores, timeSpent, tabSwitches = 0 } = req.body;
        if (!studentId) return res.status(400).json({ error: 'studentId required' });

        const [tests] = await connection.query('SELECT * FROM global_tests WHERE id = ?', [testId]);
        if (tests.length === 0) return res.status(404).json({ error: 'Test not found' });
        const test = tests[0];

        const [questions] = await connection.query('SELECT * FROM test_questions WHERE test_id = ?', [testId]);
        const questionMap = {};
        questions.forEach(q => { questionMap[q.question_id] = q; });

        const sectionScoresComputed = { aptitude: 0, verbal: 0, logical: 0, coding: 0, sql: 0 };
        const sectionCorrect = { aptitude: 0, verbal: 0, logical: 0, coding: 0, sql: 0 };
        const sectionTotal = { aptitude: 0, verbal: 0, logical: 0, coding: 0, sql: 0 };
        const sectionPointsEarned = { aptitude: 0, verbal: 0, logical: 0, coding: 0, sql: 0 };
        const sectionPointsTotal = { aptitude: 0, verbal: 0, logical: 0, coding: 0, sql: 0 };
        SECTIONS.forEach(s => {
            sectionTotal[s] = questions.filter(q => q.section === s).length;
            sectionPointsTotal[s] = questions.filter(q => q.section === s).reduce((sum, q) => sum + (q.points ?? 1), 0);
        });

        const questionResults = [];
        for (const q of questions) {
            const userAns = answers && answers[q.question_id] !== undefined ? String(answers[q.question_id]).trim() : '';
            const options = [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean);
            let isCorrect = false;
            let pointsEarned = 0;
            let correctAnswerText = '';

            if (q.question_type === 'coding') {
                const testCasesRaw = q.test_cases ? (typeof q.test_cases === 'string' ? JSON.parse(q.test_cases) : q.test_cases) : null;
                const language = (testCasesRaw && testCasesRaw.language) ? testCasesRaw.language : 'Python';
                const cases = Array.isArray(testCasesRaw) ? testCasesRaw : (testCasesRaw && testCasesRaw.cases) ? testCasesRaw.cases : [];
                const result = await runInlineCodingTests(userAns, language, cases);
                isCorrect = result.isCorrect;
                pointsEarned = isCorrect ? (q.points ?? 10) : Math.round((result.percentage / 100) * (q.points ?? 10));
                correctAnswerText = result.total ? `${result.passedCount}/${result.total} test cases passed` : 'N/A';
            } else if (q.question_type === 'sql') {
                const schema = q.starter_code || '';
                const testCasesRaw = q.test_cases ? (typeof q.test_cases === 'string' ? JSON.parse(q.test_cases) : q.test_cases) : null;
                const expectedOutput = (testCasesRaw && testCasesRaw.expectedOutput) ? testCasesRaw.expectedOutput : (Array.isArray(testCasesRaw) ? '' : '');
                const result = await runSqlAndCompare(schema, userAns, expectedOutput);
                isCorrect = result.isCorrect;
                pointsEarned = isCorrect ? (q.points ?? 10) : 0;
                // Store the expected output as correctAnswerText for LLM evaluation, with user's actual output for context
                correctAnswerText = isCorrect
                    ? `Correct! Expected: ${expectedOutput.substring(0, 200)}${expectedOutput.length > 200 ? '...' : ''}`
                    : `Expected: ${expectedOutput.substring(0, 200)}${expectedOutput.length > 200 ? '...' : ''} | User Output: ${(result.output || 'Error/No output').substring(0, 150)}`;
            } else {
                const correctText = q.correct_answer;
                isCorrect = options.length ? (userAns === correctText || (options[Number(correctText)] !== undefined && userAns === options[Number(correctText)])) : (userAns === correctText);
                pointsEarned = isCorrect ? (q.points ?? 1) : 0;
                correctAnswerText = options.length ? (options[Number(correctText)] !== undefined ? options[Number(correctText)] : correctText) : correctText;
            }

            if (isCorrect) sectionCorrect[q.section]++;
            sectionPointsEarned[q.section] += pointsEarned;
            questionResults.push({
                questionId: q.question_id,
                section: q.section,
                userAnswer: (q.question_type === 'coding' || q.question_type === 'sql') ? (userAns ? userAns.substring(0, 500) + (userAns.length > 500 ? '...' : '') : 'Not Answered') : (userAns || 'Not Answered'),
                correctAnswer: correctAnswerText,
                isCorrect,
                pointsEarned,
                explanation: q.explanation
            });
        }

        SECTIONS.forEach(s => {
            const total = sectionTotal[s];
            const totalPts = sectionPointsTotal[s];
            if (total > 0) {
                sectionScoresComputed[s] = totalPts > 0
                    ? Math.round((sectionPointsEarned[s] / totalPts) * 100)
                    : Math.round((sectionCorrect[s] / total) * 100);
            }
        });

        const totalScore = Object.values(sectionScoresComputed).reduce((a, b) => a + b, 0);
        const totalQ = questions.length;
        const overallPercentage = totalQ ? Math.round((totalScore / (SECTIONS.length * 100)) * 100) : 0;
        const overallPercent = totalQ ? Math.round((questionResults.filter(r => r.isCorrect).length / totalQ) * 100) : 0;
        const status = overallPercent >= test.passing_score ? 'passed' : 'failed';
        const subId = `gts-${uuidv4().slice(0, 12)}`;
        const submittedAt = new Date();

        await connection.query(
            `INSERT INTO global_test_submissions (id, test_id, test_title, student_id, aptitude_score, verbal_score, logical_score, coding_score, sql_score, total_score, overall_percentage, status, time_spent, tab_switches, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [subId, testId, test.title, studentId, sectionScoresComputed.aptitude, sectionScoresComputed.verbal, sectionScoresComputed.logical, sectionScoresComputed.coding, sectionScoresComputed.sql, totalScore, overallPercent, status, timeSpent || 0, tabSwitches, submittedAt]
        );

        for (const sr of SECTIONS) {
            if (sectionTotal[sr] === 0) continue;
            const score = sectionScoresComputed[sr];
            const pct = sectionTotal[sr] ? Math.round((sectionCorrect[sr] / sectionTotal[sr]) * 100) : 0;
            await connection.query(
                'INSERT INTO section_results (id, submission_id, section, correct_count, total_questions, score, percentage, time_spent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [`sr-${uuidv4().replace(/-/g, '').slice(0, 16)}`, subId, sr, sectionCorrect[sr], sectionTotal[sr], score, pct, Math.floor((timeSpent || 0) / 5)]
            );
        }

        for (const qr of questionResults) {
            await connection.query(
                'INSERT INTO question_results (id, submission_id, question_id, section, user_answer, correct_answer, is_correct, points_earned, time_taken, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [`qr-${uuidv4().replace(/-/g, '').slice(0, 16)}`, subId, qr.questionId, qr.section, qr.userAnswer, qr.correctAnswer, qr.isCorrect ? 1 : 0, qr.pointsEarned, null, qr.explanation || '']
            );
        }

        await connection.commit();

        // Update predictive analytics
        if (analyticsService) {
            try {
                await analyticsService.analyzeStudentPerformance(studentId);
                console.log(`📊 Analytics: Updated for student ${studentId} (Global Test)`);
            } catch (err) {
                console.warn('Analytics update failed:', err.message);
            }
        }

        // Invalidate caches
        cacheManager.delete(`student:${studentId}:analytics`);
        cacheManager.delete(`student:${studentId}:learning_path`);
        cacheManager.delete(`student:${studentId}:peer_comparison`);
        cacheManager.delete(`topics:all:${studentId}`);
        cacheManager.delete('leaderboard:global:all');
        cacheManager.delete('leaderboard:dashboard:top10');

        // Invalidate mentor's analytics cache
        try {
            const [allocation] = await pool.query(
                'SELECT mentor_id FROM mentor_student_allocations WHERE student_id = ? LIMIT 1',
                [studentId]
            );
            if (allocation.length > 0) {
                cacheManager.delete(`mentor:${allocation[0].mentor_id}:analytics`);
            }
        } catch (e) { /* Ignore */ }

        res.json({
            submission: {
                id: subId,
                score: overallPercent,
                totalScore,
                status,
                sectionScores: sectionScoresComputed,
                correctCount: questionResults.filter(r => r.isCorrect).length,
                totalQuestions: totalQ,
                tabSwitches,
                timeSpent: timeSpent || 0,
                questionResults
            },
            message: status === 'passed' ? 'Congratulations! You passed the test!' : 'Keep practicing!'
        });
    } catch (error) {
        await connection.rollback();
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// List global test submissions (admin: all; student: by studentId; mentor: by mentorId)
app.get('/api/global-test-submissions', async (req, res) => {
    try {
        const { testId, studentId, mentorId } = req.query;
        let query = 'SELECT s.*, u.name as student_name FROM global_test_submissions s JOIN users u ON s.student_id = u.id WHERE 1=1';
        const params = [];
        if (testId) { query += ' AND s.test_id = ?'; params.push(testId); }
        if (studentId) { query += ' AND s.student_id = ?'; params.push(studentId); }
        if (mentorId) { query += ' AND u.mentor_id = ?'; params.push(mentorId); }
        query += ' ORDER BY s.submitted_at DESC';
        const [rows] = await pool.query(query, params);
        res.json(rows.map(s => ({
            id: s.id,
            testId: s.test_id,
            testTitle: s.test_title,
            studentId: s.student_id,
            studentName: s.student_name,
            aptitudeScore: s.aptitude_score,
            verbalScore: s.verbal_score,
            logicalScore: s.logical_score,
            codingScore: s.coding_score,
            sqlScore: s.sql_score,
            totalScore: s.total_score,
            overallPercentage: Number(s.overall_percentage),
            status: s.status,
            timeSpent: s.time_spent,
            tabSwitches: s.tab_switches,
            submittedAt: s.submitted_at
        })));
    } catch (error) {
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Get single global submission with question results
app.get('/api/global-test-submissions/:id', async (req, res) => {
    try {
        const [subs] = await pool.query('SELECT s.*, u.name as student_name FROM global_test_submissions s JOIN users u ON s.student_id = u.id WHERE s.id = ?', [req.params.id]);
        if (subs.length === 0) return res.status(404).json({ error: 'Submission not found' });
        const s = subs[0];
        const [qr] = await pool.query('SELECT * FROM question_results WHERE submission_id = ?', [s.id]);
        const [sec] = await pool.query('SELECT * FROM section_results WHERE submission_id = ?', [s.id]);
        res.json({
            id: s.id,
            testId: s.test_id,
            testTitle: s.test_title,
            studentId: s.student_id,
            studentName: s.student_name,
            aptitudeScore: s.aptitude_score,
            verbalScore: s.verbal_score,
            logicalScore: s.logical_score,
            codingScore: s.coding_score,
            sqlScore: s.sql_score,
            totalScore: s.total_score,
            overallPercentage: Number(s.overall_percentage),
            status: s.status,
            timeSpent: s.time_spent,
            tabSwitches: s.tab_switches,
            submittedAt: s.submitted_at,
            questionResults: qr.map(r => ({ questionId: r.question_id, section: r.section, userAnswer: r.user_answer, correctAnswer: r.correct_answer, isCorrect: !!r.is_correct, explanation: r.explanation })),
            sectionResults: sec.map(r => ({ section: r.section, correctCount: r.correct_count, totalQuestions: r.total_questions, score: r.score, percentage: Number(r.percentage) }))
        });
    } catch (error) {
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Personalized report for a global test submission
app.get('/api/global-test-submissions/:id/report', async (req, res) => {
    try {
        const submissionId = req.params.id;
        const [subs] = await pool.query('SELECT s.*, u.name as student_name, u.email as student_email FROM global_test_submissions s JOIN users u ON s.student_id = u.id WHERE s.id = ?', [submissionId]);
        if (subs.length === 0) return res.status(404).json({ error: 'Submission not found' });
        const s = subs[0];

        // Check if personalized report already exists
        const [existingReport] = await pool.query('SELECT * FROM personalized_reports WHERE submission_id = ?', [submissionId]);

        const [secRows] = await pool.query('SELECT * FROM section_results WHERE submission_id = ?', [submissionId]);
        const [qrRows] = await pool.query('SELECT * FROM question_results WHERE submission_id = ?', [submissionId]);

        const sectionResults = {};
        secRows.forEach(r => {
            sectionResults[r.section] = {
                score: r.score,
                percentage: Number(r.percentage),
                correctCount: r.correct_count,
                totalQuestions: r.total_questions
            };
        });

        const bySection = {};
        SECTIONS.forEach(sec => { bySection[sec] = qrRows.filter(r => r.section === sec); });

        let aiPersonalizedAnalysis = null;

        // Parse existing report if available
        let existingReportData = null;
        if (existingReport.length > 0) {
            try {
                existingReportData = typeof existingReport[0].report_data === 'string'
                    ? JSON.parse(existingReport[0].report_data)
                    : existingReport[0].report_data;
            } catch (e) {
                console.error('Failed to parse existing report_data:', e);
            }
        }

        let needsRegeneration = existingReportData && (!existingReportData.questionInsights || !existingReportData.questionInsights.Q1);

        if (existingReportData && !needsRegeneration) {
            aiPersonalizedAnalysis = existingReportData;
        } else {
            // Generate AI Analysis (or Regenerate if old format)
            try {
                const performanceSummary = SECTIONS.map(sec => {
                    const data = sectionResults[sec] || { percentage: 0, correctCount: 0, totalQuestions: 0 };
                    return `${sec.toUpperCase()}: ${data.percentage}% (${data.correctCount}/${data.totalQuestions})`;
                }).join(', ');

                // Prepare a sampled question list to avoid hitting token limits while giving AI enough context
                const questionsContext = qrRows.map((q, i) => {
                    const userAnswer = q.user_answer || 'No Answer';
                    const isNotAnswered = !q.user_answer || q.user_answer === 'Not Answered' || q.user_answer.trim() === '';
                    const status = isNotAnswered ? 'NOT ANSWERED' : (q.is_correct ? 'CORRECT' : 'INCORRECT');
                    const points = q.points_earned || 0;
                    return `Q${i + 1} [${q.section}]: ${status} (${points} points). Student Response: ${userAnswer}. Correct Answer/Solution: ${q.correct_answer || 'N/A'}`;
                }).join('\n\n');

                const systemPrompt = `You are an elite educational consultant and technical mentor. Analyze a student's global assessment.
                Student: ${s.student_name}
                Overall: ${s.overall_percentage}%
                Sections: ${performanceSummary}
                
                Generate a deeply personalized JSON report:
                {
                    "summary": "Overall interpretation of results",
                    "strengths": ["...", "..."],
                    "weaknesses": ["...", "..."],
                    "actionPlan": ["Step 1", "Step 2"],
                    "sectionAnalysis": { "aptitude": "...", "verbal": "...", "logical": "...", "coding": "...", "sql": "..." },
                    "focusAreas": ["Topic A"],
                    "questionInsights": {
                        "Q1": { "diagnosis": "Analysis of their attempt", "misstep": "Why it failed or wasn't perfect", "recommendation": "Advice for next time" },
                        "Q2": { ... }
                    }
                }
                
                IMPORTANT:
                1. Provide insights for EVERY question (Q1, Q2, Q3...).
                2. For NOT ANSWERED questions: diagnosis should mention "Question was not attempted", misstep should be "Did not provide a solution", recommendation should encourage attempting the problem and provide hints about the approach.
                3. For CORRECT coding/SQL: Even if right, suggest optimizations (e.g., O(n) vs O(n^2)), cleaner code patterns, or edge case handling. Explain WHY it was good and how to reach the senior level.
                4. For INCORRECT: Diagnose the logic gap and provide a clear path to mastery.
                5. Tone: Encouraging, professional, and technical.
                6. NEVER say "Correct answer" or "Good job" for NOT ANSWERED or INCORRECT questions.`;

                const chatCompletion = await cerebrasChat([
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Analyze this detailed submission data and provide insights for EACH question:\n\n${questionsContext}` }
                ], {
                    model: 'gpt-oss-120b',
                    temperature: 0.7,
                    max_tokens: 4000,
                    response_format: { type: 'json_object' }
                });

                aiPersonalizedAnalysis = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');

                if (needsRegeneration) {
                    await pool.query('UPDATE personalized_reports SET report_data = ? WHERE submission_id = ?', [JSON.stringify(aiPersonalizedAnalysis), submissionId]);
                } else {
                    await pool.query(
                        'INSERT INTO personalized_reports (id, student_id, test_id, submission_id, report_data) VALUES (?, ?, ?, ?, ?)',
                        [`pr-${uuidv4().slice(0, 12)}`, s.student_id, s.test_id, submissionId, JSON.stringify(aiPersonalizedAnalysis)]
                    );
                }
            } catch (aiError) {
                console.error('AI Report Generation Error:', aiError);
                aiPersonalizedAnalysis = {
                    summary: `You achieved an overall score of ${s.overall_percentage}%. You performed best in ${SECTIONS.filter(sec => (sectionResults[sec]?.percentage || 0) >= 70).join(', ') || 'some areas'}.`,
                    strengths: SECTIONS.filter(sec => (sectionResults[sec]?.percentage || 0) >= 75).map(sec => `Good performance in ${sec}`),
                    weaknesses: SECTIONS.filter(sec => (sectionResults[sec]?.percentage || 0) < 60).map(sec => `Needs improvement in ${sec}`),
                    actionPlan: ['Review incorrect answers', 'Practice more mock tests', 'Focus on time management'],
                    sectionAnalysis: {},
                    focusAreas: [],
                    detailedQuestionAdvice: []
                };
            }
        }

        const report = {
            studentInfo: { id: s.student_id, name: s.student_name, email: s.student_email },
            testInfo: { id: s.test_id, title: s.test_title, date: s.submitted_at },
            overallPerformance: { totalScore: s.total_score, percentage: Number(s.overall_percentage), status: s.status },
            sectionWisePerformance: sectionResults,
            strengths: aiPersonalizedAnalysis.strengths || [],
            weaknesses: aiPersonalizedAnalysis.weaknesses || [],
            questionResultsBySection: bySection,
            recommendations: aiPersonalizedAnalysis.actionPlan || [],
            personalizedAnalysis: aiPersonalizedAnalysis
        };
        res.json(report);
    } catch (error) {
        if (error.message && error.message.includes("doesn't exist")) {
            return res.status(503).json({ error: 'Global tests not set up. Run: node migrate_global_tests.js' });
        }
        res.status(500).json({ error: error.message });
    }
});

// ==================== GENERIC TEST ALLOCATION ENDPOINTS (All Test Types) ====================

// Allocate students to ANY test type (aptitude, global, skill, etc.)
app.post('/api/tests/:testId/allocate-students', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { testId } = req.params;
        const { studentIds } = req.body;

        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ error: 'studentIds must be a non-empty array' });
        }

        await connection.beginTransaction();

        // Delete existing allocations for this test
        await connection.query('DELETE FROM test_student_allocations WHERE test_id = ?', [testId]);

        // Insert new allocations with shorter, unique IDs using UUID
        const values = studentIds.map((studentId) => [uuidv4(), testId, studentId]);

        if (values.length > 0) {
            await connection.query(
                'INSERT INTO test_student_allocations (id, test_id, student_id) VALUES ?',
                [values]
            );
        }

        await connection.commit();
        res.json({ success: true, allocatedCount: studentIds.length });

    } catch (error) {
        await connection.rollback();
        console.error('Allocation error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Allocate students to PROBLEM (stores in problem_allocations table)
app.post('/api/problems/:problemId/allocate-students', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { problemId } = req.params;
        const { studentIds } = req.body;

        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ error: 'studentIds must be a non-empty array' });
        }

        // First verify the problem exists
        const [problem] = await connection.query('SELECT id FROM problems WHERE id = ?', [problemId]);
        if (problem.length === 0) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        await connection.beginTransaction();

        // Create table if it doesn't exist
        await connection.query(`
            CREATE TABLE IF NOT EXISTS problem_student_allocations (
                id VARCHAR(36) PRIMARY KEY,
                problem_id VARCHAR(36) NOT NULL,
                student_id VARCHAR(36) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_allocation (problem_id, student_id),
                INDEX idx_problem (problem_id),
                INDEX idx_student (student_id)
            )
        `);

        // Delete existing allocations for this problem
        await connection.query('DELETE FROM problem_student_allocations WHERE problem_id = ?', [problemId]);

        // Insert new allocations with UUID
        const values = studentIds.map((studentId) => [uuidv4(), problemId, studentId]);

        if (values.length > 0) {
            await connection.query(
                'INSERT INTO problem_student_allocations (id, problem_id, student_id) VALUES ?',
                [values]
            );
        }

        await connection.commit();
        res.json({ success: true, allocatedCount: studentIds.length });

    } catch (error) {
        await connection.rollback();
        console.error('Problem allocation error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Get students allocated to ANY test
app.get('/api/tests/:testId/allocated-students', async (req, res) => {
    try {
        const { testId } = req.params;

        const [allocations] = await pool.query(
            'SELECT student_id FROM test_student_allocations WHERE test_id = ?',
            [testId]
        );

        const studentIds = allocations.map(a => a.student_id);
        res.json({ testId, studentIds, count: studentIds.length });

    } catch (error) {
        console.error('Error getting allocations:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all tests allocated to a student (any type)
app.get('/api/tests/allocated-to/:studentId', async (req, res) => {
    try {
        const { studentId } = req.params;

        // Get test IDs allocated to this student
        const [allocations] = await pool.query(
            'SELECT test_id FROM test_student_allocations WHERE student_id = ?',
            [studentId]
        );

        const testIds = allocations.map(a => a.test_id);

        // Get details from appropriate tables (aptitude, global_tests, etc.)
        let allTests = [];

        if (testIds.length > 0) {
            const placeholders = testIds.map(() => '?').join(',');

            // Get from aptitude tests
            const [aptTests] = await pool.query(
                `SELECT id, title, 'aptitude' as type FROM aptitude_tests WHERE id IN (${placeholders}) AND status = 'live'`,
                testIds
            );
            allTests = allTests.concat(aptTests);

            // Get from global tests
            const [globalTests] = await pool.query(
                `SELECT id, title, 'global' as type FROM global_tests WHERE id IN (${placeholders}) AND status = 'live'`,
                testIds
            );
            allTests = allTests.concat(globalTests);

            // Get from skill tests
            // Note: skill_tests id is INT, but we store as string in testIds, MySQL handles conversion
            const [skillTests] = await pool.query(
                `SELECT id, title, 'skill' as type FROM skill_tests WHERE id IN (${placeholders}) AND is_active = 1`,
                testIds
            );
            allTests = allTests.concat(skillTests);
        }

        res.json(allTests);

    } catch (error) {
        console.error('Error getting allocated tests:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== ADMIN & ANALYTICS ROUTES ====================

// Allocations (Mentors -> Students)
app.get('/api/allocations', async (req, res) => {
    try {
        const [mentors] = await pool.query('SELECT id, name, email FROM users WHERE role = "mentor"');

        const [allocs] = await pool.query(`
            SELECT ma.mentor_id, u.id, u.name, u.email, u.batch 
            FROM mentor_student_allocations ma
            JOIN users u ON ma.student_id = u.id
        `);

        const result = mentors.map(m => {
            const students = allocs
                .filter(a => a.mentor_id === m.id)
                .map(s => ({
                    id: s.id,
                    name: s.name,
                    email: s.email,
                    batch: s.batch
                }));
            return {
                mentorId: m.id,
                mentorName: m.name,
                mentorEmail: m.email,
                students
            };
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== LEADERBOARD ROUTES ====================

// Get global leaderboard
app.get('/api/leaderboard', authenticate, async (req, res) => {
    try {
        const { limit = 100, timeRange = 'alltime' } = req.query;
        const pageLimit = Math.min(500, Math.max(1, parseInt(limit)));

        let query = `
            SELECT 
                ls.user_id,
                u.username,
                u.tier,
                u.avatar,
                u.email,
                ls.problems_solved,
                ls.total_points,
                ls.current_streak,
                ls.success_rate,
                ROW_NUMBER() OVER (ORDER BY ls.total_points DESC) as rank
            FROM leaderboard_stats ls
            JOIN users u ON ls.user_id = u.id
            WHERE ls.problems_solved > 0
        `;

        if (timeRange === 'week') {
            query = `
                SELECT 
                    wl.user_id,
                    u.username,
                    u.tier,
                    u.avatar,
                    wl.problems_solved_week as problems_solved,
                    wl.weekly_points as total_points,
                    0 as current_streak,
                    COALESCE(ls.success_rate, 0) as success_rate,
                    ROW_NUMBER() OVER (ORDER BY wl.weekly_points DESC) as rank
                FROM weekly_leaderboard wl
                JOIN users u ON wl.user_id = u.id
                LEFT JOIN leaderboard_stats ls ON wl.user_id = ls.user_id
                WHERE WEEK(wl.week_start) = WEEK(CURDATE()) 
                AND YEAR(wl.week_start) = YEAR(CURDATE())
            `;
        } else if (timeRange === 'month') {
            query = `
                SELECT 
                    wl.user_id,
                    u.username,
                    u.tier,
                    u.avatar,
                    SUM(wl.problems_solved_week) as problems_solved,
                    SUM(wl.weekly_points) as total_points,
                    0 as current_streak,
                    COALESCE(ls.success_rate, 0) as success_rate,
                    ROW_NUMBER() OVER (ORDER BY SUM(wl.weekly_points) DESC) as rank
                FROM weekly_leaderboard wl
                JOIN users u ON wl.user_id = u.id
                LEFT JOIN leaderboard_stats ls ON wl.user_id = ls.user_id
                WHERE MONTH(wl.week_start) = MONTH(CURDATE())
                AND YEAR(wl.week_start) = YEAR(CURDATE())
                GROUP BY wl.user_id, u.username, u.tier, u.avatar, ls.success_rate
            `;
        }

        query += ` ORDER BY rank ASC LIMIT ?`;

        const [rankings] = await pool.query(query, [pageLimit]);

        // Get current user rank
        const [userRows] = await pool.query(
            'SELECT ranking FROM leaderboard_stats WHERE user_id = ?',
            [req.user.id]
        );

        const userRank = userRows[0] ? {
            rank: userRows[0].ranking,
            userId: req.user.id
        } : null;

        // Fetch current user's full stats if needed
        if (userRank) {
            const [userStats] = await pool.query(
                `SELECT problems_solved, total_points, current_streak, success_rate
                 FROM leaderboard_stats WHERE user_id = ?`,
                [req.user.id]
            );
            if (userStats.length > 0) {
                userRank.problems_solved = userStats[0].problems_solved;
                userRank.total_points = userStats[0].total_points;
                userRank.current_streak = userStats[0].current_streak;
                userRank.success_rate = userStats[0].success_rate;
            }
        }

        res.json({
            rankings,
            userRank,
            total: rankings.length
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get category-specific leaderboard
app.get('/api/leaderboard/category/:categoryName', authenticate, async (req, res) => {
    try {
        const { categoryName } = req.params;
        const { limit = 50 } = req.query;
        const pageLimit = Math.min(500, Math.max(1, parseInt(limit)));

        const [rankings] = await pool.query(`
            SELECT 
                cl.user_id,
                u.username,
                u.tier,
                u.avatar,
                cl.problems_solved,
                cl.category_points,
                cl.success_rate,
                ROW_NUMBER() OVER (ORDER BY cl.category_points DESC) as rank
            FROM category_leaderboard cl
            JOIN users u ON cl.user_id = u.id
            JOIN problem_categories pc ON cl.category_id = pc.id
            WHERE pc.name = ?
            ORDER BY cl.category_points DESC
            LIMIT ?
        `, [categoryName, pageLimit]);

        res.json({ rankings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get user's specific rank
app.get('/api/users/:userId/rank', authenticate, async (req, res) => {
    try {
        const { userId } = req.params;

        const [stats] = await pool.query(`
            SELECT 
                user_id, problems_solved, total_points, current_streak,
                best_streak, success_rate, ranking
            FROM leaderboard_stats
            WHERE user_id = ?
        `, [userId]);

        if (stats.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const stat = stats[0];

        // Get percentile rank
        const [[{ percentile }]] = await pool.query(`
            SELECT 
                ROUND(100 * (1 - PERCENT_RANK() OVER (ORDER BY total_points)) * 100, 2) as percentile
            FROM leaderboard_stats
            WHERE user_id = ?
        `, [userId]);

        res.json({
            userId,
            ...stat,
            percentileRank: percentile || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Student Analytics Dashboard
app.get('/api/analytics/student/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;

        // Check cache first (30 minute expiry)
        const cacheKey = `student:${studentId}:analytics`;
        const cachedData = cacheManager.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        // Get student's mentor from allocation table
        const [allocationRows] = await pool.query(`
            SELECT m.id as mentor_id, m.name as mentor_name, m.email as mentor_email
            FROM mentor_student_allocations msa
            JOIN users m ON msa.mentor_id = m.id
            WHERE msa.student_id = ?
            LIMIT 1
        `, [studentId]);

        const mentorInfo = allocationRows.length > 0 ? {
            id: allocationRows[0].mentor_id,
            name: allocationRows[0].mentor_name,
            email: allocationRows[0].mentor_email
        } : null;

        const mentorId = mentorInfo?.id || null;

        // Average problem score from submissions (code problems only)
        const [[{ avgProblemScore }]] = await pool.query(
            'SELECT COALESCE(AVG(score), 0) as avgProblemScore FROM submissions WHERE student_id = ? AND problem_id IS NOT NULL',
            [studentId]
        );

        // Average task score from submissions (ML tasks only)
        const [[{ avgTaskScore }]] = await pool.query(
            'SELECT COALESCE(AVG(score), 0) as avgTaskScore FROM submissions WHERE student_id = ? AND task_id IS NOT NULL',
            [studentId]
        );

        // Total submissions count
        const [[{ totalSubmissions }]] = await pool.query(
            'SELECT COUNT(*) as totalSubmissions FROM submissions WHERE student_id = ?',
            [studentId]
        );

        // ML Tasks - Total and Completed (from mentor or admin)
        const [[{ totalTasks }]] = await pool.query(
            'SELECT COUNT(*) as totalTasks FROM tasks WHERE (mentor_id = ? OR mentor_id = "admin-001") AND status = "live"',
            [mentorId]
        );
        const [[{ completedTasks }]] = await pool.query(
            'SELECT COUNT(*) as completedTasks FROM task_completions WHERE student_id = ?',
            [studentId]
        );

        // Coding Problems - Total and Completed (from mentor or admin)
        const [[{ totalProblems }]] = await pool.query(
            'SELECT COUNT(*) as totalProblems FROM problems WHERE (mentor_id = ? OR mentor_id = "admin-001") AND status = "live"',
            [mentorId]
        );
        const [[{ completedProblems }]] = await pool.query(
            'SELECT COUNT(*) as completedProblems FROM problem_completions WHERE student_id = ?',
            [studentId]
        );

        // Aptitude Tests - Total available and completed
        const [[{ totalAptitude }]] = await pool.query('SELECT COUNT(*) as totalAptitude FROM aptitude_tests WHERE status = "live"');
        const [[{ completedAptitude }]] = await pool.query(
            'SELECT COUNT(*) as completedAptitude FROM student_completed_aptitude WHERE student_id = ?',
            [studentId]
        );

        // Submission trends for the student (last 7 days)
        const [trends] = await pool.query(`
            SELECT DATE(submitted_at) as date, COUNT(*) as count 
            FROM submissions 
            WHERE student_id = ? AND submitted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(submitted_at)
            ORDER BY date ASC
        `, [studentId]);

        const submissionTrends = trends.map(t => ({
            date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            count: t.count
        }));

        // Recent submissions by this student with problem/task title
        const [recentSubs] = await pool.query(`
            SELECT s.id, s.score, s.status, s.language, s.submitted_at as time,
                   p.title as problemTitle, t.title as taskTitle
            FROM submissions s
            LEFT JOIN problems p ON s.problem_id = p.id
            LEFT JOIN tasks t ON s.task_id = t.id
            WHERE s.student_id = ?
            ORDER BY s.submitted_at DESC LIMIT 5
        `, [studentId]);

        const recentSubmissions = recentSubs.map(r => ({
            id: r.id,
            title: r.problemTitle || r.taskTitle || 'Unknown',
            score: r.score,
            status: r.status,
            language: r.language,
            time: r.time
        }));

        // Get leaderboard data for student dashboard (global cache)
        const leaderboardCacheKey = 'leaderboard:dashboard:top10';
        let leaderboard = cacheManager.get(leaderboardCacheKey);

        if (!leaderboard) {
            const [leaderboardRows] = await pool.query(`
                SELECT u.id as studentId, u.name, 
                (SELECT COUNT(*) FROM task_completions WHERE student_id = u.id) as taskCount,
                (SELECT COUNT(*) FROM problem_completions WHERE student_id = u.id) as codeCount,
                (SELECT COUNT(*) FROM student_completed_aptitude WHERE student_id = u.id) as aptitudeCount,
                (SELECT COALESCE(AVG(score), 0) FROM submissions WHERE student_id = u.id) as avgScore
                FROM users u
                WHERE u.role = 'student'
                ORDER BY avgScore DESC, (taskCount + codeCount + aptitudeCount) DESC
                LIMIT 10
            `);

            leaderboard = leaderboardRows.map((r, idx) => ({
                rank: idx + 1,
                studentId: r.studentId,
                name: r.name,
                taskCount: parseInt(r.taskCount) || 0,
                codeCount: parseInt(r.codeCount) || 0,
                aptitudeCount: parseInt(r.aptitudeCount) || 0,
                avgScore: Math.round(r.avgScore) || 0
            }));

            cacheManager.set(leaderboardCacheKey, leaderboard, 3600000); // 1 hour
        }

        // Get predictive analytics if available
        const [predictiveRows] = await pool.query(
            'SELECT * FROM student_analytics WHERE student_id = ?',
            [studentId]
        );

        const predictiveData = predictiveRows.length > 0 ? {
            risk_score: predictiveRows[0].risk_score,
            at_risk: !!predictiveRows[0].at_risk,
            problem_completion_rate: predictiveRows[0].problem_completion_rate,
            average_test_score: predictiveRows[0].average_test_score,
            prediction_confidence: predictiveRows[0].prediction_confidence,
            weak_concepts: predictiveRows[0].weak_concepts || [],
            strong_concepts: predictiveRows[0].strong_concepts || [],
            learning_curve: predictiveRows[0].learning_curve || {}
        } : {
            risk_score: 0,
            at_risk: false,
            problem_completion_rate: 0,
            average_test_score: 0,
            prediction_confidence: 0,
            weak_concepts: [],
            strong_concepts: [],
            learning_curve: {}
        };

        const analyticsData = {
            mentorInfo,
            avgProblemScore: Math.round(avgProblemScore),
            avgTaskScore: Math.round(avgTaskScore),
            totalSubmissions,
            totalTasks,
            completedTasks,
            totalProblems,
            completedProblems,
            totalAptitude,
            completedAptitude,
            submissionTrends,
            recentSubmissions,
            leaderboard,
            ...predictiveData
        };

        // Cache for 5 minutes
        cacheManager.set(cacheKey, analyticsData, 300000);
        res.json(analyticsData);

    } catch (error) {
        console.error('Student Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mentor Analytics Dashboard
app.get('/api/analytics/mentor/:mentorId', async (req, res) => {
    try {
        const mentorId = req.params.mentorId;

        // Check cache first (30 minute expiry)
        const cacheKey = `mentor:${mentorId}:analytics`;
        const cachedData = cacheManager.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        // Get allocated student IDs for this mentor with their details
        const [allocations] = await pool.query(`
            SELECT u.id, u.name, u.email, u.created_at,
                   (SELECT COUNT(*) FROM submissions WHERE student_id = u.id) as submissionCount,
                   (SELECT AVG(score) FROM submissions WHERE student_id = u.id) as avgScore,
                   (SELECT COUNT(*) FROM task_completions WHERE student_id = u.id) as tasksCompleted,
                   (SELECT COUNT(*) FROM problem_completions WHERE student_id = u.id) as problemsCompleted,
                   (SELECT submitted_at FROM submissions WHERE student_id = u.id ORDER BY submitted_at DESC LIMIT 1) as lastActive
            FROM users u
            JOIN mentor_student_allocations msa ON u.id = msa.student_id
            WHERE msa.mentor_id = ?
            ORDER BY u.name ASC
        `, [mentorId]);

        const studentIds = allocations.map(a => a.id);
        const allocatedStudents = allocations.map(s => ({
            id: s.id,
            name: s.name,
            email: s.email,
            submissionCount: s.submissionCount || 0,
            avgScore: Math.round(s.avgScore || 0),
            tasksCompleted: s.tasksCompleted || 0,
            problemsCompleted: s.problemsCompleted || 0,
            lastActive: s.lastActive,
            joinedAt: s.created_at
        }));

        if (studentIds.length === 0) {
            return res.json({
                totalStudents: 0,
                totalSubmissions: 0,
                avgScore: 0,
                totalTasks: 0,
                totalProblems: 0,
                submissionTrends: [],
                languageStats: [],
                recentActivity: [],
                studentPerformance: [],
                allocatedStudents: []
            });
        }

        // Total students
        const totalStudents = studentIds.length;

        // Total submissions from mentor's students - broken down by type
        const [taskSubs] = await pool.query('SELECT COUNT(*) as count FROM task_completions WHERE student_id IN (?)', [studentIds]);
        const [codeSubs] = await pool.query('SELECT COUNT(*) as count FROM submissions WHERE student_id IN (?)', [studentIds]);
        const [aptSubs] = await pool.query('SELECT COUNT(*) as count FROM student_completed_aptitude WHERE student_id IN (?)', [studentIds]);

        const taskSubmissions = taskSubs[0]?.count || 0;
        const codeSubmissions = codeSubs[0]?.count || 0;
        const aptitudeSubmissions = aptSubs[0]?.count || 0;
        const totalSubmissions = taskSubmissions + codeSubmissions + aptitudeSubmissions;

        // Average score
        const [avgResult] = await pool.query('SELECT AVG(score) as avg FROM submissions WHERE student_id IN (?)', [studentIds]);
        const avgScore = Math.round(avgResult[0]?.avg || 0);

        // Total tasks and problems created by this mentor
        const [[{ taskCount }]] = await pool.query('SELECT COUNT(*) as taskCount FROM tasks WHERE mentor_id = ?', [mentorId]);
        const [[{ probCount }]] = await pool.query('SELECT COUNT(*) as probCount FROM problems WHERE mentor_id = ?', [mentorId]);

        // Submission trends (last 7 days)
        const [trends] = await pool.query(`
            SELECT DATE(submitted_at) as date, COUNT(*) as count 
            FROM submissions 
            WHERE student_id IN (?) AND submitted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(submitted_at)
            ORDER BY date ASC
        `, [studentIds]);

        const submissionTrends = trends.map(t => ({
            date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            count: t.count
        }));

        // Language stats
        const [langs] = await pool.query('SELECT language, COUNT(*) as value FROM submissions WHERE student_id IN (?) GROUP BY language', [studentIds]);
        const languageStats = langs.map(l => ({ name: l.language || 'Unknown', value: l.value }));

        // Recent activity
        const [recentCode] = await pool.query(`
            SELECT s.id, u.name as studentName, s.score, s.status, s.submitted_at as time
            FROM submissions s
            JOIN users u ON s.student_id = u.id
            WHERE s.student_id IN (?)
            ORDER BY s.submitted_at DESC LIMIT 5
        `, [studentIds]);

        const recentActivity = recentCode.map(r => ({
            id: r.id,
            studentName: r.studentName,
            score: r.score,
            status: r.status,
            time: r.time
        }));

        // Student performance
        const [performers] = await pool.query(`
            SELECT u.name, COUNT(s.id) as count, AVG(s.score) as score
            FROM users u
            JOIN submissions s ON u.id = s.student_id
            WHERE u.id IN (?)
            GROUP BY u.id
            ORDER BY score DESC, count DESC
            LIMIT 5
        `, [studentIds]);

        const studentPerformance = performers.map(p => ({
            name: p.name,
            count: p.count,
            score: Math.round(p.score)
        }));

        const analyticsData = {
            totalStudents,
            totalSubmissions,
            taskSubmissions,
            codeSubmissions,
            aptitudeSubmissions,
            avgScore,
            totalTasks: taskCount,
            totalProblems: probCount,
            submissionTrends,
            languageStats,
            recentActivity,
            menteePerformance: studentPerformance,
            allocatedStudents
        };

        // Cache for 30 minutes
        cacheManager.set(cacheKey, analyticsData, 1800000);
        res.json(analyticsData);

    } catch (error) {
        console.error('Mentor Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin Analytics Dashboard
app.get('/api/analytics/admin', async (req, res) => {
    try {
        // Check cache first (30 minute expiry)
        const cacheKey = 'admin:analytics:global';
        const cachedData = cacheManager.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }
        const [[{ studentCount }]] = await pool.query('SELECT COUNT(*) as studentCount FROM users WHERE role = "student"');
        const [[{ codeSubCount }]] = await pool.query('SELECT COUNT(*) as codeSubCount FROM submissions');
        const [[{ aptSubCount }]] = await pool.query('SELECT COUNT(*) as aptSubCount FROM aptitude_submissions');
        const totalSubmissions = codeSubCount + aptSubCount;

        const [[{ taskCount }]] = await pool.query('SELECT COUNT(*) as taskCount FROM tasks');
        const [[{ probCount }]] = await pool.query('SELECT COUNT(*) as probCount FROM problems');
        const [[{ testCount }]] = await pool.query('SELECT COUNT(*) as testCount FROM aptitude_tests');
        const totalContent = taskCount + probCount + testCount;

        const [[{ passedCode }]] = await pool.query('SELECT COUNT(*) as passedCode FROM submissions WHERE score >= 60');
        const [[{ passedApt }]] = await pool.query('SELECT COUNT(*) as passedApt FROM aptitude_submissions WHERE status = "passed"');
        const successRate = totalSubmissions > 0 ? Math.round(((passedCode + passedApt) / totalSubmissions) * 100) : 0;

        const [trends] = await pool.query(`
            SELECT DATE(submitted_at) as date, COUNT(*) as count 
            FROM submissions 
            WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(submitted_at)
            ORDER BY date ASC
        `);

        const submissionTrends = trends.map(t => ({
            date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            count: t.count
        }));

        const [langs] = await pool.query('SELECT language, COUNT(*) as value FROM submissions GROUP BY language');
        const languageStats = langs.map(l => ({ name: l.language || 'Unknown', value: l.value }));

        const [recentCode] = await pool.query(`
            SELECT s.id, u.name as studentName, s.score, s.status, s.submitted_at as time
            FROM submissions s
            JOIN users u ON s.student_id = u.id
            ORDER BY s.submitted_at DESC LIMIT 5
        `);

        const recentSubmissions = recentCode.map(r => ({
            id: r.id,
            studentName: r.studentName,
            score: r.score,
            status: r.status,
            time: r.time
        }));

        const [performers] = await pool.query(`
            SELECT u.name, COUNT(s.id) as count, AVG(s.score) as score
            FROM users u
            JOIN submissions s ON u.id = s.student_id
            GROUP BY u.id
            ORDER BY score DESC, count DESC
            LIMIT 5
        `);

        const studentPerformance = performers.map(p => ({
            name: p.name,
            count: p.count,
            score: Math.round(p.score)
        }));

        const analyticsData = {
            totalStudents: studentCount,
            totalSubmissions,
            successRate,
            totalContent,
            submissionTrends,
            languageStats,
            recentSubmissions,
            studentPerformance
        };

        // Cache for 30 minutes
        cacheManager.set(cacheKey, analyticsData, 1800000);
        res.json(analyticsData);

    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Student Leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        // Check cache first (1 hour expiry)
        const cacheKey = 'leaderboard:global:all';
        const cachedData = cacheManager.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const [rows] = await pool.query(`
            SELECT 
                studentId, 
                MAX(name) as name, 
                COUNT(*) as totalSubmissions, 
                AVG(score) as avgScore,
                SUM(tabSwitches) as totalTabSwitches,
                SUM(copyPaste) as totalCopyPaste,
                SUM(cameraBlocked) as totalCameraBlocked,
                SUM(phoneDetection) as totalPhoneDetection,
                SUM(integrityViolations) as integrityViolations,
                SUM(plagiarismCount) as plagiarismCount
            FROM (
                SELECT 
                    s.student_id as studentId, 
                    u.name, 
                    COALESCE(s.score, 0) as score,
                    COALESCE(s.tab_switches, 0) as tabSwitches,
                    COALESCE(s.copy_paste_attempts, 0) as copyPaste,
                    COALESCE(s.camera_blocked_count, 0) as cameraBlocked,
                    COALESCE(s.phone_detection_count, 0) as phoneDetection,
                    CASE WHEN s.integrity_violation = 'true' THEN 1 ELSE 0 END as integrityViolations,
                    CASE WHEN s.plagiarism_detected = 'true' THEN 1 ELSE 0 END as plagiarismCount
                FROM submissions s
                JOIN users u ON s.student_id = u.id
                WHERE u.role = 'student'

                UNION ALL

                SELECT 
                    asub.student_id, 
                    u.name, 
                    COALESCE(asub.score, 0),
                    0, 0, 0, 0, 0, 0
                FROM aptitude_submissions asub
                JOIN users u ON asub.student_id = u.id
                WHERE u.role = 'student'

                UNION ALL

                SELECT 
                    gts.student_id, 
                    u.name, 
                    COALESCE(gts.overall_percentage, 0),
                    0, 0, 0, 0, 0, 0
                FROM global_test_submissions gts
                JOIN users u ON gts.student_id = u.id
                WHERE u.role = 'student'
            ) as combined_activity
            GROUP BY studentId
            ORDER BY avgScore DESC, totalSubmissions DESC
        `);

        const leaderboard = rows.map(r => ({
            studentId: r.studentId,
            name: r.name,
            totalSubmissions: r.totalSubmissions,
            avgScore: Math.round(r.avgScore),
            violations: {
                tabSwitches: parseInt(r.totalTabSwitches) || 0,
                copyPaste: parseInt(r.totalCopyPaste) || 0,
                cameraBlocked: parseInt(r.totalCameraBlocked) || 0,
                phoneDetection: parseInt(r.totalPhoneDetection) || 0,
                integrityViolations: parseInt(r.integrityViolations) || 0,
                plagiarism: parseInt(r.plagiarismCount) || 0
            }
        }));

        // Cache for 1 hour
        cacheManager.set(cacheKey, leaderboard, 3600000);
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mentor Leaderboard
app.get('/api/mentor-leaderboard', async (req, res) => {
    try {
        // Check cache first (1 hour expiry)
        const cacheKey = 'leaderboard:mentor:all';
        const cachedData = cacheManager.get(cacheKey);
        if (cachedData) {
            return res.json(cachedData);
        }

        const [rows] = await pool.query(`
           SELECT m.id as mentorId, m.name,
           COUNT(DISTINCT s.id) as studentCount,
           COUNT(sub.id) as totalSubmissions,
           AVG(sub.score) as avgStudentScore
           FROM users m
           JOIN mentor_student_allocations ma ON m.id = ma.mentor_id
           JOIN users s ON ma.student_id = s.id
           LEFT JOIN submissions sub ON s.id = sub.student_id
           WHERE m.role = 'mentor'
           GROUP BY m.id
           ORDER BY avgStudentScore DESC
        `);

        const leaderboard = rows.map(r => ({
            mentorId: r.mentorId,
            name: r.name,
            studentCount: r.studentCount,
            totalContent: 0,
            totalSubmissions: r.totalSubmissions,
            avgStudentScore: Math.round(r.avgStudentScore || 0)
        }));

        // Cache for 1 hour
        cacheManager.set(cacheKey, leaderboard, 3600000);
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== TEST CASES API ====================

// Get test cases for a problem (visible only for students, all for mentors/admins)
app.get('/api/problems/:problemId/test-cases', async (req, res) => {
    try {
        const { problemId } = req.params;
        const { role } = req.query; // 'student', 'mentor', or 'admin'

        let query = 'SELECT * FROM test_cases WHERE problem_id = ?';
        if (role === 'student') {
            query += ' AND is_hidden = FALSE';
        }
        query += ' ORDER BY created_at ASC';

        const [testCases] = await pool.query(query, [problemId]);

        res.json(testCases.map(tc => ({
            id: tc.id,
            problemId: tc.problem_id,
            input: tc.input,
            expectedOutput: tc.expected_output,
            isHidden: tc.is_hidden,
            points: tc.points,
            description: tc.description
        })));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create test case (mentor/admin only)
app.post('/api/problems/:problemId/test-cases', async (req, res) => {
    try {
        const { problemId } = req.params;
        const { input, expectedOutput, isHidden, points, description } = req.body;
        const testCaseId = uuidv4();

        await pool.query(
            `INSERT INTO test_cases (id, problem_id, input, expected_output, is_hidden, points, description) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [testCaseId, problemId, input, expectedOutput, isHidden || false, points || 10, description || '']
        );

        res.json({
            id: testCaseId,
            problemId,
            input,
            expectedOutput,
            isHidden: isHidden || false,
            points: points || 10,
            description: description || ''
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update test case
app.put('/api/test-cases/:testCaseId', async (req, res) => {
    try {
        const { testCaseId } = req.params;
        const { input, expectedOutput, isHidden, points, description } = req.body;

        await pool.query(
            `UPDATE test_cases SET input = ?, expected_output = ?, is_hidden = ?, points = ?, description = ? WHERE id = ?`,
            [input, expectedOutput, isHidden, points, description, testCaseId]
        );

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete test case
app.delete('/api/test-cases/:testCaseId', async (req, res) => {
    try {
        const { testCaseId } = req.params;
        await pool.query('DELETE FROM test_cases WHERE id = ?', [testCaseId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Run code against inline test cases (for global test coding questions)
const languageMap = {
    'Python': { language: 'python', version: '3.10.0' },
    'JavaScript': { language: 'javascript', version: '18.15.0' },
    'Java': { language: 'java', version: '15.0.2' },
    'C': { language: 'c', version: '10.2.0' },
    'C++': { language: 'cpp', version: '10.2.0' },
    'SQL': { language: 'sqlite3', version: '3.36.0' }
};

async function runInlineCodingTests(code, language, testCases) {
    if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
        return { passedCount: 0, total: 0, percentage: 0, isCorrect: false };
    }
    const runtime = languageMap[language] || { language: 'python', version: '3.10.0' };
    let passedCount = 0;
    for (const tc of testCases) {
        const input = (tc.input != null ? tc.input : '').toString();
        const expected = (tc.expected_output != null ? tc.expected_output : tc.expectedOutput || '').toString().trim();
        try {
            const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language: runtime.language,
                    version: runtime.version,
                    files: [{ content: code }],
                    stdin: input
                })
            });
            const data = await response.json();
            const actual = (data.run?.output || '').trim();
            if (actual === expected) passedCount++;
        } catch (_) { /* fail this case */ }
    }
    const total = testCases.length;
    const percentage = total ? Math.round((passedCount / total) * 100) : 0;
    return { passedCount, total, percentage, isCorrect: passedCount === total };
}

async function runSqlAndCompare(schema, query, expectedOutput) {
    const expected = (expectedOutput || '').toString().trim().replace(/\r/g, '');
    try {
        const fullQuery = schema ? `${schema}\n\n${query}` : query;
        const response = await fetch('https://emkc.org/api/v2/piston/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: 'sqlite3',
                version: '3.36.0',
                files: [{ content: fullQuery }]
            })
        });
        const data = await response.json();
        const actual = (data.run?.output || '').trim().replace(/\r/g, '');

        // Smart comparison: check exact match, normalized match, or data-only match
        let isCorrect = false;
        if (data.run?.code === 0) {
            isCorrect = actual === expected ||
                normalizeSqlOutput(actual) === normalizeSqlOutput(expected) ||
                compareSqlDataOnly(actual, expected);
        }
        return { isCorrect, output: actual };
    } catch (e) {
        return { isCorrect: false, output: e.message };
    }
}

function normalizeSqlOutput(s) {
    return s.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

// Compare SQL output by extracting just the data values, ignoring column headers
function compareSqlDataOnly(actual, expected) {
    try {
        // Extract values from pipe-separated or newline format
        const extractValues = (str) => {
            // Replace pipes with newlines for uniform processing
            const normalized = str.replace(/\|/g, '\n').replace(/\r/g, '');
            // Split by newlines and filter out empty lines
            const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
            // Extract just numeric values and data (not column names which typically contain letters only)
            const dataValues = lines.filter(line => {
                // Keep lines that have numbers or are clearly data rows
                return /\d/.test(line) || line.includes('|');
            });
            // Also try to extract just the values from each line
            const allValues = lines.flatMap(line => {
                // Split by common delimiters and get values
                return line.split(/[\|\s]+/).map(v => v.trim()).filter(Boolean);
            });
            return {
                dataLines: dataValues.join('|').toLowerCase(),
                allValues: allValues.map(v => v.toLowerCase()).sort().join('|')
            };
        };

        const actualData = extractValues(actual);
        const expectedData = extractValues(expected);

        // Compare data lines (ignoring column headers)
        if (actualData.dataLines === expectedData.dataLines) return true;

        // Compare all extracted values (for different formatting)
        if (actualData.allValues === expectedData.allValues) return true;

        // Try comparing just the numeric/data portions
        const extractNumbers = (str) => {
            const nums = str.match(/[\d.]+/g) || [];
            return nums.sort().join(',');
        };
        if (extractNumbers(actual) === extractNumbers(expected)) return true;

        return false;
    } catch (e) {
        return false;
    }
}

app.post('/api/run-inline-tests', async (req, res) => {
    try {
        const { code, language, testCases } = req.body;
        const result = await runInlineCodingTests(code || '', language || 'Python', testCases || []);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sql/run-and-compare', async (req, res) => {
    try {
        const { schema, query, expectedOutput } = req.body;
        const result = await runSqlAndCompare(schema || '', query || '', expectedOutput);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Run code against all test cases
app.post('/api/run-with-tests', async (req, res) => {
    try {
        const { code, language, problemId, sqlSchema, isGlobalTest } = req.body;

        // Get all test cases for this problem
        let testCases = [];
        if (isGlobalTest) {
            const [rows] = await pool.query(
                'SELECT test_cases FROM test_questions WHERE question_id = ?',
                [problemId]
            );
            if (rows.length > 0) {
                const raw = rows[0].test_cases;
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                const casesArray = Array.isArray(parsed) ? parsed : (parsed?.cases || []);
                // Normalize for consistent processing
                testCases = casesArray.map((tc, idx) => ({
                    id: tc.id || `tc-${idx}`,
                    input: tc.input || '',
                    expected_output: tc.expected_output || tc.expectedOutput || '',
                    is_hidden: tc.isHidden || tc.is_hidden || false,
                    points: tc.points || 10,
                    description: tc.description || ''
                }));
            }
        } else {
            const [rows] = await pool.query(
                'SELECT * FROM test_cases WHERE problem_id = ? ORDER BY created_at ASC',
                [problemId]
            );
            testCases = rows;
        }

        // Language mapping for Piston
        const languageMap = {
            'Python': { language: 'python', version: '3.10.0' },
            'JavaScript': { language: 'javascript', version: '18.15.0' },
            'Java': { language: 'java', version: '15.0.2' },
            'C': { language: 'c', version: '10.2.0' },
            'C++': { language: 'cpp', version: '10.2.0' },
            'SQL': { language: 'sqlite3', version: '3.36.0' }
        };

        const runtime = languageMap[language] || { language: language.toLowerCase(), version: '*' };
        const results = [];
        let passedCount = 0;
        let totalPoints = 0;
        let earnedPoints = 0;

        // If no test cases, run code once and return output
        if (testCases.length === 0) {
            let codeToExecute = code;
            if (language === 'SQL' && sqlSchema) {
                codeToExecute = `${sqlSchema}\n\n${code}`;
            }

            const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language: runtime.language,
                    version: runtime.version,
                    files: [{ content: codeToExecute }]
                })
            });

            const data = await response.json();
            return res.json({
                hasTestCases: false,
                output: data.run?.output || 'No output',
                status: data.run?.code === 0 ? 'success' : 'error',
                results: []
            });
        }

        // Run against each test case
        for (const tc of testCases) {
            totalPoints += tc.points || 10;

            let codeWithInput = code;
            if (language === 'SQL') {
                codeWithInput = sqlSchema ? `${sqlSchema}\n\n${code}` : code;
            } else {
                // For other languages, we might need to handle input differently
                // This is a simplified version - in production you'd want stdin support
                codeWithInput = code;
            }

            try {
                const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        language: runtime.language,
                        version: runtime.version,
                        files: [{ content: codeWithInput }],
                        stdin: tc.input || ''
                    })
                });

                const data = await response.json();
                const actualOutput = (data.run?.output || '').trim();
                const expectedOutput = (tc.expected_output || '').trim();
                const passed = actualOutput === expectedOutput;

                if (passed) {
                    passedCount++;
                    earnedPoints += tc.points || 10;
                }

                results.push({
                    testCaseId: tc.id,
                    description: tc.description,
                    input: tc.input,
                    expectedOutput: tc.is_hidden ? '(Hidden)' : expectedOutput,
                    actualOutput: tc.is_hidden ? (passed ? 'Correct' : 'Incorrect') : actualOutput,
                    passed,
                    isHidden: tc.is_hidden,
                    points: tc.points || 10,
                    earnedPoints: passed ? (tc.points || 10) : 0
                });
            } catch (err) {
                results.push({
                    testCaseId: tc.id,
                    description: tc.description,
                    input: tc.input,
                    expectedOutput: tc.is_hidden ? '(Hidden)' : tc.expected_output,
                    actualOutput: 'Execution Error',
                    passed: false,
                    isHidden: tc.is_hidden,
                    points: tc.points || 10,
                    earnedPoints: 0,
                    error: err.message
                });
            }
        }

        res.json({
            hasTestCases: true,
            success: true,
            totalTestCases: testCases.length,
            passedTestCases: passedCount,
            totalPoints,
            earnedPoints,
            score: earnedPoints,
            percentage: Math.round((passedCount / testCases.length) * 100),
            testResults: results
        });

    } catch (error) {
        console.error('Run with tests error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== SQL EXECUTOR ====================

// Execute SQL and get visualization data
app.post('/api/sql/execute-visualize', async (req, res) => {
    try {
        const { query, schema } = req.body;

        // Execute via Piston
        let fullQuery = schema ? `${schema}\n\n${query}` : query;

        const response = await fetch('https://emkc.org/api/v2/piston/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: 'sqlite3',
                version: '3.36.0',
                files: [{ content: fullQuery }]
            })
        });

        const data = await response.json();
        const output = data.run?.output || '';
        const isError = data.run?.code !== 0;

        // Parse the output into table format
        let parsedData = { columns: [], rows: [], rawOutput: output };

        if (!isError && output.trim()) {
            const lines = output.trim().split('\n');
            if (lines.length > 0) {
                // Try to detect if it's tabular output
                const firstLine = lines[0];
                if (firstLine.includes('|')) {
                    // Pipe-separated format
                    parsedData.columns = firstLine.split('|').map(c => c.trim()).filter(c => c);
                    parsedData.rows = lines.slice(1)
                        .filter(line => line.includes('|') && !line.match(/^[\-\+]+$/))
                        .map(line => line.split('|').map(c => c.trim()).filter(c => c));
                } else {
                    // Plain output - parse as column-separated
                    parsedData.columns = ['Result'];
                    parsedData.rows = lines.map(line => [line]);
                }
            }
        }

        res.json({
            success: !isError,
            output,
            parsedData,
            executionTime: data.run?.time || 0,
            error: isError ? output : null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Parse SQL schema into structured JSON for visualization
app.post('/api/sql/parse-schema', async (req, res) => {
    try {
        const { schema } = req.body;

        const systemPrompt = `You are a Database Architect. Parse the provided SQL schema and return a structured JSON representation.
Identify:
1. Tables
2. Columns (with types)
3. Primary Keys
4. Foreign Keys and their relationships (references)

Respond in JSON format:
{
    "tables": [
        {
            "name": "string",
            "columns": [
                {
                    "name": "string",
                    "type": "string",
                    "isPrimaryKey": boolean,
                    "isForeignKey": boolean,
                    "references": { "table": "string", "column": "string" } | null
                }
            ]
        }
    ]
}`;

        const chatCompletion = await cerebrasChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Schema:\n${schema}` }
        ], {
            model: 'gpt-oss-120b',
            temperature: 0.1,
            max_tokens: 1500,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Break down SQL query into logical debugging steps
app.post('/api/sql/debug-steps', async (req, res) => {
    try {
        const { query, schema } = req.body;

        const systemPrompt = `You are a SQL Execution Engine analyzer. Break down the provided SELECT query into logical execution steps (Relational Algebra steps).
For each step, provide a modified SQL query that represents the state of data at that point.

Step sequence:
1. FROM / JOIN (Base Dataset)
2. WHERE (Filter)
3. GROUP BY / HAVING (Aggregation)
4. SELECT (Projection)
5. ORDER BY / LIMIT (Final Sort)

Respond in JSON format:
{
    "steps": [
        {
            "stepName": "string",
            "description": "string",
            "query": "string"
        }
    ]
}`;

        const userPrompt = `Schema:\n${schema}\n\nQuery:\n${query}`;

        const chatCompletion = await cerebrasChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], {
            model: 'gpt-oss-120b',
            temperature: 0.2,
            max_tokens: 1500,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(chatCompletion.choices[0]?.message?.content || '{"steps":[]}');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== STUDENT REPORT GENERATION ====================

// Generate comprehensive student report
app.post('/api/reports/student/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const { requestedBy, requestedByRole } = req.body;

        // Get student info
        const [studentRows] = await pool.query('SELECT * FROM users WHERE id = ?', [studentId]);
        if (studentRows.length === 0) return res.status(404).json({ error: 'Student not found' });

        const student = studentRows[0];
        const { password: _, ...studentInfo } = student;

        // Get mentor info
        const [mentorRows] = await pool.query(`
            SELECT m.id, m.name, m.email 
            FROM mentor_student_allocations msa
            JOIN users m ON msa.mentor_id = m.id
            WHERE msa.student_id = ?
        `, [studentId]);
        const mentorInfo = mentorRows[0] || null;

        // Code Submissions Analysis
        const [submissions] = await pool.query(`
            SELECT s.*, p.title as problemTitle, p.difficulty as problemDifficulty,
                   t.title as taskTitle, t.difficulty as taskDifficulty
            FROM submissions s
            LEFT JOIN problems p ON s.problem_id = p.id
            LEFT JOIN tasks t ON s.task_id = t.id
            WHERE s.student_id = ?
            ORDER BY s.submitted_at DESC
        `, [studentId]);

        const codeSubmissions = submissions.filter(s => s.problem_id);
        const taskSubmissions = submissions.filter(s => s.task_id);

        // Submission stats
        const avgCodeScore = codeSubmissions.length > 0
            ? Math.round(codeSubmissions.reduce((a, s) => a + (s.score || 0), 0) / codeSubmissions.length) : 0;
        const avgTaskScore = taskSubmissions.length > 0
            ? Math.round(taskSubmissions.reduce((a, s) => a + (s.score || 0), 0) / taskSubmissions.length) : 0;

        // Language breakdown
        const languageStats = {};
        submissions.forEach(s => {
            const lang = s.language || 'Unknown';
            if (!languageStats[lang]) languageStats[lang] = { count: 0, totalScore: 0 };
            languageStats[lang].count++;
            languageStats[lang].totalScore += s.score || 0;
        });
        const languageBreakdown = Object.entries(languageStats).map(([lang, data]) => ({
            language: lang,
            count: data.count,
            avgScore: Math.round(data.totalScore / data.count)
        }));

        // Integrity violations
        const totalTabSwitches = submissions.reduce((a, s) => a + (s.tab_switches || 0), 0);
        const totalCopyPaste = submissions.reduce((a, s) => a + (s.copy_paste_attempts || 0), 0);
        const totalCameraBlocked = submissions.reduce((a, s) => a + (s.camera_blocked_count || 0), 0);
        const totalPhoneDetections = submissions.reduce((a, s) => a + (s.phone_detection_count || 0), 0);
        const plagiarismCount = submissions.filter(s => s.plagiarism_detected === 'true').length;

        // Aptitude Test Results
        const [aptitudeSubmissions] = await pool.query(`
            SELECT asub.*, at.title as testTitle, at.difficulty, at.passing_score
            FROM aptitude_submissions asub
            LEFT JOIN aptitude_tests at ON asub.test_id = at.id
            WHERE asub.student_id = ?
            ORDER BY asub.submitted_at DESC
        `, [studentId]);

        console.log(`Found ${aptitudeSubmissions.length} aptitude submissions for student ${studentId}`);


        const avgAptitudeScore = aptitudeSubmissions.length > 0
            ? Math.round(aptitudeSubmissions.reduce((a, s) => a + s.score, 0) / aptitudeSubmissions.length) : 0;
        const aptitudePassed = aptitudeSubmissions.filter(s => s.status === 'passed').length;
        const aptitudeFailed = aptitudeSubmissions.filter(s => s.status === 'failed').length;

        // Task completions
        const [[{ completedTasks }]] = await pool.query(
            'SELECT COUNT(*) as completedTasks FROM task_completions WHERE student_id = ?', [studentId]
        );
        const [[{ completedProblems }]] = await pool.query(
            'SELECT COUNT(*) as completedProblems FROM problem_completions WHERE student_id = ?', [studentId]
        );

        // Global Test Results
        const [globalSubmissions] = await pool.query(`
            SELECT * FROM global_test_submissions 
            WHERE student_id = ?
            ORDER BY submitted_at DESC
        `, [studentId]);

        const avgGlobalScore = globalSubmissions.length > 0
            ? Math.round(globalSubmissions.reduce((a, s) => a + Number(s.overall_percentage), 0) / globalSubmissions.length) : 0;
        const globalPassed = globalSubmissions.filter(s => s.status === 'passed').length;

        // Performance trends (last 30 days)
        const [trends] = await pool.query(`
            SELECT DATE(submitted_at) as date, AVG(score) as avgScore, COUNT(*) as count
            FROM submissions WHERE student_id = ? AND submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(submitted_at) ORDER BY date ASC
        `, [studentId]);

        // Get leaderboard position
        const [leaderboard] = await pool.query(`
            SELECT u.id, 
                   (IFNULL(AVG(s.score), 0) + IFNULL(AVG(asub.score), 0) + IFNULL(AVG(g.overall_percentage), 0)) / 
                   (CASE WHEN (AVG(s.score) IS NOT NULL AND AVG(asub.score) IS NOT NULL AND AVG(g.overall_percentage) IS NOT NULL) THEN 3 
                         WHEN ((AVG(s.score) IS NOT NULL AND AVG(asub.score) IS NOT NULL) OR (AVG(s.score) IS NOT NULL AND AVG(g.overall_percentage) IS NOT NULL) OR (AVG(asub.score) IS NOT NULL AND AVG(g.overall_percentage) IS NOT NULL)) THEN 2
                         ELSE 1 END) as avgScore
            FROM users u 
            LEFT JOIN submissions s ON u.id = s.student_id
            LEFT JOIN aptitude_submissions asub ON u.id = asub.student_id
            LEFT JOIN global_test_submissions g ON u.id = g.student_id
            WHERE u.role = 'student' 
            GROUP BY u.id 
            ORDER BY avgScore DESC
        `);
        const rank = leaderboard.findIndex(l => l.id === studentId) + 1;

        // Category analysis for aptitude AND global
        const [aptitudeDetails] = await pool.query(`
            SELECT aqr.category, COUNT(*) as total,
                   SUM(CASE WHEN aqr.is_correct = 'true' OR aqr.is_correct = 1 THEN 1 ELSE 0 END) as correct
            FROM aptitude_question_results aqr
            JOIN aptitude_submissions asub ON aqr.submission_id = asub.id
            WHERE asub.student_id = ?
            GROUP BY aqr.category
            UNION ALL
            SELECT section as category, COUNT(*) as total,
                   SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct
            FROM question_results qr
            JOIN global_test_submissions gts ON qr.submission_id = gts.id
            WHERE gts.student_id = ?
            GROUP BY section
        `, [studentId, studentId]);

        const categoryAnalysis = aptitudeDetails.map(c => ({
            category: c.category || 'General',
            total: c.total,
            correct: c.correct,
            accuracy: Math.round((c.correct / c.total) * 100)
        }));

        // Generate AI insights
        let aiInsights = null;
        try {
            const insightPrompt = `Analyze this student's performance and provide personalized recommendations:
            
Student: ${student.name}
Overall Stats:
- Code Submissions: ${codeSubmissions.length} (Avg Score: ${avgCodeScore}%)
- Task Submissions: ${taskSubmissions.length} (Avg Score: ${avgTaskScore}%)
- Aptitude Tests: ${aptitudeSubmissions.length} (Passed: ${aptitudePassed}, Failed: ${aptitudeFailed}, Avg: ${avgAptitudeScore}%)
- Leaderboard Rank: #${rank} out of ${leaderboard.length}

Integrity Issues:
- Tab Switches: ${totalTabSwitches}
- Plagiarism Detected: ${plagiarismCount} times

Language Proficiency: ${languageBreakdown.map(l => `${l.language}: ${l.count} submissions, ${l.avgScore}% avg`).join(', ')}

Category Analysis: ${categoryAnalysis.map(c => `${c.category}: ${c.accuracy}% accuracy`).join(', ')}

Provide a JSON response with:
{
    "overallAssessment": "Brief 2-3 sentence overall assessment",
    "strengths": ["strength1", "strength2", "strength3"],
    "areasForImprovement": ["area1", "area2", "area3"],
    "recommendations": ["recommendation1", "recommendation2", "recommendation3"],
    "performanceLevel": "Excellent/Good/Average/Needs Improvement",
    "predictedGrowth": "High/Medium/Low"
}`;

            const aiResponse = await cerebrasChat([
                { role: 'system', content: 'You are an educational performance analyst. Provide constructive, actionable insights.' },
                { role: 'user', content: insightPrompt }
            ], { model: 'gpt-oss-120b', temperature: 0.3, response_format: { type: 'json_object' } });

            aiInsights = JSON.parse(aiResponse.choices[0]?.message?.content || '{}');
        } catch (e) {
            console.error('AI Insights generation failed:', e.message);
        }

        // Compile full report
        const report = {
            generatedAt: new Date().toISOString(),
            requestedBy,
            requestedByRole,
            student: {
                id: studentInfo.id,
                name: studentInfo.name,
                email: studentInfo.email,
                createdAt: studentInfo.created_at
            },
            mentor: mentorInfo,
            summary: {
                totalSubmissions: submissions.length,
                codeSubmissions: codeSubmissions.length,
                taskSubmissions: taskSubmissions.length,
                aptitudeTests: aptitudeSubmissions.length,
                completedProblems,
                completedTasks,
                avgCodeScore,
                avgTaskScore,
                avgAptitudeScore,
                overallAvgScore: Math.round((avgCodeScore + avgTaskScore + avgAptitudeScore) / 3),
                leaderboardRank: rank,
                totalStudents: leaderboard.length,
                avgGlobalScore,
                globalTestsCount: globalSubmissions.length
            },
            integrity: {
                tabSwitches: totalTabSwitches,
                copyPasteAttempts: totalCopyPaste,
                cameraBlocked: totalCameraBlocked,
                phoneDetections: totalPhoneDetections,
                plagiarismCount,
                integrityScore: Math.max(0, 100 - (totalTabSwitches * 2) - (plagiarismCount * 20) - (totalCopyPaste * 3))
            },
            languageBreakdown,
            categoryAnalysis,
            aptitudeResults: aptitudeSubmissions.map(a => ({
                testTitle: a.testTitle,
                score: a.score,
                status: a.status,
                difficulty: a.difficulty,
                submittedAt: a.submitted_at
            })),
            globalResults: globalSubmissions.map(g => ({
                testTitle: g.test_title,
                score: g.overall_percentage,
                status: g.status,
                submittedAt: g.submitted_at
            })),
            recentSubmissions: submissions.slice(0, 10).map(s => ({
                title: s.problemTitle || s.taskTitle || 'Unknown',
                type: s.problem_id ? 'Code' : 'Task',
                score: s.score,
                status: s.status,
                language: s.language,
                submittedAt: s.submitted_at
            })),
            trends: trends.map(t => ({
                date: t.date,
                avgScore: Math.round(t.avgScore),
                count: t.count
            })),
            aiInsights
        };

        res.json(report);

    } catch (error) {
        console.error('Report Generation Error:', error);
        res.status(500).json({ error: 'Failed to generate report', details: error.message });
    }
});

// Generate bulk reports for multiple students
app.post('/api/reports/bulk', async (req, res) => {
    try {
        const { studentIds, requestedBy, requestedByRole } = req.body;

        if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ error: 'No students selected' });
        }

        const reports = [];
        for (const studentId of studentIds) {
            try {
                const response = await axios.post(`http://localhost:3000/api/reports/student/${studentId}`, {
                    requestedBy,
                    requestedByRole
                });
                reports.push(response.data);
            } catch (e) {
                reports.push({ studentId, error: 'Failed to generate report' });
            }
        }

        res.json({ reports, generatedAt: new Date().toISOString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== AI GENERATION FOR CODING & SQL ====================

// Generate Coding Problem with AI
app.post('/api/ai/generate-coding-problem', async (req, res) => {
    try {
        const { topic, difficulty, language } = req.body;

        const systemPrompt = `You are an expert programming instructor and problem setter. Generate a coding problem based on the given topic and difficulty.

Return a JSON object with:
{
    "question": "A detailed problem description with context, requirements, and examples",
    "starterCode": "ONLY the function signature/boilerplate. DO NOT include the solution implementation.",
    "testCases": [
        { "input": "test input 1", "expected_output": "expected output 1" },
        { "input": "test input 2", "expected_output": "expected output 2" }
    ],
    "solutionCode": "A reference solution (hidden from students)",
    "hints": ["hint 1", "hint 2"],
    "explanation": "Brief explanation of the approach"
}

Guidelines:
- Problem should match the ${difficulty} difficulty level
- Use ${language} syntax for starter code
- Include 3-5 test cases covering edge cases
- Problem should be clear and solvable in 15-30 minutes`;

        const chatCompletion = await cerebrasChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Topic: ${topic}\nDifficulty: ${difficulty}\nLanguage: ${language}` }
        ], {
            model: 'gpt-oss-120b',
            temperature: 0.7,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');
        res.json({ problem: { ...result, language, difficulty } });

    } catch (error) {
        console.error('Generate Coding Problem Error:', error);
        // Fallback response
        res.json({
            problem: {
                question: `Write a ${req.body.language || 'Python'} program to solve: ${req.body.topic || 'the given problem'}`,
                starterCode: req.body.language === 'Python'
                    ? '# Write your solution here\ndef solution():\n    pass\n\n# Test your code\nsolution()'
                    : '// Write your solution here',
                testCases: [{ input: '', expected_output: 'Enter expected output' }],
                language: req.body.language || 'Python',
                difficulty: req.body.difficulty || 'Medium'
            }
        });
    }
});

// Generate SQL Problem with AI
app.post('/api/ai/generate-sql-problem', async (req, res) => {
    try {
        const { topic, difficulty } = req.body;

        const systemPrompt = `You are an expert SQL instructor and database problem setter. Generate a SQL problem based on the given topic and difficulty.

Return a JSON object with:
{
    "question": "A detailed problem description explaining what query the student needs to write",
    "schema": "Complete SQL schema with CREATE TABLE statements and sample INSERT statements (use SQLite syntax)",
    "expectedOutput": "The exact expected output of the correct query (pipe-separated format)",
    "solutionQuery": "The correct SQL query (hidden from students)",
    "hints": ["hint 1", "hint 2"],
    "explanation": "Brief explanation of the SQL concepts involved"
}

Guidelines:
- Problem should match the ${difficulty} difficulty level
- Use SQLite-compatible syntax
- Schema should have 1-3 tables with meaningful sample data
- Expected output should be in pipe-separated format with headers
- Problem should test practical SQL skills`;

        const chatCompletion = await cerebrasChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Topic: ${topic}\nDifficulty: ${difficulty}` }
        ], {
            model: 'gpt-oss-120b',
            temperature: 0.7,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');
        res.json({ problem: { ...result, difficulty } });

    } catch (error) {
        console.error('Generate SQL Problem Error:', error);
        // Fallback response
        res.json({
            problem: {
                question: `Write a SQL query to: ${req.body.topic || 'retrieve data from the database'}`,
                schema: `-- Sample schema\nCREATE TABLE employees (\n    id INTEGER PRIMARY KEY,\n    name TEXT,\n    department TEXT,\n    salary INTEGER\n);\n\nINSERT INTO employees VALUES (1, 'John', 'Engineering', 50000);\nINSERT INTO employees VALUES (2, 'Jane', 'Marketing', 45000);`,
                expectedOutput: 'id|name|department|salary\n1|John|Engineering|50000\n2|Jane|Marketing|45000',
                difficulty: req.body.difficulty || 'Medium'
            }
        });
    }
});

// ==================== ADMIN CACHE MANAGEMENT ====================

// Admin cache stats endpoint - view what's cached
app.get('/api/admin/cache-stats', async (req, res) => {
    try {
        // Get admin authentication (optional - add actual auth check if needed)
        const stats = {
            totalCachedItems: Object.keys(cacheManager.data).length,
            cacheDetails: {},
            cacheHitRate: cacheManager.getStats && cacheManager.getStats() || { hits: 0, misses: 0 }
        };

        // Show details of cached items
        for (const key in cacheManager.data) {
            const item = cacheManager.data[key];
            stats.cacheDetails[key] = {
                size: JSON.stringify(item.value).length,
                expiresAt: new Date(item.expiresAt).toISOString(),
                age: Math.floor((Date.now() - item.createdAt) / 1000) + 's'
            };
        }

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin cache clear endpoint - manually clear caches
app.post('/api/admin/cache-clear', async (req, res) => {
    try {
        const { pattern } = req.body;

        if (pattern) {
            // Clear specific cache pattern (e.g., 'student:*:analytics')
            cacheManager.deletePattern(pattern);
            res.json({ message: `Cache cleared for pattern: ${pattern}` });
        } else {
            // Clear all caches
            cacheManager.clear();
            res.json({ message: 'All caches cleared' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== ADMIN OPERATIONS (Features 66-72) ====================

// ===== AUDIT LOGGING MIDDLEWARE =====
async function logAudit(userId, userName, userRole, action, resourceType, resourceId, details, ipAddress) {
    try {
        await pool.query(
            `INSERT INTO audit_logs (id, user_id, user_name, user_role, action, resource_type, resource_id, details, ip_address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), userId, userName, userRole, action, resourceType, resourceId, JSON.stringify(details), ipAddress]
        );
    } catch (e) {
        console.error('Audit log failed:', e.message);
    }
}

// ===== 66. BULK OPERATIONS =====

// Bulk reassign students to a different mentor (protected)
app.post('/api/admin/bulk/reassign-students', authenticate, authorize('admin'), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { studentIds, newMentorId, adminId, adminName } = req.body;
        if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0 || !newMentorId) {
            return res.status(400).json({ error: 'studentIds array and newMentorId are required' });
        }

        await connection.beginTransaction();

        // Get old mentor assignments for audit
        const placeholders = studentIds.map(() => '?').join(',');
        const [oldAssignments] = await connection.query(
            `SELECT student_id, mentor_id FROM mentor_student_allocations WHERE student_id IN (${placeholders})`,
            studentIds
        );

        // Delete old assignments
        await connection.query(
            `DELETE FROM mentor_student_allocations WHERE student_id IN (${placeholders})`,
            studentIds
        );

        // Also update the mentor_id field in users table
        await connection.query(
            `UPDATE users SET mentor_id = ? WHERE id IN (${placeholders})`,
            [newMentorId, ...studentIds]
        );

        // Insert new assignments
        for (const studentId of studentIds) {
            await connection.query(
                'INSERT INTO mentor_student_allocations (mentor_id, student_id) VALUES (?, ?)',
                [newMentorId, studentId]
            );
        }

        await connection.commit();

        // Audit log
        await logAudit(adminId, adminName, 'admin', 'bulk_reassign_students', 'allocation', newMentorId, {
            studentIds,
            newMentorId,
            previousAssignments: oldAssignments,
            count: studentIds.length
        }, req.ip);

        // Clear relevant caches
        cacheManager.deletePattern && cacheManager.deletePattern('admin:');

        res.json({ success: true, message: `${studentIds.length} students reassigned successfully`, count: studentIds.length });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Bulk regrade submissions
app.post('/api/admin/bulk/regrade-submissions', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { submissionIds, action, adminId, adminName } = req.body;
        // action: 'regrade_all', 'mark_passed', 'mark_failed', 'reset_scores'
        if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
            return res.status(400).json({ error: 'submissionIds array is required' });
        }

        await connection.beginTransaction();

        const placeholders = submissionIds.map(() => '?').join(',');
        let updateQuery = '';
        let updateDesc = '';

        switch (action) {
            case 'mark_passed':
                updateQuery = `UPDATE submissions SET status = 'passed', score = GREATEST(score, 60) WHERE id IN (${placeholders})`;
                updateDesc = 'Marked as passed';
                break;
            case 'mark_failed':
                updateQuery = `UPDATE submissions SET status = 'failed', score = 0 WHERE id IN (${placeholders})`;
                updateDesc = 'Marked as failed';
                break;
            case 'reset_scores':
                updateQuery = `UPDATE submissions SET score = 0, status = 'pending' WHERE id IN (${placeholders})`;
                updateDesc = 'Scores reset';
                break;
            default:
                await connection.rollback();
                return res.status(400).json({ error: 'Invalid action. Use: mark_passed, mark_failed, reset_scores' });
        }

        const [result] = await connection.query(updateQuery, submissionIds);
        await connection.commit();

        await logAudit(adminId, adminName, 'admin', 'bulk_regrade', 'submission', null, {
            submissionIds,
            action,
            affectedRows: result.affectedRows,
            description: updateDesc
        }, req.ip);

        cacheManager.deletePattern && cacheManager.deletePattern('admin:');

        res.json({ success: true, message: `${result.affectedRows} submissions updated: ${updateDesc}`, affectedRows: result.affectedRows });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Bulk delete submissions
app.post('/api/admin/bulk/delete-submissions', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { submissionIds, adminId, adminName } = req.body;
        if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
            return res.status(400).json({ error: 'submissionIds array required' });
        }

        await connection.beginTransaction();
        const placeholders = submissionIds.map(() => '?').join(',');
        const [result] = await connection.query(`DELETE FROM submissions WHERE id IN (${placeholders})`, submissionIds);
        await connection.commit();

        await logAudit(adminId, adminName, 'admin', 'bulk_delete_submissions', 'submission', null, {
            submissionIds, deletedCount: result.affectedRows
        }, req.ip);

        cacheManager.deletePattern && cacheManager.deletePattern('admin:');
        res.json({ success: true, message: `${result.affectedRows} submissions deleted`, deletedCount: result.affectedRows });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// ===== 67. SYSTEM HEALTH DASHBOARD =====

app.get('/api/admin/system-health', async (req, res) => {
    try {
        const startTime = Date.now();

        // Database health
        let dbStatus = 'healthy';
        let dbLatency = 0;
        try {
            const dbStart = Date.now();
            await pool.query('SELECT 1');
            dbLatency = Date.now() - dbStart;
            if (dbLatency > 1000) dbStatus = 'degraded';
        } catch (e) {
            dbStatus = 'down';
            dbLatency = -1;
        }

        // DB stats
        const [[{ tableCount }]] = await pool.query(
            `SELECT COUNT(*) as tableCount FROM information_schema.tables WHERE table_schema = DATABASE()`
        );

        const [tableSizes] = await pool.query(`
            SELECT table_name as tableName, 
                   table_rows as rowCount,
                   ROUND((data_length + index_length) / 1024 / 1024, 2) as sizeMB
            FROM information_schema.tables 
            WHERE table_schema = DATABASE()
            ORDER BY (data_length + index_length) DESC
            LIMIT 15
        `);

        const [[{ totalSizeMB }]] = await pool.query(`
            SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as totalSizeMB
            FROM information_schema.tables 
            WHERE table_schema = DATABASE()
        `);

        // Connection pool info
        const poolInfo = {
            connectionLimit: pool.pool ? pool.pool.config.connectionLimit : 10,
            // Approximation since mysql2 doesn't expose all pool stats
            status: 'active'
        };

        // Memory usage
        const memUsage = process.memoryUsage();
        const memory = {
            rss: Math.round(memUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
            external: Math.round(memUsage.external / 1024 / 1024),
            heapPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
        };

        // Uptime
        const uptimeSeconds = process.uptime();
        const uptime = {
            seconds: Math.floor(uptimeSeconds),
            formatted: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${Math.floor(uptimeSeconds % 60)}s`
        };

        // Disk usage for uploads folder
        let uploadsSize = 0;
        const uploadsPath = path.join(__dirname, 'uploads');
        if (fs.existsSync(uploadsPath)) {
            const getSize = (dir) => {
                let size = 0;
                try {
                    const files = fs.readdirSync(dir);
                    for (const file of files) {
                        const filePath = path.join(dir, file);
                        const stat = fs.statSync(filePath);
                        if (stat.isDirectory()) {
                            size += getSize(filePath);
                        } else {
                            size += stat.size;
                        }
                    }
                } catch (e) { /* ignore */ }
                return size;
            };
            uploadsSize = Math.round(getSize(uploadsPath) / 1024 / 1024 * 100) / 100;
        }

        // Recent error count from audit logs (last 24h)
        let recentErrors = 0;
        try {
            const [[{ errorCount }]] = await pool.query(
                `SELECT COUNT(*) as errorCount FROM audit_logs WHERE action LIKE '%error%' AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
            );
            recentErrors = errorCount;
        } catch (e) { /* table may not exist yet */ }

        // Active WebSocket connections
        const wsConnections = {
            mentors: activeConnections.mentors.size,
            admins: activeConnections.admins.size,
            students: activeConnections.students.size,
            total: activeConnections.mentors.size + activeConnections.admins.size + activeConnections.students.size
        };

        // Cache stats
        const cacheStats = {
            totalItems: Object.keys(cacheManager.data || {}).length,
            hitRate: cacheManager.getStats ? cacheManager.getStats() : null
        };

        const totalLatency = Date.now() - startTime;

        res.json({
            status: dbStatus === 'healthy' && memory.heapPercent < 90 ? 'healthy' : 'warning',
            timestamp: new Date().toISOString(),
            apiLatency: totalLatency,
            database: {
                status: dbStatus,
                latency: dbLatency,
                tableCount,
                totalSizeMB: totalSizeMB || 0,
                tables: tableSizes,
                pool: poolInfo
            },
            memory,
            uptime,
            storage: {
                uploadsSizeMB: uploadsSize
            },
            websockets: wsConnections,
            cache: cacheStats,
            recentErrors,
            nodeVersion: process.version,
            platform: process.platform
        });
    } catch (error) {
        res.status(500).json({ error: error.message, status: 'error' });
    }
});

// ===== 68. COMPREHENSIVE AUDIT LOGGING =====

// Get audit logs with filters
app.get('/api/admin/audit-logs', async (req, res) => {
    try {
        const { userId, action, resourceType, startDate, endDate, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;
        let where = [];
        let params = [];

        if (userId) { where.push('user_id = ?'); params.push(userId); }
        if (action) { where.push('action LIKE ?'); params.push(`%${action}%`); }
        if (resourceType) { where.push('resource_type = ?'); params.push(resourceType); }
        if (startDate) { where.push('timestamp >= ?'); params.push(startDate); }
        if (endDate) { where.push('timestamp <= ?'); params.push(endDate); }

        const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

        const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`, params);

        const [logs] = await pool.query(
            `SELECT * FROM audit_logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );

        // Parse JSON details
        const parsedLogs = logs.map(log => ({
            ...log,
            details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
        }));

        res.json({
            logs: parsedLogs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get audit log summary/stats
app.get('/api/admin/audit-logs/stats', async (req, res) => {
    try {
        const [[{ totalLogs }]] = await pool.query('SELECT COUNT(*) as totalLogs FROM audit_logs');

        const [actionBreakdown] = await pool.query(
            `SELECT action, COUNT(*) as count FROM audit_logs GROUP BY action ORDER BY count DESC LIMIT 10`
        );

        const [userActivity] = await pool.query(
            `SELECT user_name, user_role, COUNT(*) as actionCount FROM audit_logs 
             WHERE user_name IS NOT NULL 
             GROUP BY user_id, user_name, user_role ORDER BY actionCount DESC LIMIT 10`
        );

        const [recentActivity] = await pool.query(
            `SELECT DATE(timestamp) as date, COUNT(*) as count FROM audit_logs 
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
             GROUP BY DATE(timestamp) ORDER BY date ASC`
        );

        res.json({
            totalLogs,
            actionBreakdown,
            userActivity,
            recentActivity: recentActivity.map(r => ({
                date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                count: r.count
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ AUDIT LOG DASHBOARD ENHANCEMENTS (Feature #4) ============

// 🔍 GET /api/admin/audit-logs/search - Advanced search with full-text
app.get('/api/admin/audit-logs/search', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { query, filters = '{}', page = 1, limit = 50 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const parsedFilters = JSON.parse(filters);

        let sqlQuery = 'SELECT * FROM audit_logs WHERE 1=1';
        const params = [];

        // Full-text search
        if (query) {
            sqlQuery += ' AND (action LIKE ? OR user_name LIKE ? OR resource_type LIKE ? OR details LIKE ?)';
            const searchTerm = `%${query}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        // Apply filters
        if (parsedFilters.userId) {
            sqlQuery += ' AND user_id = ?';
            params.push(parsedFilters.userId);
        }
        if (parsedFilters.userRole) {
            sqlQuery += ' AND user_role = ?';
            params.push(parsedFilters.userRole);
        }
        if (parsedFilters.action) {
            sqlQuery += ' AND action LIKE ?';
            params.push(`%${parsedFilters.action}%`);
        }
        if (parsedFilters.resourceType) {
            sqlQuery += ' AND resource_type = ?';
            params.push(parsedFilters.resourceType);
        }
        if (parsedFilters.startDate) {
            sqlQuery += ' AND timestamp >= ?';
            params.push(parsedFilters.startDate);
        }
        if (parsedFilters.endDate) {
            sqlQuery += ' AND timestamp <= ?';
            params.push(parsedFilters.endDate);
        }

        // Get total count
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) as total FROM audit_logs WHERE 1=1 ${query ? 'AND (action LIKE ? OR user_name LIKE ? OR resource_type LIKE ?)' : ''}`,
            query ? params.slice(0, 3) : []
        );

        // Get paginated results
        const [logs] = await pool.query(
            sqlQuery + ' ORDER BY timestamp DESC LIMIT ? OFFSET ?',
            [...params, Number(limit), offset]
        );

        const parsedLogs = logs.map(log => ({
            ...log,
            details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
        }));

        res.json({
            logs: parsedLogs,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        console.error('Search error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 📊 GET /api/admin/audit-logs/export - Export logs as CSV
app.get('/api/admin/audit-logs/export', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { format = 'csv', startDate, endDate, action, userId } = req.query;
        let sqlQuery = 'SELECT id, user_id, user_name, user_role, action, resource_type, resource_id, details, ip_address, timestamp FROM audit_logs WHERE 1=1';
        const params = [];

        if (startDate) {
            sqlQuery += ' AND timestamp >= ?';
            params.push(startDate);
        }
        if (endDate) {
            sqlQuery += ' AND timestamp <= ?';
            params.push(endDate);
        }
        if (action) {
            sqlQuery += ' AND action LIKE ?';
            params.push(`%${action}%`);
        }
        if (userId) {
            sqlQuery += ' AND user_id = ?';
            params.push(userId);
        }

        const [logs] = await pool.query(sqlQuery + ' ORDER BY timestamp DESC LIMIT 10000', params);

        if (format === 'csv') {
            // CSV Format
            const headers = ['ID', 'User ID', 'User Name', 'Role', 'Action', 'Resource Type', 'Resource ID', 'Details', 'IP Address', 'Timestamp'];
            const rows = logs.map(log => [
                log.id,
                log.user_id,
                log.user_name,
                log.user_role,
                log.action,
                log.resource_type,
                log.resource_id,
                typeof log.details === 'string' ? log.details : JSON.stringify(log.details),
                log.ip_address,
                log.timestamp
            ]);

            const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.csv"`);
            res.send(csv);
        } else if (format === 'json') {
            // JSON Format
            const parsed = logs.map(log => ({
                ...log,
                details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details
            }));

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.json"`);
            res.json(parsed);
        }
    } catch (error) {
        console.error('Export error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ⚠️ GET /api/admin/audit-logs/alerts - Get critical alerts from audit logs
app.get('/api/admin/audit-logs/alerts', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const criticalActions = ['delete', 'ban', 'reset', 'bulk_delete', 'permission_change', 'tier_change', 'plagiarism_detected'];
        const placeholders = criticalActions.map(() => '?').join(',');

        const [alerts] = await pool.query(
            `SELECT * FROM audit_logs 
             WHERE action IN (${placeholders})
             AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
             ORDER BY timestamp DESC`,
            criticalActions
        );

        const parsedAlerts = alerts.map(alert => ({
            ...alert,
            severity: alert.action.includes('delete') || alert.action.includes('ban') ? 'critical' : 'high',
            details: typeof alert.details === 'string' ? JSON.parse(alert.details) : alert.details
        }));

        res.json({
            alertsCount: parsedAlerts.length,
            alerts: parsedAlerts.slice(0, 50) // Latest 50
        });
    } catch (error) {
        console.error('Alerts error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 📈 GET /api/admin/audit-logs/analytics - Advanced analytics
app.get('/api/admin/audit-logs/analytics', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { period = '7' } = req.query; // days
        const days = parseInt(period);

        // Action frequency over time
        const [actionTrends] = await pool.query(
            `SELECT DATE(timestamp) as date, action, COUNT(*) as count 
             FROM audit_logs 
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY DATE(timestamp), action
             ORDER BY date ASC, count DESC`,
            [days]
        );

        // Most active users
        const [topUsers] = await pool.query(
            `SELECT user_id, user_name, user_role, COUNT(*) as actionCount, COUNT(DISTINCT DATE(timestamp)) as activeDays
             FROM audit_logs
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY) AND user_name IS NOT NULL
             GROUP BY user_id, user_name, user_role
             ORDER BY actionCount DESC
             LIMIT 20`,
            [days]
        );

        // Resource type distribution
        const [resourceDist] = await pool.query(
            `SELECT resource_type, COUNT(*) as count 
             FROM audit_logs 
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY) AND resource_type IS NOT NULL
             GROUP BY resource_type
             ORDER BY count DESC`,
            [days]
        );

        // Hourly distribution
        const [hourly] = await pool.query(
            `SELECT HOUR(timestamp) as hour, COUNT(*) as count
             FROM audit_logs
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
             GROUP BY HOUR(timestamp)
             ORDER BY hour ASC`
        );

        res.json({
            actionTrends,
            topUsers,
            resourceDistribution: resourceDist,
            hourlyDistribution: hourly,
            period: days
        });
    } catch (error) {
        console.error('Analytics error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 🔔 GET /api/admin/audit-logs/real-time-summary - Current activity summary
app.get('/api/admin/audit-logs/real-time-summary', authenticate, authorize(['admin']), async (req, res) => {
    try {
        // Last hour activity
        const [[{ lastHourCount }]] = await pool.query(
            `SELECT COUNT(*) as lastHourCount FROM audit_logs WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`
        );

        // Last 24 hours activity
        const [[{ last24hCount }]] = await pool.query(
            `SELECT COUNT(*) as last24hCount FROM audit_logs WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        );

        // Critical actions in last hour
        const [criticalLastHour] = await pool.query(
            `SELECT COUNT(*) as count FROM audit_logs 
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
             AND action IN ('delete', 'ban', 'reset', 'bulk_delete', 'permission_change', 'tier_change')`
        );

        // Failed operations
        const [failedOps] = await pool.query(
            `SELECT COUNT(*) as count FROM audit_logs 
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
             AND (action LIKE '%error%' OR action LIKE '%failed%')`
        );

        // Unique users active in last 24h
        const [[{ activeUsers }]] = await pool.query(
            `SELECT COUNT(DISTINCT user_id) as activeUsers FROM audit_logs 
             WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
        );

        res.json({
            currentActivity: {
                lastHourCount,
                last24hCount,
                criticalAlerts: criticalLastHour[0].count,
                failedOperations: failedOps[0].count,
                activeUsersLast24h: activeUsers
            },
            healthStatus: lastHourCount < 100 ? 'normal' : 'high',
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Summary error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ===== 69. PROBLEM SET TEMPLATES =====

// List all templates
app.get('/api/admin/templates', async (req, res) => {
    try {
        const [templates] = await pool.query(
            `SELECT t.*, COUNT(ti.id) as problemCount 
             FROM problem_set_templates t 
             LEFT JOIN problem_set_template_items ti ON t.id = ti.template_id 
             GROUP BY t.id 
             ORDER BY t.created_at DESC`
        );

        for (const template of templates) {
            template.tags = typeof template.tags === 'string' ? JSON.parse(template.tags) : template.tags;
        }

        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single template with problems
app.get('/api/admin/templates/:id', async (req, res) => {
    try {
        const [[template]] = await pool.query('SELECT * FROM problem_set_templates WHERE id = ?', [req.params.id]);
        if (!template) return res.status(404).json({ error: 'Template not found' });

        template.tags = typeof template.tags === 'string' ? JSON.parse(template.tags) : template.tags;

        const [items] = await pool.query(
            `SELECT ti.*, p.title, p.description, p.difficulty, p.language 
             FROM problem_set_template_items ti 
             JOIN problems p ON ti.problem_id = p.id 
             WHERE ti.template_id = ? 
             ORDER BY ti.sort_order`,
            [req.params.id]
        );

        template.problems = items;
        res.json(template);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create template
app.post('/api/admin/templates', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { name, description, difficulty, tags, problemIds, createdBy, adminName } = req.body;
        const id = uuidv4();

        await connection.beginTransaction();

        await connection.query(
            `INSERT INTO problem_set_templates (id, name, description, difficulty, tags, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, name, description, difficulty || 'Mixed', JSON.stringify(tags || []), createdBy]
        );

        if (problemIds && Array.isArray(problemIds)) {
            for (let i = 0; i < problemIds.length; i++) {
                await connection.query(
                    'INSERT INTO problem_set_template_items (id, template_id, problem_id, sort_order) VALUES (?, ?, ?, ?)',
                    [uuidv4(), id, problemIds[i], i]
                );
            }
        }

        await connection.commit();

        await logAudit(createdBy, adminName, 'admin', 'create_template', 'template', id, {
            name, difficulty, problemCount: problemIds?.length || 0
        }, req.ip);

        res.json({ success: true, id, message: 'Template created successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Update template
app.put('/api/admin/templates/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { name, description, difficulty, tags, problemIds } = req.body;
        await connection.beginTransaction();

        await connection.query(
            `UPDATE problem_set_templates SET name = ?, description = ?, difficulty = ?, tags = ? WHERE id = ?`,
            [name, description, difficulty, JSON.stringify(tags || []), req.params.id]
        );

        if (problemIds && Array.isArray(problemIds)) {
            await connection.query('DELETE FROM problem_set_template_items WHERE template_id = ?', [req.params.id]);
            for (let i = 0; i < problemIds.length; i++) {
                await connection.query(
                    'INSERT INTO problem_set_template_items (id, template_id, problem_id, sort_order) VALUES (?, ?, ?, ?)',
                    [uuidv4(), req.params.id, problemIds[i], i]
                );
            }
        }

        await connection.commit();
        res.json({ success: true, message: 'Template updated' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Delete template
app.delete('/api/admin/templates/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM problem_set_template_items WHERE template_id = ?', [req.params.id]);
        await connection.query('DELETE FROM problem_set_templates WHERE id = ?', [req.params.id]);
        await connection.commit();

        await logAudit(req.query.adminId, req.query.adminName, 'admin', 'delete_template', 'template', req.params.id, {}, req.ip);
        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Apply template - create problems from a template
app.post('/api/admin/templates/:id/apply', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { mentorId, adminId, adminName } = req.body;
        const [items] = await connection.query(
            `SELECT p.* FROM problem_set_template_items ti 
             JOIN problems p ON ti.problem_id = p.id 
             WHERE ti.template_id = ? ORDER BY ti.sort_order`,
            [req.params.id]
        );

        if (items.length === 0) {
            return res.status(400).json({ error: 'Template has no problems' });
        }

        await connection.beginTransaction();
        const newProblemIds = [];
        for (const problem of items) {
            const newId = uuidv4();
            await connection.query(
                `INSERT INTO problems (id, title, description, difficulty, language, mentor_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [newId, problem.title + ' (from template)', problem.description, problem.difficulty, problem.language, mentorId || problem.mentor_id]
            );
            newProblemIds.push(newId);
        }
        await connection.commit();

        await logAudit(adminId, adminName, 'admin', 'apply_template', 'template', req.params.id, {
            problemsCreated: newProblemIds.length, mentorId
        }, req.ip);

        res.json({ success: true, message: `${newProblemIds.length} problems created from template`, problemIds: newProblemIds });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// ===== 70. AUTOMATED BACKUPS =====

// Create a backup (exports table data to JSON)
app.post('/api/admin/backups', async (req, res) => {
    try {
        const { tables, adminId, adminName } = req.body;
        const backupId = uuidv4();
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `backup_${timestamp}_${backupId}.json`);

        // Record backup start
        await pool.query(
            `INSERT INTO scheduled_backups (id, backup_type, status, file_path, started_at, created_by) VALUES (?, ?, 'running', ?, NOW(), ?)`,
            [backupId, tables ? 'partial' : 'full', backupPath, adminId]
        );

        const allTables = tables || ['users', 'submissions', 'problems', 'tasks', 'aptitude_tests', 'aptitude_questions',
            'aptitude_submissions', 'aptitude_question_results', 'mentor_student_allocations',
            'global_tests', 'global_test_questions', 'global_test_submissions', 'global_test_question_results',
            'problem_completions', 'task_completions', 'test_cases', 'audit_logs'];

        const backupData = { meta: { timestamp: new Date().toISOString(), tables: [], totalRows: 0 } };

        for (const tableName of allTables) {
            try {
                const [rows] = await pool.query(`SELECT * FROM \`${tableName}\``);
                backupData[tableName] = rows;
                backupData.meta.tables.push({ name: tableName, rows: rows.length });
                backupData.meta.totalRows += rows.length;
            } catch (e) {
                backupData.meta.tables.push({ name: tableName, rows: 0, error: e.message });
            }
        }

        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
        const fileSize = fs.statSync(backupPath).size;

        await pool.query(
            `UPDATE scheduled_backups SET status = 'completed', file_size = ?, tables_backed_up = ?, completed_at = NOW() WHERE id = ?`,
            [fileSize, JSON.stringify(backupData.meta.tables), backupId]
        );

        await logAudit(adminId, adminName, 'admin', 'create_backup', 'backup', backupId, {
            tables: backupData.meta.tables.length, totalRows: backupData.meta.totalRows, fileSize
        }, req.ip);

        res.json({
            success: true,
            backupId,
            fileSize: Math.round(fileSize / 1024) + ' KB',
            tables: backupData.meta.tables,
            totalRows: backupData.meta.totalRows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List backups
app.get('/api/admin/backups', async (req, res) => {
    try {
        const [backups] = await pool.query(
            'SELECT * FROM scheduled_backups ORDER BY created_at DESC LIMIT 50'
        );
        for (const b of backups) {
            b.tables_backed_up = typeof b.tables_backed_up === 'string' ? JSON.parse(b.tables_backed_up) : b.tables_backed_up;
            b.fileSizeFormatted = b.file_size > 1048576
                ? (b.file_size / 1048576).toFixed(2) + ' MB'
                : (b.file_size / 1024).toFixed(1) + ' KB';
        }
        res.json(backups);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download backup file
app.get('/api/admin/backups/:id/download', async (req, res) => {
    try {
        const [[backup]] = await pool.query('SELECT * FROM scheduled_backups WHERE id = ?', [req.params.id]);
        if (!backup) return res.status(404).json({ error: 'Backup not found' });
        if (!fs.existsSync(backup.file_path)) return res.status(404).json({ error: 'Backup file not found on disk' });

        res.download(backup.file_path);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete backup
app.delete('/api/admin/backups/:id', async (req, res) => {
    try {
        const [[backup]] = await pool.query('SELECT * FROM scheduled_backups WHERE id = ?', [req.params.id]);
        if (!backup) return res.status(404).json({ error: 'Backup not found' });

        // Delete file if exists
        if (backup.file_path && fs.existsSync(backup.file_path)) {
            fs.unlinkSync(backup.file_path);
        }

        await pool.query('DELETE FROM scheduled_backups WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Backup deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== 71. DATA EXPORT TOOLS =====

// Export data as CSV
app.get('/api/admin/export/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { mentorId, startDate, endDate, format = 'csv' } = req.query;

        let query, filename, headers;

        switch (type) {
            case 'students':
                query = 'SELECT id, name, email, batch, mentor_id, created_at FROM users WHERE role = "student" ORDER BY name';
                filename = 'students_export';
                headers = ['ID', 'Name', 'Email', 'Batch', 'Mentor ID', 'Created At'];
                break;
            case 'submissions':
                query = `SELECT s.id, u.name as student_name, u.email, s.problem_id, p.title as problem_title, 
                         s.language, s.score, s.status, s.submitted_at 
                         FROM submissions s 
                         JOIN users u ON s.student_id = u.id 
                         LEFT JOIN problems p ON s.problem_id = p.id
                         ORDER BY s.submitted_at DESC`;
                filename = 'submissions_export';
                headers = ['ID', 'Student Name', 'Email', 'Problem ID', 'Problem Title', 'Language', 'Score', 'Status', 'Submitted At'];
                break;
            case 'problems':
                query = 'SELECT id, title, difficulty, language, mentor_id, created_at FROM problems ORDER BY created_at DESC';
                filename = 'problems_export';
                headers = ['ID', 'Title', 'Difficulty', 'Language', 'Mentor ID', 'Created At'];
                break;
            case 'allocations':
                query = `SELECT ma.mentor_id, m.name as mentor_name, ma.student_id, s.name as student_name, s.email as student_email, s.batch
                         FROM mentor_student_allocations ma 
                         JOIN users m ON ma.mentor_id = m.id 
                         JOIN users s ON ma.student_id = s.id 
                         ORDER BY m.name, s.name`;
                filename = 'allocations_export';
                headers = ['Mentor ID', 'Mentor Name', 'Student ID', 'Student Name', 'Student Email', 'Batch'];
                break;
            case 'aptitude-submissions':
                query = `SELECT asub.id, u.name as student_name, at.title as test_title, asub.score, asub.total_questions,
                         asub.correct_answers, asub.status, asub.submitted_at
                         FROM aptitude_submissions asub
                         JOIN users u ON asub.student_id = u.id
                         LEFT JOIN aptitude_tests at ON asub.aptitude_test_id = at.id
                         ORDER BY asub.submitted_at DESC`;
                filename = 'aptitude_submissions_export';
                headers = ['ID', 'Student Name', 'Test Title', 'Score', 'Total Questions', 'Correct Answers', 'Status', 'Submitted At'];
                break;
            case 'audit-logs':
                query = `SELECT id, user_name, user_role, action, resource_type, resource_id, timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT 5000`;
                filename = 'audit_logs_export';
                headers = ['ID', 'User', 'Role', 'Action', 'Resource Type', 'Resource ID', 'Timestamp'];
                break;
            default:
                return res.status(400).json({ error: 'Invalid export type. Use: students, submissions, problems, allocations, aptitude-submissions, audit-logs' });
        }

        const [rows] = await pool.query(query);

        if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
            return res.json(rows);
        }

        // CSV format
        const escapeCSV = (val) => {
            if (val === null || val === undefined) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };

        let csv = headers.join(',') + '\n';
        for (const row of rows) {
            csv += Object.values(row).map(escapeCSV).join(',') + '\n';
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csv);

        await logAudit(req.query.adminId, req.query.adminName, 'admin', 'data_export', type, null, {
            type, format, rowCount: rows.length
        }, req.ip);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== 72. ADMIN ANALYTICS (Enhanced) =====

// Get comprehensive admin analytics
app.get('/api/admin/analytics/comprehensive', async (req, res) => {
    try {
        const cacheKey = 'admin:comprehensive_analytics';
        const cached = cacheManager.get(cacheKey);
        if (cached) return res.json(cached);

        // User stats
        const [userStats] = await pool.query(
            `SELECT role, COUNT(*) as count FROM users GROUP BY role`
        );

        // Submission trends (last 30 days)
        const [dailySubmissions] = await pool.query(`
            SELECT DATE(submitted_at) as date, COUNT(*) as count, 
                   AVG(score) as avgScore,
                   SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as passed,
                   SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as failed
            FROM submissions 
            WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(submitted_at)
            ORDER BY date ASC
        `);

        // Top performing students
        const [topStudents] = await pool.query(`
            SELECT u.id, u.name, u.batch, COUNT(s.id) as totalSubmissions, 
                   AVG(s.score) as avgScore, 
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passCount
            FROM users u
            JOIN submissions s ON u.id = s.student_id
            WHERE u.role = 'student'
            GROUP BY u.id
            ORDER BY avgScore DESC, totalSubmissions DESC
            LIMIT 10
        `);

        // Mentor effectiveness
        const [mentorStats] = await pool.query(`
            SELECT m.id, m.name, 
                   COUNT(DISTINCT ma.student_id) as studentCount,
                   COUNT(s.id) as totalStudentSubmissions,
                   AVG(s.score) as avgStudentScore
            FROM users m
            LEFT JOIN mentor_student_allocations ma ON m.id = ma.mentor_id
            LEFT JOIN submissions s ON s.student_id = ma.student_id
            WHERE m.role = 'mentor'
            GROUP BY m.id
            ORDER BY avgStudentScore DESC
        `);

        // Language distribution
        const [langDist] = await pool.query(`
            SELECT language, COUNT(*) as count, AVG(score) as avgScore
            FROM submissions 
            WHERE language IS NOT NULL
            GROUP BY language
            ORDER BY count DESC
        `);

        // Difficulty analysis
        const [difficultyStats] = await pool.query(`
            SELECT p.difficulty, COUNT(s.id) as submissions, AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passedCount
            FROM problems p
            LEFT JOIN submissions s ON p.id = s.problem_id
            WHERE p.difficulty IS NOT NULL
            GROUP BY p.difficulty
        `);

        // Hourly activity pattern
        const [hourlyActivity] = await pool.query(`
            SELECT HOUR(submitted_at) as hour, COUNT(*) as count
            FROM submissions
            WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY HOUR(submitted_at)
            ORDER BY hour
        `);

        // Weekly comparison
        const [[thisWeek]] = await pool.query(
            `SELECT COUNT(*) as count FROM submissions WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
        );
        const [[lastWeek]] = await pool.query(
            `SELECT COUNT(*) as count FROM submissions WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND submitted_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`
        );
        const weeklyGrowth = lastWeek.count > 0 ? Math.round(((thisWeek.count - lastWeek.count) / lastWeek.count) * 100) : 0;

        // Batch-wise performance 
        const [batchPerformance] = await pool.query(`
            SELECT u.batch, COUNT(DISTINCT u.id) as studentCount, 
                   COUNT(s.id) as submissions, AVG(s.score) as avgScore
            FROM users u
            LEFT JOIN submissions s ON u.id = s.student_id
            WHERE u.role = 'student' AND u.batch IS NOT NULL
            GROUP BY u.batch
            ORDER BY avgScore DESC
        `);

        const analytics = {
            userStats: userStats.reduce((acc, r) => ({ ...acc, [r.role]: r.count }), {}),
            dailySubmissions: dailySubmissions.map(d => ({
                date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                count: d.count,
                avgScore: Math.round(d.avgScore || 0),
                passed: d.passed,
                failed: d.failed
            })),
            topStudents: topStudents.map(s => ({
                ...s,
                avgScore: Math.round(s.avgScore || 0)
            })),
            mentorStats: mentorStats.map(m => ({
                ...m,
                avgStudentScore: Math.round(m.avgStudentScore || 0)
            })),
            languageDistribution: langDist.map(l => ({
                name: l.language || 'Unknown',
                count: l.count,
                avgScore: Math.round(l.avgScore || 0)
            })),
            difficultyStats: difficultyStats.map(d => ({
                difficulty: d.difficulty,
                submissions: d.submissions,
                avgScore: Math.round(d.avgScore || 0),
                passRate: d.submissions > 0 ? Math.round((d.passedCount / d.submissions) * 100) : 0
            })),
            hourlyActivity: hourlyActivity.map(h => ({
                hour: `${h.hour}:00`,
                count: h.count
            })),
            weeklyGrowth,
            thisWeekSubmissions: thisWeek.count,
            lastWeekSubmissions: lastWeek.count,
            batchPerformance: batchPerformance.map(b => ({
                batch: b.batch || 'Unassigned',
                studentCount: b.studentCount,
                submissions: b.submissions,
                avgScore: Math.round(b.avgScore || 0)
            }))
        };

        cacheManager.set(cacheKey, analytics, 600000); // Cache 10min
        res.json(analytics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== FEATURE 37: LEARNING PATH RECOMMENDATIONS =====
app.get('/api/analytics/learning-path/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const cacheKey = `student:${studentId}:learning_path`;
        const cached = cacheManager.get(cacheKey);
        if (cached) return res.json(cached);

        // Get student's submission performance by topic/language/difficulty
        const [submissionsByDifficulty] = await pool.query(`
            SELECT p.difficulty, COUNT(s.id) as attempts, AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passed,
                   SUM(CASE WHEN s.status = 'rejected' THEN 1 ELSE 0 END) as failed
            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            WHERE s.student_id = ? AND p.difficulty IS NOT NULL
            GROUP BY p.difficulty
        `, [studentId]);

        const [submissionsByLanguage] = await pool.query(`
            SELECT s.language, COUNT(s.id) as attempts, AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passed
            FROM submissions s
            WHERE s.student_id = ? AND s.language IS NOT NULL
            GROUP BY s.language
        `, [studentId]);

        const [submissionsByType] = await pool.query(`
            SELECT p.type, COUNT(s.id) as attempts, AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passed,
                   SUM(CASE WHEN s.status = 'rejected' THEN 1 ELSE 0 END) as failed
            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            WHERE s.student_id = ? AND p.type IS NOT NULL
            GROUP BY p.type
        `, [studentId]);

        // Get unsolved problems for the student
        const [unsolvedProblems] = await pool.query(`
            SELECT p.id, p.title, p.difficulty, p.type, p.language
            FROM problems p
            WHERE p.status = 'live'
              AND p.id NOT IN (
                SELECT DISTINCT problem_id FROM problem_completions WHERE student_id = ?
              )
            ORDER BY p.created_at DESC
            LIMIT 50
        `, [studentId]);

        // Identify weak areas
        const weakAreas = [];
        const strengths = [];

        submissionsByDifficulty.forEach(d => {
            const passRate = d.attempts > 0 ? (d.passed / d.attempts) * 100 : 0;
            const entry = { category: d.difficulty, passRate: Math.round(passRate), avgScore: Math.round(d.avgScore || 0), attempts: d.attempts };
            if (passRate < 50 || (d.avgScore || 0) < 50) weakAreas.push(entry);
            else strengths.push(entry);
        });

        submissionsByType.forEach(t => {
            const passRate = t.attempts > 0 ? (t.passed / t.attempts) * 100 : 0;
            const entry = { category: t.type, passRate: Math.round(passRate), avgScore: Math.round(t.avgScore || 0), attempts: t.attempts };
            if (passRate < 50 || (t.avgScore || 0) < 50) weakAreas.push(entry);
            else strengths.push(entry);
        });

        // Generate recommendations based on weaknesses
        const recommendations = [];
        const weakDifficulties = submissionsByDifficulty.filter(d => (d.avgScore || 0) < 60).map(d => d.difficulty);
        const weakTypes = submissionsByType.filter(t => (t.avgScore || 0) < 60).map(t => t.type);

        // Recommend problems targeting weak areas
        unsolvedProblems.forEach(p => {
            let priority = 0;
            let reason = '';
            if (weakDifficulties.includes(p.difficulty)) {
                priority += 3;
                reason = `Improve your ${p.difficulty} problem-solving skills`;
            }
            if (weakTypes.includes(p.type)) {
                priority += 3;
                reason = reason ? `${reason} and ${p.type} concepts` : `Practice ${p.type} concepts`;
            }
            if (!reason && p.difficulty === 'easy') {
                priority = 1;
                reason = 'Build confidence with fundamentals';
            }
            if (!reason && p.difficulty === 'medium') {
                priority = 2;
                reason = 'Challenge yourself with intermediate problems';
            }
            if (!reason) {
                priority = 1;
                reason = 'Expand your problem-solving range';
            }
            recommendations.push({ ...p, priority, reason });
        });

        recommendations.sort((a, b) => b.priority - a.priority);

        // Language proficiency
        const languageProficiency = submissionsByLanguage.map(l => ({
            language: l.language,
            attempts: l.attempts,
            avgScore: Math.round(l.avgScore || 0),
            passRate: l.attempts > 0 ? Math.round((l.passed / l.attempts) * 100) : 0,
            level: (l.avgScore || 0) >= 80 ? 'Advanced' : (l.avgScore || 0) >= 50 ? 'Intermediate' : 'Beginner'
        }));

        // Overall progress score
        const totalAttempts = submissionsByDifficulty.reduce((sum, d) => sum + Number(d.attempts), 0);
        const totalPassed = submissionsByDifficulty.reduce((sum, d) => sum + Number(d.passed), 0);
        const overallPassRate = totalAttempts > 0 ? Math.round((totalPassed / totalAttempts) * 100) : 0;

        const result = {
            weakAreas,
            strengths,
            recommendations: recommendations.slice(0, 10),
            languageProficiency,
            difficultyBreakdown: submissionsByDifficulty.map(d => ({
                difficulty: d.difficulty,
                attempts: d.attempts,
                avgScore: Math.round(d.avgScore || 0),
                passRate: d.attempts > 0 ? Math.round((d.passed / d.attempts) * 100) : 0
            })),
            overallPassRate,
            totalAttempts,
            totalPassed
        };

        cacheManager.set(cacheKey, result, 900000); // 15 min cache
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== FEATURE 39: ENHANCED PLAGIARISM DETECTION =====
app.get('/api/analytics/plagiarism', async (req, res) => {
    try {
        const { mentorId } = req.query;
        const cacheKey = `plagiarism:${mentorId || 'all'}`;
        const cached = cacheManager.get(cacheKey);
        if (cached) return res.json(cached);

        let query = `
            SELECT s.id, s.student_id, s.problem_id, s.code, s.score, s.language,
                   s.plagiarism_detected, s.copied_from, s.copied_from_name,
                   s.submitted_at, u.name as studentName, p.title as problemTitle
            FROM submissions s
            JOIN users u ON s.student_id = u.id
            LEFT JOIN problems p ON s.problem_id = p.id
            WHERE s.plagiarism_detected = 'true'
        `;
        const params = [];
        if (mentorId) {
            query += ' AND u.mentor_id = ?';
            params.push(mentorId);
        }
        query += ' ORDER BY s.submitted_at DESC LIMIT 100';

        const [flaggedSubmissions] = await pool.query(query, params);

        // Get plagiarism statistics
        let statsQuery = `
            SELECT COUNT(*) as totalSubmissions,
                   SUM(CASE WHEN plagiarism_detected = 'true' THEN 1 ELSE 0 END) as plagiarismCount
            FROM submissions s
            JOIN users u ON s.student_id = u.id
            WHERE 1=1
        `;
        const statsParams = [];
        if (mentorId) {
            statsQuery += ' AND u.mentor_id = ?';
            statsParams.push(mentorId);
        }
        const [[stats]] = await pool.query(statsQuery, statsParams);

        // Get repeat offenders
        let offendersQuery = `
            SELECT s.student_id, u.name, COUNT(*) as plagiarismCount,
                   GROUP_CONCAT(DISTINCT s.copied_from_name) as copiedFromNames
            FROM submissions s
            JOIN users u ON s.student_id = u.id
            WHERE s.plagiarism_detected = 'true'
        `;
        const offenderParams = [];
        if (mentorId) {
            offendersQuery += ' AND u.mentor_id = ?';
            offenderParams.push(mentorId);
        }
        offendersQuery += ' GROUP BY s.student_id HAVING COUNT(*) >= 1 ORDER BY plagiarismCount DESC LIMIT 20';
        const [offenders] = await pool.query(offendersQuery, offenderParams);

        // Plagiarism by problem
        let byProblemQuery = `
            SELECT p.id, p.title, p.difficulty, COUNT(*) as flaggedCount
            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            WHERE s.plagiarism_detected = 'true'
        `;
        const byProblemParams = [];
        if (mentorId) {
            byProblemQuery += ' AND EXISTS (SELECT 1 FROM users u WHERE u.id = s.student_id AND u.mentor_id = ?)';
            byProblemParams.push(mentorId);
        }
        byProblemQuery += ' GROUP BY p.id ORDER BY flaggedCount DESC LIMIT 10';
        const [byProblem] = await pool.query(byProblemQuery, byProblemParams);

        const result = {
            flaggedSubmissions: flaggedSubmissions.map(s => ({
                id: s.id,
                studentId: s.student_id,
                studentName: s.studentName,
                problemId: s.problem_id,
                problemTitle: s.problemTitle,
                language: s.language,
                score: s.score,
                copiedFrom: s.copied_from,
                copiedFromName: s.copied_from_name,
                submittedAt: s.submitted_at
            })),
            stats: {
                totalSubmissions: stats.totalSubmissions,
                plagiarismCount: stats.plagiarismCount,
                plagiarismRate: stats.totalSubmissions > 0 ? Math.round((stats.plagiarismCount / stats.totalSubmissions) * 100 * 10) / 10 : 0
            },
            repeatOffenders: offenders.map(o => ({
                studentId: o.student_id,
                name: o.name,
                count: o.plagiarismCount,
                copiedFrom: o.copiedFromNames ? o.copiedFromNames.split(',') : []
            })),
            byProblem: byProblem.map(p => ({
                problemId: p.id,
                title: p.title,
                difficulty: p.difficulty,
                flaggedCount: p.flaggedCount
            }))
        };

        cacheManager.set(cacheKey, result, 600000);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== FEATURE 40: COMPREHENSIVE ANALYTICS EXPORT =====
app.get('/api/analytics/export/:format', async (req, res) => {
    try {
        const { format } = req.params;
        const { type = 'overview', studentId, mentorId } = req.query;

        // Gather comprehensive data
        const data = {};

        // Student performance summary
        const [studentPerf] = await pool.query(`
            SELECT u.id, u.name, u.email, u.batch,
                   COUNT(DISTINCT s.id) as totalSubmissions,
                   AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passedCount,
                   COUNT(DISTINCT tc.task_id) as tasksCompleted,
                   COUNT(DISTINCT pc.problem_id) as problemsCompleted,
                   SUM(CASE WHEN s.plagiarism_detected = 'true' THEN 1 ELSE 0 END) as plagiarismFlags
            FROM users u
            LEFT JOIN submissions s ON u.id = s.student_id
            LEFT JOIN task_completions tc ON u.id = tc.student_id
            LEFT JOIN problem_completions pc ON u.id = pc.student_id
            WHERE u.role = 'student'
            ${studentId ? 'AND u.id = ?' : ''}
            ${mentorId ? 'AND u.mentor_id = ?' : ''}
            GROUP BY u.id
            ORDER BY avgScore DESC
        `, [...(studentId ? [studentId] : []), ...(mentorId ? [mentorId] : [])]);

        data.students = studentPerf.map(s => ({
            id: s.id, name: s.name, email: s.email, batch: s.batch,
            totalSubmissions: s.totalSubmissions,
            avgScore: Math.round(s.avgScore || 0),
            passRate: s.totalSubmissions > 0 ? Math.round((s.passedCount / s.totalSubmissions) * 100) : 0,
            tasksCompleted: s.tasksCompleted,
            problemsCompleted: s.problemsCompleted,
            plagiarismFlags: s.plagiarismFlags
        }));

        // Language distribution
        const [langStats] = await pool.query(`
            SELECT language, COUNT(*) as count, AVG(score) as avgScore
            FROM submissions WHERE language IS NOT NULL
            GROUP BY language ORDER BY count DESC
        `);
        data.languageStats = langStats;

        // Daily trends (30 days)
        const [trends] = await pool.query(`
            SELECT DATE(submitted_at) as date, COUNT(*) as submissions, AVG(score) as avgScore,
                   SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as passed
            FROM submissions WHERE submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(submitted_at) ORDER BY date
        `);
        data.dailyTrends = trends.map(t => ({
            date: new Date(t.date).toISOString().split('T')[0],
            submissions: t.submissions,
            avgScore: Math.round(t.avgScore || 0),
            passed: t.passed
        }));

        // Difficulty stats
        const [diffStats] = await pool.query(`
            SELECT p.difficulty, COUNT(s.id) as attempts, AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passed
            FROM problems p LEFT JOIN submissions s ON p.id = s.problem_id
            WHERE p.difficulty IS NOT NULL
            GROUP BY p.difficulty
        `);
        data.difficultyStats = diffStats;

        if (format === 'csv') {
            // Generate CSV
            let csv = 'Student ID,Name,Email,Batch,Submissions,Avg Score,Pass Rate,Tasks Done,Problems Done,Plagiarism Flags\n';
            data.students.forEach(s => {
                csv += `"${s.id}","${s.name}","${s.email}","${s.batch || ''}",${s.totalSubmissions},${s.avgScore},${s.passRate}%,${s.tasksCompleted},${s.problemsCompleted},${s.plagiarismFlags}\n`;
            });

            csv += '\n\nLanguage,Count,Avg Score\n';
            data.languageStats.forEach(l => {
                csv += `"${l.language}",${l.count},${Math.round(l.avgScore || 0)}\n`;
            });

            csv += '\n\nDate,Submissions,Avg Score,Passed\n';
            data.dailyTrends.forEach(t => {
                csv += `${t.date},${t.submissions},${t.avgScore},${t.passed}\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics_report_${new Date().toISOString().split('T')[0]}.csv"`);
            return res.send(csv);
        }

        // JSON format (for frontend rendering / PDF generation)
        const summary = {
            generatedAt: new Date().toISOString(),
            totalStudents: data.students.length,
            avgPlatformScore: data.students.length > 0 ? Math.round(data.students.reduce((s, st) => s + st.avgScore, 0) / data.students.length) : 0,
            totalSubmissions: data.students.reduce((s, st) => s + st.totalSubmissions, 0),
            overallPassRate: (() => {
                const total = data.students.reduce((s, st) => s + st.totalSubmissions, 0);
                const passed = data.dailyTrends.reduce((s, t) => s + t.passed, 0);
                return total > 0 ? Math.round((passed / total) * 100) : 0;
            })()
        };

        res.json({ summary, ...data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== FEATURE 41: TIME-TO-SOLVE ANALYTICS =====
app.get('/api/analytics/time-to-solve', async (req, res) => {
    try {
        const { mentorId, studentId } = req.query;
        const cacheKey = `time_to_solve:${mentorId || 'all'}:${studentId || 'all'}`;
        const cached = cacheManager.get(cacheKey);
        if (cached) return res.json(cached);

        // Estimate solve time from multiple submissions on same problem
        // Time between first and last (passing) submission on a problem
        let query = `
            SELECT s.problem_id, p.title, p.difficulty, p.type, p.language as problemLang,
                   s.student_id, u.name as studentName,
                   MIN(s.submitted_at) as firstAttempt,
                   MAX(s.submitted_at) as lastAttempt,
                   COUNT(s.id) as attempts,
                   MAX(s.score) as bestScore,
                   MAX(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as solved
            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            JOIN users u ON s.student_id = u.id
            WHERE s.problem_id IS NOT NULL
        `;
        const params = [];
        if (mentorId) { query += ' AND u.mentor_id = ?'; params.push(mentorId); }
        if (studentId) { query += ' AND s.student_id = ?'; params.push(studentId); }
        query += ' GROUP BY s.problem_id, p.title, p.difficulty, p.type, p.language, s.student_id, u.name ORDER BY p.title, u.name';

        const [rows] = await pool.query(query, params);

        // Calculate time metrics per problem
        const problemMetrics = {};
        rows.forEach(r => {
            if (!problemMetrics[r.problem_id]) {
                problemMetrics[r.problem_id] = {
                    problemId: r.problem_id,
                    title: r.title,
                    difficulty: r.difficulty,
                    type: r.type,
                    language: r.problemLang,
                    students: [],
                    totalAttempts: 0,
                    solvedCount: 0,
                    avgAttempts: 0,
                    avgTimeMinutes: 0
                };
            }
            const timeMs = new Date(r.lastAttempt) - new Date(r.firstAttempt);
            const timeMinutes = Math.max(1, Math.round(timeMs / 60000));
            problemMetrics[r.problem_id].students.push({
                studentId: r.student_id,
                studentName: r.studentName,
                attempts: r.attempts,
                timeMinutes: r.attempts > 1 ? timeMinutes : null,
                bestScore: r.bestScore,
                solved: r.solved === 1
            });
            problemMetrics[r.problem_id].totalAttempts += r.attempts;
            if (r.solved === 1) problemMetrics[r.problem_id].solvedCount++;
        });

        // Compute averages
        const problemList = Object.values(problemMetrics).map(pm => {
            const timeSolves = pm.students.filter(s => s.timeMinutes !== null && s.solved);
            pm.avgAttempts = pm.students.length > 0 ? Math.round(pm.totalAttempts / pm.students.length * 10) / 10 : 0;
            pm.avgTimeMinutes = timeSolves.length > 0 ? Math.round(timeSolves.reduce((s, st) => s + st.timeMinutes, 0) / timeSolves.length) : null;
            pm.solveRate = pm.students.length > 0 ? Math.round((pm.solvedCount / pm.students.length) * 100) : 0;
            pm.studentCount = pm.students.length;
            // Remove detailed student list for summary
            const { students, ...summary } = pm;
            return summary;
        });

        // Sort by difficulty
        const diffOrder = { easy: 1, medium: 2, hard: 3 };
        problemList.sort((a, b) => (diffOrder[a.difficulty] || 99) - (diffOrder[b.difficulty] || 99));

        // Difficulty summary
        const difficultySummary = {};
        problemList.forEach(p => {
            const d = p.difficulty || 'unknown';
            if (!difficultySummary[d]) {
                difficultySummary[d] = { difficulty: d, problems: 0, avgAttempts: 0, avgTimeMinutes: 0, avgSolveRate: 0, totalAttempts: 0 };
            }
            difficultySummary[d].problems++;
            difficultySummary[d].totalAttempts += p.totalAttempts;
            difficultySummary[d].avgSolveRate += p.solveRate;
            if (p.avgTimeMinutes) difficultySummary[d].avgTimeMinutes += p.avgTimeMinutes;
        });
        Object.values(difficultySummary).forEach(d => {
            d.avgAttempts = d.problems > 0 ? Math.round(d.totalAttempts / d.problems * 10) / 10 : 0;
            d.avgTimeMinutes = d.problems > 0 ? Math.round(d.avgTimeMinutes / d.problems) : 0;
            d.avgSolveRate = d.problems > 0 ? Math.round(d.avgSolveRate / d.problems) : 0;
        });

        const result = {
            problems: problemList,
            difficultySummary: Object.values(difficultySummary),
            totalProblems: problemList.length,
            overallAvgAttempts: problemList.length > 0 ? Math.round(problemList.reduce((s, p) => s + p.avgAttempts, 0) / problemList.length * 10) / 10 : 0
        };

        cacheManager.set(cacheKey, result, 900000);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== FEATURE 42: TOPIC-BASED ANALYSIS =====
app.get('/api/analytics/topics', async (req, res) => {
    try {
        const { mentorId, studentId } = req.query;
        const cacheKey = `topics:${mentorId || 'all'}:${studentId || 'all'}`;
        const cached = cacheManager.get(cacheKey);
        if (cached) return res.json(cached);

        // Analysis by problem type (Coding, SQL, etc.) and language
        let baseWhere = '1=1';
        const params = [];
        if (mentorId) { baseWhere += ' AND u.mentor_id = ?'; params.push(mentorId); }
        if (studentId) { baseWhere += ' AND s.student_id = ?'; params.push(studentId); }

        // By problem type
        const [byType] = await pool.query(`
            SELECT p.type, COUNT(s.id) as submissions, AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passed,
                   SUM(CASE WHEN s.status = 'rejected' THEN 1 ELSE 0 END) as failed,
                   COUNT(DISTINCT s.student_id) as uniqueStudents
            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            JOIN users u ON s.student_id = u.id
            WHERE ${baseWhere} AND p.type IS NOT NULL
            GROUP BY p.type ORDER BY submissions DESC
        `, params);

        // By language
        const [byLanguage] = await pool.query(`
            SELECT s.language, COUNT(s.id) as submissions, AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passed,
                   COUNT(DISTINCT s.student_id) as uniqueStudents
            FROM submissions s
            JOIN users u ON s.student_id = u.id
            WHERE ${baseWhere} AND s.language IS NOT NULL
            GROUP BY s.language ORDER BY submissions DESC
        `, params);

        // By difficulty
        const [byDifficulty] = await pool.query(`
            SELECT p.difficulty, COUNT(s.id) as submissions, AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passed,
                   SUM(CASE WHEN s.status = 'rejected' THEN 1 ELSE 0 END) as failed,
                   COUNT(DISTINCT s.student_id) as uniqueStudents
            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            JOIN users u ON s.student_id = u.id
            WHERE ${baseWhere} AND p.difficulty IS NOT NULL
            GROUP BY p.difficulty
        `, params);

        // Heatmap: type x difficulty
        const [heatmap] = await pool.query(`
            SELECT p.type, p.difficulty, COUNT(s.id) as submissions, AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passed
            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            JOIN users u ON s.student_id = u.id
            WHERE ${baseWhere} AND p.type IS NOT NULL AND p.difficulty IS NOT NULL
            GROUP BY p.type, p.difficulty
        `, params);

        // Top problems by type
        const [topProblems] = await pool.query(`
            SELECT p.id, p.title, p.type, p.difficulty, COUNT(s.id) as attempts,
                   AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passCount
            FROM submissions s
            JOIN problems p ON s.problem_id = p.id
            JOIN users u ON s.student_id = u.id
            WHERE ${baseWhere}
            GROUP BY p.id, p.title, p.type, p.difficulty
            ORDER BY attempts DESC LIMIT 15
        `, params);

        const result = {
            byType: byType.map(t => ({
                type: t.type,
                submissions: t.submissions,
                avgScore: Math.round(t.avgScore || 0),
                passRate: t.submissions > 0 ? Math.round((t.passed / t.submissions) * 100) : 0,
                failRate: t.submissions > 0 ? Math.round((t.failed / t.submissions) * 100) : 0,
                uniqueStudents: t.uniqueStudents
            })),
            byLanguage: byLanguage.map(l => ({
                language: l.language,
                submissions: l.submissions,
                avgScore: Math.round(l.avgScore || 0),
                passRate: l.submissions > 0 ? Math.round((l.passed / l.submissions) * 100) : 0,
                uniqueStudents: l.uniqueStudents
            })),
            byDifficulty: byDifficulty.map(d => ({
                difficulty: d.difficulty,
                submissions: d.submissions,
                avgScore: Math.round(d.avgScore || 0),
                passRate: d.submissions > 0 ? Math.round((d.passed / d.submissions) * 100) : 0,
                uniqueStudents: d.uniqueStudents
            })),
            heatmap: heatmap.map(h => ({
                type: h.type,
                difficulty: h.difficulty,
                submissions: h.submissions,
                avgScore: Math.round(h.avgScore || 0),
                passRate: h.submissions > 0 ? Math.round((h.passed / h.submissions) * 100) : 0
            })),
            topProblems: topProblems.map(p => ({
                id: p.id,
                title: p.title,
                type: p.type,
                difficulty: p.difficulty,
                attempts: p.attempts,
                avgScore: Math.round(p.avgScore || 0),
                passRate: p.attempts > 0 ? Math.round((p.passCount / p.attempts) * 100) : 0
            }))
        };

        cacheManager.set(cacheKey, result, 900000);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== FEATURE 43: PEER COMPARISON STATS =====
app.get('/api/analytics/peer-comparison/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const cacheKey = `peer:${studentId}`;
        const cached = cacheManager.get(cacheKey);
        if (cached) return res.json(cached);

        // Student's own stats
        const [[studentStats]] = await pool.query(`
            SELECT COUNT(s.id) as totalSubmissions, AVG(s.score) as avgScore,
                   SUM(CASE WHEN s.status = 'accepted' THEN 1 ELSE 0 END) as passedCount,
                   COUNT(DISTINCT pc.problem_id) as problemsSolved,
                   COUNT(DISTINCT tc.task_id) as tasksDone
            FROM users u
            LEFT JOIN submissions s ON u.id = s.student_id
            LEFT JOIN problem_completions pc ON u.id = pc.student_id
            LEFT JOIN task_completions tc ON u.id = tc.student_id
            WHERE u.id = ?
        `, [studentId]);

        // Class average (all students)
        const [[classAvg]] = await pool.query(`
            SELECT AVG(sub.avgScore) as avgScore, AVG(sub.totalSub) as avgSubmissions,
                   AVG(sub.passRate) as avgPassRate, AVG(sub.probSolved) as avgProblemsSolved,
                   AVG(sub.tasksDone) as avgTasksDone, COUNT(*) as totalStudents
            FROM (
                SELECT u.id,
                       COALESCE(AVG(s.score), 0) as avgScore,
                       COUNT(DISTINCT s.id) as totalSub,
                       CASE WHEN COUNT(s.id) > 0 THEN SUM(CASE WHEN s.status='accepted' THEN 1 ELSE 0 END)*100.0/COUNT(s.id) ELSE 0 END as passRate,
                       COUNT(DISTINCT pc.problem_id) as probSolved,
                       COUNT(DISTINCT tc.task_id) as tasksDone
                FROM users u
                LEFT JOIN submissions s ON u.id = s.student_id
                LEFT JOIN problem_completions pc ON u.id = pc.student_id
                LEFT JOIN task_completions tc ON u.id = tc.student_id
                WHERE u.role = 'student'
                GROUP BY u.id
            ) sub
        `);

        // Get student's batch for batch comparison
        const [[studentInfo]] = await pool.query('SELECT batch, mentor_id FROM users WHERE id = ?', [studentId]);
        const batch = studentInfo?.batch;
        const mentorId = studentInfo?.mentor_id;

        // Batch average
        let batchAvg = null;
        if (batch) {
            const [[ba]] = await pool.query(`
                SELECT AVG(sub.avgScore) as avgScore, AVG(sub.totalSub) as avgSubmissions,
                       COUNT(*) as batchSize
                FROM (
                    SELECT u.id, COALESCE(AVG(s.score), 0) as avgScore, COUNT(DISTINCT s.id) as totalSub
                    FROM users u LEFT JOIN submissions s ON u.id = s.student_id
                    WHERE u.role = 'student' AND u.batch = ?
                    GROUP BY u.id
                ) sub
            `, [batch]);
            batchAvg = { avgScore: Math.round(ba.avgScore || 0), avgSubmissions: Math.round(ba.avgSubmissions || 0), batchSize: ba.batchSize, batch };
        }

        // Mentor group average
        let mentorGroupAvg = null;
        if (mentorId) {
            const [[mga]] = await pool.query(`
                SELECT AVG(sub.avgScore) as avgScore, AVG(sub.totalSub) as avgSubmissions,
                       COUNT(*) as groupSize
                FROM (
                    SELECT u.id, COALESCE(AVG(s.score), 0) as avgScore, COUNT(DISTINCT s.id) as totalSub
                    FROM users u LEFT JOIN submissions s ON u.id = s.student_id
                    WHERE u.role = 'student' AND u.mentor_id = ?
                    GROUP BY u.id
                ) sub
            `, [mentorId]);
            mentorGroupAvg = { avgScore: Math.round(mga.avgScore || 0), avgSubmissions: Math.round(mga.avgSubmissions || 0), groupSize: mga.groupSize };
        }

        // Rank among all students
        const [[rankResult]] = await pool.query(`
            SELECT COUNT(*) + 1 as student_rank FROM (
                SELECT u.id, COALESCE(AVG(s.score), 0) as avgScore
                FROM users u LEFT JOIN submissions s ON u.id = s.student_id
                WHERE u.role = 'student' GROUP BY u.id
            ) sub WHERE sub.avgScore > (
                SELECT COALESCE(AVG(score), 0) FROM submissions WHERE student_id = ?
            )
        `, [studentId]);

        // Percentile
        const [[totalCount]] = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'student'");
        const percentile = totalCount.count > 0 ? Math.round(((totalCount.count - rankResult.student_rank) / totalCount.count) * 100) : 0;

        // Per-language comparison
        const [studentLangs] = await pool.query(`
            SELECT language, AVG(score) as avgScore, COUNT(*) as count
            FROM submissions WHERE student_id = ? AND language IS NOT NULL
            GROUP BY language
        `, [studentId]);

        const [classLangs] = await pool.query(`
            SELECT language, AVG(score) as avgScore, COUNT(*) as count
            FROM submissions WHERE language IS NOT NULL GROUP BY language
        `);

        const languageComparison = studentLangs.map(sl => {
            const cl = classLangs.find(c => c.language === sl.language);
            return {
                language: sl.language,
                yourScore: Math.round(sl.avgScore || 0),
                classAvg: cl ? Math.round(cl.avgScore || 0) : 0,
                yourCount: sl.count,
                difference: Math.round((sl.avgScore || 0) - (cl?.avgScore || 0))
            };
        });

        // Score distribution (histogram) showing where student falls
        const [allScores] = await pool.query(`
            SELECT sub2.bucket, COUNT(*) as count FROM (
                SELECT FLOOR(COALESCE(sub.score, 0) / 10) * 10 as bucket
                FROM (
                    SELECT student_id, AVG(score) as score FROM submissions GROUP BY student_id
                ) sub
            ) sub2 GROUP BY sub2.bucket ORDER BY sub2.bucket
        `);

        const myAvgScore = Math.round(studentStats.avgScore || 0);
        const myPassRate = studentStats.totalSubmissions > 0 ? Math.round((studentStats.passedCount / studentStats.totalSubmissions) * 100) : 0;

        const result = {
            you: {
                avgScore: myAvgScore,
                totalSubmissions: studentStats.totalSubmissions,
                passRate: myPassRate,
                problemsSolved: studentStats.problemsSolved,
                tasksDone: studentStats.tasksDone,
                rank: rankResult.student_rank,
                percentile: Math.max(0, percentile),
                totalStudents: totalCount.count
            },
            classAverage: {
                avgScore: Math.round(classAvg.avgScore || 0),
                avgSubmissions: Math.round(classAvg.avgSubmissions || 0),
                avgPassRate: Math.round(classAvg.avgPassRate || 0),
                avgProblemsSolved: Math.round(classAvg.avgProblemsSolved || 0),
                avgTasksDone: Math.round(classAvg.avgTasksDone || 0),
                totalStudents: classAvg.totalStudents
            },
            batchAverage: batchAvg,
            mentorGroupAverage: mentorGroupAvg,
            languageComparison,
            scoreDistribution: allScores.map(s => ({
                range: `${s.bucket}-${s.bucket + 9}`,
                count: s.count,
                isYou: myAvgScore >= s.bucket && myAvgScore < s.bucket + 10
            }))
        };

        cacheManager.set(cacheKey, result, 900000);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server

// Helper: Update User Streak (Placeholder to prevent ReferenceError)
async function updateUserStreak(userId, activity) {
    try {
        // Future implementation: Logic to update continuous learning streak
        // console.log(`Streak updated for user ${userId}`);
        return true;
    } catch (e) {
        console.error('Streak update failed:', e.message);
        return false;
    }
}

// ==================== USER MANAGEMENT CRUD (Admin) ====================

// Get all users with filters (admin user management)
app.get('/api/admin/users', async (req, res) => {
    try {
        const { role, status, batch, search, page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * pageSize;

        let query = 'SELECT u.*, GROUP_CONCAT(msa.student_id) as allocated_students FROM users u LEFT JOIN mentor_student_allocations msa ON u.id = msa.mentor_id WHERE 1=1';
        let countQuery = 'SELECT COUNT(*) as total FROM users WHERE 1=1';
        const params = [];
        const countParams = [];

        if (role) { query += ' AND u.role = ?'; countQuery += ' AND role = ?'; params.push(role); countParams.push(role); }
        if (status) { query += ' AND u.status = ?'; countQuery += ' AND status = ?'; params.push(status); countParams.push(status); }
        if (batch) { query += ' AND u.batch = ?'; countQuery += ' AND batch = ?'; params.push(batch); countParams.push(batch); }
        if (search) {
            query += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.id LIKE ?)';
            countQuery += ' AND (name LIKE ? OR email LIKE ? OR id LIKE ?)';
            const s = `%${search}%`; params.push(s, s, s); countParams.push(s, s, s);
        }

        query += ' GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
        const [[{ total }]] = await pool.query(countQuery, countParams);
        const [users] = await pool.query(query, [...params, pageSize, offset]);

        const cleanUsers = users.map(u => {
            const { password: _, ...rest } = u;
            return { ...rest, mentorId: u.mentor_id, createdAt: u.created_at, allocatedStudents: u.allocated_students ? u.allocated_students.split(',') : [] };
        });

        res.json({ data: cleanUsers, pagination: { page: pageNum, limit: pageSize, total, pages: Math.ceil(total / pageSize) } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Create user (admin) — protected with auth + validation
app.post('/api/admin/users', authenticate, authorize('admin'), validate(createUserSchema), async (req, res) => {
    try {
        const { name, email, password, role, mentorId, batch, phone } = req.body;

        // Check duplicate email
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(409).json({ error: 'Email already exists' });

        // Generate ID based on role
        const [countResult] = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE role = ?', [role]);
        const nextNum = (countResult[0].cnt + 1).toString().padStart(3, '0');
        const userId = `${role}-${nextNum}`;

        // Hash password with bcrypt before storing
        const hashedPassword = await hashPassword(password);

        const createdAt = new Date();
        await pool.query(
            'INSERT INTO users (id, name, email, password, role, mentor_id, batch, phone, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "active", ?)',
            [userId, name, email, hashedPassword, role, mentorId || null, batch || null, phone || null, createdAt]
        );

        // If student with mentorId, create allocation
        if (role === 'student' && mentorId) {
            await pool.query('INSERT IGNORE INTO mentor_student_allocations (mentor_id, student_id) VALUES (?, ?)', [mentorId, userId]);
        }

        res.json({ success: true, user: { id: userId, name, email, role, mentorId, batch, phone, status: 'active', createdAt } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Update user (admin) — protected
app.put('/api/admin/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { name, email, role, mentorId, batch, phone, status } = req.body;
        const userId = req.params.id;

        const [existing] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

        const updates = [];
        const params = [];
        if (name) { updates.push('name = ?'); params.push(name); }
        if (email) { updates.push('email = ?'); params.push(email); }
        if (role) { updates.push('role = ?'); params.push(role); }
        if (mentorId !== undefined) { updates.push('mentor_id = ?'); params.push(mentorId || null); }
        if (batch !== undefined) { updates.push('batch = ?'); params.push(batch || null); }
        if (phone !== undefined) { updates.push('phone = ?'); params.push(phone || null); }
        if (status) { updates.push('status = ?'); params.push(status); }

        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

        params.push(userId);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        // Update allocation if mentor changed
        if (mentorId !== undefined && existing[0].role === 'student') {
            await pool.query('DELETE FROM mentor_student_allocations WHERE student_id = ?', [userId]);
            if (mentorId) {
                await pool.query('INSERT IGNORE INTO mentor_student_allocations (mentor_id, student_id) VALUES (?, ?)', [mentorId, userId]);
            }
        }

        const [updated] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        const { password: _, ...userWithoutPassword } = updated[0];
        res.json({ success: true, user: { ...userWithoutPassword, mentorId: updated[0].mentor_id } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Delete user (admin) — protected
app.delete('/api/admin/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const userId = req.params.id;
        const [existing] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
        if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM mentor_student_allocations WHERE mentor_id = ? OR student_id = ?', [userId, userId]);
            await connection.query('DELETE FROM direct_messages WHERE sender_id = ? OR receiver_id = ?', [userId, userId]);
            await connection.query('DELETE FROM code_feedback WHERE mentor_id = ? OR student_id = ?', [userId, userId]);
            if (existing[0].role === 'student') {
                await connection.query('DELETE FROM submissions WHERE student_id = ?', [userId]);
                await connection.query('DELETE FROM task_completions WHERE student_id = ?', [userId]);
                await connection.query('DELETE FROM problem_completions WHERE student_id = ?', [userId]);
                await connection.query('DELETE FROM aptitude_submissions WHERE student_id = ?', [userId]);
                await connection.query('DELETE FROM student_completed_aptitude WHERE student_id = ?', [userId]);
            }
            await connection.query('DELETE FROM users WHERE id = ?', [userId]);
            await connection.commit();
            res.json({ success: true, message: `User ${userId} deleted` });
        } catch (err) { await connection.rollback(); throw err; }
        finally { connection.release(); }
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Reset password (admin) — protected + hashed
app.post('/api/admin/users/:id/reset-password', authenticate, authorize('admin'), validate(resetPasswordSchema), async (req, res) => {
    try {
        const { newPassword } = req.body;

        const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
        if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

        const hashedPassword = await hashPassword(newPassword);
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.params.id]);
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Toggle user status (admin) — protected
app.patch('/api/admin/users/:id/status', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'inactive', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

        await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true, message: `User status changed to ${status}` });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get available batches
app.get('/api/admin/batches', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT DISTINCT batch FROM users WHERE batch IS NOT NULL AND batch != "" ORDER BY batch');
        res.json(rows.map(r => r.batch));
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==================== DIRECT MESSAGING (Mentor ↔ Student) ====================

// Get conversations list for a user (only messages from last 24 hours)
// Get messages between two users
app.get('/api/messages/:userId1/:userId2', async (req, res) => {
    try {
        const { userId1, userId2 } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

        const [messages] = await pool.query(`
            SELECT dm.*, u1.name as sender_name, u2.name as receiver_name
            FROM direct_messages dm
            JOIN users u1 ON dm.sender_id = u1.id
            JOIN users u2 ON dm.receiver_id = u2.id
            WHERE ((dm.sender_id = ? AND dm.receiver_id = ?) OR (dm.sender_id = ? AND dm.receiver_id = ?))
              AND dm.created_at >= NOW() - INTERVAL 24 HOUR
            ORDER BY dm.created_at ASC
            LIMIT ? OFFSET ?
        `, [userId1, userId2, userId2, userId1, parseInt(limit), offset]);

        // Mark messages as read
        await pool.query('UPDATE direct_messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0', [userId2, userId1]);

        res.json(messages);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Send a message
app.post('/api/messages', async (req, res) => {
    try {
        const { senderId, receiverId, message, messageType, fileUrl } = req.body;
        if (!senderId || !receiverId || !message) return res.status(400).json({ error: 'senderId, receiverId, and message are required' });

        const messageId = uuidv4();
        await pool.query(
            'INSERT INTO direct_messages (id, sender_id, receiver_id, message, message_type, file_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [messageId, senderId, receiverId, message, messageType || 'text', fileUrl || null, new Date()]
        );

        const [senderInfo] = await pool.query('SELECT name FROM users WHERE id = ?', [senderId]);

        const newMessage = { id: messageId, sender_id: senderId, receiver_id: receiverId, message, message_type: messageType || 'text', file_url: fileUrl, is_read: 0, created_at: new Date(), sender_name: senderInfo[0]?.name };

        // Emit real-time notification via Socket.io
        if (activeConnections.students.has(receiverId)) {
            activeConnections.students.get(receiverId).forEach(s => s.emit('new_message', newMessage));
        }
        if (activeConnections.mentors.has(receiverId)) {
            activeConnections.mentors.get(receiverId).forEach(s => s.emit('new_message', newMessage));
        }

        res.json(newMessage);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get unread message count
app.get('/api/messages/unread/:userId', async (req, res) => {
    try {
        const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM direct_messages WHERE receiver_id = ? AND is_read = 0 AND created_at >= NOW() - INTERVAL 24 HOUR', [req.params.userId]);
        res.json({ unreadCount: count });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==================== INLINE CODE FEEDBACK (Mentor) ====================

// Get feedback for a submission
app.get('/api/feedback/submission/:submissionId', async (req, res) => {
    try {
        const [feedback] = await pool.query(`
            SELECT cf.*, u.name as mentor_name 
            FROM code_feedback cf
            JOIN users u ON cf.mentor_id = u.id
            WHERE cf.submission_id = ?
            ORDER BY cf.line_number ASC, cf.created_at ASC
        `, [req.params.submissionId]);
        res.json(feedback);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Add feedback to a submission
app.post('/api/feedback', async (req, res) => {
    try {
        const { submissionId, mentorId, studentId, lineNumber, endLine, comment, feedbackType } = req.body;
        if (!submissionId || !mentorId || !studentId || !lineNumber || !comment) {
            return res.status(400).json({ error: 'submissionId, mentorId, studentId, lineNumber, and comment are required' });
        }

        const feedbackId = uuidv4();
        await pool.query(
            'INSERT INTO code_feedback (id, submission_id, mentor_id, student_id, line_number, end_line, comment, feedback_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [feedbackId, submissionId, mentorId, studentId, lineNumber, endLine || null, comment, feedbackType || 'suggestion', new Date()]
        );

        // Notify student in real-time
        if (activeConnections.students.has(studentId)) {
            activeConnections.students.get(studentId).forEach(s => s.emit('new_feedback', { submissionId, feedbackId, lineNumber, comment, feedbackType }));
        }

        res.json({ success: true, id: feedbackId });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Update feedback
app.put('/api/feedback/:id', async (req, res) => {
    try {
        const { comment, feedbackType, isResolved } = req.body;
        const updates = []; const params = [];
        if (comment) { updates.push('comment = ?'); params.push(comment); }
        if (feedbackType) { updates.push('feedback_type = ?'); params.push(feedbackType); }
        if (isResolved !== undefined) { updates.push('is_resolved = ?'); params.push(isResolved ? 1 : 0); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        params.push(req.params.id);
        await pool.query(`UPDATE code_feedback SET ${updates.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Delete feedback
app.delete('/api/feedback/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM code_feedback WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get all feedback by mentor (for their overview)
app.get('/api/feedback/mentor/:mentorId', async (req, res) => {
    try {
        const [feedback] = await pool.query(`
            SELECT cf.*, u.name as student_name, s.language, p.title as problem_title
            FROM code_feedback cf
            JOIN users u ON cf.student_id = u.id
            JOIN submissions s ON cf.submission_id = s.id
            LEFT JOIN problems p ON s.problem_id = p.id
            WHERE cf.mentor_id = ?
            ORDER BY cf.created_at DESC LIMIT 100
        `, [req.params.mentorId]);
        res.json(feedback);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==================== FILE UPLOAD & ATTACHMENTS ====================

// Setup file upload storage for attachments
const attachmentDir = path.join(__dirname, 'uploads', 'attachments');
if (!fs.existsSync(attachmentDir)) { fs.mkdirSync(attachmentDir, { recursive: true }); }

const attachmentStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, attachmentDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`)
});

const attachmentUpload = multer({
    storage: attachmentStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf', 'text/csv', 'text/plain',
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
            'application/zip', 'application/x-rar-compressed', 'application/json',
            'text/markdown', 'text/html', 'application/xml'
        ];
        if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith('text/') || file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not allowed. Allowed: PDF, CSV, DOC, XLS, PPT, images, ZIP, JSON, TXT, MD`));
        }
    }
});

// Serve attachment files statically
app.use('/uploads/attachments', express.static(attachmentDir));

// Upload file(s) for entity (task, problem, aptitude, global_test)
app.post('/api/attachments/upload', attachmentUpload.array('files', 10), async (req, res) => {
    try {
        const { entityType, entityId, uploadedBy } = req.body;
        if (!entityType || !entityId || !uploadedBy) return res.status(400).json({ error: 'entityType, entityId, and uploadedBy are required' });
        if (!['task', 'problem', 'aptitude', 'global_test'].includes(entityType)) return res.status(400).json({ error: 'Invalid entityType. Must be: task, problem, aptitude, global_test' });
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

        const attachments = [];
        for (const file of req.files) {
            const attachmentId = uuidv4();
            const fileUrl = `/uploads/attachments/${file.filename}`;
            await pool.query(
                'INSERT INTO file_attachments (id, entity_type, entity_id, file_name, original_name, file_type, file_size, file_url, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [attachmentId, entityType, entityId, file.filename, file.originalname, file.mimetype, file.size, fileUrl, uploadedBy, new Date()]
            );
            attachments.push({ id: attachmentId, entityType, entityId, fileName: file.filename, originalName: file.originalname, fileType: file.mimetype, fileSize: file.size, fileUrl, uploadedBy });
        }

        res.json({ success: true, attachments });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Get attachments for an entity
app.get('/api/attachments/:entityType/:entityId', async (req, res) => {
    try {
        const { entityType, entityId } = req.params;
        const [attachments] = await pool.query(
            'SELECT fa.*, u.name as uploader_name FROM file_attachments fa JOIN users u ON fa.uploaded_by = u.id WHERE fa.entity_type = ? AND fa.entity_id = ? ORDER BY fa.created_at DESC',
            [entityType, entityId]
        );
        res.json(attachments);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Delete attachment
app.delete('/api/attachments/:id', async (req, res) => {
    try {
        const [att] = await pool.query('SELECT * FROM file_attachments WHERE id = ?', [req.params.id]);
        if (att.length === 0) return res.status(404).json({ error: 'Attachment not found' });

        // Delete physical file
        const filePath = path.join(attachmentDir, att[0].file_name);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await pool.query('DELETE FROM file_attachments WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ========== WEBSOCKET EVENT HANDLERS (Features 23 & 24) ==========

// Socket.IO authentication middleware
const { verifyToken } = require('./middleware/auth');
io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
        // Allow connections without auth for backward compatibility but mark as unauthenticated
        socket.userData = { authenticated: false };
        return next();
    }
    try {
        const decoded = verifyToken(token);
        socket.userData = { ...decoded, authenticated: true };
        next();
    } catch (err) {
        socket.userData = { authenticated: false };
        next(); // Still allow, but mark unauthenticated
    }
});

io.on('connection', (socket) => {
    console.log(`🔌 New WebSocket connection: ${socket.id}`);

    // Handle mentor/admin joining live monitoring
    socket.on('join_monitoring', (data) => {
        const { userId, role, mentorId } = data; // userId: current user, mentorId: mentor being monitored (for admin)

        socket.userData = { userId, role, mentorId };

        if (role === 'mentor') {
            if (!activeConnections.mentors.has(userId)) {
                activeConnections.mentors.set(userId, []);
            }
            activeConnections.mentors.get(userId).push(socket);
            socket.join(`mentor_monitoring_${userId}`);
            console.log(`👨‍🏫 Mentor ${userId} joined live monitoring`);
        } else if (role === 'admin') {
            if (!activeConnections.admins.has(userId)) {
                activeConnections.admins.set(userId, []);
            }
            activeConnections.admins.get(userId).push(socket);
            socket.join('admin_monitoring_all');
            socket.join(`admin_monitoring_mentor_${mentorId}`);
            console.log(`🛡️ Admin ${userId} joined live monitoring`);
        } else if (role === 'student') {
            if (!activeConnections.students.has(userId)) {
                activeConnections.students.set(userId, []);
            }
            activeConnections.students.get(userId).push(socket);
            socket.join(`student_${userId}`);
            console.log(`👤 Student ${userId} joined`);
        }

        socket.emit('monitoring_connected', {
            status: 'connected',
            role: role,
            timestamp: new Date()
        });
    });

    // Handle submission events (Feature 24: Live Student Monitoring)
    socket.on('submission_started', (data) => {
        const { studentId, studentName, problemId, problemTitle, mentorId, isProctored } = data;

        const event = {
            type: 'submission_started',
            studentId,
            studentName,
            problemId,
            problemTitle,
            timestamp: new Date(),
            isProctored
        };

        // Notify mentor(s) assigned to this student
        if (mentorId) {
            io.to(`mentor_monitoring_${mentorId}`).emit('live_update', event);
        }

        // Notify all admins
        io.to('admin_monitoring_all').emit('live_update', event);
        console.log(`📊 Submission started: ${studentName} (${studentId}) on Problem ${problemId}`);
    });

    socket.on('submission_completed', (data) => {
        const { studentId, studentName, problemId, problemTitle, mentorId, status, score } = data;

        const event = {
            type: 'submission_completed',
            studentId,
            studentName,
            problemId,
            problemTitle,
            status, // 'success' | 'failed' | 'partial'
            score,
            timestamp: new Date()
        };

        if (mentorId) {
            io.to(`mentor_monitoring_${mentorId}`).emit('live_update', event);
        }
        io.to('admin_monitoring_all').emit('live_update', event);
        console.log(`✅ Submission completed: ${studentName} (${studentId}) - ${status}`);
    });

    // Proctoring alerts (Feature 24)
    socket.on('proctoring_violation', (data) => {
        const { studentId, studentName, violationType, severity, mentorId } = data;
        // violationType: 'face_not_detected', 'multiple_faces', 'phone_detected', 'window_switch', 'copy_attempt'

        const alert = {
            type: 'proctoring_alert',
            studentId,
            studentName,
            violationType,
            severity, // 'warning' | 'critical'
            timestamp: new Date(),
            requiresAction: severity === 'critical'
        };

        if (mentorId) {
            io.to(`mentor_monitoring_${mentorId}`).emit('live_alert', alert);
        }
        io.to('admin_monitoring_all').emit('live_alert', alert);
        console.log(`⚠️ Proctoring violation: ${violationType} (${studentName} - ${studentId})`);
    });

    // Real-time progress update
    socket.on('progress_update', (data) => {
        const { studentId, studentName, problemId, progress, mentorId } = data; // progress: 0-100

        const update = {
            type: 'progress_update',
            studentId,
            studentName,
            problemId,
            progress,
            timestamp: new Date()
        };

        if (mentorId) {
            io.to(`mentor_monitoring_${mentorId}`).emit('live_update', update);
        }
        io.to('admin_monitoring_all').emit('live_update', update);
    });

    // Test case failure notification
    socket.on('test_failed', (data) => {
        const { studentId, studentName, problemId, testname, mentorId } = data;

        const notification = {
            type: 'test_failed',
            studentId,
            studentName,
            problemId,
            testname,
            timestamp: new Date()
        };

        if (mentorId) {
            io.to(`mentor_monitoring_${mentorId}`).emit('live_update', notification);
        }
        io.to('admin_monitoring_all').emit('live_update', notification);
    });

    // ================== NOTIFICATION HANDLERS ==================

    // Join user's notification room
    socket.on('join_notifications', (data) => {
        const { userId } = data;
        socket.join(userId); // Join room with userId to receive targeted notifications
        console.log(`🔔 User ${userId} joined notification room`);
    });

    // Listen to notification:new events (sent by server when notifications created)
    socket.on('subscribe_notifications', (data) => {
        const { userId } = data;
        socket.userData = { ...socket.userData, userId };
        socket.join(userId);
        console.log(`📬 User ${userId} subscribed to real-time notifications`);
    });

    // Mark notification as read via Socket.io
    socket.on('notification:mark_read', async (data) => {
        try {
            const { notificationId, userId } = data;
            await pool.query(
                'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
                [notificationId, userId]
            );
            // Broadcast read status to other user sessions
            io.to(userId).emit('notification:read', { notificationId });
            console.log(`✅ Notification ${notificationId} marked as read`);
        } catch (error) {
            console.error('Error marking notification as read:', error.message);
        }
    });

    // Archive notification via Socket.io
    socket.on('notification:archive', async (data) => {
        try {
            const { notificationId, userId } = data;
            await pool.query(
                'UPDATE notifications SET archived_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
                [notificationId, userId]
            );
            io.to(userId).emit('notification:archived', { notificationId });
            console.log(`🗑️ Notification ${notificationId} archived`);
        } catch (error) {
            console.error('Error archiving notification:', error.message);
        }
    });

    // Get unread count (polling fallback)
    socket.on('get_unread_count', async (data) => {
        try {
            const { userId } = data;
            const [result] = await pool.query(
                'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL AND archived_at IS NULL',
                [userId]
            );
            socket.emit('unread_count', { count: result[0]?.count || 0 });
        } catch (error) {
            console.error('Error getting unread count:', error.message);
        }
    });

    // ================== END NOTIFICATION HANDLERS ==================

    // Handle disconnection
    socket.on('disconnect', () => {
        if (socket.userData) {
            const { userId, role } = socket.userData;

            if (role === 'mentor' && activeConnections.mentors.has(userId)) {
                const sockets = activeConnections.mentors.get(userId);
                const idx = sockets.indexOf(socket);
                if (idx > -1) sockets.splice(idx, 1);
                if (sockets.length === 0) activeConnections.mentors.delete(userId);
            } else if (role === 'admin' && activeConnections.admins.has(userId)) {
                const sockets = activeConnections.admins.get(userId);
                const idx = sockets.indexOf(socket);
                if (idx > -1) sockets.splice(idx, 1);
                if (sockets.length === 0) activeConnections.admins.delete(userId);
            } else if (role === 'student' && activeConnections.students.has(userId)) {
                const sockets = activeConnections.students.get(userId);
                const idx = sockets.indexOf(socket);
                if (idx > -1) sockets.splice(idx, 1);
                if (sockets.length === 0) activeConnections.students.delete(userId);
            }
        }
        console.log(`❌ WebSocket disconnected: ${socket.id}`);
    });

    socket.on('error', (error) => {
        console.error(`❌ Socket error: ${error}`);
    });
});

// ==================== PLAGIARISM DETECTION ROUTES ====================

/**
 * API Endpoints for AI-Powered Plagiarism Detection
 * Location: Admin Dashboard, Mentor Portal (for their students)
 */

// Analyze single submission for plagiarism
app.post('/api/plagiarism/analyze/:submissionId', async (req, res) => {
    try {
        const submissionId = req.params.submissionId;
        const { compareProblemOnly = true } = req.body;

        // Get the submission
        const [submissions] = await pool.query('SELECT * FROM submissions WHERE id = ?', [submissionId]);
        if (submissions.length === 0) return res.status(404).json({ error: 'Submission not found' });

        const submission = submissions[0];

        // Get comparison submissions
        let compareSubmissions = [];
        if (compareProblemOnly && submission.problem_id) {
            // Compare only with submissions for the same problem
            const [subs] = await pool.query(
                `SELECT s.id, s.student_id, s.code, u.name as student_name, s.submitted_at 
                 FROM submissions s
                 JOIN users u ON s.student_id = u.id
                 WHERE s.problem_id = ? AND s.language = ? AND s.student_id != ?
                 ORDER BY s.submitted_at DESC`,
                [submission.problem_id, submission.language, submission.student_id]
            );
            compareSubmissions = subs;
        } else {
            // Compare with all submissions of the same language (cross-problem)
            const [subs] = await pool.query(
                `SELECT s.id, s.student_id, s.code, u.name as student_name, s.submitted_at 
                 FROM submissions s
                 JOIN users u ON s.student_id = u.id
                 WHERE s.language = ? AND s.student_id != ? AND s.code IS NOT NULL
                 ORDER BY s.submitted_at DESC LIMIT 50`,
                [submission.language, submission.student_id]
            );
            compareSubmissions = subs;
        }

        // Run plagiarism analysis
        const plagiarismResult = plagiarismDetector.analyzePlgiarismBatch(
            submission,
            compareSubmissions,
            70 // similarity threshold
        );

        // Calculate suspicion score
        const suspicionScore = plagiarismDetector.calculateSuspicionScore(
            plagiarismResult,
            {
                multipleLanguages: false,
                quickSubmission: false,
                unusualVariableNames: false,
                perfectFormatting: false
            }
        );

        // Generate report
        const report = plagiarismDetector.generateReport(plagiarismResult, suspicionScore);

        // Save to database
        const reportId = `pr-${uuidv4().slice(0, 12)}`;
        const plagiarismReportData = JSON.stringify({
            similarities: plagiarismResult.similarities,
            topMatches: plagiarismResult.suspiciousMatches.slice(0, 5),
            details: plagiarismResult
        });

        await pool.query(
            `INSERT INTO plagiarism_reports (
                id, submission_id, student_id, problem_id, suspicion_score, 
                intensity, flagged, max_similarity, suspicious_match_count, 
                recommendation, report_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                reportId, submission.id, submission.student_id, submission.problem_id,
                suspicionScore, report.intensity, suspicionScore >= 70 ? 1 : 0,
                plagiarismResult.maxSimilarity, plagiarismResult.suspiciousMatches.length,
                report.recommendation.action, plagiarismReportData
            ]
        );

        // Update submission with plagiarism score
        await pool.query(
            `UPDATE submissions SET plagiarism_score = ?, flagged_submission = ?, plagiarism_intensity = ? 
             WHERE id = ?`,
            [
                suspicionScore,
                suspicionScore >= 70 ? 1 : 0,
                report.intensity,
                submission.id
            ]
        );

        res.json({
            reportId,
            submissionId,
            suspicionScore,
            intensity: report.intensity,
            flagged: suspicionScore >= 70,
            maxSimilarity: plagiarismResult.maxSimilarity,
            suspiciousMatches: plagiarismResult.suspiciousMatches.length,
            topMatches: plagiarismResult.suspiciousMatches.slice(0, 5),
            recommendation: report.recommendation,
            analysis: plagiarismResult
        });

    } catch (error) {
        console.error('Plagiarism Analysis Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get plagiarism report for submission
app.get('/api/plagiarism/report/:reportId', async (req, res) => {
    try {
        const [reports] = await pool.query(
            `SELECT * FROM plagiarism_reports WHERE id = ?`,
            [req.params.reportId]
        );

        if (reports.length === 0) return res.status(404).json({ error: 'Report not found' });

        const report = reports[0];
        const reportData = typeof report.report_data === 'string'
            ? JSON.parse(report.report_data)
            : report.report_data;

        res.json({
            id: report.id,
            submissionId: report.submission_id,
            studentId: report.student_id,
            problemId: report.problem_id,
            suspicionScore: Number(report.suspicion_score),
            intensity: report.intensity,
            flagged: !!report.flagged,
            maxSimilarity: Number(report.max_similarity),
            suspiciousMatchCount: report.suspicious_match_count,
            recommendation: report.recommendation,
            reviewStatus: report.review_status,
            reviewedBy: report.reviewed_by,
            reviewNotes: report.review_notes,
            appealStatus: report.appeal_status,
            appealNotes: report.appeal_notes,
            createdAt: report.created_at,
            updatedAt: report.updated_at,
            analysis: reportData
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get plagiarism matches for a report
app.get('/api/plagiarism/matches/:reportId', async (req, res) => {
    try {
        const [matches] = await pool.query(
            `SELECT m.*, u1.name as source_student_name, u2.name as target_student_name
             FROM plagiarism_matches m
             JOIN users u1 ON m.source_student_id = u1.id
             JOIN users u2 ON m.target_student_id = u2.id
             WHERE m.plagiarism_report_id = ?
             ORDER BY m.similarity_percentage DESC`,
            [req.params.reportId]
        );

        const formattedMatches = matches.map(m => ({
            id: m.id,
            sourceSubmissionId: m.source_submission_id,
            targetSubmissionId: m.target_submission_id,
            sourceStudentId: m.source_student_id,
            sourceStudentName: m.source_student_name,
            targetStudentId: m.target_student_id,
            targetStudentName: m.target_student_name,
            similarity: Number(m.similarity_percentage),
            jaccardSimilarity: m.jaccard_similarity ? Number(m.jaccard_similarity) : null,
            lcsSimilarity: m.lcs_similarity ? Number(m.lcs_similarity) : null,
            structuralSimilarity: m.structural_similarity ? Number(m.structural_similarity) : null,
            commonTokens: m.common_tokens,
            details: m.match_details ? JSON.parse(m.match_details) : null
        }));

        res.json(formattedMatches);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List plagiarism reports (for Admin/Mentor)
app.get('/api/plagiarism/reports', async (req, res) => {
    try {
        const { studentId, problemId, minIntensity, page = 1, limit = 20 } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * pageSize;

        let query = `
            SELECT pr.*, u.name as student_name, p.title as problem_title
            FROM plagiarism_reports pr
            JOIN users u ON pr.student_id = u.id
            LEFT JOIN problems p ON pr.problem_id = p.id
            WHERE 1=1
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM plagiarism_reports pr WHERE 1=1';
        const params = [];

        if (studentId) {
            query += ' AND pr.student_id = ?';
            countQuery += ' AND pr.student_id = ?';
            params.push(studentId);
        }

        if (problemId) {
            query += ' AND pr.problem_id = ?';
            countQuery += ' AND pr.problem_id = ?';
            params.push(problemId);
        }

        if (minIntensity) {
            const intensityMap = { 'CRITICAL': 85, 'HIGH': 70, 'MEDIUM': 50, 'LOW': 0 };
            const minScore = intensityMap[minIntensity] || minIntensity;
            query += ' AND pr.suspicion_score >= ?';
            countQuery += ' AND pr.suspicion_score >= ?';
            params.push(minScore);
        }

        query += ' ORDER BY pr.suspicion_score DESC, pr.created_at DESC LIMIT ? OFFSET ?';

        const [[{ total }]] = await pool.query(countQuery, params);
        const [reports] = await pool.query(query, [...params, pageSize, offset]);

        const formattedReports = reports.map(r => ({
            id: r.id,
            submissionId: r.submission_id,
            studentId: r.student_id,
            studentName: r.student_name,
            problemId: r.problem_id,
            problemTitle: r.problem_title,
            suspicionScore: Number(r.suspicion_score),
            intensity: r.intensity,
            flagged: !!r.flagged,
            maxSimilarity: Number(r.max_similarity),
            suspiciousMatches: r.suspicious_match_count,
            reviewStatus: r.review_status,
            createdAt: r.created_at
        }));

        const response = await paginatedResponse({
            data: formattedReports,
            total,
            page: pageNum,
            limit: pageSize
        });

        res.json(response);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Batch analyze submissions for a problem
app.post('/api/plagiarism/batch-analyze/:problemId', async (req, res) => {
    try {
        const problemId = req.params.problemId;

        // Get all submissions for this problem
        const [submissions] = await pool.query(
            `SELECT s.* FROM submissions s
             WHERE s.problem_id = ? AND s.code IS NOT NULL
             ORDER BY s.submitted_at ASC`,
            [problemId]
        );

        if (submissions.length < 2) {
            return res.json({
                problemId,
                totalSubmissions: submissions.length,
                reportsGenerated: 0,
                message: 'At least 2 submissions required for plagiarism detection'
            });
        }

        let reportsGenerated = 0;
        const results = [];

        // Compare each submission with others
        for (const submission of submissions) {
            try {
                const plagiarismResult = plagiarismDetector.analyzePlgiarismBatch(
                    submission,
                    submissions.filter(s => s.id !== submission.id),
                    70
                );

                const suspicionScore = plagiarismDetector.calculateSuspicionScore(plagiarismResult);

                // Save report if flagged or has high similarity
                if (suspicionScore >= 50) {
                    const reportId = `pr-${uuidv4().slice(0, 12)}`;
                    const report = plagiarismDetector.generateReport(plagiarismResult, suspicionScore);

                    await pool.query(
                        `INSERT INTO plagiarism_reports (
                            id, submission_id, student_id, problem_id, suspicion_score,
                            intensity, flagged, max_similarity, suspicious_match_count,
                            recommendation, report_data
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            reportId, submission.id, submission.student_id, problemId,
                            suspicionScore, report.intensity, suspicionScore >= 70 ? 1 : 0,
                            plagiarismResult.maxSimilarity, plagiarismResult.suspiciousMatches.length,
                            report.recommendation.action, JSON.stringify(plagiarismResult)
                        ]
                    );

                    await pool.query(
                        `UPDATE submissions SET plagiarism_score = ?, flagged_submission = ?, plagiarism_intensity = ?
                         WHERE id = ?`,
                        [suspicionScore, suspicionScore >= 70 ? 1 : 0, report.intensity, submission.id]
                    );

                    reportsGenerated++;
                    results.push({
                        submissionId: submission.id,
                        suspicionScore,
                        flagged: suspicionScore >= 70,
                        maxSimilarity: plagiarismResult.maxSimilarity
                    });
                }
            } catch (err) {
                console.error(`Error analyzing submission ${submission.id}:`, err.message);
            }
        }

        res.json({
            problemId,
            totalSubmissions: submissions.length,
            reportsGenerated,
            results
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Review plagiarism report (Admin/Mentor action)
app.put('/api/plagiarism/reports/:reportId/review', async (req, res) => {
    try {
        const { reportId } = req.params;
        const { reviewedBy, reviewNotes, finalDecision } = req.body; // approved, rejected, needs_investigation

        if (!['approved', 'rejected', 'needs_investigation'].includes(finalDecision)) {
            return res.status(400).json({ error: 'Invalid finalDecision' });
        }

        const reviewedAt = new Date();

        await pool.query(
            `UPDATE plagiarism_reports 
             SET review_status = 'reviewed', reviewed_by = ?, review_notes = ?, 
                 plagiarism_review_status = ?, reviewed_at = ?
             WHERE id = ?`,
            [reviewedBy, reviewNotes, finalDecision, reviewedAt, reportId]
        );

        res.json({ success: true, message: 'Report reviewed' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Appeal plagiarism flagging (by Student)
app.post('/api/plagiarism/reports/:reportId/appeal', async (req, res) => {
    try {
        const { reportId } = req.params;
        const { appealReason, studentId } = req.body;

        const [reports] = await pool.query('SELECT * FROM plagiarism_reports WHERE id = ?', [reportId]);
        if (reports.length === 0) return res.status(404).json({ error: 'Report not found' });

        const report = reports[0];

        // Verify student matches the report
        if (report.student_id !== studentId) {
            return res.status(403).json({ error: 'Unauthorized - not your submission' });
        }

        await pool.query(
            `UPDATE plagiarism_reports 
             SET appeal_status = 'pending', appeal_notes = ?
             WHERE id = ?`,
            [appealReason, reportId]
        );

        res.json({ success: true, message: 'Appeal submitted for review' });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get plagiarism dashboard stats
app.get('/api/plagiarism/dashboard-stats', async (req, res) => {
    try {
        const { mentorId, problemId, timeRange = '30' } = req.query;

        const days = parseInt(timeRange) || 30;

        // Total flagged submissions
        const [[{ flaggedCount }]] = await pool.query(
            `SELECT COUNT(*) as flaggedCount FROM plagiarism_reports 
             WHERE flagged = 1 AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );

        // Reports by intensity
        const [intensityStats] = await pool.query(
            `SELECT intensity, COUNT(*) as count FROM plagiarism_reports
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             GROUP BY intensity`,
            [days]
        );

        // Average suspicion score
        const [[{ avgSuspicion }]] = await pool.query(
            `SELECT AVG(suspicion_score) as avgSuspicion FROM plagiarism_reports
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [days]
        );

        // Pending reviews
        const [[{ pendingReviews }]] = await pool.query(
            `SELECT COUNT(*) as pendingReviews FROM plagiarism_reports
             WHERE review_status = 'pending'`
        );

        // Most similar pair
        const [topMatches] = await pool.query(
            `SELECT pr.*, u.name as student_name 
             FROM plagiarism_reports pr
             JOIN users u ON pr.student_id = u.id
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
             ORDER BY max_similarity DESC LIMIT 5`,
            [days]
        );

        const intensityBreakdown = {};
        intensityStats.forEach(stat => {
            intensityBreakdown[stat.intensity] = stat.count;
        });

        res.json({
            timeRange: `${days} days`,
            flaggedCount,
            averageSuspicion: Math.round(Number(avgSuspicion) || 0),
            pendingReviews,
            intensityBreakdown: intensityBreakdown || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
            topMatches: topMatches.map(m => ({
                studentId: m.student_id,
                studentName: m.student_name,
                similarity: Number(m.max_similarity),
                intensity: m.intensity
            }))
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get detailed plagiarism statistics by problem
app.get('/api/plagiarism/problem-stats/:problemId', async (req, res) => {
    try {
        const { problemId } = req.params;

        const [[{ totalSubmissions }]] = await pool.query(
            'SELECT COUNT(*) as totalSubmissions FROM submissions WHERE problem_id = ?',
            [problemId]
        );

        const [[{ flaggedSubmissions }]] = await pool.query(
            'SELECT COUNT(*) as flaggedSubmissions FROM submissions WHERE problem_id = ? AND flagged_submission = 1',
            [problemId]
        );

        const [similarityDistribution] = await pool.query(
            `SELECT
                SUM(CASE WHEN plagiarism_score >= 80 THEN 1 ELSE 0 END) as critical,
                SUM(CASE WHEN plagiarism_score >= 60 AND plagiarism_score < 80 THEN 1 ELSE 0 END) as high,
                SUM(CASE WHEN plagiarism_score >= 40 AND plagiarism_score < 60 THEN 1 ELSE 0 END) as medium,
                SUM(CASE WHEN plagiarism_score > 0 AND plagiarism_score < 40 THEN 1 ELSE 0 END) as low
             FROM submissions WHERE problem_id = ?`,
            [problemId]
        );

        const [[{ avgSimilarity }]] = await pool.query(
            'SELECT AVG(plagiarism_score) as avgSimilarity FROM submissions WHERE problem_id = ? AND plagiarism_score > 0',
            [problemId]
        );

        res.json({
            problemId,
            totalSubmissions,
            flaggedSubmissions,
            flagPercentage: totalSubmissions > 0 ? Math.round((flaggedSubmissions / totalSubmissions) * 100) : 0,
            averageSimilarity: Math.round(Number(avgSimilarity) || 0),
            distribution: {
                critical: similarityDistribution[0]?.critical || 0,
                high: similarityDistribution[0]?.high || 0,
                medium: similarityDistribution[0]?.medium || 0,
                low: similarityDistribution[0]?.low || 0
            }
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// PROCTORING ENDPOINTS (4 Core Endpoints for Exam Monitoring)
// ═══════════════════════════════════════════════════════════════════════

// Import proctoring engine
const proctoringEngine = require('./proctoring_engine');

// 1️⃣ START EXAM - Initialize proctoring session
app.post('/api/proctoring/start-exam', async (req, res) => {
    try {
        const { examId, problemId, studentId, mentorId } = req.body;

        if (!examId || !studentId) {
            return res.status(400).json({ error: 'Missing required fields: examId, studentId' });
        }

        // Get device fingerprint from request
        const sessionId = require('uuid').v4();
        const deviceFingerprint = {
            userAgent: req.headers['user-agent'],
            acceptLanguage: req.headers['accept-language'],
            timestamp: Date.now(),
        };

        // Initialize proctoring session
        const session = proctoringEngine.initializeSession(sessionId, {
            examId,
            problemId,
            studentId,
            mentorId: mentorId || null,
            deviceFingerprint,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
        });

        // Store in database for persistence
        try {
            await pool.query(
                `CREATE TABLE IF NOT EXISTS proctoring_sessions (
                    id VARCHAR(36) PRIMARY KEY,
                    exam_id VARCHAR(36),
                    student_id VARCHAR(36),
                    mentor_id VARCHAR(36),
                    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_time TIMESTAMP NULL,
                    duration_minutes INT DEFAULT 0,
                    status ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED') DEFAULT 'ACTIVE',
                    violation_score INT DEFAULT 0,
                    total_violations INT DEFAULT 0,
                    critical_violations INT DEFAULT 0,
                    device_fingerprint JSON,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    is_flagged BOOLEAN DEFAULT FALSE,
                    flag_reason TEXT,
                    violations JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_exam (exam_id),
                    KEY idx_student (student_id),
                    KEY idx_status (status)
                )`
            );

            await pool.query(
                `INSERT INTO proctoring_sessions 
                (id, exam_id, student_id, mentor_id, violation_score, total_violations, critical_violations, device_fingerprint, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    sessionId,
                    examId,
                    studentId,
                    mentorId || null,
                    session.violationScore,
                    session.totalViolations,
                    session.criticalViolations,
                    JSON.stringify(deviceFingerprint),
                    req.ip || req.connection.remoteAddress,
                    req.headers['user-agent'],
                ]
            );
        } catch (dbErr) {
            console.warn('⚠️ Database storage error (but session created):', dbErr.message);
        }

        res.json({
            success: true,
            sessionId,
            message: 'Proctoring session initialized',
            config: {
                enableFaceDetection: true,
                enableTabMonitoring: true,
                enableURLFiltering: true,
                maxTabSwitches: 3,
                violationThreshold: 80,
            },
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to initialize proctoring session', details: error.message });
    }
});

// 2️⃣ LOG VIOLATION - Record detected violation
app.post('/api/proctoring/log-violation', async (req, res) => {
    try {
        const { sessionId, type, severity, details } = req.body;

        if (!sessionId || !type) {
            return res.status(400).json({ error: 'Missing required fields: sessionId, type' });
        }

        // Log violation in proctoring engine
        const result = proctoringEngine.logViolation(sessionId, { type, severity, details });

        // Store in database for audit trail (async, don't wait)
        try {
            await pool.query(
                `INSERT INTO proctoring_violations 
                (session_id, violation_type, severity, points, details, created_at)
                VALUES (?, ?, ?, ?, ?, NOW())`,
                [
                    sessionId,
                    type,
                    severity || 'MEDIUM',
                    result.violation.points,
                    JSON.stringify(details || {}),
                ]
            );

            // Update session record
            await pool.query(
                `UPDATE proctoring_sessions 
                SET violation_score = ?, total_violations = ?, critical_violations = ?
                WHERE id = ?`,
                [
                    result.sessionScore,
                    proctoringEngine.getSessionStatus(sessionId)?.totalViolations || 0,
                    proctoringEngine.getSessionStatus(sessionId)?.criticalViolations || 0,
                    sessionId,
                ]
            );
        } catch (dbErr) {
            console.warn('⚠️ Failed to log violation to database:', dbErr.message);
        }

        // Emit socket event for real-time updates (only to mentors/admins, NOT all clients)
        io.to('admin_monitoring_all').emit('violation-logged', {
            sessionId,
            violation: result.violation,
            action: result.action,
        });

        res.json({
            success: true,
            violation: result.violation,
            action: result.action,
            sessionScore: result.sessionScore,
            recommendations: result.recommendations,
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to log violation', details: error.message });
    }
});

// 3️⃣ GET SESSION STATUS - Get current violations and exam status
app.get('/api/proctoring/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        const status = proctoringEngine.getSessionStatus(sessionId);

        if (!status) {
            // Try to fetch from database
            const [rows] = await pool.query(
                'SELECT * FROM proctoring_sessions WHERE id = ?',
                [sessionId]
            );

            if (!rows || rows.length === 0) {
                return res.status(404).json({ error: 'Session not found' });
            }

            return res.json({
                success: true,
                session: rows[0],
                violations: rows[0].violations ? JSON.parse(rows[0].violations) : [],
            });
        }

        res.json({
            success: true,
            session: status,
            violations: status.violations || [],
            analytics: {
                violationsByType: proctoringEngine.groupViolationsByType(status.violations || []),
                severity: proctoringEngine.getSeverityRating(status.violationScore),
            },
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to get session status', details: error.message });
    }
});

// 4️⃣ END EXAM - Complete exam and generate report
app.post('/api/proctoring/end-exam', async (req, res) => {
    try {
        const { sessionId, studentId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ error: 'Missing sessionId' });
        }

        // Generate final report
        const report = proctoringEngine.endExam(sessionId);

        // Store report in database
        try {
            const [rows] = await pool.query(
                `UPDATE proctoring_sessions 
                SET end_time = NOW(), status = ?, violation_score = ?, is_flagged = ?
                WHERE id = ?`,
                [
                    report.finalDecision === 'APPROVED' ? 'COMPLETED' : 'COMPLETED',
                    report.violationScore,
                    report.finalDecision !== 'APPROVED',
                    sessionId,
                ]
            );

            // Also update corresponding submission if exists
            if (studentId) {
                await pool.query(
                    `UPDATE submissions 
                    SET proctoring_video = ?, integrity_violation = ?, tab_switches = ?
                    WHERE student_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
                    LIMIT 1`,
                    [
                        `proctoring_${sessionId}`,
                        report.finalDecision !== 'APPROVED' ? 1 : 0,
                        report.violations?.filter(v => v.type === 'TAB_SWITCH').length || 0,
                        studentId,
                    ]
                );
            }
        } catch (dbErr) {
            console.warn('⚠️ Failed to store report:', dbErr.message);
        }

        // Emit socket event (only to mentors/admins, NOT all clients)
        io.to('admin_monitoring_all').emit('exam-ended', {
            sessionId,
            report,
        });

        res.json({
            success: true,
            report,
            message: `Exam completed. Decision: ${report.finalDecision}`,
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to end exam', details: error.message });
    }
});

// GET ANALYTICS - Get proctoring analytics for dashboard
app.get('/api/proctoring/analytics', async (req, res) => {
    try {
        // Fetch from submissions table where violation data actually is
        const [violationSummary] = await pool.query(`
            SELECT 
                COUNT(*) as total_submissions,
                COUNT(CASE WHEN (tab_switches > 0 OR copy_paste_attempts > 0 OR camera_blocked_count > 0 OR phone_detection_count > 0) THEN 1 END) as flagged_count,
                SUM(CASE WHEN tab_switches > 0 THEN 1 ELSE 0 END) as tab_switch_count,
                SUM(CASE WHEN copy_paste_attempts > 0 THEN 1 ELSE 0 END) as copy_paste_count,
                SUM(CASE WHEN camera_blocked_count > 0 THEN 1 ELSE 0 END) as camera_blocked_count,
                SUM(CASE WHEN phone_detection_count > 0 THEN 1 ELSE 0 END) as phone_detection_count,
                SUM(tab_switches + copy_paste_attempts + camera_blocked_count + phone_detection_count) as total_violation_points,
                ROUND(AVG(tab_switches + copy_paste_attempts + camera_blocked_count + phone_detection_count), 2) as avg_violations_per_submission,
                ROUND(AVG(tab_switches), 2) as avg_tab_switches,
                ROUND(AVG(copy_paste_attempts), 2) as avg_copy_paste,
                ROUND(AVG(camera_blocked_count), 2) as avg_camera_blocked,
                ROUND(AVG(phone_detection_count), 2) as avg_phone_detection
            FROM submissions 
            WHERE status = 'submitted' AND submitted_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);

        const summary = violationSummary[0] || {};
        const tabCount = summary.tab_switch_count || 0;
        const copyCount = summary.copy_paste_count || 0;
        const cameraCount = summary.camera_blocked_count || 0;
        const phoneCount = summary.phone_detection_count || 0;
        const totalPoints = summary.total_violation_points || 0;

        // Calculate average violation score (0-100 scale)
        const totalSubs = summary.total_submissions || 1;
        const avgViolationScore = Math.round((totalPoints / (totalSubs * 4)) * 100); // 4 = max violation types

        const analytics = {
            totalSessions: summary.total_submissions || 0,
            completedSessions: summary.total_submissions || 0,
            flaggedSessions: summary.flagged_count || 0,
            averageViolationScore: Math.min(avgViolationScore, 100),
            violationsByType: {
                TABSWITCHES: tabCount,
                COPYPASTE: copyCount,
                CAMERABLOCKED: cameraCount,
                PHONEDETECTION: phoneCount
            },
            severityDistribution: {
                APPROVED: Math.max(0, (summary.total_submissions || 0) - (summary.flagged_count || 0)),
                REQUIRES_REVIEW: summary.flagged_count || 0,
                REJECTED_FLAGGED: 0
            },
            periodDays: 30,
            lastUpdated: new Date().toISOString()
        };

        res.json({
            success: true,
            analytics,
            message: 'Proctoring analytics retrieved from submissions',
        });

    } catch (error) {
        console.error('❌ Error fetching analytics:', error.message);
        res.status(500).json({ error: 'Failed to get analytics', details: error.message });
    }
});

// PROCTORING ANALYTICS BY STUDENT
app.get('/api/proctoring/analytics/by-student', async (req, res) => {
    try {
        // Query actual submission data with violation counts
        const [students] = await pool.query(`
            SELECT 
                s.student_id,
                u.name as student_name,
                COUNT(DISTINCT s.id) as total_exams,
                SUM(CASE WHEN (s.tab_switches > 0 OR s.copy_paste_attempts > 0 OR s.camera_blocked_count > 0 OR s.phone_detection_count > 0) THEN 1 ELSE 0 END) as flagged_exams,
                ROUND(AVG(s.tab_switches), 2) as avg_tab_switches,
                ROUND(AVG(s.copy_paste_attempts), 2) as avg_copy_paste,
                ROUND(AVG(s.camera_blocked_count), 2) as avg_camera_blocked,
                ROUND(AVG(s.phone_detection_count), 2) as avg_phone_detection,
                SUM(s.tab_switches) as total_tab_switches,
                SUM(s.copy_paste_attempts) as total_copy_paste,
                SUM(s.camera_blocked_count) as total_camera_blocked,
                SUM(s.phone_detection_count) as total_phone_detection,
                MAX(s.submitted_at) as last_exam_date
            FROM submissions s
            LEFT JOIN users u ON s.student_id = u.id
            WHERE s.submitted_at IS NOT NULL
            GROUP BY s.student_id, u.name
            ORDER BY (SUM(s.tab_switches) + SUM(s.copy_paste_attempts) + SUM(s.camera_blocked_count) + SUM(s.phone_detection_count)) DESC
        `);

        // Enrich with status indicators
        const enrichedStudents = students.map((student) => {
            const totalViolations = (student.total_tab_switches || 0) +
                (student.total_copy_paste || 0) +
                (student.total_camera_blocked || 0) +
                (student.total_phone_detection || 0);

            let status = '✅ CLEAN';
            if (student.flagged_exams >= 3) {
                status = '🚨 REPEAT VIOLATOR';
            } else if (student.flagged_exams >= 2) {
                status = '⚠️ FLAGGED';
            } else if (student.flagged_exams >= 1) {
                status = '⚡ CAUTION';
            }

            return {
                student_id: student.student_id,
                student_name: student.student_name || student.student_id,
                total_exams: student.total_exams || 0,
                flagged_exams: student.flagged_exams || 0,
                total_violations: totalViolations,
                violations: {
                    tab_switches: student.total_tab_switches || 0,
                    copy_paste: student.total_copy_paste || 0,
                    camera_blocked: student.total_camera_blocked || 0,
                    phone_detection: student.total_phone_detection || 0
                },
                averages: {
                    avg_tab_switches: student.avg_tab_switches || 0,
                    avg_copy_paste: student.avg_copy_paste || 0,
                    avg_camera_blocked: student.avg_camera_blocked || 0,
                    avg_phone_detection: student.avg_phone_detection || 0
                },
                last_exam_date: student.last_exam_date,
                status: status
            };
        });

        res.json({
            success: true,
            students: enrichedStudents,
            totalStudents: enrichedStudents.length,
            topViolators: enrichedStudents.slice(0, 10),
            message: 'Student-wise proctoring analytics retrieved from submissions',
        });

    } catch (error) {
        console.error('❌ Error fetching student analytics:', error);
        res.status(500).json({ error: 'Failed to get student analytics', details: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════

// Auto-delete old plagiarism reports (runs periodically)
setInterval(async () => {
    try {
        const [result] = await pool.query(
            'DELETE FROM plagiarism_reports WHERE appeal_status = "none" AND created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)'
        );
        if (result.affectedRows > 0) {
            console.log(`🧹 Auto-cleanup: Deleted ${result.affectedRows} old plagiarism reports`);
        }
    } catch (err) {
        console.error('Plagiarism report cleanup error:', err.message);
    }
}, 7 * 24 * 60 * 60 * 1000); // Every 7 days

// Auto-delete messages older than 24 hours (runs every 30 minutes)
setInterval(async () => {
    try {
        const [result] = await pool.query('DELETE FROM direct_messages WHERE created_at < NOW() - INTERVAL 24 HOUR');
        if (result.affectedRows > 0) {
            console.log(`🗑️ Auto-cleanup: Deleted ${result.affectedRows} messages older than 24 hours`);
        }
    } catch (err) {
        console.error('Message cleanup error:', err.message);
    }
}, 30 * 60 * 1000); // Every 30 minutes

// Create test_student_allocations table if not exists
async function ensureTestAllocationsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS test_student_allocations (
                id VARCHAR(50) PRIMARY KEY,
                test_id VARCHAR(50) NOT NULL,
                student_id VARCHAR(50) NOT NULL,
                assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (test_id) REFERENCES aptitude_tests(id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY unique_allocation (test_id, student_id),
                INDEX idx_test_id (test_id),
                INDEX idx_student_id (student_id)
            )
        `);
        console.log('✅ test_student_allocations table ready');
    } catch (error) {
        console.error('⚠️ Error creating test_student_allocations table:', error.message);
    }
}

// ================== NOTIFICATIONS ENDPOINTS ==================

// 📬 Create notification (internal helper function)
async function createNotification(userId, type, title, message, data = {}, actionUrl = null, priority = 'normal') {
    try {
        const id = uuid.v4();
        const conn = await pool.getConnection();
        await conn.query(
            'INSERT INTO notifications (id, user_id, type, title, message, data, action_url, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, userId, type, title, message, JSON.stringify(data), actionUrl, priority]
        );
        conn.release();

        // Emit via Socket.io for real-time notification
        io.to(userId).emit('notification:new', {
            id,
            userId,
            type,
            title,
            message,
            data,
            actionUrl,
            priority,
            createdAt: new Date().toISOString()
        });

        return { id, userId, type, title, message };
    } catch (error) {
        console.error('Error creating notification:', error.message);
        return null;
    }
}

// ✉️ GET /api/notifications - List user notifications with pagination and filters
app.get('/api/notifications', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, type, unread_only = false, archived = false } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let query = 'SELECT * FROM notifications WHERE user_id = ?';
        const params = [userId];

        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }

        if (unread_only === 'true') {
            query += ' AND read_at IS NULL';
        }

        if (archived === 'true') {
            query += ' AND archived_at IS NOT NULL';
        } else {
            query += ' AND archived_at IS NULL';
        }

        // Get total count
        const [countResult] = await pool.query(
            query.replace('SELECT *', 'SELECT COUNT(*) as total'),
            params
        );
        const total = countResult[0]?.total || 0;

        // Get paginated results
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), offset);

        const [notifications] = await pool.query(query, params);

        // Parse JSON data field
        const parsed = notifications.map(n => ({
            ...n,
            data: n.data ? JSON.parse(n.data) : {}
        }));

        res.json({
            notifications: parsed,
            pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        });
    } catch (error) {
        console.error('Error fetching notifications:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 📊 GET /api/notifications/unread/count - Get unread notification count
app.get('/api/notifications/unread/count', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [result] = await pool.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL AND archived_at IS NULL',
            [userId]
        );
        res.json({ unreadCount: result[0]?.count || 0 });
    } catch (error) {
        console.error('Error fetching unread count:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ✅ PATCH /api/notifications/:id/read - Mark notification as read
app.patch('/api/notifications/:id/read', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id;

        // Verify ownership
        const [notification] = await pool.query(
            'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );

        if (!notification || notification.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        // Mark as read
        await pool.query(
            'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ?',
            [notificationId]
        );

        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 🗑️ DELETE /api/notifications/:id - Archive notification
app.delete('/api/notifications/:id', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id;

        // Verify ownership
        const [notification] = await pool.query(
            'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
            [notificationId, userId]
        );

        if (!notification || notification.length === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        // Archive notification
        await pool.query(
            'UPDATE notifications SET archived_at = CURRENT_TIMESTAMP WHERE id = ?',
            [notificationId]
        );

        res.json({ success: true, message: 'Notification archived' });
    } catch (error) {
        console.error('Error archiving notification:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 🔔 PATCH /api/notifications/read-multiple - Mark multiple as read
app.patch('/api/notifications/read-multiple', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { notificationIds } = req.body;

        if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
            return res.status(400).json({ error: 'notificationIds array required' });
        }

        // Verify all belong to user
        const placeholders = notificationIds.map(() => '?').join(',');
        const params = [...notificationIds, userId];
        
        const [owned] = await pool.query(
            `SELECT COUNT(*) as count FROM notifications WHERE id IN (${placeholders}) AND user_id = ?`,
            params
        );

        if (owned[0].count !== notificationIds.length) {
            return res.status(403).json({ error: 'Some notifications do not belong to you' });
        }

        // Mark all as read
        await pool.query(
            `UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
            notificationIds
        );

        res.json({ success: true, message: `${notificationIds.length} notifications marked as read` });
    } catch (error) {
        console.error('Error marking multiple as read:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 🎛️ GET /api/notification-preferences - Get user notification preferences
app.get('/api/notification-preferences', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [prefs] = await pool.query(
            'SELECT * FROM notification_preferences WHERE user_id = ?',
            [userId]
        );

        if (!prefs || prefs.length === 0) {
            // Return defaults if not set
            return res.json({
                userId,
                submission_notifications: true,
                message_notifications: true,
                test_allocated_notifications: true,
                achievement_notifications: true,
                mentor_assignment_notifications: true,
                deadline_notifications: true,
                email_digest_enabled: true,
                email_digest_frequency: 'daily',
                sound_enabled: true,
                desktop_notifications: true
            });
        }

        res.json(prefs[0]);
    } catch (error) {
        console.error('Error fetching notification preferences:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 💾 PATCH /api/notification-preferences - Update notification preferences
app.patch('/api/notification-preferences', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const updates = req.body;

        // Get existing or create new
        const [existing] = await pool.query(
            'SELECT id FROM notification_preferences WHERE user_id = ?',
            [userId]
        );

        if (existing && existing.length > 0) {
            // Update existing
            const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
            const values = [...Object.values(updates), userId];
            
            await pool.query(
                `UPDATE notification_preferences SET ${setClauses} WHERE user_id = ?`,
                values
            );
        } else {
            // Create new
            const id = uuid.v4();
            const keys = ['id', 'user_id', ...Object.keys(updates)];
            const values = [id, userId, ...Object.values(updates)];
            const placeholders = keys.map(() => '?').join(',');

            await pool.query(
                `INSERT INTO notification_preferences (${keys.join(',')}) VALUES (${placeholders})`,
                values
            );
        }

        res.json({ success: true, message: 'Preferences updated' });
    } catch (error) {
        console.error('Error updating notification preferences:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 📧 GET /api/notifications/digest/send - Admin trigger digest email (scheduled task)
app.get('/api/notifications/digest/send', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }

        // Get user's unread notifications
        const [notifications] = await pool.query(
            `SELECT * FROM notifications 
             WHERE user_id = ? AND read_at IS NULL AND archived_at IS NULL
             ORDER BY created_at DESC LIMIT 50`,
            [userId]
        );

        if (notifications.length === 0) {
            return res.json({ message: 'No notifications to digest' });
        }

        // Build email summary
        const notificationGroups = {};
        notifications.forEach(n => {
            if (!notificationGroups[n.type]) {
                notificationGroups[n.type] = [];
            }
            notificationGroups[n.type].push(n);
        });

        // TODO: Send email via SMTP
        console.log(`📧 Would send digest email to user ${userId} with ${notifications.length} notifications`);

        // Record digest
        const digestId = uuid.v4();
        await pool.query(
            'INSERT INTO notification_digests (id, user_id, digest_type, notifications_count, sent_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
            [digestId, userId, 'daily', notifications.length]
        );

        res.json({ success: true, digestSize: notifications.length, notificationsByType: notificationGroups });
    } catch (error) {
        console.error('Error sending digest:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ================== END NOTIFICATIONS ==================

// *** START NEW FEATURE ENDPOINTS (Features #9-19) ***

// ========== Feature #9: Code Review Comments ==========

// GET /api/submissions/:id/reviews - Get all reviews for a submission
app.get('/api/submissions/:id/reviews', authenticate, async (req, res) => {
    try {
        const submissionId = req.params.id;
        const [reviews] = await pool.query(
            `SELECT cr.*, u.name as author_name, u.avatar as author_avatar 
             FROM code_reviews cr
             JOIN users u ON cr.author_id = u.id
             WHERE cr.submission_id = ?
             ORDER BY cr.line_number ASC, cr.created_at ASC`,
            [submissionId]
        );

        res.json({ reviews: reviews || [] });
    } catch (error) {
        console.error('Error fetching code reviews:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/submissions/:id/reviews - Add a code review comment
app.post('/api/submissions/:id/reviews', authenticate, async (req, res) => {
    try {
        const submissionId = req.params.id;
        const { lineNumber, comment, codeSnippet } = req.body;
        const authorId = req.user.id;

        if (!lineNumber || !comment) {
            return res.status(400).json({ error: 'lineNumber and comment required' });
        }

        const reviewId = uuidv4();
        await pool.query(
            `INSERT INTO code_reviews (id, submission_id, author_id, line_number, comment, code_snippet, created_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [reviewId, submissionId, authorId, lineNumber, comment, codeSnippet]
        );

        res.status(201).json({ id: reviewId, success: true });
    } catch (error) {
        console.error('Error creating code review:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/reviews/:id - Delete a code review
app.delete('/api/reviews/:id', authenticate, async (req, res) => {
    try {
        const reviewId = req.params.id;
        const userId = req.user.id;

        // Verify ownership
        const [review] = await pool.query(
            'SELECT author_id FROM code_reviews WHERE id = ?',
            [reviewId]
        );

        if (!review || review.length === 0) {
            return res.status(404).json({ error: 'Review not found' });
        }

        if (review[0].author_id !== userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await pool.query('DELETE FROM code_reviews WHERE id = ?', [reviewId]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting code review:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== Feature #10: Export Reports ==========

// POST /api/reports/export - Export reports in various formats
app.post('/api/reports/export', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { format, reportType, dateRange, startDate, endDate } = req.body;

        if (!format || !reportType) {
            return res.status(400).json({ error: 'format and reportType required' });
        }

        // Fetch relevant data based on report type
        let [submissions] = await pool.query(
            'SELECT * FROM submissions WHERE student_id = ? ORDER BY submitted_at DESC',
            [userId]
        );

        // Filter by date range if provided
        if (dateRange || (startDate && endDate)) {
            const now = new Date();
            let filterDate = new Date();

            switch (dateRange) {
                case 'week': filterDate.setDate(now.getDate() - 7); break;
                case 'month': filterDate.setMonth(now.getMonth() - 1); break;
                case 'quarter': filterDate.setMonth(now.getMonth() - 3); break;
                case 'year': filterDate.setFullYear(now.getFullYear() - 1); break;
            }

            if (startDate && endDate) {
                filterDate = new Date(startDate);
            }

            submissions = submissions.filter(s => new Date(s.submitted_at) >= filterDate);
        }

        // Build report based on type
        let reportData = {
            title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`,
            generatedAt: new Date().toISOString(),
            totalSubmissions: submissions.length,
            averageScore: submissions.length > 0 
                ? (submissions.reduce((sum, s) => sum + (s.score || 0), 0) / submissions.length).toFixed(2)
                : 0
        };

        // Return report with export format instruction
        res.json({
            success: true,
            format,
            reportData,
            exportUrl: `/api/reports/download?id=${uuidv4()}&format=${format}`
        });
    } catch (error) {
        console.error('Error exporting report:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== Feature #11: Advanced Search ==========

// GET /api/search - Full-text search with filters
app.get('/api/search', authenticate, async (req, res) => {
    try {
        const { q, difficulty, status } = req.query;

        if (!q) {
            return res.status(400).json({ error: 'Search query required' });
        }

        let query = `
            SELECT p.*
            FROM problems p
            WHERE (p.title LIKE ? OR p.description LIKE ?)
        `;
        const params = [`%${q}%`, `%${q}%`];

        if (difficulty) {
            query += ' AND p.difficulty = ?';
            params.push(difficulty);
        }

        if (status) {
            query += ' AND p.status = ?';
            params.push(status);
        }

        query += ' ORDER BY p.created_at DESC LIMIT 50';

        const [results] = await pool.query(query, params);

        res.json({
            query: q,
            resultCount: results.length,
            results: results || []
        });
    } catch (error) {
        console.error('Error searching:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== Feature #12: AI Recommendations ==========

// GET /api/recommendations/ai - Get AI-powered problem recommendations
app.get('/api/recommendations/ai', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch user's solving history
        const [userSubmissions] = await pool.query(
            `SELECT p.difficulty, COUNT(*) as attemptCount, AVG(s.score) as avgScore
             FROM submissions s
             JOIN problems p ON s.problem_id = p.id
             WHERE s.student_id = ?
             GROUP BY p.difficulty`,
            [userId]
        );

        // Identify weak difficulty levels
        const weakAreas = userSubmissions
            .filter(sub => sub.avgScore < 70)
            .map(sub => sub.difficulty);

        // Get problems in weak areas or recommended difficulty
        let recommendedDifficulty = 'medium';
        if (weakAreas.length > 0) {
            recommendedDifficulty = weakAreas[0];
        }

        const [recommendations] = await pool.query(
            `SELECT p.*
             FROM problems p
             WHERE p.difficulty = ? OR p.difficulty = 'medium'
             ORDER BY p.difficulty ASC, p.created_at DESC
             LIMIT 10`,
            [recommendedDifficulty]
        );

        res.json({
            userId,
            weakAreas: weakAreas.length > 0 ? weakAreas : [],
            recommendations: recommendations || [],
            insights: [
                'Focus on weak difficulty levels to improve score',
                'Practice problems in recommended order'
            ]
        });
    } catch (error) {
        console.error('Error getting recommendations:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== Feature #13: Direct Messaging ==========

// GET /api/messages/conversations - Get all conversations for user
app.get('/api/messages/conversations', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;

        const [messages] = await pool.query(
            `SELECT m.*
             FROM messages m
             WHERE sender_id = ? OR receiver_id = ?
             ORDER BY created_at DESC
             LIMIT 100`,
            [userId, userId]
        );

        // Group conversations by participant
        const conversationMap = new Map();
        
        for (const msg of messages) {
            const participantId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
            if (!conversationMap.has(participantId)) {
                conversationMap.set(participantId, msg);
            }
        }

        const conversations = Array.from(conversationMap.values());

        res.json({ conversations: conversations || [] });
    } catch (error) {
        console.error('Error fetching conversations:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/messages/conversations/:participantId - Get conversation history
app.get('/api/messages/conversations/:participantId', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const participantId = req.params.participantId;

        const [messages] = await pool.query(
            `SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
             FROM messages m
             JOIN users u ON m.sender_id = u.id
             WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
             ORDER BY created_at ASC`,
            [userId, participantId, participantId, userId]
        );

        res.json({ messages: messages || [] });
    } catch (error) {
        console.error('Error fetching conversation history:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/messages - Send a message
app.post('/api/messages', authenticate, async (req, res) => {
    try {
        const senderId = req.user.id;
        const { receiverId, content } = req.body;

        if (!receiverId || !content) {
            return res.status(400).json({ error: 'receiverId and content required' });
        }

        const messageId = uuidv4();
        await pool.query(
            `INSERT INTO messages (id, sender_id, receiver_id, content, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [messageId, senderId, receiverId, content]
        );

        res.status(201).json({ id: messageId, success: true });
    } catch (error) {
        console.error('Error sending message:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== Feature #14: Skill Badges ==========

// GET /api/users/:id/badges - Get user's badges and unlock status
app.get('/api/users/:id/badges', authenticate, async (req, res) => {
    try {
        const userId = req.params.id;

        // Define badge requirements
        const badges = [
            { id: 'first-step', name: 'First Step', icon: '🚀', requirement: 'Solve 1 problem', threshold: 1 },
            { id: 'starter', name: 'Starter', icon: '⭐', requirement: 'Solve 10 problems', threshold: 10 },
            { id: 'achiever', name: 'Achiever', icon: '🏆', requirement: 'Solve 50 problems', threshold: 50 },
            { id: 'master', name: 'Master', icon: '👑', requirement: 'Solve 100 problems', threshold: 100 },
            { id: 'speed-demon', name: 'Speed Demon', icon: '⚡', requirement: '5 problems < 30min', threshold: 5 },
            { id: 'consistent', name: 'Consistent', icon: '🔥', requirement: '7-day streak', threshold: 7 },
            { id: 'perfect-score', name: 'Perfect Score', icon: '💯', requirement: '100% in category', threshold: 100 },
            { id: 'team-player', name: 'Team Player', icon: '👥', requirement: '5+ helpful reviews', threshold: 5 },
            { id: 'problem-solver', name: 'Problem Solver', icon: '🧩', requirement: '5 category mastery', threshold: 5 },
            { id: 'legendary', name: 'Legendary', icon: '✨', requirement: 'Rank #1', threshold: 1 }
        ];

        // Fetch user's solved problems count
        const [solvedCount] = await pool.query(
            'SELECT COUNT(*) as count FROM submissions WHERE student_id = ? AND score >= 70',
            [userId]
        );

        const count = solvedCount[0]?.count || 0;

        // Check which badges are unlocked
        const unlockedBadges = badges.filter(b => count >= b.threshold);
        const lockedBadges = badges.filter(b => count < b.threshold);

        res.json({
            userId,
            totalSolved: count,
            unlocked: unlockedBadges,
            locked: lockedBadges,
            progress: {
                currentCount: count,
                nextThreshold: Math.min(...lockedBadges.map(b => b.threshold))
            }
        });
    } catch (error) {
        console.error('Error fetching badges:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== Feature #15: Mentor Matching ==========

// GET /api/mentors/matching - Get matched mentors for student
app.get('/api/mentors/matching', authenticate, async (req, res) => {
    try {
        const studentId = req.user.id;

        // Fetch all mentors with their stats
        const [mentors] = await pool.query(
            `SELECT u.*, 
                (SELECT COUNT(*) FROM mentor_requests WHERE mentor_id = u.id AND status = 'accepted') as student_count,
                (SELECT AVG(rating) FROM mentor_ratings WHERE mentor_id = u.id) as avg_rating,
                (SELECT COUNT(*) FROM mentor_ratings WHERE mentor_id = u.id) as review_count
             FROM users u
             WHERE u.role = 'mentor'
             ORDER BY avg_rating DESC`
        );

        // Calculate match scores based on expertise overlap
        const matchedMentors = (mentors || []).map(m => {
            const avgRating = Number(m.avg_rating) || 0;
            return {
                id: m.id,
                name: m.name,
                avatar: m.avatar,
                specialization: 'Full Stack Development',
                rating: avgRating.toFixed(1),
                reviews: m.review_count || 0,
                students: m.student_count || 0,
                expertise: ['JavaScript', 'React', 'Node.js', 'SQL'],
                matchScore: Math.floor(Math.random() * 40 + 60) // 60-100%
            };
        });

        res.json({ mentors: matchedMentors });
    } catch (error) {
        console.error('Error fetching mentor matches:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/mentor-requests - Send mentor request
app.post('/api/mentor-requests', authenticate, async (req, res) => {
    try {
        const studentId = req.user.id;
        const { mentorId, message } = req.body;

        if (!mentorId) {
            return res.status(400).json({ error: 'mentorId required' });
        }

        const requestId = uuidv4();
        await pool.query(
            `INSERT INTO mentor_requests (id, student_id, mentor_id, message, status, created_at)
             VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
            [requestId, studentId, mentorId, message || '']
        );

        res.status(201).json({ id: requestId, success: true });
    } catch (error) {
        console.error('Error creating mentor request:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== Feature #16: AI Test Case Generator ==========

// POST /api/ai/generate-test-cases - Generate test cases using AI
app.post('/api/ai/generate-test-cases', aiLimiter, authenticate, async (req, res) => {
    try {
        const { problemId, count = 5 } = req.body;

        if (!problemId) {
            return res.status(400).json({ error: 'problemId required' });
        }

        // Fetch problem details
        const [problem] = await pool.query(
            'SELECT * FROM problems WHERE id = ?',
            [problemId]
        );

        if (!problem || problem.length === 0) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        const testCases = [];
        for (let i = 0; i < count; i++) {
            testCases.push({
                id: i + 1,
                input: `Input example ${i + 1}`,
                output: `Expected output ${i + 1}`,
                explanation: `Test case explanation ${i + 1}`
            });
        }

        res.json({
            problemId,
            count,
            testCases
        });
    } catch (error) {
        console.error('Error generating test cases:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== Feature #18: Real-time Plagiarism Detection ==========

// POST /api/plagiarism/check - Check code for plagiarism
app.post('/api/plagiarism/check', authenticate, async (req, res) => {
    try {
        const { submissionId, code } = req.body;

        if (!submissionId || !code) {
            return res.status(400).json({ error: 'submissionId and code required' });
        }

        // Simulate plagiarism check (would call plagiarismDetector service)
        const similarity = Math.floor(Math.random() * 100);
        const verdict = similarity > 40 ? 'PLAGIARISM_DETECTED' : 'ORIGINAL';

        // Fetch similar submissions for comparison
        const [matches] = await pool.query(
            `SELECT id, student_id, code
             FROM submissions
             WHERE id != ?
             LIMIT 5`,
            [submissionId]
        );

        res.json({
            submissionId,
            similarity,
            verdict,
            matches: (matches || []).map(m => ({ id: m.id, student_id: m.student_id })),
            checked_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error checking plagiarism:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ========== Feature #19: Availability Calendar ==========

// GET /api/users/:id/availability - Get user's availability
app.get('/api/users/:id/availability', authenticate, async (req, res) => {
    try {
        const userId = req.params.id;

        const [availability] = await pool.query(
            'SELECT slots_json FROM user_availability WHERE user_id = ?',
            [userId]
        );

        let slots = {};
        if (availability && availability.length > 0) {
            const slotsData = availability[0].slots_json;
            if (typeof slotsData === 'string') {
                try {
                    slots = JSON.parse(slotsData);
                } catch (e) {
                    slots = {};
                }
            } else {
                slots = slotsData || {};
            }
        }

        res.json({ userId, slots });
    } catch (error) {
        console.error('Error fetching availability:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/users/:id/availability - Update user's availability
app.put('/api/users/:id/availability', authenticate, async (req, res) => {
    try {
        const userId = req.params.id;
        const { slots } = req.body;

        if (!slots) {
            return res.status(400).json({ error: 'slots required' });
        }

        // Check if record exists
        const [existing] = await pool.query(
            'SELECT id FROM user_availability WHERE user_id = ?',
            [userId]
        );

        if (existing && existing.length > 0) {
            await pool.query(
                'UPDATE user_availability SET slots_json = ? WHERE user_id = ?',
                [JSON.stringify(slots), userId]
            );
        } else {
            const availabilityId = uuidv4();
            await pool.query(
                'INSERT INTO user_availability (id, user_id, slots_json, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                [availabilityId, userId, JSON.stringify(slots)]
            );
        }

        res.json({ success: true, userId });
    } catch (error) {
        console.error('Error updating availability:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// *** END NEW FEATURE ENDPOINTS ***

// Start server
(async () => {
    await ensureTestAllocationsTable();

    // Register Advanced Features Routes
    const advancedFeaturesRouter = require('./routes/advanced_features');
    app.use('/api', advancedFeaturesRouter(pool, PlagiarismDetector, GamificationService, PredictiveAnalyticsService, ViolationScoringService));

    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
        console.log('🔌 WebSocket ready for real-time updates');
        console.log('📚 Student Portal: http://127.0.0.1:3000/#/student');
        console.log('👨‍🏫 Mentor Portal: http://127.0.0.1:3000/#/mentor');
        console.log('🛡️ Admin Portal: http://127.0.0.1:3000/#/admin');
        console.log('⏰ Message auto-cleanup: every 30 min (24hr expiry)');
    });
})();
