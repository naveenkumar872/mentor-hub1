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
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
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
    'http://localhost:3000', // Backend/Frontend if served together
    // 'https://mentor-hub-backend-tkil.onrender.com', 
    // /\.onrender\.com$/  
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
        let query = 'SELECT * FROM users';
        const params = [];
        if (role) {
            query += ' WHERE role = ?';
            params.push(role);
        }

        const [users] = await pool.query(query, params);

        const enrichedUsers = await Promise.all(users.map(async u => {
            const { password: _, ...userWithoutPassword } = u;
            let extras = {};
            if (u.role === 'mentor') {
                const [students] = await pool.query('SELECT student_id FROM mentor_student_allocations WHERE mentor_id = ?', [u.id]);
                extras.allocatedStudents = students.map(s => s.student_id);
            }
            return {
                ...userWithoutPassword,
                mentorId: u.mentor_id,
                createdAt: u.created_at,
                ...extras
            };
        }));

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
        const { mentorId, status } = req.query;
        let query = 'SELECT * FROM tasks WHERE 1=1';
        const params = [];

        if (mentorId) {
            query += ' AND mentor_id = ?';
            params.push(mentorId);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        const [tasks] = await pool.query(query, params);

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
        const { mentorId, status } = req.query;
        let query = 'SELECT * FROM problems WHERE 1=1';
        const params = [];

        if (mentorId) {
            query += ' AND mentor_id = ?';
            params.push(mentorId);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        const [problems] = await pool.query(query, params);

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
                    maxTabSwitches: p.max_tab_switches || 3
                }
            };
        }));

        res.json(enrichedProblems);
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
                    maxTabSwitches: p.max_tab_switches || 3
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
            trackTabSwitches, maxTabSwitches
        } = req.body;
        const createdAt = new Date();

        await pool.query(
            `INSERT INTO problems (id, mentor_id, title, description, sample_input, expected_output, sql_schema, expected_query_result, difficulty, type, language, status, created_at, enable_proctoring, enable_video_audio, disable_copy_paste, track_tab_switches, max_tab_switches) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [problemId, mentorId, title, description, sampleInput || '', expectedOutput || '', sqlSchema || null, expectedQueryResult || null, difficulty, type, language, status || 'live', createdAt, enableProctoring ? 'true' : 'false', enableVideoAudio ? 'true' : 'false', disableCopyPaste ? 'true' : 'false', trackTabSwitches ? 'true' : 'false', maxTabSwitches || 3]
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
        const { studentId, mentorId } = req.query;

        let query = `
            SELECT s.*, u.name as studentName, u.mentor_id,
                   p.title as problemTitle, t.title as taskTitle
            FROM submissions s 
            JOIN users u ON s.student_id = u.id
            LEFT JOIN problems p ON s.problem_id = p.id
            LEFT JOIN tasks t ON s.task_id = t.id
            WHERE 1=1
        `;
        const params = [];

        // Filter by studentId for student portal
        if (studentId) {
            query += ' AND s.student_id = ?';
            params.push(studentId);
        }

        // Filter by mentorId for mentor portal (students assigned to this mentor)
        if (mentorId) {
            query += ' AND u.mentor_id = ?';
            params.push(mentorId);
        }

        query += ' ORDER BY s.submitted_at DESC';

        const [rows] = await pool.query(query, params);

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

        res.json(fixedRows);
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
app.post('/api/submissions/proctored', upload.single('proctoringVideo'), async (req, res) => {
    try {
        const { studentId, problemId, language, code, submissionType, tabSwitches, copyPasteAttempts, cameraBlockedCount, phoneDetectionCount, timeSpent } = req.body;
        const submissionId = uuidv4();
        const submittedAt = new Date();

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
                integrity_violation, proctoring_video, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                submissionId, studentId, problemId, code, submissionType || 'editor', language,
                finalScore, finalStatus, evaluationResult.feedback, evaluationResult.aiExplanation || '',
                evaluationResult.analysis?.correctness, evaluationResult.analysis?.efficiency,
                evaluationResult.analysis?.codeStyle, evaluationResult.analysis?.bestPractices,
                tabSwitchCount, copyPasteCount, cameraBlockCount, phoneCount,
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

        // Map languages to Piston runtimes
        const languageMap = {
            'Python': { language: 'python', version: '3.10.0' },
            'JavaScript': { language: 'javascript', version: '18.15.0' },
            'Java': { language: 'java', version: '15.0.2' },
            'C': { language: 'c', version: '10.2.0' },
            'C++': { language: 'cpp', version: '10.2.0' },
            'SQL': { language: 'sqlite3', version: '3.36.0' }
        };

        const runtime = languageMap[language] || { language: language.toLowerCase(), version: '*' };

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

        // Piston Execution API
        const response = await fetch('https://emkc.org/api/v2/piston/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: runtime.language,
                version: runtime.version,
                files: [
                    {
                        content: codeToExecute
                    }
                ],
                stdin: stdin || ''
            })
        });

        const data = await response.json();

        if (data.run) {
            res.json({
                output: data.run.output || 'No output detected',
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
            sectionConfig: t.section_config ? (typeof t.section_config === 'string' ? JSON.parse(t.section_config) : t.section_config) : null
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
            const item = {
                id: q.question_id,
                question: q.question,
                options: opt,
                correctAnswer: q.correct_answer,
                explanation: q.explanation,
                category: q.category,
                questionType: q.question_type,
                section: q.section,
                testCases: q.test_cases ? (typeof q.test_cases === 'string' ? JSON.parse(q.test_cases) : q.test_cases) : null,
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
            maxAttempts, maxTabSwitches, status, createdBy, sectionConfig
        } = req.body;
        const sectionConfigJson = sectionConfig ? JSON.stringify(sectionConfig) : null;
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
            `INSERT INTO global_tests (id, title, type, difficulty, duration, total_questions, passing_score, status, created_by, description, start_time, deadline, max_attempts, max_tab_switches, section_config)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [testId, title || 'Untitled', type || 'comprehensive', difficulty, duration || 180, totalQuestions, passingScore ?? 60, status || 'draft', createdBy || null, description || '', formattedStartTime, formattedDeadline, maxAttempts ?? 1, maxTabSwitches ?? 3, sectionConfigJson]
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
            maxAttempts, maxTabSwitches, status, sectionConfig
        } = req.body;
        const sectionConfigJson = sectionConfig ? JSON.stringify(sectionConfig) : null;
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
        }
        await connection.query('DELETE FROM global_test_submissions WHERE test_id = ?', [id]);
        await connection.query('DELETE FROM test_questions WHERE test_id = ?', [id]);
        await connection.query('DELETE FROM personalized_reports WHERE test_id = ?', [id]);
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
                correctAnswerText = result.output || 'Expected result';
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
        let needsRegeneration = existingReport.length > 0 && (!existingReport[0].report_data.questionInsights || !existingReport[0].report_data.questionInsights.Q1);

        if (existingReport.length > 0 && !needsRegeneration) {
            aiPersonalizedAnalysis = existingReport[0].report_data;
        } else {
            // Generate AI Analysis (or Regenerate if old format)
            try {
                const performanceSummary = SECTIONS.map(sec => {
                    const data = sectionResults[sec] || { percentage: 0, correctCount: 0, totalQuestions: 0 };
                    return `${sec.toUpperCase()}: ${data.percentage}% (${data.correctCount}/${data.totalQuestions})`;
                }).join(', ');

                // Prepare a sampled question list to avoid hitting token limits while giving AI enough context
                const questionsContext = qrRows.map((q, i) => {
                    return `Q${i + 1} [${q.section}]: ${q.is_correct ? 'CORRECT' : 'INCORRECT'}. Student Response: ${q.user_answer || 'No Answer'}. Correct Answer/Solution: ${q.correct_answer || 'N/A'}`;
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
                2. For CORRECT coding/SQL: Even if right, suggest optimizations (e.g., O(n) vs O(n^2)), cleaner code patterns, or edge case handling. Explain WHY it was good and how to reach the senior level.
                3. For INCORRECT: Diagnose the logic gap and provide a clear path to mastery.
                4. Tone: Encouraging, professional, and technical.`;

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

        res.json({
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
        });

    } catch (error) {
        console.error('Student Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Mentor Analytics Dashboard
app.get('/api/analytics/mentor/:mentorId', async (req, res) => {
    try {
        const mentorId = req.params.mentorId;

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

        res.json({
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
        });

    } catch (error) {
        console.error('Mentor Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin Analytics Dashboard
app.get('/api/analytics/admin', async (req, res) => {
    try {
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

        res.json({
            totalStudents: studentCount,
            totalSubmissions,
            successRate,
            totalContent,
            submissionTrends,
            languageStats,
            recentSubmissions,
            studentPerformance
        });

    } catch (error) {
        console.error('Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Student Leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
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

        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mentor Leaderboard
app.get('/api/mentor-leaderboard', async (req, res) => {
    try {
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
        const isCorrect = data.run?.code === 0 && (actual === expected || normalizeSqlOutput(actual) === normalizeSqlOutput(expected));
        return { isCorrect, output: actual };
    } catch (e) {
        return { isCorrect: false, output: e.message };
    }
}

function normalizeSqlOutput(s) {
    return s.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
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
                const response = await axios.post(`http://localhost:${PORT}/api/reports/student/${studentId}`, {
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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
    console.log('📚 Student Portal: http://127.0.0.1:3000/#/student');
    console.log('👨‍🏫 Mentor Portal: http://127.0.0.1:3000/#/mentor');
    console.log('🛡️ Admin Portal: http://127.0.0.1:3000/#/admin');
});
