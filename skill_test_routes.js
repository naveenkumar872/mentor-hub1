/**
 * Skill Test Routes - Backend API for AI-powered assessment system
 * Handles: test creation, MCQ, Coding, SQL, Interview, Reports, Proctoring
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    generateMCQQuestions,
    generateCodingProblems,
    generateSQLProblems,
    generateInterviewQuestion,
    evaluateInterviewAnswer,
    generateFinalReport
} = require('./ai_service');

function registerSkillTestRoutes(app, pool) {

    // ════════════════════════════════════════
    //  ADMIN: CREATE / MANAGE SKILL TESTS
    // ════════════════════════════════════════

    // Create a new skill test
    app.post('/api/skill-tests/create', async (req, res) => {
        try {
            const { title, description, skills, mcq_count, coding_count, sql_count, interview_count,
                attempt_limit, mcq_duration_minutes, mcq_passing_score, coding_passing_score,
                sql_passing_score, interview_passing_score, created_by, difficulty_level,
                proctoring_enabled, proctoring_config } = req.body;

            if (!title || !skills || !Array.isArray(skills) || skills.length === 0) {
                return res.status(400).json({ error: 'Title and at least one skill are required' });
            }

            const [result] = await pool.query(
                `INSERT INTO skill_tests (title, description, skills, mcq_count, coding_count, sql_count, 
                 interview_count, attempt_limit, mcq_duration_minutes, mcq_passing_score, coding_passing_score,
                 sql_passing_score, interview_passing_score, created_by, difficulty_level, proctoring_enabled, proctoring_config)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [title, description || '', JSON.stringify(skills), mcq_count || 10, coding_count || 3,
                    sql_count || 3, interview_count || 5, attempt_limit || 1, mcq_duration_minutes || 30,
                    mcq_passing_score || 60, coding_passing_score || 50, sql_passing_score || 50,
                    interview_passing_score || 6, created_by || 'admin', difficulty_level || 'mixed',
                    proctoring_enabled !== false, proctoring_config ? JSON.stringify(proctoring_config) : JSON.stringify({ camera: true, mic: true, fullscreen: true, paste_disabled: true, face_detection: true, camera_block_detect: true, phone_detect: true })]
            );

            res.json({ success: true, testId: result.insertId });
        } catch (err) {
            console.error('Create skill test error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Get all skill tests (admin)
    app.get('/api/skill-tests/all', async (req, res) => {
        try {
            const [tests] = await pool.query('SELECT * FROM skill_tests ORDER BY created_at DESC');
            const parsed = tests.map(t => ({
                ...t,
                skills: typeof t.skills === 'string' ? JSON.parse(t.skills) : t.skills,
                proctoring_config: t.proctoring_config ? (typeof t.proctoring_config === 'string' ? JSON.parse(t.proctoring_config) : t.proctoring_config) : null
            }));

            // Get attempt counts per test
            for (const test of parsed) {
                const [counts] = await pool.query(
                    `SELECT COUNT(*) as total, SUM(overall_status = 'completed') as completed,
                     SUM(overall_status = 'failed') as failed
                     FROM skill_test_attempts WHERE test_id = ?`, [test.id]
                );
                test.attempt_stats = counts[0] || { total: 0, completed: 0, failed: 0 };
            }

            res.json(parsed);
        } catch (err) {
            console.error('Get skill tests error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Toggle test active/inactive
    app.put('/api/skill-tests/:id/toggle', async (req, res) => {
        try {
            const [test] = await pool.query('SELECT is_active FROM skill_tests WHERE id = ?', [req.params.id]);
            if (!test.length) return res.status(404).json({ error: 'Test not found' });

            await pool.query('UPDATE skill_tests SET is_active = ? WHERE id = ?', [!test[0].is_active, req.params.id]);
            res.json({ success: true, is_active: !test[0].is_active });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Delete a skill test
    app.delete('/api/skill-tests/:id', async (req, res) => {
        try {
            await pool.query('DELETE FROM skill_tests WHERE id = ?', [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get all attempts for a test (admin view)
    app.get('/api/skill-tests/:id/attempts', async (req, res) => {
        try {
            const [attempts] = await pool.query(
                `SELECT id, student_id, student_name, attempt_number, current_stage, overall_status,
                 mcq_score, mcq_status, coding_score, coding_status, sql_score, sql_status,
                 interview_score, interview_status, created_at
                 FROM skill_test_attempts WHERE test_id = ? ORDER BY created_at DESC`,
                [req.params.id]
            );
            res.json(attempts);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  STUDENT: VIEW AVAILABLE TESTS
    // ════════════════════════════════════════

    // Get active tests for students
    app.get('/api/skill-tests/student/available', async (req, res) => {
        try {
            const studentId = req.query.studentId;
            const [tests] = await pool.query('SELECT * FROM skill_tests WHERE is_active = TRUE ORDER BY created_at DESC');
            const parsed = tests.map(t => ({
                ...t,
                skills: typeof t.skills === 'string' ? JSON.parse(t.skills) : t.skills,
                proctoring_config: t.proctoring_config ? (typeof t.proctoring_config === 'string' ? JSON.parse(t.proctoring_config) : t.proctoring_config) : null
            }));

            // Get student's attempts for each test
            if (studentId) {
                for (const test of parsed) {
                    const [attempts] = await pool.query(
                        `SELECT id, attempt_number, current_stage, overall_status, mcq_score, mcq_status,
                         coding_score, coding_status, sql_score, sql_status, interview_score, interview_status
                         FROM skill_test_attempts WHERE test_id = ? AND student_id = ? ORDER BY attempt_number DESC`,
                        [test.id, studentId]
                    );
                    test.my_attempts = attempts;
                    test.attempts_used = attempts.length;
                    test.can_attempt = attempts.length < test.attempt_limit &&
                        !attempts.some(a => a.overall_status === 'in_progress');
                }
            }

            res.json(parsed);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  STUDENT: START / GET ATTEMPT
    // ════════════════════════════════════════

    // Start a new attempt (generates MCQ questions)
    app.post('/api/skill-tests/:testId/start', async (req, res) => {
        try {
            const { studentId, studentName } = req.body;
            const testId = req.params.testId;

            const [tests] = await pool.query('SELECT * FROM skill_tests WHERE id = ? AND is_active = TRUE', [testId]);
            if (!tests.length) return res.status(404).json({ error: 'Test not found or inactive' });
            const test = tests[0];
            const skills = typeof test.skills === 'string' ? JSON.parse(test.skills) : test.skills;

            // Check attempt limit
            const [existing] = await pool.query(
                'SELECT COUNT(*) as cnt FROM skill_test_attempts WHERE test_id = ? AND student_id = ?', [testId, studentId]
            );
            if (existing[0].cnt >= test.attempt_limit) {
                return res.status(400).json({ error: 'Attempt limit reached' });
            }

            // Check for existing in-progress attempt
            const [inProgress] = await pool.query(
                `SELECT id FROM skill_test_attempts WHERE test_id = ? AND student_id = ? AND overall_status = 'in_progress'`,
                [testId, studentId]
            );
            if (inProgress.length > 0) {
                return res.json({ success: true, attemptId: inProgress[0].id, resumed: true });
            }

            // Generate MCQ questions
            const mcqQuestions = await generateMCQQuestions(skills, test.mcq_count);

            const attemptNumber = existing[0].cnt + 1;
            const [result] = await pool.query(
                `INSERT INTO skill_test_attempts (test_id, student_id, student_name, attempt_number, 
                 mcq_questions, mcq_answers, coding_submissions, sql_submissions, interview_qa)
                 VALUES (?, ?, ?, ?, ?, '{}', '{}', '{}', '[]')`,
                [testId, studentId, studentName || 'Student', attemptNumber, JSON.stringify(mcqQuestions)]
            );

            res.json({ success: true, attemptId: result.insertId });
        } catch (err) {
            console.error('Start attempt error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Get attempt status/info
    app.get('/api/skill-tests/attempt/:attemptId', async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT a.*, t.title, t.skills, t.mcq_count, t.coding_count, t.sql_count, t.interview_count,
                 t.mcq_duration_minutes, t.mcq_passing_score, t.coding_passing_score, t.sql_passing_score,
                 t.interview_passing_score, t.proctoring_enabled, t.proctoring_config
                 FROM skill_test_attempts a JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?`,
                [req.params.attemptId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });

            const attempt = rows[0];
            // Parse JSON fields
            ['skills', 'mcq_questions', 'mcq_answers', 'coding_problems', 'coding_submissions',
                'sql_problems', 'sql_submissions', 'interview_qa', 'report', 'proctoring_config'].forEach(f => {
                    if (attempt[f] && typeof attempt[f] === 'string') {
                        try { attempt[f] = JSON.parse(attempt[f]); } catch { }
                    }
                });

            res.json(attempt);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  MCQ TEST
    // ════════════════════════════════════════

    // Start MCQ (return questions without answers)
    app.post('/api/skill-tests/mcq/start/:attemptId', async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT a.*, t.mcq_duration_minutes FROM skill_test_attempts a 
                 JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?`, [req.params.attemptId]
            );
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = rows[0];

            if (['passed', 'failed'].includes(attempt.mcq_status) && attempt.mcq_status !== 'pending') {
                if (attempt.mcq_status !== 'in_progress') {
                    return res.status(400).json({ error: 'MCQ already completed' });
                }
            }

            let endTime = attempt.mcq_end_time;
            if (attempt.mcq_status === 'pending') {
                const now = new Date();
                endTime = new Date(now.getTime() + attempt.mcq_duration_minutes * 60000);
                await pool.query(
                    `UPDATE skill_test_attempts SET mcq_status = 'in_progress', mcq_start_time = ?, mcq_end_time = ? WHERE id = ?`,
                    [now, endTime, attempt.id]
                );
            }

            const questions = typeof attempt.mcq_questions === 'string' ? JSON.parse(attempt.mcq_questions) : attempt.mcq_questions;
            // Strip correct answers
            const safeQuestions = (questions || []).map(q => {
                const { correct_answer, explanation, ...safe } = q;
                return safe;
            });

            const existingAnswers = typeof attempt.mcq_answers === 'string' ? JSON.parse(attempt.mcq_answers) : attempt.mcq_answers;

            res.json({
                questions: safeQuestions,
                duration_minutes: attempt.mcq_duration_minutes,
                end_time: endTime,
                existing_answers: existingAnswers || {}
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Submit MCQ answers
    app.post('/api/skill-tests/mcq/submit', async (req, res) => {
        try {
            const { attemptId, answers } = req.body;

            const [rows] = await pool.query(
                `SELECT a.*, t.mcq_passing_score, t.skills FROM skill_test_attempts a 
                 JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?`, [attemptId]);
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = rows[0];

            if (['passed', 'failed'].includes(attempt.mcq_status)) {
                return res.status(400).json({ error: 'MCQ already submitted' });
            }

            const questions = typeof attempt.mcq_questions === 'string' ? JSON.parse(attempt.mcq_questions) : attempt.mcq_questions;
            let correct = 0;
            const total = questions.length;

            for (const q of questions) {
                const qId = String(q.id);
                const studentAnswer = answers[qId];
                // Support both letter (A/B/C/D) and index (0/1/2/3) formats
                let isCorrect = false;
                if (studentAnswer !== undefined && studentAnswer !== null) {
                    const letterToIndex = { A: 0, B: 1, C: 2, D: 3 };
                    const studentIdx = typeof studentAnswer === 'string' && letterToIndex[studentAnswer.toUpperCase()] !== undefined
                        ? letterToIndex[studentAnswer.toUpperCase()] : Number(studentAnswer);
                    const correctIdx = typeof q.correct_answer === 'string' && letterToIndex[q.correct_answer.toUpperCase()] !== undefined
                        ? letterToIndex[q.correct_answer.toUpperCase()] : Number(q.correct_answer);
                    isCorrect = studentIdx === correctIdx;
                }
                if (isCorrect) correct++;
            }

            const score = total > 0 ? (correct / total * 100) : 0;
            const passed = score >= (attempt.mcq_passing_score || 60);
            const status = passed ? 'passed' : 'failed';

            if (passed) {
                // Generate coding problems for next stage
                const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
                const [testInfo] = await pool.query('SELECT coding_count, difficulty_level FROM skill_tests WHERE id = ?', [attempt.test_id]);
                const codingCount = parseInt(testInfo[0]?.coding_count) || 3;
                const diffLevel = testInfo[0]?.difficulty_level || 'mixed';
                const codingProblems = await generateCodingProblems(skills, codingCount, diffLevel);

                await pool.query(
                    `UPDATE skill_test_attempts SET mcq_answers = ?, mcq_score = ?, mcq_status = ?,
                     current_stage = 'coding', coding_problems = ? WHERE id = ?`,
                    [JSON.stringify(answers), score, status, JSON.stringify(codingProblems), attemptId]
                );
            } else {
                // Failed - generate report and end
                await pool.query(
                    `UPDATE skill_test_attempts SET mcq_answers = ?, mcq_score = ?, mcq_status = ?,
                     current_stage = 'completed', overall_status = 'failed' WHERE id = ?`,
                    [JSON.stringify(answers), score, status, attemptId]
                );
                // Generate report async
                generateAndSaveReport(pool, attemptId).catch(err => console.error('Report gen error:', err));
            }

            res.json({ success: true, score, correct, total, passed, status });
        } catch (err) {
            console.error('Submit MCQ error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  CODING TEST
    // ════════════════════════════════════════

    // Start coding test
    app.post('/api/skill-tests/coding/start/:attemptId', async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT a.*, t.coding_count FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?`, [req.params.attemptId]);
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = rows[0];

            if (attempt.mcq_status !== 'passed') return res.status(400).json({ error: 'Must pass MCQ first' });

            if (attempt.coding_status === 'pending') {
                await pool.query(`UPDATE skill_test_attempts SET coding_status = 'in_progress' WHERE id = ?`, [attempt.id]);
            }

            let problems = typeof attempt.coding_problems === 'string' ? JSON.parse(attempt.coding_problems) : attempt.coding_problems;
            const submissions = typeof attempt.coding_submissions === 'string' ? JSON.parse(attempt.coding_submissions) : attempt.coding_submissions;

            // Enforce coding_count from test config (trim if more problems than configured)
            const configuredCount = parseInt(attempt.coding_count) || 3;
            if (problems && Array.isArray(problems) && problems.length > configuredCount) {
                problems = problems.slice(0, configuredCount);
                // Also update DB so finish route uses correct count
                await pool.query('UPDATE skill_test_attempts SET coding_problems = ? WHERE id = ?',
                    [JSON.stringify(problems), attempt.id]);
            }

            res.json({ problems: problems || [], existing_submissions: submissions || {} });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Run code (sandbox execution)
    app.post('/api/skill-tests/coding/run', async (req, res) => {
        try {
            const { code, language, input_data } = req.body;
            const result = await executeCode(code, language, input_data || '');
            res.json(result);
        } catch (err) {
            res.json({ success: false, error: err.message });
        }
    });

    // Submit code for a problem
    app.post('/api/skill-tests/coding/submit', async (req, res) => {
        try {
            const { attemptId, problemId, code, language } = req.body;

            const [rows] = await pool.query('SELECT * FROM skill_test_attempts WHERE id = ?', [attemptId]);
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = rows[0];

            const problems = typeof attempt.coding_problems === 'string' ? JSON.parse(attempt.coding_problems) : attempt.coding_problems;
            const problem = problems.find(p => p.id === problemId);
            if (!problem) return res.status(404).json({ error: 'Problem not found' });

            // Run test cases
            const testResults = [];
            let allPassed = true;
            for (const tc of (problem.test_cases || [])) {
                const result = await executeCode(code, language, tc.input);
                const output = (result.output || '').trim();
                const expected = (tc.expected_output || '').trim();
                const passed = output === expected;
                if (!passed) allPassed = false;
                testResults.push({ input: tc.input, expected, actual: output, passed });
            }

            // Save submission
            const submissions = typeof attempt.coding_submissions === 'string' ? JSON.parse(attempt.coding_submissions) : (attempt.coding_submissions || {});
            if (allPassed) {
                submissions[String(problemId)] = { code, language, passed: true, testResults };
            }
            await pool.query('UPDATE skill_test_attempts SET coding_submissions = ? WHERE id = ?',
                [JSON.stringify(submissions), attemptId]);

            res.json({ success: true, all_passed: allPassed, test_results: testResults });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Finish coding test
    app.post('/api/skill-tests/coding/finish/:attemptId', async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT a.*, t.coding_passing_score, t.sql_count, t.skills FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?`, [req.params.attemptId]);
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = rows[0];

            const problems = typeof attempt.coding_problems === 'string' ? JSON.parse(attempt.coding_problems) : (attempt.coding_problems || []);
            const submissions = typeof attempt.coding_submissions === 'string' ? JSON.parse(attempt.coding_submissions) : (attempt.coding_submissions || {});

            const solved = Object.keys(submissions).length;
            const total = problems.length;
            const score = total > 0 ? (solved / total * 100) : 0;
            const passed = score >= (attempt.coding_passing_score || 50);
            const status = passed ? 'passed' : 'failed';

            if (passed) {
                // Generate SQL problems for next stage
                const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
                const sqlProblems = await generateSQLProblems(skills, attempt.sql_count || 3);

                await pool.query(
                    `UPDATE skill_test_attempts SET coding_score = ?, coding_status = ?,
                     current_stage = 'sql', sql_problems = ? WHERE id = ?`,
                    [score, status, JSON.stringify(sqlProblems), attempt.id]
                );
            } else {
                await pool.query(
                    `UPDATE skill_test_attempts SET coding_score = ?, coding_status = ?,
                     current_stage = 'completed', overall_status = 'failed' WHERE id = ?`,
                    [score, status, attempt.id]
                );
                generateAndSaveReport(pool, attempt.id).catch(err => console.error('Report gen error:', err));
            }

            res.json({ success: true, score, solved, total, passed, status });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  SQL TEST
    // ════════════════════════════════════════

    // Start SQL test
    app.post('/api/skill-tests/sql/start/:attemptId', async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM skill_test_attempts WHERE id = ?', [req.params.attemptId]);
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = rows[0];

            if (attempt.coding_status !== 'passed') return res.status(400).json({ error: 'Must pass coding first' });

            if (attempt.sql_status === 'pending') {
                await pool.query(`UPDATE skill_test_attempts SET sql_status = 'in_progress' WHERE id = ?`, [attempt.id]);
            }

            const problems = typeof attempt.sql_problems === 'string' ? JSON.parse(attempt.sql_problems) : attempt.sql_problems;
            const submissions = typeof attempt.sql_submissions === 'string' ? JSON.parse(attempt.sql_submissions) : attempt.sql_submissions;

            res.json({ problems: problems || [], existing_submissions: submissions || {} });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Run SQL query against sandbox
    app.post('/api/skill-tests/sql/run', async (req, res) => {
        try {
            const { query } = req.body;
            const result = await executeSQLSandbox(query);
            res.json(result);
        } catch (err) {
            res.json({ success: false, error: err.message });
        }
    });

    // Evaluate SQL query
    app.post('/api/skill-tests/sql/evaluate', async (req, res) => {
        try {
            const { attemptId, problemId, query } = req.body;

            const [rows] = await pool.query('SELECT * FROM skill_test_attempts WHERE id = ?', [attemptId]);
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = rows[0];

            const problems = typeof attempt.sql_problems === 'string' ? JSON.parse(attempt.sql_problems) : attempt.sql_problems;
            const problem = problems.find(p => p.id === problemId);
            if (!problem) return res.status(404).json({ error: 'Problem not found' });

            // Run student query and reference query
            const studentResult = await executeSQLSandbox(query);
            const referenceResult = await executeSQLSandbox(problem.reference_query);

            // Compare results
            const passed = studentResult.success && referenceResult.success &&
                JSON.stringify(studentResult.rows) === JSON.stringify(referenceResult.rows);

            // Save submission
            const submissions = typeof attempt.sql_submissions === 'string' ? JSON.parse(attempt.sql_submissions) : (attempt.sql_submissions || {});
            submissions[String(problemId)] = { query, passed, studentRows: studentResult.rows?.length || 0 };
            await pool.query('UPDATE skill_test_attempts SET sql_submissions = ? WHERE id = ?',
                [JSON.stringify(submissions), attemptId]);

            res.json({
                success: true, passed,
                student_result: studentResult,
                reference_result: referenceResult,
                match: passed
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Finish SQL test
    app.post('/api/skill-tests/sql/finish/:attemptId', async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT a.*, t.sql_passing_score, t.interview_count FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?`, [req.params.attemptId]);
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = rows[0];

            const problems = typeof attempt.sql_problems === 'string' ? JSON.parse(attempt.sql_problems) : (attempt.sql_problems || []);
            const submissions = typeof attempt.sql_submissions === 'string' ? JSON.parse(attempt.sql_submissions) : (attempt.sql_submissions || {});

            const solved = Object.values(submissions).filter(s => s.passed).length;
            const total = problems.length;
            const score = total > 0 ? (solved / total * 100) : 0;
            const passed = score >= (attempt.sql_passing_score || 50);
            const status = passed ? 'passed' : 'failed';

            if (passed) {
                await pool.query(
                    `UPDATE skill_test_attempts SET sql_score = ?, sql_status = ?, current_stage = 'interview' WHERE id = ?`,
                    [score, status, attempt.id]
                );
            } else {
                await pool.query(
                    `UPDATE skill_test_attempts SET sql_score = ?, sql_status = ?,
                     current_stage = 'completed', overall_status = 'failed' WHERE id = ?`,
                    [score, status, attempt.id]
                );
                generateAndSaveReport(pool, attempt.id).catch(err => console.error('Report gen error:', err));
            }

            res.json({ success: true, score, solved, total, passed, status });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  AI INTERVIEW
    // ════════════════════════════════════════

    // Start interview
    app.post('/api/skill-tests/interview/start/:attemptId', async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT a.*, t.skills, t.interview_count FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?`, [req.params.attemptId]);
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = rows[0];

            if (attempt.sql_status !== 'passed') return res.status(400).json({ error: 'Must pass SQL first' });

            const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
            const totalQuestions = attempt.interview_count || 5;

            // Check if already started
            const existingQA = typeof attempt.interview_qa === 'string' ? JSON.parse(attempt.interview_qa) : attempt.interview_qa;
            if (existingQA && existingQA.length > 0 && attempt.interview_status === 'in_progress') {
                // Resume - return current question
                const currentIdx = attempt.interview_current_index || 0;
                const currentQA = existingQA[currentIdx];
                return res.json({
                    question: currentQA?.question || currentQA?.question_data?.question,
                    category: currentQA?.question_data?.category || '',
                    difficulty: currentQA?.question_data?.difficulty || 'medium',
                    question_number: currentIdx + 1,
                    total_questions: totalQuestions,
                    resumed: true
                });
            }

            // Generate first question
            const questionData = await generateInterviewQuestion(skills, [], 1, totalQuestions);
            const qaList = [{
                question_data: questionData,
                question: questionData.question,
                answer: null, score: null, evaluation: null
            }];

            await pool.query(
                `UPDATE skill_test_attempts SET interview_status = 'in_progress', interview_qa = ?,
                 interview_current_index = 0 WHERE id = ?`,
                [JSON.stringify(qaList), attempt.id]
            );

            res.json({
                question: questionData.question,
                category: questionData.category || '',
                difficulty: questionData.difficulty || 'medium',
                question_number: 1,
                total_questions: totalQuestions
            });
        } catch (err) {
            console.error('Start interview error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // Answer interview question
    app.post('/api/skill-tests/interview/answer', async (req, res) => {
        try {
            const { attemptId, answer } = req.body;

            const [rows] = await pool.query(
                `SELECT a.*, t.skills, t.interview_count, t.interview_passing_score FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?`, [attemptId]);
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = rows[0];

            const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
            const totalQuestions = attempt.interview_count || 5;
            const qaList = typeof attempt.interview_qa === 'string' ? JSON.parse(attempt.interview_qa) : (attempt.interview_qa || []);
            const currentIdx = attempt.interview_current_index || 0;
            const currentQA = qaList[currentIdx];

            // Evaluate answer
            const evaluation = await evaluateInterviewAnswer(
                currentQA.question,
                answer,
                currentQA.question_data?.expected_key_points || [],
                currentQA.question_data?.category || 'general'
            );

            qaList[currentIdx].answer = answer;
            qaList[currentIdx].score = evaluation.score || 5;
            qaList[currentIdx].evaluation = evaluation;

            const nextIdx = currentIdx + 1;
            const isComplete = nextIdx >= totalQuestions;

            if (!isComplete) {
                // Generate next question
                const questionData = await generateInterviewQuestion(skills, qaList, nextIdx + 1, totalQuestions);
                qaList.push({
                    question_data: questionData,
                    question: questionData.question,
                    answer: null, score: null, evaluation: null
                });

                await pool.query(
                    `UPDATE skill_test_attempts SET interview_qa = ?, interview_current_index = ? WHERE id = ?`,
                    [JSON.stringify(qaList), nextIdx, attemptId]
                );

                return res.json({
                    evaluation,
                    score: evaluation.score,
                    feedback: evaluation.feedback,
                    is_complete: false,
                    next_question: questionData.question,
                    next_category: questionData.category || '',
                    next_difficulty: questionData.difficulty || 'medium',
                    question_number: nextIdx + 1,
                    total_questions: totalQuestions
                });
            } else {
                // Interview complete
                const scores = qaList.filter(qa => qa.score !== null).map(qa => qa.score);
                const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
                const passed = avgScore >= (attempt.interview_passing_score || 6);
                const status = passed ? 'passed' : 'failed';

                await pool.query(
                    `UPDATE skill_test_attempts SET interview_qa = ?, interview_score = ?, interview_status = ?,
                     current_stage = 'completed', overall_status = ? WHERE id = ?`,
                    [JSON.stringify(qaList), avgScore, status, passed ? 'completed' : 'failed', attemptId]
                );

                // Generate report
                generateAndSaveReport(pool, attemptId).catch(err => console.error('Report gen error:', err));

                return res.json({
                    evaluation,
                    score: evaluation.score,
                    feedback: evaluation.feedback,
                    is_complete: true,
                    overall_score: avgScore,
                    passed,
                    status
                });
            }
        } catch (err) {
            console.error('Answer interview error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  PROCTORING
    // ════════════════════════════════════════

    app.post('/api/skill-tests/proctoring/log', async (req, res) => {
        try {
            const { attemptId, testStage, eventType, details, severity } = req.body;
            await pool.query(
                `INSERT INTO skill_proctoring_logs (attempt_id, test_stage, event_type, details, severity)
                 VALUES (?, ?, ?, ?, ?)`,
                [attemptId, testStage, eventType, details || '', severity || 'low']
            );

            // Update violation count
            if (testStage === 'mcq') {
                await pool.query('UPDATE skill_test_attempts SET mcq_violations = mcq_violations + 1 WHERE id = ?', [attemptId]);
            } else if (testStage === 'interview') {
                await pool.query('UPDATE skill_test_attempts SET interview_violations = interview_violations + 1 WHERE id = ?', [attemptId]);
            }

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  REPORT
    // ════════════════════════════════════════

    app.get('/api/skill-tests/report/:attemptId', async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT a.*, t.title, t.skills FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?`, [req.params.attemptId]);
            if (!rows.length) return res.status(404).json({ error: 'Attempt not found' });

            const attempt = rows[0];
            ['skills', 'mcq_questions', 'mcq_answers', 'coding_problems', 'coding_submissions',
                'sql_problems', 'sql_submissions', 'interview_qa', 'report'].forEach(f => {
                    if (attempt[f] && typeof attempt[f] === 'string') {
                        try { attempt[f] = JSON.parse(attempt[f]); } catch { }
                    }
                });

            // Get violations
            const [violations] = await pool.query(
                'SELECT * FROM skill_proctoring_logs WHERE attempt_id = ? ORDER BY created_at', [attempt.id]
            );

            res.json({ attempt, violations });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  HELPER FUNCTIONS
    // ════════════════════════════════════════

    // Execute code in sandbox
    async function executeCode(code, language, inputData) {
        const tmpDir = os.tmpdir();
        const id = Date.now() + '_' + Math.random().toString(36).slice(2);
        const isWindows = process.platform === 'win32';
        let filePath, cmd;
        // Write input to a temp file (avoids Windows echo quoting issues)
        const inputFile = path.join(tmpDir, `input_${id}.txt`);
        const cleanInput = (inputData || '').replace(/\r\n/g, '\n');
        fs.writeFileSync(inputFile, cleanInput);

        // Always pipe input, even if empty. This ensures stdin is available for the process.
        // On Windows 'type' works, on *nix 'cat'.
        const pipeInput = isWindows ? `type "${inputFile}" | ` : `cat "${inputFile}" | `;

        try {
            if (language === 'python') {
                filePath = path.join(tmpDir, `code_${id}.py`);
                fs.writeFileSync(filePath, code);
                cmd = `${pipeInput}python "${filePath}"`;
            } else if (language === 'javascript') {
                filePath = path.join(tmpDir, `code_${id}.js`);
                fs.writeFileSync(filePath, code);
                cmd = `${pipeInput}node "${filePath}"`;
            } else if (language === 'java') {
                const javaDir = path.join(tmpDir, `java_${id}`);
                fs.mkdirSync(javaDir, { recursive: true });
                filePath = path.join(javaDir, 'Main.java');
                fs.writeFileSync(filePath, code);
                const runJava = isWindows
                    ? `cd /d "${javaDir}" && javac Main.java && ${pipeInput}java Main`
                    : `cd "${javaDir}" && javac Main.java && ${pipeInput}java Main`;
                cmd = runJava;
            } else if (language === 'c') {
                filePath = path.join(tmpDir, `code_${id}.c`);
                const outPath = path.join(tmpDir, `code_${id}_out${isWindows ? '.exe' : ''}`);
                fs.writeFileSync(filePath, code);
                cmd = `gcc "${filePath}" -o "${outPath}" && ${pipeInput}"${outPath}"`;
            } else if (language === 'cpp') {
                filePath = path.join(tmpDir, `code_${id}.cpp`);
                const outPath = path.join(tmpDir, `code_${id}_out${isWindows ? '.exe' : ''}`);
                fs.writeFileSync(filePath, code);
                cmd = `g++ "${filePath}" -o "${outPath}" && ${pipeInput}"${outPath}"`;
            } else {
                try { fs.unlinkSync(inputFile); } catch { }
                return { success: false, error: `Unsupported language: ${language}` };
            }

            return new Promise((resolve) => {
                exec(cmd, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
                    // Cleanup temp files
                    try { if (filePath) fs.unlinkSync(filePath); } catch { }
                    try { fs.unlinkSync(inputFile); } catch { }

                    if (error) {
                        resolve({ success: false, error: stderr || error.message, output: stdout });
                    } else {
                        resolve({ success: true, output: stdout.trim(), stderr: stderr || '' });
                    }
                });
            });
        } catch (err) {
            try { fs.unlinkSync(inputFile); } catch { }
            return { success: false, error: err.message };
        }
    }

    // Execute SQL in sandbox (using sql.js - SQLite in memory)
    async function executeSQLSandbox(query) {
        try {
            const initSqlJs = require('sql.js');
            const SQL = await initSqlJs();
            const db = new SQL.Database();

            // Seed sandbox tables
            db.run(`
                CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, department TEXT, salary REAL, hire_date TEXT, manager_id INTEGER);
                INSERT INTO employees VALUES (1, 'Alice Johnson', 'Engineering', 95000, '2020-01-15', NULL);
                INSERT INTO employees VALUES (2, 'Bob Smith', 'Engineering', 85000, '2020-06-01', 1);
                INSERT INTO employees VALUES (3, 'Carol Williams', 'Marketing', 72000, '2019-03-20', NULL);
                INSERT INTO employees VALUES (4, 'David Brown', 'Engineering', 92000, '2021-02-10', 1);
                INSERT INTO employees VALUES (5, 'Eva Martinez', 'Sales', 68000, '2020-09-01', NULL);
                INSERT INTO employees VALUES (6, 'Frank Lee', 'Marketing', 75000, '2021-07-15', 3);
                INSERT INTO employees VALUES (7, 'Grace Kim', 'Sales', 71000, '2020-11-20', 5);
                INSERT INTO employees VALUES (8, 'Henry Wilson', 'Engineering', 105000, '2018-05-01', NULL);
                INSERT INTO employees VALUES (9, 'Iris Chen', 'HR', 65000, '2022-01-10', NULL);
                INSERT INTO employees VALUES (10, 'Jack Davis', 'HR', 62000, '2022-06-15', 9);

                CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT, budget REAL, location TEXT);
                INSERT INTO departments VALUES (1, 'Engineering', 500000, 'San Francisco');
                INSERT INTO departments VALUES (2, 'Marketing', 200000, 'New York');
                INSERT INTO departments VALUES (3, 'Sales', 300000, 'Chicago');
                INSERT INTO departments VALUES (4, 'HR', 150000, 'San Francisco');

                CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER, start_date TEXT, end_date TEXT, status TEXT);
                INSERT INTO projects VALUES (1, 'Project Alpha', 1, '2023-01-01', '2023-06-30', 'completed');
                INSERT INTO projects VALUES (2, 'Project Beta', 1, '2023-03-15', '2023-12-31', 'in_progress');
                INSERT INTO projects VALUES (3, 'Campaign X', 2, '2023-02-01', '2023-05-30', 'completed');
                INSERT INTO projects VALUES (4, 'Sales Push', 3, '2023-04-01', '2023-09-30', 'in_progress');
                INSERT INTO projects VALUES (5, 'Project Gamma', 1, '2023-07-01', NULL, 'planning');

                CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_name TEXT, product TEXT, quantity INTEGER, price REAL, order_date TEXT);
                INSERT INTO orders VALUES (1, 'Acme Corp', 'Widget A', 100, 25.99, '2023-01-15');
                INSERT INTO orders VALUES (2, 'Beta Inc', 'Widget B', 50, 49.99, '2023-02-20');
                INSERT INTO orders VALUES (3, 'Acme Corp', 'Widget A', 200, 25.99, '2023-03-10');
                INSERT INTO orders VALUES (4, 'Gamma LLC', 'Widget C', 75, 15.50, '2023-04-05');
                INSERT INTO orders VALUES (5, 'Beta Inc', 'Widget A', 150, 25.99, '2023-05-12');
                INSERT INTO orders VALUES (6, 'Delta Co', 'Widget B', 80, 49.99, '2023-06-18');
                INSERT INTO orders VALUES (7, 'Gamma LLC', 'Widget C', 120, 15.50, '2023-07-22');
                INSERT INTO orders VALUES (8, 'Acme Corp', 'Widget D', 30, 99.99, '2023-08-30');
            `);

            const results = db.exec(query);
            db.close();

            if (results.length === 0) {
                return { success: true, columns: [], rows: [], message: 'Query executed successfully (no results)' };
            }

            const columns = results[0].columns;
            const rows = results[0].values.map(row => {
                const obj = {};
                columns.forEach((col, i) => { obj[col] = row[i]; });
                return obj;
            });

            return { success: true, columns, rows };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    // Generate and save report
    async function generateAndSaveReport(pool, attemptId) {
        try {
            const [rows] = await pool.query(
                `SELECT a.*, t.title, t.skills FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?`, [attemptId]);
            if (!rows.length) return;
            const attempt = rows[0];

            const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
            const mcqQuestions = typeof attempt.mcq_questions === 'string' ? JSON.parse(attempt.mcq_questions) : (attempt.mcq_questions || []);
            const mcqAnswers = typeof attempt.mcq_answers === 'string' ? JSON.parse(attempt.mcq_answers) : (attempt.mcq_answers || {});
            const codingProblems = typeof attempt.coding_problems === 'string' ? JSON.parse(attempt.coding_problems) : (attempt.coding_problems || []);
            const codingSubmissions = typeof attempt.coding_submissions === 'string' ? JSON.parse(attempt.coding_submissions) : (attempt.coding_submissions || {});
            const sqlProblems = typeof attempt.sql_problems === 'string' ? JSON.parse(attempt.sql_problems) : (attempt.sql_problems || []);
            const sqlSubmissions = typeof attempt.sql_submissions === 'string' ? JSON.parse(attempt.sql_submissions) : (attempt.sql_submissions || {});
            const interviewQA = typeof attempt.interview_qa === 'string' ? JSON.parse(attempt.interview_qa) : (attempt.interview_qa || []);

            const [violations] = await pool.query('SELECT COUNT(*) as cnt FROM skill_proctoring_logs WHERE attempt_id = ?', [attemptId]);

            const mcqCorrect = mcqQuestions.filter(q => {
                const studentAnswer = mcqAnswers[String(q.id)];
                if (studentAnswer === undefined || studentAnswer === null) return false;
                const letterToIndex = { A: 0, B: 1, C: 2, D: 3 };
                const studentIdx = typeof studentAnswer === 'string' && letterToIndex[studentAnswer.toUpperCase()] !== undefined
                    ? letterToIndex[studentAnswer.toUpperCase()] : Number(studentAnswer);
                const correctIdx = typeof q.correct_answer === 'string' && letterToIndex[q.correct_answer.toUpperCase()] !== undefined
                    ? letterToIndex[q.correct_answer.toUpperCase()] : Number(q.correct_answer);
                return studentIdx === correctIdx;
            }).length;

            const report = await generateFinalReport(
                attempt.title, skills,
                { score: attempt.mcq_score || 0, correct: mcqCorrect, total: mcqQuestions.length, passed: attempt.mcq_status === 'passed' },
                { score: attempt.coding_score || 0, solved: Object.keys(codingSubmissions).length, total: codingProblems.length, passed: attempt.coding_status === 'passed' },
                { score: attempt.sql_score || 0, solved: Object.values(sqlSubmissions).filter(s => s.passed).length, total: sqlProblems.length, passed: attempt.sql_status === 'passed' },
                {
                    avgScore: attempt.interview_score || 0,
                    answered: interviewQA.filter(qa => qa.answer).length,
                    total: interviewQA.length,
                    passed: attempt.interview_status === 'passed',
                    highlights: interviewQA.map(qa => ({
                        question: qa.question,
                        answer_summary: (qa.answer || '').substring(0, 300),
                        score: qa.score,
                        ai_feedback: qa.evaluation?.feedback || 'No evaluation'
                    }))
                },
                violations[0]?.cnt || 0
            );

            await pool.query('UPDATE skill_test_attempts SET report = ? WHERE id = ?', [JSON.stringify(report), attemptId]);
        } catch (err) {
            console.error('Report generation error:', err);
        }
    }

    // ════════════════════════════════════════
    //  STUDENT: MY SKILL SUBMISSIONS
    // ════════════════════════════════════════
    app.get('/api/skill-tests/student/submissions', async (req, res) => {
        try {
            const { studentId } = req.query;
            if (!studentId) return res.status(400).json({ error: 'studentId required' });

            const [rows] = await pool.query(
                `SELECT a.id, a.test_id, a.attempt_number, a.current_stage, a.overall_status,
                 a.mcq_score, a.mcq_status, a.coding_score, a.coding_status,
                 a.sql_score, a.sql_status, a.interview_score, a.interview_status,
                 a.report, a.created_at, a.updated_at,
                 t.title, t.description, t.skills, t.difficulty_level
                 FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id
                 WHERE a.student_id = ?
                 ORDER BY a.created_at DESC`,
                [studentId]
            );

            const parsed = rows.map(r => ({
                ...r,
                skills: typeof r.skills === 'string' ? JSON.parse(r.skills) : r.skills,
                report: r.report ? (typeof r.report === 'string' ? JSON.parse(r.report) : r.report) : null
            }));

            res.json(parsed);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  ADMIN: ALL SKILL SUBMISSIONS
    // ════════════════════════════════════════
    app.get('/api/skill-tests/admin/all-submissions', async (req, res) => {
        try {
            const [rows] = await pool.query(
                `SELECT a.id, a.test_id, a.student_id, a.student_name, a.attempt_number,
                 a.current_stage, a.overall_status,
                 a.mcq_score, a.mcq_status, a.coding_score, a.coding_status,
                 a.sql_score, a.sql_status, a.interview_score, a.interview_status,
                 a.report, a.created_at, a.updated_at,
                 t.title, t.description, t.skills, t.difficulty_level
                 FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id
                 ORDER BY a.created_at DESC
                 LIMIT 200`
            );

            const parsed = rows.map(r => ({
                ...r,
                skills: typeof r.skills === 'string' ? JSON.parse(r.skills) : r.skills,
                report: r.report ? (typeof r.report === 'string' ? JSON.parse(r.report) : r.report) : null
            }));

            res.json(parsed);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = registerSkillTestRoutes;
