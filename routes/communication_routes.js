/**
 * Communication Test Routes — Event-based Architecture
 * Admin creates named tests -> adds questions per module -> assigns to students -> go-live
 * Modules: read-speak | listen-repeat | topic-speak | grammar-quiz | vocabulary-test | situational-response | email-writing | interview-qa
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

// --- WER Scoring ---------------------------------------------------------------

function wordErrorRate(reference, hypothesis) {
    const ref = reference.toLowerCase().trim().split(/\s+/);
    const hyp = hypothesis.toLowerCase().trim().split(/\s+/);
    const m = ref.length, n = hyp.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = ref[i - 1] === hyp[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n] / Math.max(m, 1);
}

function scoreSpeech(expectedSentence, transcribedText) {
    if (!transcribedText || transcribedText.trim().length === 0) {
        return { pronunciationScore: 0, feedback: 'No speech detected. Please try again.' };
    }
    const wer = wordErrorRate(expectedSentence, transcribedText);
    const pronunciationScore = Math.round(Math.max(0, (1 - wer) * 100));
    let feedback;
    if (pronunciationScore >= 90) feedback = 'Excellent! Your pronunciation is outstanding.';
    else if (pronunciationScore >= 75) feedback = 'Good work! Minor pronunciation issues detected.';
    else if (pronunciationScore >= 55) feedback = 'Fair attempt. Focus on speaking more clearly.';
    else feedback = 'Needs improvement — try reading the sentence slowly and clearly.';
    return { pronunciationScore, feedback };
}

function tryParse(val) {
    if (val !== null && typeof val === 'object') return val; // mysql2 auto-parses JSON columns
    try { return JSON.parse(val || 'null'); } catch { return null; }
}

// --- Router Factory -----------------------------------------------------------

module.exports = function communicationRoutes(pool, authenticate, cerebrasChat) {
    const router = express.Router();

    // Multer memory storage for audio uploads (no temp files needed)
    const audioUpload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('audio/')) cb(null, true);
            else cb(new Error('Only audio files are accepted'));
        }
    });

    // POST /comm-test/transcribe — Groq Whisper audio transcription
    router.post('/comm-test/transcribe', authenticate, audioUpload.single('audio'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ success: false, error: 'No audio file uploaded' });
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) return res.status(500).json({ success: false, error: 'Transcription service not configured' });

            // Use native FormData + Blob (Node 18+)
            const formData = new FormData();
            const audioBlob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' });
            formData.append('file', audioBlob, 'speech.webm');
            formData.append('model', 'whisper-large-v3-turbo');
            formData.append('language', 'en');
            formData.append('response_format', 'json');

            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}` },
                body: formData,
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('Groq Whisper error:', errText);
                return res.status(502).json({ success: false, error: 'Transcription service error' });
            }
            const data = await response.json();
            res.json({ success: true, transcript: data.text || '' });
        } catch (e) {
            console.error('Transcription error:', e);
            res.status(500).json({ success: false, error: 'Transcription failed: ' + e.message });
        }
    });

    function requireAdmin(req, res, next) {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }
        next();
    }

    // ==========================================================================
    //  ADMIN — TEST MANAGEMENT
    // ==========================================================================

    // GET /admin/comm-test/tests
    router.get('/admin/comm-test/tests', authenticate, requireAdmin, async (req, res) => {
        try {
            const [tests] = await pool.query(
                `SELECT t.*,
                        (SELECT COUNT(*) FROM comm_test_questions q WHERE q.test_id = t.id) AS question_count,
                        (SELECT COUNT(*) FROM comm_test_assignments a WHERE a.test_id = t.id) AS assigned_count,
                        (SELECT COUNT(*) FROM comm_test_sessions s WHERE s.test_id = t.id AND s.completed_at IS NOT NULL) AS attempt_count
                 FROM comm_tests t
                 ORDER BY t.created_at DESC`
            );
            res.json({ success: true, tests });
        } catch (err) {
            console.error('[comm-test] GET tests error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /admin/comm-test/tests
    router.post('/admin/comm-test/tests', authenticate, requireAdmin, async (req, res) => {
        try {
            const { title, description, modules, duration_minutes, questions_per_module, section_questions, section_times, passing_score, attempt_limit, proctoring_mode, gd_participants } = req.body;
            if (!title || !title.trim()) return res.status(400).json({ success: false, error: 'Title is required' });
            if (!Array.isArray(modules) || modules.length === 0) return res.status(400).json({ success: false, error: 'At least one module must be selected' });

            const id = uuidv4();
            await pool.query(
                `INSERT INTO comm_tests (id, title, description, modules, duration_minutes, questions_per_module, section_questions, section_times, passing_score, attempt_limit, proctoring_mode, gd_participants, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, title.trim(), (description || '').trim(), JSON.stringify(modules),
                 duration_minutes || 60, questions_per_module || 5,
                 section_questions ? JSON.stringify(section_questions) : null,
                 section_times ? JSON.stringify(section_times) : null,
                 passing_score || 60,
                 attempt_limit != null ? Number(attempt_limit) : null,
                 proctoring_mode || 'off',
                 gd_participants ? Number(gd_participants) : 3,
                 req.user.id]
            );
            res.json({ success: true, id, message: 'Test created' });
        } catch (err) {
            console.error('[comm-test] POST tests error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // PUT /admin/comm-test/tests/:id
    router.put('/admin/comm-test/tests/:id', authenticate, requireAdmin, async (req, res) => {
        try {
            const { title, description, modules, duration_minutes, questions_per_module, section_questions, section_times, passing_score, attempt_limit, proctoring_mode, gd_participants } = req.body;
            const [[test]] = await pool.query('SELECT status FROM comm_tests WHERE id = ?', [req.params.id]);
            if (!test) return res.status(404).json({ success: false, error: 'Test not found' });
            if (test.status === 'ended') return res.status(400).json({ success: false, error: 'Cannot edit an ended test' });

            const updates = [];
            const values = [];
            if (title) { updates.push('title = ?'); values.push(title.trim()); }
            if (description !== undefined) { updates.push('description = ?'); values.push(description.trim()); }
            if (modules) { updates.push('modules = ?'); values.push(JSON.stringify(modules)); }
            if (duration_minutes) { updates.push('duration_minutes = ?'); values.push(duration_minutes); }
            if (questions_per_module) { updates.push('questions_per_module = ?'); values.push(questions_per_module); }
            if (section_questions !== undefined) { updates.push('section_questions = ?'); values.push(section_questions ? JSON.stringify(section_questions) : null); }
            if (section_times !== undefined) { updates.push('section_times = ?'); values.push(section_times ? JSON.stringify(section_times) : null); }
            if (passing_score) { updates.push('passing_score = ?'); values.push(passing_score); }
            if ('attempt_limit' in req.body) { updates.push('attempt_limit = ?'); values.push(attempt_limit != null ? Number(attempt_limit) : null); }
            if (proctoring_mode) { updates.push('proctoring_mode = ?'); values.push(proctoring_mode); }
            if (gd_participants) { updates.push('gd_participants = ?'); values.push(Number(gd_participants)); }
            if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

            values.push(req.params.id);
            await pool.query(`UPDATE comm_tests SET ${updates.join(', ')} WHERE id = ?`, values);
            res.json({ success: true, message: 'Test updated' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // DELETE /admin/comm-test/tests/:id
    router.delete('/admin/comm-test/tests/:id', authenticate, requireAdmin, async (req, res) => {
        try {
            const testId = req.params.id;
            await pool.query('DELETE FROM comm_test_questions WHERE test_id = ?', [testId]);
            await pool.query('DELETE FROM comm_test_assignments WHERE test_id = ?', [testId]);
            await pool.query('DELETE FROM comm_tests WHERE id = ?', [testId]);
            res.json({ success: true, message: 'Test deleted' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /admin/comm-test/tests/:id/go-live
    router.post('/admin/comm-test/tests/:id/go-live', authenticate, requireAdmin, async (req, res) => {
        try {
            const testId = req.params.id;
            const [[test]] = await pool.query('SELECT status FROM comm_tests WHERE id = ?', [testId]);
            if (!test) return res.status(404).json({ success: false, error: 'Test not found' });
            if (test.status === 'active') return res.status(400).json({ success: false, error: 'Test is already active' });
            if (test.status === 'ended') return res.status(400).json({ success: false, error: 'Test has already ended' });

            const [[{ qcount }]] = await pool.query(
                'SELECT COUNT(*) as qcount FROM comm_test_questions WHERE test_id = ?', [testId]
            );
            if (Number(qcount) === 0) return res.status(400).json({ success: false, error: 'Add at least one question before going live' });

            await pool.query(
                'UPDATE comm_tests SET status = ?, activated_at = NOW() WHERE id = ?',
                ['active', testId]
            );
            res.json({ success: true, message: 'Test is now live!' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /admin/comm-test/tests/:id/end
    router.post('/admin/comm-test/tests/:id/end', authenticate, requireAdmin, async (req, res) => {
        try {
            await pool.query(
                'UPDATE comm_tests SET status = ?, ended_at = NOW() WHERE id = ?',
                ['ended', req.params.id]
            );
            res.json({ success: true, message: 'Test ended' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ==========================================================================
    //  ADMIN — QUESTION BANK
    // ==========================================================================

    // GET /admin/comm-test/tests/:id/questions
    router.get('/admin/comm-test/tests/:id/questions', authenticate, requireAdmin, async (req, res) => {
        try {
            const { module_type } = req.query;
            const params = [req.params.id];
            let sql = 'SELECT * FROM comm_test_questions WHERE test_id = ?';
            if (module_type) { sql += ' AND module_type = ?'; params.push(module_type); }
            sql += ' ORDER BY module_type, id';
            const [questions] = await pool.query(sql, params);
            res.json({ success: true, questions });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /admin/comm-test/tests/:id/questions
    router.post('/admin/comm-test/tests/:id/questions', authenticate, requireAdmin, async (req, res) => {
        try {
            const { module_type, content, answer, category, hint, time_limit_sec } = req.body;
            const testId = req.params.id;
            const VALID_MODULES = ['read-speak','listen-repeat','topic-speak','grammar-quiz','vocabulary-test','situational-response','email-writing','interview-qa','gd-round'];
            if (!module_type || !VALID_MODULES.includes(module_type)) {
                return res.status(400).json({ success: false, error: 'Invalid or missing module_type' });
            }
            if (!content || !content.trim()) {
                return res.status(400).json({ success: false, error: 'content is required' });
            }
            if ((module_type === 'grammar-quiz' || module_type === 'vocabulary-test') && !answer) {
                return res.status(400).json({ success: false, error: 'answer is required for this module type' });
            }
            const [[testRow]] = await pool.query('SELECT id FROM comm_tests WHERE id = ?', [testId]);
            if (!testRow) return res.status(404).json({ success: false, error: 'Test not found' });

            const [result] = await pool.query(
                `INSERT INTO comm_test_questions (test_id, module_type, content, answer, category, hint, time_limit_sec)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [testId, module_type, content.trim(),
                 answer ? answer.trim() : null,
                 category ? category.trim() : null,
                 hint ? hint.trim() : null,
                 time_limit_sec || null]
            );
            res.json({ success: true, id: result.insertId, message: 'Question added' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // DELETE /admin/comm-test/tests/:id/questions/:qid
    router.delete('/admin/comm-test/tests/:id/questions/:qid', authenticate, requireAdmin, async (req, res) => {
        try {
            await pool.query(
                'DELETE FROM comm_test_questions WHERE id = ? AND test_id = ?',
                [req.params.qid, req.params.id]
            );
            res.json({ success: true, message: 'Question deleted' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /admin/comm-test/tests/:id/questions/ai-generate
    router.post('/admin/comm-test/tests/:id/questions/ai-generate', authenticate, requireAdmin, async (req, res) => {
        try {
            const testId = req.params.id;
            const { module_type, topic, count = 5 } = req.body;
            const VALID_MODULES = ['read-speak','listen-repeat','topic-speak','grammar-quiz','vocabulary-test','situational-response','email-writing','interview-qa','gd-round'];
            if (!module_type || !VALID_MODULES.includes(module_type)) {
                return res.status(400).json({ success: false, error: 'Invalid module_type' });
            }
            const [[testRow]] = await pool.query('SELECT id FROM comm_tests WHERE id = ?', [testId]);
            if (!testRow) return res.status(404).json({ success: false, error: 'Test not found' });

            const n = Math.min(20, Math.max(1, Number(count) || 5));
            const topicCtx = topic ? ` related to: "${topic}"` : '';

            const prompts = {
                'read-speak':           `Generate ${n} clear, natural English sentences${topicCtx} for a read-aloud assessment. Vary difficulty from simple to complex. Respond ONLY with valid JSON: {"questions":[{"content":"<sentence>"}]}`,
                'listen-repeat':        `Generate ${n} clear English sentences${topicCtx} for a listen-and-repeat assessment. Use natural spoken rhythm. Respond ONLY with valid JSON: {"questions":[{"content":"<sentence>"}]}`,
                'topic-speak':          `Generate ${n} open-ended discussion prompts${topicCtx} for a spoken English test. Each should encourage 1-2 minutes of speech. Respond ONLY with valid JSON: {"questions":[{"content":"<prompt>"}]}`,
                'grammar-quiz':         `Generate ${n} English grammar fill-in-the-blank questions${topicCtx}. Use ___ for the blank. Respond ONLY with valid JSON: {"questions":[{"content":"<sentence with ___>","answer":"<correct word>","category":"<grammar rule>"}]}`,
                'vocabulary-test':      `Generate ${n} vocabulary questions${topicCtx}. Each has a word and its meaning/usage in a professional context. Respond ONLY with valid JSON: {"questions":[{"content":"<word or phrase>","answer":"<meaning and usage example>","category":"<part of speech>"}]}`,
                'situational-response': `Generate ${n} realistic workplace situational scenarios${topicCtx} requiring a spoken professional response. Respond ONLY with valid JSON: {"questions":[{"content":"<scenario description>"}]}`,
                'email-writing':        `Generate ${n} professional email writing prompts${topicCtx}. Each should be a clear, realistic workplace task. Respond ONLY with valid JSON: {"questions":[{"content":"<email writing task>"}]}`,
                'gd-round':             `Generate 1 rich, thought-provoking group discussion topic${topicCtx} suitable for a 30–45 minute professional discussion. The topic should be debatable with multiple perspectives. Respond ONLY with valid JSON: {"questions":[{"content":"<full topic statement or question>","category":"<theme like Leadership/Ethics/Technology>"}]}`,
            };

            const aiResponse = await cerebrasChat(
                [{ role: 'system', content: 'You are an expert English language assessment content creator. Generate high-quality, professional test questions. Always respond with valid JSON only, no markdown.' },
                 { role: 'user', content: prompts[module_type] }],
                { model: 'llama3.1-8b', temperature: 0.7, max_tokens: 2048 }
            );

            let generated = [];
            try {
                let raw = aiResponse.choices[0]?.message?.content || '{}';
                raw = raw.replace(/```json\s*|\s*```/g, '').trim();
                const parsed = JSON.parse(raw);
                generated = Array.isArray(parsed.questions) ? parsed.questions : [];
            } catch {
                return res.status(500).json({ success: false, error: 'AI returned invalid JSON — please try again' });
            }

            if (generated.length === 0) {
                return res.status(500).json({ success: false, error: 'AI generated no questions — please try again' });
            }

            // Bulk insert all generated questions
            const insertValues = generated.map(q => [
                testId, module_type,
                (q.content || '').trim(),
                q.answer ? q.answer.trim() : null,
                q.category ? q.category.trim() : null,
                null, null
            ]).filter(v => v[2]); // skip empty content

            if (insertValues.length === 0) {
                return res.status(500).json({ success: false, error: 'No valid questions in AI response' });
            }

            await pool.query(
                `INSERT INTO comm_test_questions (test_id, module_type, content, answer, category, hint, time_limit_sec) VALUES ?`,
                [insertValues]
            );

            res.json({ success: true, generated: insertValues.length, message: `${insertValues.length} questions generated and saved` });
        } catch (err) {
            console.error('[comm-test] ai-generate error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ==========================================================================
    //  ADMIN — ASSIGNMENT
    // ==========================================================================

    // PUT /admin/comm-test/tests/:id/assign
    router.put('/admin/comm-test/tests/:id/assign', authenticate, requireAdmin, async (req, res) => {
        try {
            const testId = req.params.id;
            const { student_ids } = req.body;
            if (!Array.isArray(student_ids) || student_ids.length === 0) {
                return res.status(400).json({ success: false, error: 'student_ids array required' });
            }
            const values = student_ids.map(sid => [testId, String(sid)]);
            const [result] = await pool.query(
                'INSERT IGNORE INTO comm_test_assignments (test_id, student_id) VALUES ?',
                [values]
            );
            const assigned = result.affectedRows;
            res.json({ success: true, assigned, message: `Assigned to ${assigned} student(s)` });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /admin/comm-test/tests/:id/assignments
    router.get('/admin/comm-test/tests/:id/assignments', authenticate, requireAdmin, async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT a.student_id, a.assigned_at, u.name, u.email, u.department,
                        s.overall_score, s.completed_at
                 FROM comm_test_assignments a
                 LEFT JOIN users u ON a.student_id = u.id
                 LEFT JOIN comm_test_sessions s ON s.test_id = a.test_id AND s.student_id = a.student_id AND s.completed_at IS NOT NULL
                 WHERE a.test_id = ?
                 ORDER BY a.assigned_at DESC`,
                [req.params.id]
            );
            res.json({ success: true, assignments: rows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // DELETE /admin/comm-test/tests/:id/assignments/:studentId
    router.delete('/admin/comm-test/tests/:id/assignments/:studentId', authenticate, requireAdmin, async (req, res) => {
        try {
            await pool.query(
                'DELETE FROM comm_test_assignments WHERE test_id = ? AND student_id = ?',
                [req.params.id, req.params.studentId]
            );
            res.json({ success: true, message: 'Student unassigned' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ==========================================================================
    //  ADMIN — REPORTS & ANALYTICS
    // ==========================================================================

    // GET /admin/comm-test/reports
    router.get('/admin/comm-test/reports', authenticate, requireAdmin, async (req, res) => {
        try {
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.min(100, parseInt(req.query.limit) || 50);
            const offset = (page - 1) * limit;
            const search    = req.query.search   ? `%${req.query.search}%` : null;
            const testId    = req.query.test_id  || null;
            const status    = req.query.status   || null;  // 'completed' | 'incomplete'
            const minScore  = req.query.min_score != null && req.query.min_score !== '' ? Number(req.query.min_score) : null;
            const maxScore  = req.query.max_score != null && req.query.max_score !== '' ? Number(req.query.max_score) : null;
            const dateFrom  = req.query.date_from || null;
            const dateTo    = req.query.date_to   || null;
            const sort      = req.query.sort      || 'newest'; // newest|oldest|high_score|low_score

            const conditions = [];
            const params = [];
            if (search)  { conditions.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(search, search); }
            if (testId)  { conditions.push('s.test_id = ?'); params.push(testId); }
            if (status === 'completed')  conditions.push('s.completed_at IS NOT NULL');
            if (status === 'incomplete') conditions.push('s.completed_at IS NULL');
            if (minScore != null) { conditions.push('s.overall_score >= ?'); params.push(minScore); }
            if (maxScore != null) { conditions.push('s.overall_score <= ?'); params.push(maxScore); }
            if (dateFrom) { conditions.push('DATE(s.started_at) >= ?'); params.push(dateFrom); }
            if (dateTo)   { conditions.push('DATE(s.started_at) <= ?'); params.push(dateTo); }
            const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

            const orderMap = { newest: 's.started_at DESC', oldest: 's.started_at ASC', high_score: 's.overall_score DESC', low_score: 's.overall_score ASC' };
            const orderBy = orderMap[sort] || 's.started_at DESC';

            const [sessions] = await pool.query(
                `SELECT s.id, s.test_id, s.student_id, s.started_at, s.completed_at, s.overall_score,
                        ANY_VALUE(u.name) as student_name, ANY_VALUE(u.email) as student_email,
                        ANY_VALUE(t.title) as test_title,
                        COUNT(sub.id) as submission_count,
                        GROUP_CONCAT(DISTINCT sub.module_type ORDER BY sub.module_type) as modules_covered
                 FROM comm_test_sessions s
                 LEFT JOIN users u ON s.student_id = u.id
                 LEFT JOIN comm_tests t ON s.test_id = t.id
                 LEFT JOIN comm_test_submissions sub ON s.id = sub.session_id
                 ${where}
                 GROUP BY s.id ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const [[{ total }]] = await pool.query(
                `SELECT COUNT(DISTINCT s.id) as total FROM comm_test_sessions s
                 LEFT JOIN users u ON s.student_id = u.id
                 LEFT JOIN comm_tests t ON s.test_id = t.id
                 ${where}`,
                params
            );
            res.json({ success: true, sessions, total: Number(total), page, limit });
        } catch (err) {
            console.error('[comm-test] reports error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /admin/comm-test/reports/:sessionId
    router.get('/admin/comm-test/reports/:sessionId', authenticate, requireAdmin, async (req, res) => {
        try {
            const [[session]] = await pool.query(
                `SELECT s.*, u.name as student_name, u.email as student_email, t.title as test_title, t.section_times
                 FROM comm_test_sessions s
                 LEFT JOIN users u ON s.student_id = u.id
                 LEFT JOIN comm_tests t ON s.test_id = t.id
                 WHERE s.id = ?`,
                [req.params.sessionId]
            );
            if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
            const [submissions] = await pool.query(
                `SELECT * FROM comm_test_submissions WHERE session_id = ? ORDER BY submitted_at ASC`,
                [req.params.sessionId]
            );
            const sectionTimes = tryParse(session.section_times) || {};
            const byModule = {};
            for (const sub of submissions) {
                if (!byModule[sub.module_type]) byModule[sub.module_type] = [];
                byModule[sub.module_type].push({ ...sub, ai_scores: tryParse(sub.ai_scores) });
            }
            const moduleStats = Object.entries(byModule).map(([type, subs]) => ({
                module: type,
                avgScore: Math.round(subs.reduce((s, x) => s + (x.score || 0), 0) / subs.length),
                attempts: subs.length, submissions: subs,
                allocatedMinutes: sectionTimes[type] || null
            }));
            res.json({ success: true, session, overallScore: session.overall_score || 0, modules: moduleStats, sectionTimes });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // DELETE /admin/comm-test/reports/:sessionId
    router.delete('/admin/comm-test/reports/:sessionId', authenticate, requireAdmin, async (req, res) => {
        try {
            const { sessionId } = req.params;
            await pool.query(`DELETE FROM comm_test_submissions WHERE session_id = ?`, [sessionId]);
            const [result] = await pool.query(`DELETE FROM comm_test_sessions WHERE id = ?`, [sessionId]);
            if (result.affectedRows === 0) return res.status(404).json({ success: false, error: 'Session not found' });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // DELETE /admin/comm-test/reports  (bulk delete by explicit session IDs)
    router.delete('/admin/comm-test/reports', authenticate, requireAdmin, async (req, res) => {
        try {
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ success: false, error: 'No session IDs provided' });
            }
            // Session IDs are UUIDs (strings) — sanitise: allow only alphanumeric + hyphens
            const safeIds = ids.map(String).filter(id => /^[a-f0-9\-]{8,36}$/i.test(id));
            if (safeIds.length === 0) {
                return res.status(400).json({ success: false, error: 'Invalid session IDs' });
            }
            const placeholders = safeIds.map(() => '?').join(',');
            // Delete child rows first, then parent sessions
            await pool.query(`DELETE FROM comm_test_submissions WHERE session_id IN (${placeholders})`, safeIds);
            const [result] = await pool.query(`DELETE FROM comm_test_sessions WHERE id IN (${placeholders})`, safeIds);
            res.json({ success: true, deleted: result.affectedRows });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /admin/comm-test/stats
    router.get('/admin/comm-test/stats', authenticate, requireAdmin, async (req, res) => {
        try {
            const [[counts]] = await pool.query(
                `SELECT COUNT(*) as total_sessions, SUM(completed_at IS NOT NULL) as completed_sessions, AVG(overall_score) as avg_score
                 FROM comm_test_sessions`
            );
            const [[testCounts]] = await pool.query(
                `SELECT COUNT(*) as total, SUM(status='active') as active, SUM(status='ended') as ended FROM comm_tests`
            );
            const [moduleStats] = await pool.query(
                `SELECT module_type, COUNT(*) as attempts, AVG(score) as avg_score
                 FROM comm_test_submissions GROUP BY module_type`
            );
            const [sessionsOverTime] = await pool.query(
                `SELECT DATE(started_at) as date, COUNT(*) as sessions, AVG(overall_score) as avg_score
                 FROM comm_test_sessions WHERE started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                 GROUP BY DATE(started_at) ORDER BY date`
            );
            const [topStudents] = await pool.query(
                `SELECT u.name, u.email, MAX(s.overall_score) as best_score, COUNT(s.id) as sessions
                 FROM comm_test_sessions s LEFT JOIN users u ON s.student_id = u.id
                 WHERE s.overall_score IS NOT NULL GROUP BY s.student_id ORDER BY best_score DESC LIMIT 10`
            );
            res.json({
                success: true,
                totalSessions: Number(counts.total_sessions),
                completedSessions: Number(counts.completed_sessions),
                avgScore: Math.round(counts.avg_score || 0),
                totalTests: Number(testCounts.total || 0),
                activeTests: Number(testCounts.active || 0),
                endedTests: Number(testCounts.ended || 0),
                moduleStats: moduleStats.map(m => ({ module: m.module_type, attempts: Number(m.attempts), avgScore: Math.round(m.avg_score || 0) })),
                sessionsOverTime,
                topStudents
            });
        } catch (err) {
            console.error('[comm-test] stats error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ==========================================================================
    //  STUDENT ROUTES
    // ==========================================================================

    // GET /comm-test/my-tests
    router.get('/comm-test/my-tests', authenticate, async (req, res) => {
        try {
            const studentId = String(req.user.id);
            const [tests] = await pool.query(
                `SELECT t.id, t.title, t.description, t.status, t.modules,
                        t.duration_minutes, t.questions_per_module, t.section_questions,
                        t.section_times, t.passing_score, t.attempt_limit, t.activated_at,
                        (SELECT COUNT(*) FROM comm_test_sessions WHERE test_id = t.id AND student_id = ?) as sessions_count,
                        s.id as session_id, s.completed_at, s.overall_score
                 FROM comm_test_assignments a
                 JOIN comm_tests t ON a.test_id = t.id
                 LEFT JOIN (
                     SELECT id, test_id, completed_at, overall_score
                     FROM (
                         SELECT id, test_id, student_id, completed_at, overall_score,
                                ROW_NUMBER() OVER (PARTITION BY test_id ORDER BY started_at DESC) AS rn
                         FROM comm_test_sessions
                         WHERE student_id = ?
                     ) ranked
                     WHERE rn = 1
                 ) s ON s.test_id = t.id
                 WHERE a.student_id = ? AND t.status = 'active'
                 ORDER BY t.activated_at DESC`,
                [studentId, studentId, studentId]
            );
            res.json({ success: true, tests: tests.map(t => ({ ...t, modules: tryParse(t.modules) || [] })) });
        } catch (err) {
            console.error('[comm-test] my-tests error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /comm-test/tests/:testId/questions?module_type=xxx&excluded=1,2
    router.get('/comm-test/tests/:testId/questions', authenticate, async (req, res) => {
        try {
            const { testId } = req.params;
            const { module_type, excluded: excludedRaw } = req.query;
            if (!module_type) return res.status(400).json({ success: false, error: 'module_type required' });

            const [[assignment]] = await pool.query(
                'SELECT id FROM comm_test_assignments WHERE test_id = ? AND student_id = ?',
                [testId, String(req.user.id)]
            );
            if (!assignment) return res.status(403).json({ success: false, error: 'Not assigned to this test' });

            const excluded = excludedRaw ? excludedRaw.split(',').map(Number).filter(n => !isNaN(n)) : [];
            let [questions] = await pool.query(
                'SELECT id, content, category, answer FROM comm_test_questions WHERE test_id = ? AND module_type = ?',
                [testId, module_type]
            );
            if (excluded.length > 0) questions = questions.filter(q => !excluded.includes(q.id));
            if (questions.length === 0) return res.status(404).json({ success: false, error: 'No questions available for this module' });

            const total = questions.length + excluded.length;
            const pick = questions[Math.floor(Math.random() * questions.length)];
            res.json({ success: true, question: pick, total });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /comm-test/tests/:testId/grammar-batch
    router.get('/comm-test/tests/:testId/grammar-batch', authenticate, async (req, res) => {
        try {
            const { testId } = req.params;
            const count = Math.min(parseInt(req.query.count) || 5, 20);
            const [[assignment]] = await pool.query(
                'SELECT id FROM comm_test_assignments WHERE test_id = ? AND student_id = ?',
                [testId, String(req.user.id)]
            );
            if (!assignment) return res.status(403).json({ success: false, error: 'Not assigned to this test' });
            const moduleType = req.query.module_type || 'grammar-quiz';
            const [questions] = await pool.query(
                'SELECT id, content, category FROM comm_test_questions WHERE test_id = ? AND module_type = ?',
                [testId, moduleType]
            );
            const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, count);
            res.json({ success: true, questions: shuffled.map(q => ({ id: q.id, sentence: q.content, category: q.category })), quizId: uuidv4() });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /comm-test/session/start
    router.post('/comm-test/session/start', authenticate, async (req, res) => {
        try {
            const { testId } = req.body;
            if (!testId) return res.status(400).json({ success: false, error: 'testId is required' });
            const [[test]] = await pool.query('SELECT status FROM comm_tests WHERE id = ?', [testId]);
            if (!test) return res.status(404).json({ success: false, error: 'Test not found' });
            if (test.status !== 'active') return res.status(400).json({ success: false, error: 'Test is not currently active' });
            const [[assignment]] = await pool.query(
                'SELECT id FROM comm_test_assignments WHERE test_id = ? AND student_id = ?',
                [testId, String(req.user.id)]
            );
            if (!assignment) return res.status(403).json({ success: false, error: 'Not assigned to this test' });

            // Enforce attempt limit
            const [[fullTest]] = await pool.query('SELECT attempt_limit FROM comm_tests WHERE id = ?', [testId]);
            if (fullTest && fullTest.attempt_limit != null) {
                const [[{ attempts }]] = await pool.query(
                    'SELECT COUNT(*) as attempts FROM comm_test_sessions WHERE test_id = ? AND student_id = ? AND completed_at IS NOT NULL',
                    [testId, String(req.user.id)]
                );
                if (Number(attempts) >= fullTest.attempt_limit) {
                    return res.status(400).json({ success: false, error: `Attempt limit reached (${fullTest.attempt_limit} attempt${fullTest.attempt_limit > 1 ? 's' : ''} maximum)` });
                }
            }

            const sessionId = uuidv4();
            await pool.query(
                'INSERT INTO comm_test_sessions (id, test_id, student_id) VALUES (?, ?, ?)',
                [sessionId, testId, String(req.user.id)]
            );
            res.json({ success: true, sessionId });
        } catch (err) {
            console.error('[comm-test] session/start error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /comm-test/session/complete
    router.post('/comm-test/session/complete', authenticate, async (req, res) => {
        try {
            const { sessionId } = req.body;
            const studentId = String(req.user.id);
            const [[agg]] = await pool.query(
                'SELECT AVG(score) as avg_score FROM comm_test_submissions WHERE session_id = ? AND student_id = ?',
                [sessionId, studentId]
            );
            const overallScore = Math.max(0, Math.min(100, Math.round(Number(agg?.avg_score) || 0)));
            await pool.query(
                'UPDATE comm_test_sessions SET completed_at = NOW(), overall_score = ? WHERE id = ? AND student_id = ?',
                [overallScore, sessionId, studentId]
            );
            res.json({ success: true, overallScore });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /submit/read-speak
    router.post('/comm-test/submit/read-speak', authenticate, async (req, res) => {
        try {
            const { sessionId, questionId, transcribedText, durationSec } = req.body;
            const studentId = String(req.user.id);
            if (!questionId || !sessionId) return res.status(400).json({ success: false, error: 'sessionId and questionId required' });
            const [[row]] = await pool.query('SELECT content FROM comm_test_questions WHERE id = ? AND module_type = ?', [questionId, 'read-speak']);
            if (!row) return res.status(400).json({ success: false, error: 'Invalid questionId' });

            const { pronunciationScore, feedback } = scoreSpeech(row.content, transcribedText || '');
            const words = (transcribedText || '').trim().split(/\s+/).filter(Boolean).length;
            const wps = words / Math.max(durationSec || 1, 0.01);
            let fluencyScore = 0;
            if (wps < 1) fluencyScore = wps * 50;
            else if (wps <= 3) fluencyScore = 80 + ((wps - 1) / 2 * 20);
            else fluencyScore = Math.max(0, 100 - (wps - 3) * 20);
            fluencyScore = Math.round(Math.min(100, fluencyScore));
            const finalScore = Math.round((pronunciationScore * 0.7) + (fluencyScore * 0.3));

            await pool.query(
                `INSERT INTO comm_test_submissions (id, session_id, student_id, module_type, question_id, transcribed_text, expected_text, score, max_score, feedback, ai_scores)
                 VALUES (?, ?, ?, 'read-speak', ?, ?, ?, ?, 100, ?, ?)`,
                [uuidv4(), sessionId, studentId, questionId, transcribedText, row.content, finalScore, feedback,
                 JSON.stringify({ pronunciationScore, fluencyScore, wps: Math.round(wps * 100) / 100 })]
            );
            res.json({ success: true, score: finalScore, pronunciationScore, fluencyScore, wps, feedback, expected: row.content, transcription: transcribedText });
        } catch (err) {
            console.error('[comm-test] read-speak error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /submit/listen-repeat
    router.post('/comm-test/submit/listen-repeat', authenticate, async (req, res) => {
        try {
            const { sessionId, questionId, transcribedText } = req.body;
            const studentId = String(req.user.id);
            if (!questionId || !sessionId) return res.status(400).json({ success: false, error: 'sessionId and questionId required' });
            const [[row]] = await pool.query('SELECT content FROM comm_test_questions WHERE id = ? AND module_type = ?', [questionId, 'listen-repeat']);
            if (!row) return res.status(400).json({ success: false, error: 'Invalid questionId' });

            const { pronunciationScore, feedback } = scoreSpeech(row.content, transcribedText || '');
            await pool.query(
                `INSERT INTO comm_test_submissions (id, session_id, student_id, module_type, question_id, transcribed_text, expected_text, score, max_score, feedback, ai_scores)
                 VALUES (?, ?, ?, 'listen-repeat', ?, ?, ?, ?, 100, ?, ?)`,
                [uuidv4(), sessionId, studentId, questionId, transcribedText, row.content, pronunciationScore, feedback,
                 JSON.stringify({ pronunciationScore })]
            );
            res.json({ success: true, score: pronunciationScore, feedback, expected: row.content, transcription: transcribedText });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /submit/topic-speak
    router.post('/comm-test/submit/topic-speak', authenticate, async (req, res) => {
        try {
            const { sessionId, questionId, transcribedText } = req.body;
            const studentId = String(req.user.id);
            if (!questionId || !sessionId) return res.status(400).json({ success: false, error: 'sessionId and questionId required' });
            if (!transcribedText || transcribedText.trim().length < 5) return res.status(400).json({ success: false, error: 'Speech too short for evaluation' });

            const [[row]] = await pool.query('SELECT content FROM comm_test_questions WHERE id = ? AND module_type = ?', [questionId, 'topic-speak']);
            const topic = row ? row.content : 'General Topic';

            const prompt = `You are an English communication evaluator. A student was asked to speak on the topic: "${topic}"

Student's response: "${transcribedText.trim()}"

Evaluate on these 4 criteria (0-25 points each):
1. Relevance to topic (0-25)
2. Grammar and sentence structure (0-25)
3. Vocabulary richness (0-25)
4. Coherence and organization (0-25)

Respond ONLY with valid JSON, no markdown:
{"relevanceScore":<0-25>,"grammarScore":<0-25>,"vocabularyScore":<0-25>,"coherenceScore":<0-25>,"totalScore":<0-100>,"feedback":"<feedback>","strengths":["s1"],"improvements":["i1"]}`;

            const aiResponse = await cerebrasChat(
                [{ role: 'user', content: prompt }],
                { model: 'llama3.1-8b', temperature: 0.4, max_tokens: 512 }
            );

            let evaluation;
            try {
                let raw = aiResponse.choices[0]?.message?.content || '{}';
                raw = raw.replace(/```json\s*|\s*```/g, '').trim();
                evaluation = JSON.parse(raw);
            } catch {
                evaluation = { relevanceScore: 15, grammarScore: 15, vocabularyScore: 15, coherenceScore: 15, totalScore: 60, feedback: 'AI evaluation completed.', strengths: [], improvements: [] };
            }

            const finalScore = Math.min(100, Math.max(0, evaluation.totalScore || 0));
            await pool.query(
                `INSERT INTO comm_test_submissions (id, session_id, student_id, module_type, question_id, transcribed_text, expected_text, score, max_score, feedback, ai_scores)
                 VALUES (?, ?, ?, 'topic-speak', ?, ?, ?, ?, 100, ?, ?)`,
                [uuidv4(), sessionId, studentId, questionId, transcribedText, topic, finalScore, evaluation.feedback, JSON.stringify(evaluation)]
            );
            res.json({ success: true, topic, score: finalScore, ...evaluation, transcription: transcribedText });
        } catch (err) {
            console.error('[comm-test] topic-speak error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /submit/grammar-quiz
    router.post('/comm-test/submit/grammar-quiz', authenticate, async (req, res) => {
        try {
            const { sessionId, answers, moduleType: submittedModuleType = 'grammar-quiz' } = req.body;
            const studentId = String(req.user.id);
            if (!sessionId || !Array.isArray(answers) || answers.length === 0) {
                return res.status(400).json({ success: false, error: 'sessionId and answers array required' });
            }
            const ids = answers.map(a => a.id).filter(Boolean);
            const [dbQuestions] = ids.length > 0
                ? await pool.query(`SELECT id, content, answer, category FROM comm_test_questions WHERE id IN (?) AND module_type = ?`, [ids, submittedModuleType])
                : [[]];
            const qMap = {};
            for (const q of dbQuestions) qMap[q.id] = q;

            let correct = 0;
            const review = answers.map((sub, i) => {
                const q = qMap[sub.id];
                if (!q) return { questionNumber: i + 1, sentence: 'Unknown', userAnswer: sub.answer || '', correctAnswer: '', isCorrect: false };
                const isCorrect = (sub.answer || '').trim().toLowerCase() === q.answer.toLowerCase();
                if (isCorrect) correct++;
                return { questionNumber: i + 1, sentence: q.content, category: q.category, userAnswer: sub.answer || '(no answer)', correctAnswer: q.answer, isCorrect };
            });

            const finalScore = Math.round((correct / answers.length) * 100);
            await pool.query(
                `INSERT INTO comm_test_submissions (id, session_id, student_id, module_type, question_id, transcribed_text, expected_text, score, max_score, feedback, ai_scores)
                 VALUES (?, ?, ?, ?, 0, ?, ?, ?, 100, ?, ?)`,
                [uuidv4(), sessionId, studentId, submittedModuleType,
                 JSON.stringify(answers.map(a => a.answer)),
                 JSON.stringify(answers.map(a => a.id)),
                 finalScore, `${correct}/${answers.length} correct`, JSON.stringify({ review, correct, total: answers.length })]
            );
            res.json({ success: true, score: finalScore, correct, total: answers.length, percentage: finalScore, review });
        } catch (err) {
            console.error('[comm-test] grammar-quiz error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /comm-test/session/report/:sessionId
    router.get('/comm-test/session/report/:sessionId', authenticate, async (req, res) => {
        try {
            const { sessionId } = req.params;
            const studentId = String(req.user.id);
            const [[sessionInfo]] = await pool.query(
                `SELECT s.started_at, s.completed_at, s.overall_score, t.section_times FROM comm_test_sessions s
                 LEFT JOIN comm_tests t ON s.test_id = t.id
                 WHERE s.id = ? AND s.student_id = ?`,
                [sessionId, studentId]
            );
            const sectionTimes = tryParse(sessionInfo?.section_times) || {};
            const [submissions] = await pool.query(
                `SELECT module_type, score, max_score, feedback, ai_scores, submitted_at, question_id, expected_text, transcribed_text
                 FROM comm_test_submissions WHERE session_id = ? AND student_id = ? ORDER BY submitted_at ASC`,
                [sessionId, studentId]
            );
            const byModule = {};
            for (const sub of submissions) {
                if (!byModule[sub.module_type]) byModule[sub.module_type] = [];
                byModule[sub.module_type].push({ ...sub, ai_scores: tryParse(sub.ai_scores) });
            }
            const moduleStats = Object.entries(byModule).map(([type, subs]) => ({
                module: type,
                avgScore: Math.max(0, Math.min(100, Math.round(subs.reduce((s, x) => s + (Number(x.score) || 0), 0) / subs.length))),
                attempts: subs.length, submissions: subs,
                allocatedMinutes: sectionTimes[type] || null
            }));
            const computedOverallScore = moduleStats.length
                ? Math.round(moduleStats.reduce((s, m) => s + m.avgScore, 0) / moduleStats.length)
                : 0;
            const overallScore = Math.max(
                0,
                Math.min(
                    100,
                    Number(sessionInfo?.overall_score ?? computedOverallScore) || 0
                )
            );
            res.json({ success: true, sessionId, overallScore, modules: moduleStats, sectionTimes,
                session: { started_at: sessionInfo?.started_at, completed_at: sessionInfo?.completed_at, overall_score: sessionInfo?.overall_score } });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /comm-test/history
    router.get('/comm-test/history', authenticate, async (req, res) => {
        try {
            const [sessions] = await pool.query(
                `SELECT s.id, s.test_id, s.started_at, s.completed_at, s.overall_score,
                        t.title as test_title,
                        COUNT(sub.id) as submission_count,
                        GROUP_CONCAT(DISTINCT sub.module_type) as modules_covered
                 FROM comm_test_sessions s
                 LEFT JOIN comm_tests t ON s.test_id = t.id
                 LEFT JOIN comm_test_submissions sub ON s.id = sub.session_id
                 WHERE s.student_id = ?
                 GROUP BY s.id ORDER BY s.started_at DESC LIMIT 20`,
                [String(req.user.id)]
            );
            res.json({ success: true, sessions });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ==========================================================================
    //  GROUP DISCUSSION (GD) ROUTES
    // ==========================================================================

    // POST /comm-test/gd/start  — get topic + participant config for a GD session
    router.post('/comm-test/gd/start', authenticate, async (req, res) => {
        try {
            const { sessionId, testId } = req.body;
            if (!sessionId || !testId) return res.status(400).json({ success: false, error: 'sessionId and testId required' });
            const [[testRow]] = await pool.query('SELECT gd_participants, section_times, section_questions FROM comm_tests WHERE id = ?', [testId]);
            if (!testRow) return res.status(404).json({ success: false, error: 'Test not found' });

            const participants = testRow.gd_participants || 3;
            const sectionTimes = tryParse(testRow.section_times) || {};
            const durationMins = sectionTimes['gd-round'] || 30;

            // Get GD topic (first question of gd-round module for this test)
            const [[topicRow]] = await pool.query(
                'SELECT id, content, category FROM comm_test_questions WHERE test_id = ? AND module_type = ? LIMIT 1',
                [testId, 'gd-round']
            );
            if (!topicRow) return res.status(400).json({ success: false, error: 'No GD topic found. Add a topic in Questions first.' });

            // Build AI participant names
            const aiNames = ['Alex (AI)', 'Jordan (AI)', 'Morgan (AI)', 'Taylor (AI)', 'Quinn (AI)', 'Riley (AI)', 'Casey (AI)'];
            const aiParticipants = aiNames.slice(0, participants - 1).map((name, i) => ({ id: `ai_${i}`, name, isAI: true }));

            res.json({
                success: true,
                topicId: topicRow.id,
                topic: topicRow.content,
                category: topicRow.category || 'General',
                participants: aiParticipants,
                durationMins,
                prepSeconds: 30,
            });
        } catch (err) {
            console.error('[gd] start error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /comm-test/gd/ai-turn  — generate AI participant's spoken response
    router.post('/comm-test/gd/ai-turn', authenticate, async (req, res) => {
        try {
            const { topic, aiName, previousTurns, stance } = req.body;
            if (!topic || !aiName) return res.status(400).json({ success: false, error: 'topic and aiName required' });

            const history = (previousTurns || []).slice(-6).map(t => `${t.speaker}: "${t.transcript}"`).join('\n');
            const prompt = `You are ${aiName}, a confident English speaker in a group discussion.
Topic: "${topic}"
Your stance: ${stance || 'balanced — consider multiple perspectives'}
${history ? `\nPrevious discussion:\n${history}` : ''}

Speak for 20-40 seconds as ${aiName}. Make a clear, focused point. Be conversational, not formal.
Respond ONLY with the spoken text — no labels, no JSON, just natural speech.`;

            const aiResponse = await cerebrasChat(
                [{ role: 'user', content: prompt }],
                { model: 'llama3.1-8b', temperature: 0.8, max_tokens: 200 }
            );
            const speech = (aiResponse.choices[0]?.message?.content || '').trim();
            res.json({ success: true, speech });
        } catch (err) {
            console.error('[gd] ai-turn error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /comm-test/gd/turn  — save one student speaking turn
    router.post('/comm-test/gd/turn', authenticate, async (req, res) => {
        try {
            const { sessionId, turnIndex, transcript, durationSec, topic } = req.body;
            if (!sessionId || !transcript) return res.status(400).json({ success: false, error: 'sessionId and transcript required' });
            const studentId = String(req.user.id);

            // Score the turn with AI — STRICT evaluation
            const wordCount = transcript.trim().split(/\s+/).length;
            const prompt = `You are an EXTREMELY STRICT English communication evaluator for a formal group discussion. Be harsh and realistic — do NOT give high scores unless the response is truly excellent.

Topic: "${topic || 'General Discussion'}"
Student said: "${transcript.trim()}"
Word count: ${wordCount}
Duration: ${durationSec || 0} seconds

Score on 3 criteria (0-100 each). Apply these STRICT rules:
1. Language quality (grammar, vocabulary richness, sentence structure):
   - Below 30: very poor grammar, extremely limited vocabulary
   - 30-50: frequent errors, basic vocabulary, simple sentences
   - 50-65: some errors, decent vocabulary, mix of simple/complex
   - 65-80: mostly correct, good vocabulary, well-structured
   - 80-100: near-perfect grammar, rich vocabulary, sophisticated expression
   PENALISE: filler words (um/uh/like/you know), sentence fragments, repetition
2. Pronunciation clarity (estimated from text quality, word choices, expression flow):
   - Short responses (<10 words) should score BELOW 40
   - Score higher for clear articulation indicators and varied expression
3. Content confidence (relevance to topic, assertiveness, clarity of argument):
   - Off-topic or vague: below 30
   - Partially relevant with weak argument: 30-50
   - Relevant but unstructured: 50-65
   - Clear relevant argument with reasoning: 65-80
   - Compelling, well-structured argument with evidence: 80-100

Respond ONLY with valid JSON:
{"languageScore":<0-100>,"pronunciationScore":<0-100>,"confidenceScore":<0-100>,"overallScore":<0-100>,"feedback":"<one sentence>"}`;

            let scores = { languageScore: 70, pronunciationScore: 70, confidenceScore: 70, overallScore: 70, feedback: 'Good contribution.' };
            try {
                const aiResp = await cerebrasChat([{ role: 'user', content: prompt }], { model: 'llama3.1-8b', temperature: 0.3, max_tokens: 200 });
                let raw = (aiResp.choices[0]?.message?.content || '{}').replace(/```json\s*|\s*```/g, '').trim();
                scores = { ...scores, ...JSON.parse(raw) };
            } catch {}

            await pool.query(
                `INSERT INTO comm_gd_turns (id, session_id, speaker, speaker_label, turn_index, transcript, duration_sec, language_score, pronunciation_score, confidence_score)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), sessionId, studentId, 'You (Student)', turnIndex || 0, transcript, durationSec || 0,
                 scores.languageScore, scores.pronunciationScore, scores.confidenceScore]
            );
            res.json({ success: true, ...scores });
        } catch (err) {
            console.error('[gd] turn error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // POST /comm-test/gd/conclude  — finalize GD, compute overall score, generate report
    router.post('/comm-test/gd/conclude', authenticate, async (req, res) => {
        try {
            const { sessionId, topic, aiTurns } = req.body;
            const studentId = String(req.user.id);

            const [studentTurns] = await pool.query(
                'SELECT * FROM comm_gd_turns WHERE session_id = ? ORDER BY turn_index ASC',
                [sessionId]
            );

            if (studentTurns.length === 0) {
                // Student never spoke — score 0
                await pool.query(
                    'UPDATE comm_test_sessions SET completed_at = NOW(), overall_score = 0 WHERE id = ? AND student_id = ?',
                    [sessionId, studentId]
                );
                return res.json({ success: true, overallScore: 0 });
            }

            const avgLang  = Math.round(studentTurns.reduce((s, t) => s + (t.language_score || 0), 0) / studentTurns.length);
            const avgPron  = Math.round(studentTurns.reduce((s, t) => s + (t.pronunciation_score || 0), 0) / studentTurns.length);
            const avgConf  = Math.round(studentTurns.reduce((s, t) => s + (t.confidence_score || 0), 0) / studentTurns.length);
            const participation = Math.min(100, studentTurns.length * 15); // up to 100 for ~7 turns
            const overallScore = Math.round((avgLang * 0.3) + (avgPron * 0.2) + (avgConf * 0.3) + (participation * 0.2));

            // Build full conversation for report (student + AI turns interleaved)
            const allTurns = studentTurns.map(t => ({
                speaker: 'student', speaker_label: t.speaker_label || 'You (Student)',
                transcript: t.transcript, turn_index: t.turn_index,
                language_score: t.language_score, pronunciation_score: t.pronunciation_score, confidence_score: t.confidence_score
            }));
            // Interleave AI turns from the request
            if (Array.isArray(aiTurns)) {
                aiTurns.forEach((text, i) => {
                    allTurns.push({ speaker: `ai_${i}`, speaker_label: `AI Panelist ${i + 1}`, transcript: text, turn_index: -1 });
                });
            }

            // Save to submissions table for unified reporting
            await pool.query(
                `INSERT INTO comm_test_submissions (id, session_id, student_id, module_type, question_id, transcribed_text, expected_text, score, max_score, feedback, ai_scores)
                 VALUES (?, ?, ?, 'gd-round', 0, ?, ?, ?, 100, ?, ?)`,
                [uuidv4(), sessionId, studentId,
                 JSON.stringify(studentTurns.map(t => t.transcript)),
                 topic || 'Group Discussion',
                 overallScore,
                 `${studentTurns.length} turn(s) — Language ${avgLang}%, Pronunciation ${avgPron}%, Confidence ${avgConf}%`,
                 JSON.stringify({ avgLang, avgPron, avgConf, participation, turns: allTurns, aiTurns: aiTurns || [] })]
            );

            await pool.query(
                'UPDATE comm_test_sessions SET completed_at = NOW(), overall_score = ? WHERE id = ? AND student_id = ?',
                [overallScore, sessionId, studentId]
            );

            res.json({ success: true, overallScore, avgLang, avgPron, avgConf, participation, turns: studentTurns.length });
        } catch (err) {
            console.error('[gd] conclude error:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // GET /comm-test/gd/report/:sessionId  — full GD report
    router.get('/comm-test/gd/report/:sessionId', authenticate, async (req, res) => {
        try {
            const { sessionId } = req.params;
            const studentId = String(req.user.id);

            const [turns] = await pool.query(
                'SELECT * FROM comm_gd_turns WHERE session_id = ? ORDER BY turn_index ASC',
                [sessionId]
            );
            const [[sub]] = await pool.query(
                `SELECT score, feedback, ai_scores, transcribed_text FROM comm_test_submissions
                 WHERE session_id = ? AND student_id = ? AND module_type = 'gd-round'`,
                [sessionId, studentId]
            );
            const aiScores = tryParse(sub?.ai_scores) || {};

            res.json({
                success: true,
                sessionId,
                turns,
                score: sub?.score || 0,
                feedback: sub?.feedback || '',
                avgLang: aiScores.avgLang || 0,
                avgPron: aiScores.avgPron || 0,
                avgConf: aiScores.avgConf || 0,
                participation: aiScores.participation || 0,
                aiTurns: aiScores.aiTurns || [],
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
};
