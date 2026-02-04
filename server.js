const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Groq = require('groq-sdk');
const mysql = require('mysql2/promise');
const { URL } = require('url');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Groq SDK
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || '',
});

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

// Middleware
app.use(cors());
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
                completedBy: completions.map(c => c.student_id)
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
                completedBy: completions.map(c => c.student_id)
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
        const { mentorId, title, description, sampleInput, expectedOutput, difficulty, type, language, status, deadline } = req.body;
        const createdAt = new Date();

        await pool.query(
            'INSERT INTO problems (id, mentor_id, title, description, sample_input, expected_output, difficulty, type, language, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [problemId, mentorId, title, description, sampleInput || '', expectedOutput || '', difficulty, type, language, status || 'live', createdAt]
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
        const [rows] = await pool.query(`
            SELECT s.*, u.name as studentName 
            FROM submissions s 
            JOIN users u ON s.student_id = u.id
        `);

        const fixedRows = rows.map(s => ({
            id: s.id,
            studentId: s.student_id,
            studentName: s.studentName,
            problemId: s.problem_id,
            taskId: s.task_id,
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
                    const plagiarismCheck = await groq.chat.completions.create({
                        messages: [
                            { role: 'system', content: 'You are a plagiarism detection system. Analyze code for copying.' },
                            { role: 'user', content: plagiarismPrompt }
                        ],
                        model: 'llama-3.3-70b-versatile',
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
            const evaluation = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: 'You are an expert code evaluator. Be fair but thorough.' },
                    { role: 'user', content: evaluationPrompt }
                ],
                model: 'llama-3.3-70b-versatile',
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

// Delete submission
app.delete('/api/submissions/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM submissions WHERE id = ?', [req.params.id]);
        res.json({ success: true });
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

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `${problemContext}\n\nLanguage: ${language}\n\nCode to execute:\n${code}` }
            ],
            model: 'llama-3.3-70b-versatile',
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

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `${problemContext}\n\nCode (${language}):\n${code}` }
            ],
            model: 'llama-3.3-70b-versatile',
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

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ],
            model: 'llama-3.3-70b-versatile',
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

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            model: 'llama-3.3-70b-versatile'
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

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Generate ${numQuestions} aptitude questions about: ${topic || 'logical reasoning, number series, verbal ability'}` }
            ],
            model: 'llama-3.3-70b-versatile',
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
                totalQuestions: questions.length
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
            submittedAt: s.submitted_at
        }));

        res.json(cleanSubs);
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

        // Get student's mentor
        const [studentRows] = await pool.query('SELECT mentor_id FROM users WHERE id = ?', [studentId]);
        if (studentRows.length === 0) {
            return res.status(404).json({ error: 'Student not found' });
        }
        const mentorId = studentRows[0].mentor_id;

        // Average score from submissions
        const [[{ avgScore }]] = await pool.query(
            'SELECT COALESCE(AVG(score), 0) as avgScore FROM submissions WHERE student_id = ?',
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

        // Recent submissions by this student
        const [recentSubs] = await pool.query(`
            SELECT id, score, status, language, submitted_at as time
            FROM submissions
            WHERE student_id = ?
            ORDER BY submitted_at DESC LIMIT 5
        `, [studentId]);

        const recentSubmissions = recentSubs.map(r => ({
            id: r.id,
            score: r.score,
            status: r.status,
            language: r.language,
            time: r.time
        }));

        res.json({
            avgScore: Math.round(avgScore),
            totalSubmissions,
            totalTasks,
            completedTasks,
            totalProblems,
            completedProblems,
            totalAptitude,
            completedAptitude,
            submissionTrends,
            recentSubmissions
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

        // Get allocated student IDs for this mentor
        const [allocations] = await pool.query('SELECT student_id FROM mentor_student_allocations WHERE mentor_id = ?', [mentorId]);
        const studentIds = allocations.map(a => a.student_id);

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
                studentPerformance: []
            });
        }

        // Total students
        const totalStudents = studentIds.length;

        // Total submissions from mentor's students
        const [codeSubs] = await pool.query('SELECT COUNT(*) as count FROM submissions WHERE student_id IN (?)', [studentIds]);
        const [aptSubs] = await pool.query('SELECT COUNT(*) as count FROM aptitude_submissions WHERE student_id IN (?)', [studentIds]);
        const totalSubmissions = (codeSubs[0]?.count || 0) + (aptSubs[0]?.count || 0);

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
            avgScore,
            totalTasks: taskCount,
            totalProblems: probCount,
            submissionTrends,
            languageStats,
            recentActivity,
            menteePerformance: studentPerformance
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
            AVG(s.score) as avgScore
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
            avgScore: Math.round(r.avgScore)
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
