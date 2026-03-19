/**
 * Lab Exercise Routes
 * - Admin: CRUD, assign, status management, submission review
 * - Student: view assigned exercises, submit code, view own submissions
 * - AI evaluation via Cerebrass
 */

const express = require('express')
const router = express.Router()
const { v4: uuidv4 } = require('uuid')

module.exports = (pool, authenticate, cerebrasChat) => {

    const requireAdmin = (req, res, next) => {
        if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
        next()
    }

    // ─── TABLE INIT ───────────────────────────────────────────────────────────
    async function ensureTables() {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lab_exercises (
                id VARCHAR(36) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                lab_type VARCHAR(50) NOT NULL DEFAULT 'programming',
                language VARCHAR(50) DEFAULT 'none',
                max_attempts INT DEFAULT 3,
                time_limit INT DEFAULT 0,
                difficulty VARCHAR(20) DEFAULT 'medium',
                tags JSON,
                instructions TEXT,
                expected_output TEXT,
                evaluation_criteria TEXT,
                starter_code JSON,
                proctoring JSON,
                status VARCHAR(20) DEFAULT 'draft',
                created_by VARCHAR(36),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS lab_exercise_assignments (
                id VARCHAR(36) PRIMARY KEY,
                exercise_id VARCHAR(36) NOT NULL,
                student_id VARCHAR(36) NOT NULL,
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                due_date TIMESTAMP NULL,
                UNIQUE KEY unique_assignment (exercise_id, student_id)
            )
        `)

        await pool.query(`
            CREATE TABLE IF NOT EXISTS lab_exercise_submissions (
                id VARCHAR(36) PRIMARY KEY,
                exercise_id VARCHAR(36) NOT NULL,
                student_id VARCHAR(36) NOT NULL,
                files JSON NOT NULL,
                language VARCHAR(50),
                score INT DEFAULT 0,
                passed TINYINT DEFAULT 0,
                attempt_number INT DEFAULT 1,
                ai_feedback TEXT,
                ai_breakdown JSON,
                violations JSON,
                time_taken INT DEFAULT 0,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `)

        // Create indexes separately for TiDB/MySQL compatibility
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_le_status ON lab_exercises(status)',
            'CREATE INDEX IF NOT EXISTS idx_le_type ON lab_exercises(lab_type)',
            'CREATE INDEX IF NOT EXISTS idx_lea_exercise ON lab_exercise_assignments(exercise_id)',
            'CREATE INDEX IF NOT EXISTS idx_lea_student ON lab_exercise_assignments(student_id)',
            'CREATE INDEX IF NOT EXISTS idx_les_exercise ON lab_exercise_submissions(exercise_id)',
            'CREATE INDEX IF NOT EXISTS idx_les_student ON lab_exercise_submissions(student_id)',
        ]
        for (const sql of indexes) {
            try { await pool.query(sql) } catch (e) {
                if (!e.message.includes('Duplicate key') && !e.message.includes('already exists')) {
                    console.warn('[Lab Exercises] Index note:', e.message)
                }
            }
        }
    }

    ensureTables().catch(err => console.error('[Lab Exercises] Table init error:', err.message))

    // ─── HELPERS ──────────────────────────────────────────────────────────────
    function safeJson(val, fallback = null) {
        try {
            if (val == null) return fallback
            if (typeof val === 'object') return val
            return JSON.parse(val)
        } catch { return fallback }
    }

    async function evaluateWithAI(exercise, files, language) {
        const filesSummary = files.map(f =>
            `=== FILE: ${f.name} ===\n${(f.content || '').slice(0, 3000)}`
        ).join('\n\n')

        const prompt = `You are a strict code evaluator for a ${exercise.lab_type} lab exercise.

EXERCISE TITLE: ${exercise.title}
LAB TYPE: ${exercise.lab_type}
LANGUAGE: ${language || exercise.language || 'any'}
DESCRIPTION: ${exercise.description || ''}
INSTRUCTIONS: ${exercise.instructions || ''}
EXPECTED OUTPUT / REQUIREMENTS: ${exercise.expected_output || 'Based on the description'}
EVALUATION CRITERIA: ${exercise.evaluation_criteria || 'Correctness, code quality, and adherence to requirements'}

STUDENT SUBMISSION:
${filesSummary}

Evaluate the submission strictly. Return ONLY a valid JSON object with this exact structure:
{
  "score": <integer 0-100>,
  "passed": <true/false — pass if score >= 60>,
  "summary": "<1-2 sentence overall summary>",
  "breakdown": {
    "correctness": <0-40>,
    "code_quality": <0-20>,
    "requirements_met": <0-25>,
    "best_practices": <0-15>
  },
  "strengths": ["<strength 1>", "<strength 2>"],
  "issues": ["<issue 1>", "<issue 2>"],
  "suggestions": ["<suggestion 1>"],
  "missing_requirements": ["<what is missing if anything>"]
}`

        try {
            const response = await cerebrasChat([
                { role: 'system', content: 'You are a code evaluation engine. Always respond with valid JSON only. No markdown. No extra text.' },
                { role: 'user', content: prompt }
            ], { max_tokens: 1200, temperature: 0.2 })

            const text = response?.choices?.[0]?.message?.content || ''
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            if (!jsonMatch) throw new Error('No JSON in response')

            const result = JSON.parse(jsonMatch[0])
            result.score = Math.min(100, Math.max(0, parseInt(result.score) || 0))
            result.passed = result.score >= 60
            return result
        } catch (err) {
            console.error('[Lab AI Eval] Error:', err.message)
            return {
                score: 0,
                passed: false,
                summary: 'Evaluation could not be completed. Please try again.',
                breakdown: { correctness: 0, code_quality: 0, requirements_met: 0, best_practices: 0 },
                strengths: [],
                issues: ['AI evaluation failed - please contact administrator'],
                suggestions: [],
                missing_requirements: []
            }
        }
    }

    // ════════════════════════════════════════════════════════════════
    // ADMIN ROUTES
    // ════════════════════════════════════════════════════════════════

    // GET /api/admin/lab-exercises — list all
    router.get('/admin/lab-exercises', authenticate, requireAdmin, async (req, res) => {
        try {
            const { lab_type, status, search } = req.query
            let sql = 'SELECT le.*, COUNT(DISTINCT lea.student_id) as assigned_count, COUNT(DISTINCT les.id) as submission_count FROM lab_exercises le LEFT JOIN lab_exercise_assignments lea ON lea.exercise_id = le.id LEFT JOIN lab_exercise_submissions les ON les.exercise_id = le.id WHERE 1=1'
            const params = []
            if (lab_type) { sql += ' AND le.lab_type = ?'; params.push(lab_type) }
            if (status) { sql += ' AND le.status = ?'; params.push(status) }
            if (search) { sql += ' AND le.title LIKE ?'; params.push(`%${search}%`) }
            sql += ' GROUP BY le.id ORDER BY le.created_at DESC'
            const [rows] = await pool.query(sql, params)
            res.json({ exercises: rows.map(r => ({ ...r, tags: safeJson(r.tags, []), proctoring: safeJson(r.proctoring, {}), starter_code: safeJson(r.starter_code, []) })) })
        } catch (err) {
            console.error('[Lab] GET admin list:', err.message)
            res.status(500).json({ error: 'Failed to fetch exercises' })
        }
    })

    // GET /api/admin/lab-exercises/:id — single exercise detail
    router.get('/admin/lab-exercises/:id', authenticate, requireAdmin, async (req, res) => {
        try {
            const [[ex]] = await pool.query('SELECT * FROM lab_exercises WHERE id = ?', [req.params.id])
            if (!ex) return res.status(404).json({ error: 'Exercise not found' })

            const [assigned] = await pool.query(
                `SELECT lea.student_id, u.name, u.email FROM lab_exercise_assignments lea
                 JOIN users u ON u.id = lea.student_id WHERE lea.exercise_id = ?`,
                [req.params.id]
            )
            res.json({
                exercise: { ...ex, tags: safeJson(ex.tags, []), proctoring: safeJson(ex.proctoring, {}), starter_code: safeJson(ex.starter_code, []) },
                assigned_students: assigned
            })
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch exercise' })
        }
    })

    // POST /api/admin/lab-exercises — create
    router.post('/admin/lab-exercises', authenticate, requireAdmin, async (req, res) => {
        try {
            const {
                title, description, lab_type = 'programming', language = 'none',
                max_attempts = 3, time_limit = 0, difficulty = 'medium',
                tags = [], instructions = '', expected_output = '',
                evaluation_criteria = '', starter_code = [], proctoring = {}
            } = req.body

            if (!title?.trim()) return res.status(400).json({ error: 'Title is required' })
            if (!lab_type) return res.status(400).json({ error: 'Lab type is required' })

            const id = uuidv4()
            await pool.query(
                `INSERT INTO lab_exercises (id, title, description, lab_type, language, max_attempts,
                 time_limit, difficulty, tags, instructions, expected_output, evaluation_criteria,
                 starter_code, proctoring, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
                [id, title.trim(), description || '', lab_type, language, max_attempts, time_limit,
                 difficulty, JSON.stringify(tags), instructions, expected_output,
                 evaluation_criteria, JSON.stringify(starter_code), JSON.stringify(proctoring), req.user.id]
            )
            const [[created]] = await pool.query('SELECT * FROM lab_exercises WHERE id = ?', [id])
            res.status(201).json({ success: true, exercise: { ...created, tags: safeJson(created.tags, []), proctoring: safeJson(created.proctoring, {}), starter_code: safeJson(created.starter_code, []) } })
        } catch (err) {
            console.error('[Lab] POST create:', err.message)
            res.status(500).json({ error: 'Failed to create exercise' })
        }
    })

    // PUT /api/admin/lab-exercises/:id — update
    router.put('/admin/lab-exercises/:id', authenticate, requireAdmin, async (req, res) => {
        try {
            const {
                title, description, lab_type, language, max_attempts, time_limit,
                difficulty, tags, instructions, expected_output, evaluation_criteria, starter_code, proctoring
            } = req.body

            const [[ex]] = await pool.query('SELECT id FROM lab_exercises WHERE id = ?', [req.params.id])
            if (!ex) return res.status(404).json({ error: 'Exercise not found' })

            await pool.query(
                `UPDATE lab_exercises SET title=?, description=?, lab_type=?, language=?, max_attempts=?,
                 time_limit=?, difficulty=?, tags=?, instructions=?, expected_output=?, evaluation_criteria=?,
                 starter_code=?, proctoring=?, updated_at=NOW() WHERE id=?`,
                [title, description || '', lab_type, language, max_attempts, time_limit, difficulty,
                 JSON.stringify(tags || []), instructions || '', expected_output || '',
                 evaluation_criteria || '', JSON.stringify(starter_code || []),
                 JSON.stringify(proctoring || {}), req.params.id]
            )
            const [[updated]] = await pool.query('SELECT * FROM lab_exercises WHERE id = ?', [req.params.id])
            res.json({ success: true, exercise: { ...updated, tags: safeJson(updated.tags, []), proctoring: safeJson(updated.proctoring, {}), starter_code: safeJson(updated.starter_code, []) } })
        } catch (err) {
            console.error('[Lab] PUT update:', err.message)
            res.status(500).json({ error: 'Failed to update exercise' })
        }
    })

    // DELETE /api/admin/lab-exercises/:id
    router.delete('/admin/lab-exercises/:id', authenticate, requireAdmin, async (req, res) => {
        try {
            await pool.query('DELETE FROM lab_exercise_assignments WHERE exercise_id = ?', [req.params.id])
            await pool.query('DELETE FROM lab_exercise_submissions WHERE exercise_id = ?', [req.params.id])
            await pool.query('DELETE FROM lab_exercises WHERE id = ?', [req.params.id])
            res.json({ success: true })
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete exercise' })
        }
    })

    // PUT /api/admin/lab-exercises/:id/status — live / end / draft
    router.put('/admin/lab-exercises/:id/status', authenticate, requireAdmin, async (req, res) => {
        try {
            const { status } = req.body
            if (!['draft', 'active', 'ended'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
            await pool.query('UPDATE lab_exercises SET status=?, updated_at=NOW() WHERE id=?', [status, req.params.id])
            res.json({ success: true, status })
        } catch (err) {
            res.status(500).json({ error: 'Failed to update status' })
        }
    })

    // POST /api/admin/lab-exercises/:id/assign — assign to students
    router.post('/admin/lab-exercises/:id/assign', authenticate, requireAdmin, async (req, res) => {
        try {
            const { student_ids = [], due_date = null } = req.body
            if (!Array.isArray(student_ids) || student_ids.length === 0) {
                return res.status(400).json({ error: 'student_ids array required' })
            }

            const [[ex]] = await pool.query('SELECT id, status FROM lab_exercises WHERE id = ?', [req.params.id])
            if (!ex) return res.status(404).json({ error: 'Exercise not found' })

            let assigned = 0, skipped = 0
            for (const sid of student_ids) {
                try {
                    await pool.query(
                        'INSERT IGNORE INTO lab_exercise_assignments (id, exercise_id, student_id, due_date) VALUES (?, ?, ?, ?)',
                        [uuidv4(), req.params.id, sid, due_date]
                    )
                    assigned++
                } catch { skipped++ }
            }
            res.json({ success: true, assigned, skipped })
        } catch (err) {
            console.error('[Lab] POST assign:', err.message)
            res.status(500).json({ error: 'Failed to assign exercise' })
        }
    })

    // DELETE /api/admin/lab-exercises/:id/assign/:studentId — unassign
    router.delete('/admin/lab-exercises/:id/assign/:studentId', authenticate, requireAdmin, async (req, res) => {
        try {
            await pool.query(
                'DELETE FROM lab_exercise_assignments WHERE exercise_id=? AND student_id=?',
                [req.params.id, req.params.studentId]
            )
            res.json({ success: true })
        } catch (err) {
            res.status(500).json({ error: 'Failed to unassign' })
        }
    })

    // GET /api/admin/lab-submissions — all submissions with filters
    router.get('/admin/lab-submissions', authenticate, requireAdmin, async (req, res) => {
        try {
            const { exercise_id, status, language, search, page = 1, limit = 50 } = req.query
            let sql = `
                SELECT les.*, le.title as exercise_title, le.lab_type, le.language as exercise_language,
                       u.name as student_name, u.email as student_email
                FROM lab_exercise_submissions les
                JOIN lab_exercises le ON le.id = les.exercise_id
                JOIN users u ON u.id = les.student_id
                WHERE 1=1
            `
            const params = []
            if (exercise_id) { sql += ' AND les.exercise_id = ?'; params.push(exercise_id) }
            if (language) { sql += ' AND les.language = ?'; params.push(language) }
            if (status === 'passed') { sql += ' AND les.passed = 1' }
            if (status === 'failed') { sql += ' AND les.passed = 0' }
            if (search) { sql += ' AND (u.name LIKE ? OR le.title LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
            sql += ' ORDER BY les.submitted_at DESC'

            const offset = (parseInt(page) - 1) * parseInt(limit)
            const [rows] = await pool.query(sql + ` LIMIT ${parseInt(limit)} OFFSET ${offset}`, params)
            const [[{ total }]] = await pool.query(
                `SELECT COUNT(*) as total FROM lab_exercise_submissions les JOIN lab_exercises le ON le.id = les.exercise_id JOIN users u ON u.id = les.student_id WHERE 1=1`,
                []
            )

            res.json({
                submissions: rows.map(r => ({
                    ...r,
                    files: safeJson(r.files, []),
                    ai_breakdown: safeJson(r.ai_breakdown, {}),
                    violations: safeJson(r.violations, [])
                })),
                total,
                page: parseInt(page),
                pages: Math.ceil(total / parseInt(limit))
            })
        } catch (err) {
            console.error('[Lab] GET admin submissions:', err.message)
            res.status(500).json({ error: 'Failed to fetch submissions' })
        }
    })

    // DELETE /api/admin/lab-submissions/:id
    router.delete('/admin/lab-submissions/:id', authenticate, requireAdmin, async (req, res) => {
        try {
            await pool.query('DELETE FROM lab_exercise_submissions WHERE id = ?', [req.params.id])
            res.json({ success: true })
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete submission' })
        }
    })

    // GET /api/admin/lab-students — all students for assignment modal
    router.get('/admin/lab-students', authenticate, requireAdmin, async (req, res) => {
        try {
            const [students] = await pool.query(
                "SELECT id, name, email FROM users WHERE role='student' ORDER BY name"
            )
            res.json({ students })
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch students' })
        }
    })

    // GET /api/admin/lab-stats — dashboard stats
    router.get('/admin/lab-stats', authenticate, requireAdmin, async (req, res) => {
        try {
            const [[{ total_exercises }]] = await pool.query('SELECT COUNT(*) as total_exercises FROM lab_exercises')
            const [[{ active_exercises }]] = await pool.query("SELECT COUNT(*) as active_exercises FROM lab_exercises WHERE status='active'")
            const [[{ total_submissions }]] = await pool.query('SELECT COUNT(*) as total_submissions FROM lab_exercise_submissions')
            const [[{ passed_submissions }]] = await pool.query('SELECT COUNT(*) as passed_submissions FROM lab_exercise_submissions WHERE passed=1')

            const [lab_type_stats] = await pool.query(
                'SELECT lab_type, COUNT(*) as count FROM lab_exercises GROUP BY lab_type'
            )

            res.json({
                total_exercises,
                active_exercises,
                total_submissions,
                passed_submissions,
                pass_rate: total_submissions > 0 ? Math.round((passed_submissions / total_submissions) * 100) : 0,
                lab_type_stats
            })
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch stats' })
        }
    })

    // ════════════════════════════════════════════════════════════════
    // STUDENT ROUTES
    // ════════════════════════════════════════════════════════════════

    // GET /api/student/lab-exercises — get assigned exercises for logged-in student
    router.get('/student/lab-exercises', authenticate, async (req, res) => {
        try {
            const studentId = req.user.id
            const [rows] = await pool.query(
                `SELECT le.*, lea.assigned_at, lea.due_date,
                        COUNT(les.id) as submissions_count,
                        MAX(les.score) as best_score,
                        MAX(les.passed) as ever_passed,
                        MAX(les.attempt_number) as attempts_used
                 FROM lab_exercises le
                 JOIN lab_exercise_assignments lea ON lea.exercise_id = le.id
                 LEFT JOIN lab_exercise_submissions les ON les.exercise_id = le.id AND les.student_id = ?
                 WHERE lea.student_id = ? AND le.status IN ('active', 'ended')
                 GROUP BY le.id, lea.assigned_at, lea.due_date
                 ORDER BY lea.assigned_at DESC`,
                [studentId, studentId]
            )
            res.json({
                exercises: rows.map(r => ({
                    ...r,
                    tags: safeJson(r.tags, []),
                    proctoring: safeJson(r.proctoring, {}),
                    starter_code: safeJson(r.starter_code, [])
                }))
            })
        } catch (err) {
            console.error('[Lab] GET student exercises:', err.message)
            res.status(500).json({ error: 'Failed to fetch exercises' })
        }
    })

    // GET /api/student/lab-exercises/:id — exercise detail for student
    router.get('/student/lab-exercises/:id', authenticate, async (req, res) => {
        try {
            const studentId = req.user.id
            const [[assignment]] = await pool.query(
                'SELECT 1 FROM lab_exercise_assignments WHERE exercise_id=? AND student_id=?',
                [req.params.id, studentId]
            )
            if (!assignment) return res.status(403).json({ error: 'Not assigned to this exercise' })

            const [[ex]] = await pool.query(
                "SELECT * FROM lab_exercises WHERE id = ? AND status IN ('active', 'ended')",
                [req.params.id]
            )
            if (!ex) return res.status(404).json({ error: 'Exercise not found or not available' })

            const [submissions] = await pool.query(
                'SELECT id, score, passed, attempt_number, submitted_at FROM lab_exercise_submissions WHERE exercise_id=? AND student_id=? ORDER BY attempt_number',
                [req.params.id, studentId]
            )

            res.json({
                exercise: { ...ex, tags: safeJson(ex.tags, []), proctoring: safeJson(ex.proctoring, {}), starter_code: safeJson(ex.starter_code, []) },
                submissions
            })
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch exercise' })
        }
    })

    // POST /api/student/lab-exercises/:id/submit — submit code for evaluation
    router.post('/student/lab-exercises/:id/submit', authenticate, async (req, res) => {
        try {
            const studentId = req.user.id
            const { files = [], language = '', time_taken = 0, violations = [] } = req.body

            if (!files.length) return res.status(400).json({ error: 'No files provided' })

            const [[assignment]] = await pool.query(
                'SELECT 1 FROM lab_exercise_assignments WHERE exercise_id=? AND student_id=?',
                [req.params.id, studentId]
            )
            if (!assignment) return res.status(403).json({ error: 'Not assigned to this exercise' })

            const [[ex]] = await pool.query(
                "SELECT * FROM lab_exercises WHERE id = ? AND status = 'active'",
                [req.params.id]
            )
            if (!ex) return res.status(400).json({ error: 'Exercise is not active' })

            // Count existing attempts
            const [[{ attempts_used }]] = await pool.query(
                'SELECT COUNT(*) as attempts_used FROM lab_exercise_submissions WHERE exercise_id=? AND student_id=?',
                [req.params.id, studentId]
            )

            if (attempts_used >= ex.max_attempts) {
                return res.status(400).json({ error: `Maximum ${ex.max_attempts} attempts reached` })
            }

            const attempt_number = attempts_used + 1

            // Sanitize file content (limit size)
            const sanitizedFiles = files.map(f => ({
                name: String(f.name || 'file').replace(/[<>:"|?*]/g, '_').slice(0, 100),
                content: String(f.content || '').slice(0, 50000)
            }))

            // Run AI evaluation
            const evaluation = await evaluateWithAI(ex, sanitizedFiles, language || ex.language)

            const submissionId = uuidv4()
            await pool.query(
                `INSERT INTO lab_exercise_submissions
                 (id, exercise_id, student_id, files, language, score, passed, attempt_number,
                  ai_feedback, ai_breakdown, violations, time_taken)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    submissionId, req.params.id, studentId,
                    JSON.stringify(sanitizedFiles),
                    language || ex.language,
                    evaluation.score,
                    evaluation.passed ? 1 : 0,
                    attempt_number,
                    evaluation.summary,
                    JSON.stringify(evaluation.breakdown || {}),
                    JSON.stringify(violations),
                    time_taken
                ]
            )

            res.json({
                success: true,
                submission_id: submissionId,
                score: evaluation.score,
                passed: evaluation.passed,
                attempt_number,
                attempts_remaining: ex.max_attempts - attempt_number,
                feedback: {
                    summary: evaluation.summary,
                    breakdown: evaluation.breakdown,
                    strengths: evaluation.strengths || [],
                    issues: evaluation.issues || [],
                    suggestions: evaluation.suggestions || [],
                    missing_requirements: evaluation.missing_requirements || []
                }
            })
        } catch (err) {
            console.error('[Lab] POST submit:', err.message)
            res.status(500).json({ error: 'Submission failed: ' + err.message })
        }
    })

    // GET /api/student/lab-submissions — student's own submission history
    router.get('/student/lab-submissions', authenticate, async (req, res) => {
        try {
            const studentId = req.user.id
            const { exercise_id } = req.query
            let sql = `
                SELECT les.*, le.title as exercise_title, le.lab_type, le.language as exercise_language
                FROM lab_exercise_submissions les
                JOIN lab_exercises le ON le.id = les.exercise_id
                WHERE les.student_id = ?
            `
            const params = [studentId]
            if (exercise_id) { sql += ' AND les.exercise_id = ?'; params.push(exercise_id) }
            sql += ' ORDER BY les.submitted_at DESC'

            const [rows] = await pool.query(sql, params)
            res.json({
                submissions: rows.map(r => ({
                    ...r,
                    files: safeJson(r.files, []),
                    ai_breakdown: safeJson(r.ai_breakdown, {}),
                    violations: safeJson(r.violations, [])
                }))
            })
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch submissions' })
        }
    })

    // GET /api/student/lab-submissions/:id — single submission report
    router.get('/student/lab-submissions/:id', authenticate, async (req, res) => {
        try {
            const [[sub]] = await pool.query(
                `SELECT les.*, le.title as exercise_title, le.lab_type, le.description as exercise_description
                 FROM lab_exercise_submissions les
                 JOIN lab_exercises le ON le.id = les.exercise_id
                 WHERE les.id = ? AND les.student_id = ?`,
                [req.params.id, req.user.id]
            )
            if (!sub) return res.status(404).json({ error: 'Submission not found' })
            res.json({
                submission: {
                    ...sub,
                    files: safeJson(sub.files, []),
                    ai_breakdown: safeJson(sub.ai_breakdown, {}),
                    violations: safeJson(sub.violations, [])
                }
            })
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch submission' })
        }
    })

    return router
}
