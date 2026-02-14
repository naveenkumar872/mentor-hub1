const express = require('express');
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
const socketIO = require('socket.io');
require('dotenv').config();

// Performance optimization imports
const { paginatedResponse } = require('./utils/pagination');
const { cacheManager } = require('./utils/cache');

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server and initialize Socket.io
const httpServer = http.createServer(app);
const io = socketIO(httpServer, {
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
                    model: options.model || 'llama-3.3-70b',
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
    ssl: {},
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: '+00:00'
});

// Test DB Connection
pool.getConnection()
    .then(connection => {
        console.log('✅ Connected to MySQL Database (SSL Enabled)');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Database Connection Failed:', err.message);
        if (err.code === 'HANDSHAKE_SSL_ERROR') {
            console.error('   Hint: SSL Handshake failed. Check your network or certificates.');
        }
    });

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

        if (isAllowed) {
            callback(null, true);
        } else {
            callback(null, true); // Allow all for now during deployment
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = rows[0];
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

        // Normalize snake_case DB to camelCase API
        const responseUser = {
            ...userWithoutPassword,
            mentorId: user.mentor_id,
            createdAt: user.created_at
        };

        res.json({ success: true, user: responseUser });
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
            createdAt: user.created_at
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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
            completionCount: t.completion_count || 0
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

        // Tasks from their mentor OR admin
        const [tasks] = await pool.query(
            'SELECT * FROM tasks WHERE (mentor_id = ? OR mentor_id = "admin-001") AND status = "live"',
            [mentorId]
        );

        const enrichedTasks = await Promise.all(tasks.map(async t => {
            const [completions] = await pool.query('SELECT student_id FROM task_completions WHERE task_id = ?', [t.id]);
            return {
                ...t,
                mentorId: t.mentor_id,
                createdAt: t.created_at,
                completedBy: completions.map(c => c.student_id)
            };
        }));

        res.json(enrichedTasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create task
app.post('/api/tasks', async (req, res) => {
    try {
        const taskId = uuidv4();
        const { mentorId, title, description, requirements, difficulty, type } = req.body;
        const createdAt = new Date();

        // Convert requirements to JSON string if it's an array
        const requirementsStr = Array.isArray(requirements) ? JSON.stringify(requirements) : requirements;

        await pool.query(
            'INSERT INTO tasks (id, mentor_id, title, description, requirements, difficulty, type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, "live", ?)',
            [taskId, mentorId, title, description, requirementsStr, difficulty, type, createdAt]
        );

        res.json({
            id: taskId,
            ...req.body,
            completedBy: [],
            status: 'live',
            createdAt
        });
    } catch (error) {
        try {
            require('fs').appendFileSync('d:\\Mentor\\Mentor\\server_debug.log', `[${new Date().toISOString()}] Task Create Error: ${error.message}\nBody: ${JSON.stringify(req.body)}\n\n`);
        } catch (e) { }
        console.error('Task Create Error:', error);
        res.status(500).json({ error: error.message });
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

        // Problems from their mentor OR admin
        const [problems] = await pool.query(
            'SELECT * FROM problems WHERE (mentor_id = ? OR mentor_id = "admin-001") AND status = "live"',
            [mentorId]
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
app.post('/api/problems', async (req, res) => {
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
            enableFaceDetection, detectMultipleFaces, trackFaceLookaway
        } = req.body;
        const createdAt = new Date();

        await pool.query(
            `INSERT INTO problems (id, mentor_id, title, description, sample_input, expected_output, sql_schema, expected_query_result, difficulty, type, language, status, created_at, enable_proctoring, enable_video_audio, disable_copy_paste, track_tab_switches, max_tab_switches, enable_face_detection, detect_multiple_faces, track_face_lookaway) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [problemId, mentorId, title, description, sampleInput || '', expectedOutput || '', sqlSchema || null, expectedQueryResult || null, difficulty, type, language, status || 'live', createdAt, enableProctoring ? 'true' : 'false', enableVideoAudio ? 'true' : 'false', disableCopyPaste ? 'true' : 'false', trackTabSwitches ? 'true' : 'false', maxTabSwitches || 3, enableFaceDetection ? 'true' : 'false', detectMultipleFaces ? 'true' : 'false', trackFaceLookaway ? 'true' : 'false']
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

// Delete problem
app.delete('/api/problems/:id', async (req, res) => {
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

// Create submission (AI-evaluated code submission)
app.post('/api/submissions', async (req, res) => {
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
                        model: 'llama-3.3-70b',
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
        "correctness": "Excellent/Good/Fair/Poor - brief explanation",
        "efficiency": "Excellent/Good/Fair/Poor - time/space analysis",
        "codeStyle": "Excellent/Good/Fair/Poor - style notes",
        "bestPractices": "Excellent/Good/Fair/Poor - practices used"
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
                    model: 'llama-3.3-70b',
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

        // Mark problem as completed if score >= 70
        if (problemId && finalScore >= 70) {
            try {
                await pool.query(
                    'INSERT IGNORE INTO problem_completions (problem_id, student_id, completed_at) VALUES (?, ?, ?)',
                    [problemId, studentId, submittedAt]
                );

                // Log activity and update streak for successful problem completion
                try {
                    await updateUserStreak(studentId, { problemsSolved: 1, submissionsCount: 1 });
                } catch (streakErr) {
                    console.log('Streak update skipped:', streakErr.message);
                }
            } catch (e) { /* Ignore if already completed */ }
        } else {
            // Still log submission activity even if not accepted
            try {
                await updateUserStreak(studentId, { submissionsCount: 1 });
            } catch (streakErr) {
                console.log('Streak update skipped:', streakErr.message);
            }
        }

        // Invalidate caches when submission is created
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

// ML Task Submission with File or GitHub URL
app.post('/api/submissions/ml-task', async (req, res) => {
    try {
        const { 
            studentId, 
            taskId, 
            submissionType, // 'file' or 'github'
            code, // file content if type is file
            fileName,
            githubUrl, // GitHub URL if type is github
            taskTitle,
            taskDescription,
            taskRequirements
        } = req.body;

        if (!studentId || !taskId) {
            return res.status(400).json({ error: 'studentId and taskId are required' });
        }

        const submissionId = uuidv4();
        const submittedAt = new Date();
        let codeContent = '';
        let githubRepoInfo = null;

        // Handle GitHub URL submission - fetch repo details
        if (submissionType === 'github' && githubUrl) {
            try {
                // Parse GitHub URL to get owner and repo
                const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
                if (!urlMatch) {
                    return res.status(400).json({ error: 'Invalid GitHub URL format' });
                }
                const [, owner, repo] = urlMatch;
                const repoName = repo.replace(/\.git$/, '');

                // Fetch repository info from GitHub API
                const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
                    headers: { 'Accept': 'application/vnd.github.v3+json' }
                });
                
                if (!repoResponse.ok) {
                    return res.status(400).json({ error: 'Could not access GitHub repository. Make sure it is public.' });
                }
                
                githubRepoInfo = await repoResponse.json();

                // Try to fetch README
                let readmeContent = '';
                try {
                    const readmeResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/readme`, {
                        headers: { 'Accept': 'application/vnd.github.v3+json' }
                    });
                    if (readmeResponse.ok) {
                        const readmeData = await readmeResponse.json();
                        readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8');
                    }
                } catch (e) { /* No README */ }

                // Fetch main Python/Notebook files
                let mainFiles = [];
                try {
                    const contentsResponse = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents`, {
                        headers: { 'Accept': 'application/vnd.github.v3+json' }
                    });
                    if (contentsResponse.ok) {
                        const contents = await contentsResponse.json();
                        const codeFiles = contents.filter(f => 
                            f.type === 'file' && 
                            (f.name.endsWith('.py') || f.name.endsWith('.ipynb'))
                        ).slice(0, 3); // Limit to first 3 files

                        for (const file of codeFiles) {
                            try {
                                const fileResponse = await fetch(file.download_url);
                                if (fileResponse.ok) {
                                    const content = await fileResponse.text();
                                    mainFiles.push({ name: file.name, content: content.substring(0, 5000) }); // Limit content
                                }
                            } catch (e) { /* Skip file */ }
                        }
                    }
                } catch (e) { /* No contents */ }

                // Build code content for evaluation
                codeContent = `=== GitHub Repository: ${githubUrl} ===
Repository: ${githubRepoInfo.full_name}
Description: ${githubRepoInfo.description || 'No description'}
Stars: ${githubRepoInfo.stargazers_count}
Language: ${githubRepoInfo.language || 'Unknown'}
Last Updated: ${githubRepoInfo.updated_at}

=== README ===
${readmeContent.substring(0, 2000) || 'No README found'}

=== Code Files ===
${mainFiles.map(f => `--- ${f.name} ---\n${f.content}`).join('\n\n') || 'No Python/Notebook files found at root level'}
`;
            } catch (githubError) {
                console.error('GitHub fetch error:', githubError);
                return res.status(400).json({ error: 'Failed to fetch GitHub repository information' });
            }
        } else if (submissionType === 'file' && code) {
            codeContent = code;
        } else {
            return res.status(400).json({ error: 'Please provide either a file or GitHub URL' });
        }

        // Build evaluation prompt for ML task
        const evaluationPrompt = `You are an expert ML/AI project evaluator for an educational platform.

=== TASK DETAILS ===
Title: ${taskTitle || 'ML Task'}
Description: ${taskDescription || 'No description provided'}
Requirements:
${taskRequirements || 'No specific requirements'}

=== SUBMISSION ===
Submission Type: ${submissionType === 'github' ? 'GitHub Repository' : 'File Upload'}
${submissionType === 'github' ? `GitHub URL: ${githubUrl}` : `File Name: ${fileName || 'unknown'}`}

=== SUBMITTED CONTENT ===
${codeContent.substring(0, 8000)}

=== EVALUATION CRITERIA ===
Evaluate this ML task submission based on:
1. **Completeness (25 pts)**: Does it address all requirements? Is it a complete solution?
2. **Code Quality (25 pts)**: Is the code well-structured, readable, and follows Python/ML best practices?
3. **ML Approach (25 pts)**: Is the ML approach appropriate? Are proper techniques used (data preprocessing, model selection, evaluation metrics)?
4. **Documentation (15 pts)**: Is the code documented? README present? Comments explaining logic?
5. **Innovation (10 pts)**: Any creative approaches or improvements beyond basic requirements?

Respond with JSON:
{
    "score": 0-100,
    "status": "accepted" | "partial" | "rejected",
    "feedback": "Detailed, encouraging feedback for the student (3-5 sentences). Be constructive.",
    "breakdown": {
        "completeness": "X/25",
        "code_quality": "X/25", 
        "ml_approach": "X/25",
        "documentation": "X/15",
        "innovation": "X/10"
    },
    "strengths": ["strength1", "strength2"],
    "improvements": ["area1", "area2"]
}

Be fair but thorough. Consider students are learning. Provide actionable feedback.`;

        let evaluationResult = {
            score: 0,
            status: 'rejected',
            feedback: 'Evaluation in progress...',
            breakdown: {
                completeness: '0/25',
                code_quality: '0/25',
                ml_approach: '0/25',
                documentation: '0/15',
                innovation: '0/10'
            }
        };

        try {
            const evaluation = await cerebrasChat([
                { role: 'system', content: 'You are an expert ML/AI evaluator for student projects. Be fair, encouraging, and provide constructive feedback.' },
                { role: 'user', content: evaluationPrompt }
            ], {
                model: 'llama-3.3-70b',
                temperature: 0.3,
                max_tokens: 1000,
                response_format: { type: 'json_object' }
            });

            const result = JSON.parse(evaluation.choices[0]?.message?.content || '{}');
            evaluationResult = {
                score: result.score || 0,
                status: result.score >= 60 ? 'accepted' : result.score >= 40 ? 'partial' : 'rejected',
                feedback: result.feedback || 'Evaluation complete.',
                breakdown: result.breakdown || evaluationResult.breakdown,
                strengths: result.strengths || [],
                improvements: result.improvements || []
            };
        } catch (aiError) {
            console.error('AI Evaluation error for ML task:', aiError);
            evaluationResult.feedback = 'Your submission was received but automatic evaluation encountered an error. A mentor will review it manually.';
            evaluationResult.score = 50; // Default pending score
            evaluationResult.status = 'partial';
        }

        // Save to database
        await pool.query(
            `INSERT INTO submissions (
                id, student_id, task_id, code, submission_type, file_name, language,
                score, status, feedback, ai_explanation, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                submissionId,
                studentId,
                taskId,
                submissionType === 'github' ? githubUrl : code.substring(0, 50000),
                submissionType,
                submissionType === 'github' ? githubUrl : fileName,
                'Python',
                evaluationResult.score,
                evaluationResult.status,
                evaluationResult.feedback,
                JSON.stringify({ breakdown: evaluationResult.breakdown, strengths: evaluationResult.strengths, improvements: evaluationResult.improvements }),
                submittedAt
            ]
        );

        // Mark task as completed if score >= 60
        if (evaluationResult.score >= 60) {
            try {
                await pool.query(
                    'INSERT IGNORE INTO task_completions (task_id, student_id, completed_at, score) VALUES (?, ?, ?, ?)',
                    [taskId, studentId, submittedAt, evaluationResult.score]
                );
                await updateUserStreak(studentId, { tasksCompleted: 1, submissionsCount: 1 });
            } catch (e) { /* Ignore */ }
        } else {
            try { await updateUserStreak(studentId, { submissionsCount: 1 }); } catch (e) { /* Ignore */ }
        }

        // Return result
        res.json({
            id: submissionId,
            score: evaluationResult.score,
            status: evaluationResult.status,
            feedback: evaluationResult.feedback,
            breakdown: evaluationResult.breakdown,
            strengths: evaluationResult.strengths,
            improvements: evaluationResult.improvements,
            submittedAt
        });

    } catch (error) {
        console.error('ML Task Submission Error:', error);
        res.status(500).json({ error: 'Failed to process ML task submission', details: error.message });
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
            if (problems.length > 0) problemDetails = problems[0];
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
                    model: 'llama-3.3-70b',
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
            } catch (e) { /* Ignore if already completed */ }
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

// Reset all submissions (Admin only)
app.delete('/api/submissions', async (req, res) => {
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

app.post('/api/run', async (req, res) => {
    try {
        const { code, language, problemId, sqlSchema, stdin } = req.body;

        // Use the global getLanguageRuntime helper for consistent language handling
        const runtime = getLanguageRuntime(language);
        const langKey = (language || 'python').toLowerCase();

        // For SQL, prepend the schema to create tables before running the query
        let codeToExecute = code;
        if (langKey === 'sql' || langKey === 'sqlite') {
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

        // Normalize input line endings for consistent handling
        let normalizedStdin = (stdin || '').toString();
        normalizedStdin = normalizedStdin.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Use retry logic for reliability
        const data = await executeWithRetry({
            language: runtime.language,
            version: runtime.version,
            files: [{ content: codeToExecute }],
            stdin: normalizedStdin
        });

        if (data.run) {
            res.json({
                output: data.run.output || 'No output detected',
                stderr: data.run.stderr || '',
                status: data.run.code === 0 ? 'success' : 'error'
            });
        } else {
            throw new Error(data.message || 'Execution failed');
        }

    } catch (error) {
        console.error('Run Error:', error);
        res.status(500).json({ error: 'Failed to run code', details: error.message });
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
            model: 'llama-3.3-70b',
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
app.post('/api/ai/generate-problem', async (req, res) => {
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
            model: 'llama-3.3-70b',
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
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { messages, context } = req.body;

        const systemPrompt = context === 'task'
            ? `You are an AI assistant helping create ML/AI tasks for an educational platform. Help users brainstorm, refine, and create machine learning project ideas. Be helpful and suggest improvements. Keep responses concise but informative.`
            : `You are an AI assistant helping create coding problems for an educational platform. Help users brainstorm, refine, and create programming challenges. Be helpful and suggest improvements. Keep responses concise but informative.`;

        const chatCompletion = await cerebrasChat([
            { role: 'system', content: systemPrompt },
            ...messages
        ], {
            model: 'llama-3.3-70b'
        });

        const response = chatCompletion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
        res.json({ success: true, response });
    } catch (error) {
        console.error('AI Chat Error:', error);
        res.status(500).json({ error: error.message, details: 'Failed to process chat request' });
    }
});

// Generate aptitude questions using AI
app.post('/api/ai/generate-aptitude', async (req, res) => {
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
            model: 'llama-3.3-70b',
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

app.post('/api/aptitude/:id/submit', async (req, res) => {
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
            // Keep all options for correct index lookup (don't use filtered array as it shifts indices)
            const allOptions = [q.option_1, q.option_2, q.option_3, q.option_4];
            // Get the correct option text using the index from unfiltered array
            const correctOptionText = allOptions[q.correct_answer] || '';
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

        // Log activity and update streak for aptitude completion
        try {
            await updateUserStreak(studentId, { aptitudeCompleted: 1 });
        } catch (streakErr) {
            console.log('Streak update skipped:', streakErr.message);
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
app.post('/api/global-tests/:id/submit', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const testId = req.params.id;
        const { studentId, answers, selectedLanguages, sectionScores, timeSpent, tabSwitches = 0 } = req.body;
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
            // Keep all options including empty ones for correct index lookup
            const allOptions = [q.option_1, q.option_2, q.option_3, q.option_4];
            const options = allOptions.filter(Boolean);
            let isCorrect = false;
            let pointsEarned = 0;
            let correctAnswerText = '';

            if (q.question_type === 'coding') {
                const testCasesRaw = q.test_cases ? (typeof q.test_cases === 'string' ? JSON.parse(q.test_cases) : q.test_cases) : null;
                // Use submitted language if available, otherwise fall back to test case language, then Python
                const storedLanguage = (testCasesRaw && testCasesRaw.language) ? testCasesRaw.language : 'Python';
                const language = (selectedLanguages && selectedLanguages[q.question_id]) ? selectedLanguages[q.question_id] : storedLanguage;
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
                // Use allOptions for correct index lookup (don't use filtered options array as it shifts indices)
                const correctIndex = Number(correctText);
                const correctOptionByIndex = allOptions[correctIndex];
                isCorrect = options.length ? (userAns === correctText || (correctOptionByIndex !== undefined && correctOptionByIndex !== '' && userAns === correctOptionByIndex)) : (userAns === correctText);
                pointsEarned = isCorrect ? (q.points ?? 1) : 0;
                correctAnswerText = (correctOptionByIndex !== undefined && correctOptionByIndex !== '') ? correctOptionByIndex : correctText;
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
                    model: 'llama-3.3-70b',
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

        // Get leaderboard data for student dashboard
        const [leaderboardRows] = await pool.query(`
            SELECT u.id as studentId, u.name, 
            COUNT(DISTINCT tc.task_id) as taskCount,
            COUNT(DISTINCT pc.problem_id) as codeCount,
            COUNT(DISTINCT sca.aptitude_test_id) as aptitudeCount,
            COALESCE(AVG(sub.score), 0) as avgScore
            FROM users u
            LEFT JOIN task_completions tc ON u.id = tc.student_id
            LEFT JOIN problem_completions pc ON u.id = pc.student_id
            LEFT JOIN student_completed_aptitude sca ON u.id = sca.student_id
            LEFT JOIN submissions sub ON u.id = sub.student_id
            WHERE u.role = 'student'
            GROUP BY u.id
            ORDER BY avgScore DESC, (taskCount + codeCount + aptitudeCount) DESC
            LIMIT 10
        `);

        const leaderboard = leaderboardRows.map((r, idx) => ({
            rank: idx + 1,
            studentId: r.studentId,
            name: r.name,
            taskCount: parseInt(r.taskCount) || 0,
            codeCount: parseInt(r.codeCount) || 0,
            aptitudeCount: parseInt(r.aptitudeCount) || 0,
            avgScore: Math.round(r.avgScore) || 0
        }));

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
            leaderboard
        };

        // Cache for 30 minutes
        cacheManager.set(cacheKey, analyticsData, 1800000);
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
// Language mapping - supports both capitalized and lowercase keys
const languageMap = {
    'Python': { language: 'python', version: '3.10.0' },
    'python': { language: 'python', version: '3.10.0' },
    'JavaScript': { language: 'javascript', version: '18.15.0' },
    'javascript': { language: 'javascript', version: '18.15.0' },
    'Java': { language: 'java', version: '15.0.2' },
    'java': { language: 'java', version: '15.0.2' },
    'C': { language: 'c', version: '10.2.0' },
    'c': { language: 'c', version: '10.2.0' },
    'C++': { language: 'cpp', version: '10.2.0' },
    'c++': { language: 'cpp', version: '10.2.0' },
    'cpp': { language: 'cpp', version: '10.2.0' },
    'Cpp': { language: 'cpp', version: '10.2.0' },
    'SQL': { language: 'sqlite3', version: '3.36.0' },
    'sql': { language: 'sqlite3', version: '3.36.0' },
    'sqlite': { language: 'sqlite3', version: '3.36.0' },
    'SQLite': { language: 'sqlite3', version: '3.36.0' }
};

// Helper to get runtime for a language (case-insensitive)
function getLanguageRuntime(lang) {
    if (!lang) return { language: 'python', version: '3.10.0' };
    return languageMap[lang] || languageMap[lang.toLowerCase()] || { language: lang.toLowerCase(), version: '*' };
}

// Normalize output for comparison - handles line endings, trailing spaces, and whitespace differences
function normalizeOutput(str) {
    if (str === null || str === undefined) return '';
    // Ensure we have a string
    const s = typeof str === 'string' ? str : String(str);
    return s
        .replace(/\r\n/g, '\n')     // Normalize Windows line endings
        .replace(/\r/g, '\n')        // Normalize old Mac line endings
        .split('\n')                 // Split into lines
        .map(line => line.trim())    // Trim each line
        .join('\n')                  // Rejoin
        .trim();                     // Final trim
}

// Convert test case input to proper stdin format
// Handles JSON arrays like [5, 7] -> "5\n7", objects, etc.
function formatTestInput(input) {
    if (input === null || input === undefined) return '';
    
    // If already a string, check if it looks like JSON
    if (typeof input === 'string') {
        const trimmed = input.trim();
        // Try to parse JSON array/object format
        if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || 
            (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    // Convert array elements to newline-separated values
                    return parsed.map(item => 
                        typeof item === 'object' ? JSON.stringify(item) : String(item)
                    ).join('\n');
                } else if (typeof parsed === 'object') {
                    // For objects, convert values to newline-separated
                    return Object.values(parsed).map(v => 
                        typeof v === 'object' ? JSON.stringify(v) : String(v)
                    ).join('\n');
                }
            } catch (e) {
                // Not valid JSON, return as-is
            }
        }
        return trimmed;
    }
    
    // Handle arrays directly
    if (Array.isArray(input)) {
        return input.map(item => 
            typeof item === 'object' ? JSON.stringify(item) : String(item)
        ).join('\n');
    }
    
    // Handle objects
    if (typeof input === 'object') {
        return Object.values(input).map(v => 
            typeof v === 'object' ? JSON.stringify(v) : String(v)
        ).join('\n');
    }
    
    return String(input);
}

// Compare outputs with multiple strategies for flexibility
function compareOutputs(actual, expected) {
    const normActual = normalizeOutput(actual);
    const normExpected = normalizeOutput(expected);
    
    // Exact match after normalization
    if (normActual === normExpected) return true;
    
    // Case-insensitive match for string outputs
    if (normActual.toLowerCase() === normExpected.toLowerCase()) return true;
    
    // Numeric comparison - if both are numbers, compare values
    const numActual = parseFloat(normActual);
    const numExpected = parseFloat(normExpected);
    if (!isNaN(numActual) && !isNaN(numExpected) && Math.abs(numActual - numExpected) < 0.0001) return true;
    
    // Whitespace-agnostic comparison (all whitespace collapsed to single space)
    const collapseWs = s => s.replace(/\s+/g, ' ').trim();
    if (collapseWs(normActual) === collapseWs(normExpected)) return true;
    
    return false;
}

// Execute code with retry logic
async function executeWithRetry(payload, maxRetries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                // Wait before retry (exponential backoff)
                await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
            }
        }
    }
    throw lastError || new Error('Execution failed after retries');
}

async function runInlineCodingTests(code, language, testCases) {
    if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
        return { passedCount: 0, total: 0, percentage: 0, isCorrect: false, details: [] };
    }
    const runtime = getLanguageRuntime(language);
    let passedCount = 0;
    const details = [];
    
    for (const tc of testCases) {
        // Format input properly - handles JSON arrays like [5, 7] -> "5\n7"
        let input = formatTestInput(tc.input);
        // Normalize line endings for consistency
        input = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        const expected = normalizeOutput(tc.expected_output || tc.expectedOutput || '');
        
        try {
            const data = await executeWithRetry({
                language: runtime.language,
                version: runtime.version,
                files: [{ content: code }],
                stdin: input
            });
            
            const actual = data.run?.output || '';
            const passed = compareOutputs(actual, expected);
            
            if (passed) passedCount++;
            
            details.push({
                input: input.substring(0, 100),
                expected: expected,
                actual: normalizeOutput(actual),
                passed,
                error: data.run?.stderr || null
            });
        } catch (err) {
            details.push({
                input: input.substring(0, 100),
                expected: expected,
                actual: '',
                passed: false,
                error: err.message
            });
        }
    }
    const total = testCases.length;
    const percentage = total ? Math.round((passedCount / total) * 100) : 0;
    return { passedCount, total, percentage, isCorrect: passedCount === total, details };
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

        // Language mapping for Piston (case-insensitive)
        const languageMap = {
            'python': { language: 'python', version: '3.10.0' },
            'javascript': { language: 'javascript', version: '18.15.0' },
            'java': { language: 'java', version: '15.0.2' },
            'c': { language: 'c', version: '10.2.0' },
            'c++': { language: 'cpp', version: '10.2.0' },
            'cpp': { language: 'cpp', version: '10.2.0' },
            'sql': { language: 'sqlite3', version: '3.36.0' },
            'sqlite': { language: 'sqlite3', version: '3.36.0' }
        };

        const langKey = (language || 'python').toLowerCase();
        const runtime = languageMap[langKey] || { language: langKey, version: '*' };
        const results = [];
        let passedCount = 0;
        let totalPoints = 0;
        let earnedPoints = 0;

        // If no test cases, run code once and return output
        if (testCases.length === 0) {
            let codeToExecute = code;
            if ((langKey === 'sql' || langKey === 'sqlite') && sqlSchema) {
                codeToExecute = `${sqlSchema}\n\n${code}`;
            }

            const data = await executeWithRetry({
                language: runtime.language,
                version: runtime.version,
                files: [{ content: codeToExecute }]
            });

            return res.json({
                hasTestCases: false,
                output: data.run?.output || 'No output',
                stderr: data.run?.stderr || '',
                status: data.run?.code === 0 ? 'success' : 'error',
                results: []
            });
        }

        // Run against each test case
        for (const tc of testCases) {
            totalPoints += tc.points || 10;

            let codeWithInput = code;
            if (langKey === 'sql' || langKey === 'sqlite') {
                codeWithInput = sqlSchema ? `${sqlSchema}\n\n${code}` : code;
            } else {
                codeWithInput = code;
            }

            // Format input properly - handles JSON arrays like [5, 7] -> "5\n7"
            let testInput = formatTestInput(tc.input);
            // Normalize line endings
            testInput = testInput.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            try {
                const data = await executeWithRetry({
                    language: runtime.language,
                    version: runtime.version,
                    files: [{ content: codeWithInput }],
                    stdin: testInput
                });

                const actualOutput = data.run?.output || '';
                const expectedOutput = tc.expected_output || '';
                const passed = compareOutputs(actualOutput, expectedOutput);

                // Normalize outputs for display (helps with debugging)
                const normalizedActual = normalizeOutput(actualOutput);
                const normalizedExpected = normalizeOutput(expectedOutput);

                if (passed) {
                    passedCount++;
                    earnedPoints += tc.points || 10;
                }

                results.push({
                    testCaseId: tc.id,
                    description: tc.description,
                    input: tc.input,
                    expectedOutput: tc.is_hidden ? '(Hidden)' : normalizedExpected,
                    actualOutput: tc.is_hidden ? (passed ? 'Correct' : 'Incorrect') : normalizedActual,
                    rawActual: tc.is_hidden ? null : actualOutput,
                    stderr: tc.is_hidden ? null : (data.run?.stderr || null),
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
            model: 'llama-3.3-70b',
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
            model: 'llama-3.3-70b',
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
            ], { model: 'llama-3.3-70b', temperature: 0.3, response_format: { type: 'json_object' } });

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
            model: 'llama-3.3-70b',
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
            model: 'llama-3.3-70b',
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

// Bulk reassign students to a different mentor
app.post('/api/admin/bulk/reassign-students', async (req, res) => {
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

// Create user (admin)
app.post('/api/admin/users', async (req, res) => {
    try {
        const { name, email, password, role, mentorId, batch, phone } = req.body;
        if (!name || !email || !password || !role) return res.status(400).json({ error: 'Name, email, password, and role are required' });

        // Check duplicate email
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(409).json({ error: 'Email already exists' });

        // Generate ID based on role
        const [countResult] = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE role = ?', [role]);
        const nextNum = (countResult[0].cnt + 1).toString().padStart(3, '0');
        const userId = `${role}-${nextNum}`;

        const createdAt = new Date();
        await pool.query(
            'INSERT INTO users (id, name, email, password, role, mentor_id, batch, phone, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "active", ?)',
            [userId, name, email, password, role, mentorId || null, batch || null, phone || null, createdAt]
        );

        // If student with mentorId, create allocation
        if (role === 'student' && mentorId) {
            await pool.query('INSERT IGNORE INTO mentor_student_allocations (mentor_id, student_id) VALUES (?, ?)', [mentorId, userId]);
        }

        res.json({ success: true, user: { id: userId, name, email, role, mentorId, batch, phone, status: 'active', createdAt } });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Update user (admin)
app.put('/api/admin/users/:id', async (req, res) => {
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

// Delete user (admin)
app.delete('/api/admin/users/:id', async (req, res) => {
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

// Reset password (admin)
app.post('/api/admin/users/:id/reset-password', async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword) return res.status(400).json({ error: 'New password is required' });

        const [existing] = await pool.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
        if (existing.length === 0) return res.status(404).json({ error: 'User not found' });

        await pool.query('UPDATE users SET password = ? WHERE id = ?', [newPassword, req.params.id]);
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Toggle user status (admin)
app.patch('/api/admin/users/:id/status', async (req, res) => {
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
app.get('/api/messages/conversations/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const [conversations] = await pool.query(`
            SELECT 
                CASE WHEN dm.sender_id = ? THEN dm.receiver_id ELSE dm.sender_id END AS other_user_id,
                u.name AS other_user_name, u.role AS other_user_role, u.email AS other_user_email,
                dm.message AS last_message, dm.created_at AS last_message_at, dm.message_type,
                (SELECT COUNT(*) FROM direct_messages WHERE sender_id = other_user_id AND receiver_id = ? AND is_read = 0 AND created_at >= NOW() - INTERVAL 24 HOUR) AS unread_count
            FROM direct_messages dm
            JOIN users u ON u.id = CASE WHEN dm.sender_id = ? THEN dm.receiver_id ELSE dm.sender_id END
            WHERE dm.id IN (
                SELECT MAX(id) FROM direct_messages 
                WHERE (sender_id = ? OR receiver_id = ?) AND created_at >= NOW() - INTERVAL 24 HOUR
                GROUP BY CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
            )
            ORDER BY dm.created_at DESC
        `, [userId, userId, userId, userId, userId, userId]);
        res.json(conversations);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

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

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
    console.log('🔌 WebSocket ready for real-time updates');
    console.log('📚 Student Portal: http://127.0.0.1:3000/#/student');
    console.log('👨‍🏫 Mentor Portal: http://127.0.0.1:3000/#/mentor');
    console.log('🛡️ Admin Portal: http://127.0.0.1:3000/#/admin');
    console.log('⏰ Message auto-cleanup: every 30 min (24hr expiry)');
});
