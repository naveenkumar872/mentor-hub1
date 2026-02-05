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
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || process.env.cereberas_api_key || '';

// Cerebras chat completion helper function
async function cerebrasChat(messages, options = {}) {
    const response = await fetch(CEREBRAS_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${CEREBRAS_API_KEY}`,
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
        throw new Error(`Cerebras API error: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
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
    keepAliveInitialDelay: 0
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

// Middleware - CORS configuration for production
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    /\.onrender\.com$/  // Allow all Render subdomains
];

app.use(cors({
    origin: function(origin, callback) {
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
            // Proctoring settings
            enableProctoring, enableVideoAudio, disableCopyPaste, 
            trackTabSwitches, maxTabSwitches
        } = req.body;
        const createdAt = new Date();

        await pool.query(
            `INSERT INTO problems (id, mentor_id, title, description, sample_input, expected_output, difficulty, type, language, status, created_at, enable_proctoring, enable_video_audio, disable_copy_paste, track_tab_switches, max_tab_switches) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [problemId, mentorId, title, description, sampleInput || '', expectedOutput || '', difficulty, type, language, status || 'live', createdAt, enableProctoring ? 'true' : 'false', enableVideoAudio ? 'true' : 'false', disableCopyPaste ? 'true' : 'false', trackTabSwitches ? 'true' : 'false', maxTabSwitches || 3]
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

        // Check for plagiarism - get other submissions for same problem
        let plagiarismResult = { detected: false, copiedFrom: null, copiedFromName: null, similarity: 0 };
        if (problemId) {
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

        // AI Code Evaluation
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

        let evaluationResult = {
            score: 0,
            status: 'rejected',
            feedback: 'Evaluation failed. Please try again.',
            aiExplanation: 'Could not evaluate submission.',
            analysis: {
                correctness: 'Unknown',
                efficiency: 'Unknown',
                codeStyle: 'Unknown',
                bestPractices: 'Unknown'
            }
        };

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

        // Apply penalties
        let finalScore = evaluationResult.score || 0;
        let integrityViolation = false;

        // Penalty for tab switches (each switch = -5 points, max -25)
        if (tabSwitches > 0) {
            const tabPenalty = Math.min(tabSwitches * 5, 25);
            finalScore = Math.max(0, finalScore - tabPenalty);
            integrityViolation = tabSwitches >= 3;
        }

        // Penalty for plagiarism
        if (plagiarismResult.detected) {
            finalScore = Math.max(0, Math.floor(finalScore * 0.3)); // 70% penalty
            integrityViolation = true;
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
            } catch (e) { /* Ignore if already completed */ }
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

        // AI Evaluation (same as regular submission)
        let evaluationResult = { score: 0, status: 'rejected', feedback: 'Unable to evaluate', analysis: {} };
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

        // Apply penalties for proctoring violations
        let finalScore = evaluationResult.score || 0;
        let integrityViolation = false;
        const tabSwitchCount = parseInt(tabSwitches) || 0;
        const copyPasteCount = parseInt(copyPasteAttempts) || 0;
        const cameraBlockCount = parseInt(cameraBlockedCount) || 0;
        const phoneCount = parseInt(phoneDetectionCount) || 0;

        // Penalty for tab switches (each switch = -5 points, max -25)
        if (tabSwitchCount > 0) {
            const tabPenalty = Math.min(tabSwitchCount * 5, 25);
            finalScore = Math.max(0, finalScore - tabPenalty);
            integrityViolation = tabSwitchCount >= 3;
        }

        // Penalty for copy/paste attempts (each attempt = -3 points, max -15)
        if (copyPasteCount > 0) {
            const copyPenalty = Math.min(copyPasteCount * 3, 15);
            finalScore = Math.max(0, finalScore - copyPenalty);
        }

        // Penalty for camera obstruction (each block = -10 points, max -30)
        // This is a serious violation as it indicates attempt to hide from proctoring
        if (cameraBlockCount > 0) {
            const cameraPenalty = Math.min(cameraBlockCount * 10, 30);
            finalScore = Math.max(0, finalScore - cameraPenalty);
            if (cameraBlockCount >= 2) integrityViolation = true;
        }

        // Penalty for phone detection (each detection = -15 points, max -45)
        // Using a phone is a severe cheating attempt
        if (phoneCount > 0) {
            const phonePenalty = Math.min(phoneCount * 15, 45);
            finalScore = Math.max(0, finalScore - phonePenalty);
            integrityViolation = true; // Any phone detection is an integrity violation
            console.log(`📱 Phone detected ${phoneCount} times, penalty: -${phonePenalty} points`);
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

// Reset all submissions (Admin only)
app.delete('/api/submissions', async (req, res) => {
    try {
        // Delete all code submissions
        const [codeResult] = await pool.query('DELETE FROM submissions');
        // Delete all aptitude submissions
        const [aptitudeResult] = await pool.query('DELETE FROM aptitude_submissions');
        // Delete all problem completions
        await pool.query('DELETE FROM problem_completions');
        // Delete all task completions
        await pool.query('DELETE FROM task_completions');
        
        res.json({ 
            success: true, 
            message: 'All submissions reset successfully',
            deletedCodeSubmissions: codeResult.affectedRows,
            deletedAptitudeSubmissions: aptitudeResult.affectedRows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// ==================== RUN CODE & SUBMIT API ====================

app.post('/api/run', async (req, res) => {
    try {
        const { code, language, problemId } = req.body;

        let problemContext = '';
        if (problemId) {
            const [probs] = await pool.query('SELECT * FROM problems WHERE id = ?', [problemId]);
            if (probs.length > 0) {
                const p = probs[0];
                problemContext = `Problem: ${p.title}\nDescription: ${p.description}\nSample Input: ${p.sample_input || 'N/A'}\nExpected Output: ${p.expected_output || 'N/A'}`;
            }
        }

        const systemPrompt = `You are a high-performance Python and JavaScript code executor and evaluator.
        Your task is to:
        1. Simulate the execution of the provided code with extreme accuracy.
        2. Identify any syntax, runtime, or logical errors.
        3. If a problem context is provided, verify if the code logic correctly solves it.
        4. Focus on the output of the function or the final print statements.
        
        Respond ONLY with a JSON object:
        {
            "output": "The simulated standard output (stdout)",
            "status": "success" | "error" | "logical_error",
            "testCasesPassed": "X/Y (if context provided, else N/A)",
            "explanation": "Brief technical explanation"
        }`;

        const chatCompletion = await cerebrasChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${problemContext}\n\nLanguage: ${language}\n\nCode to execute:\n${code}` }
        ], {
            model: 'llama-3.3-70b',
            temperature: 0.1,
            max_tokens: 512,
            response_format: { type: 'json_object' }
        });

        const responseText = chatCompletion.choices[0]?.message?.content;
        let result = { output: 'No output', status: 'error' };
        try { result = JSON.parse(responseText); } catch (e) { }

        res.json(result);
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

        const systemPrompt = isProblem
            ? `Generate coding problem JSON ({title, description, sampleInput, expectedOutput, difficulty, type="Coding", language="${language || 'Python'}", status="live"}) based on request.`
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
            deadline: t.deadline,
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
            deadline: test.deadline,
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
        const { title, difficulty, duration, passingScore, maxTabSwitches, maxAttempts, deadline, description, status, questions, createdBy } = req.body;
        const createdAt = new Date();

        // Insert the test (store new fields in JSON metadata column or separate columns if available)
        await connection.query(
            'INSERT INTO aptitude_tests (id, title, type, difficulty, duration, total_questions, passing_score, max_tab_switches, max_attempts, deadline, description, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [testId, title, 'aptitude', difficulty, duration || 30, questions.length, passingScore || 60, maxTabSwitches || 3, maxAttempts || 1, deadline || null, description || '', status || 'live', createdBy, createdAt]
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
            SELECT u.id as studentId, u.name, 
            COUNT(s.id) as totalSubmissions, 
            AVG(s.score) as avgScore,
            SUM(COALESCE(s.tab_switches, 0)) as totalTabSwitches,
            SUM(COALESCE(s.copy_paste_attempts, 0)) as totalCopyPaste,
            SUM(COALESCE(s.camera_blocked_count, 0)) as totalCameraBlocked,
            SUM(COALESCE(s.phone_detection_count, 0)) as totalPhoneDetection,
            SUM(CASE WHEN s.integrity_violation = 'true' THEN 1 ELSE 0 END) as integrityViolations,
            SUM(CASE WHEN s.plagiarism_detected = 'true' THEN 1 ELSE 0 END) as plagiarismCount
            FROM users u
            JOIN submissions s ON u.id = s.student_id
            WHERE u.role = 'student'
            GROUP BY u.id
            ORDER BY avgScore DESC, totalSubmissions DESC
            LIMIT 50
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
    console.log('📚 Student Portal: http://127.0.0.1:3000/#/student');
    console.log('👨‍🏫 Mentor Portal: http://127.0.0.1:3000/#/mentor');
    console.log('🛡️ Admin Portal: http://127.0.0.1:3000/#/admin');
});
