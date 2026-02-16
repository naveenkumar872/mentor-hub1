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
    generateFallbackCoding,
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
                attempt_limit, mcq_duration_minutes, coding_duration_minutes, sql_duration_minutes, interview_duration_minutes,
                mcq_passing_score, coding_passing_score,
                sql_passing_score, interview_passing_score } = req.body;

            const [result] = await pool.query(
                `INSERT INTO skill_tests (
                    title, description, skills, mcq_count, coding_count, sql_count, interview_count,
                    attempt_limit, mcq_duration_minutes, coding_duration_minutes, sql_duration_minutes, interview_duration_minutes,
                    mcq_passing_score, coding_passing_score, sql_passing_score, interview_passing_score
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [title, description, JSON.stringify(skills), mcq_count, coding_count, sql_count, interview_count,
                    attempt_limit, mcq_duration_minutes, coding_duration_minutes, sql_duration_minutes, interview_duration_minutes,
                    mcq_passing_score, coding_passing_score, sql_passing_score, interview_passing_score]
            );

            res.json({ success: true, id: result.insertId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get all skill tests
    app.get('/api/skill-tests/all', async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM skill_tests ORDER BY created_at DESC');
            const parsed = rows.map(r => ({
                ...r,
                skills: typeof r.skills === 'string' ? JSON.parse(r.skills) : r.skills
            }));
            res.json(parsed);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Toggle skill test status
    app.put('/api/skill-tests/:id/toggle', async (req, res) => {
        try {
            await pool.query('UPDATE skill_tests SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
            res.json({ success: true });
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

    // Get test attempts by test ID
    app.get('/api/skill-tests/:id/attempts', async (req, res) => {
        try {
            const [rows] = await pool.query('SELECT * FROM skill_test_attempts WHERE test_id = ? ORDER BY created_at DESC', [req.params.id]);
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  STUDENT: DISCOVER & START TESTS
    // ════════════════════════════════════════

    // Get available tests for student
    app.get('/api/skill-tests/student/available', async (req, res) => {
        try {
            const { studentId } = req.query;
            const [tests] = await pool.query('SELECT * FROM skill_tests WHERE is_active = TRUE ORDER BY created_at DESC');

            // For each test, get student's latest attempt status
            const enriched = await Promise.all(tests.map(async t => {
                const [attempts] = await pool.query(
                    'SELECT id, attempt_number, overall_status, current_stage, mcq_score, created_at FROM skill_test_attempts WHERE test_id = ? AND student_id = ? ORDER BY attempt_number DESC',
                    [t.id, studentId]
                );

                return {
                    ...t,
                    skills: typeof t.skills === 'string' ? JSON.parse(t.skills) : t.skills,
                    attempts_used: attempts.length,
                    can_attempt: attempts.length < t.attempt_limit && !attempts.some(a => a.overall_status === 'completed'),
                    my_attempts: attempts
                };
            }));

            res.json(enriched);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Start a new test attempt
    app.post('/api/skill-tests/:testId/start', async (req, res) => {
        try {
            const { testId } = req.params;
            const { studentId, studentName } = req.body;

            // 1. Check if test exists and is active
            const [tests] = await pool.query('SELECT * FROM skill_tests WHERE id = ?', [testId]);
            if (tests.length === 0) return res.status(404).json({ error: 'Test not found' });
            const test = tests[0];

            // 2. Check attempt limits
            const [attempts] = await pool.query(
                'SELECT id FROM skill_test_attempts WHERE test_id = ? AND student_id = ?',
                [testId, studentId]
            );
            if (attempts.length >= test.attempt_limit) {
                return res.status(400).json({ error: 'Attempt limit reached for this test' });
            }

            // 3. Create initial attempt record
            const [result] = await pool.query(
                `INSERT INTO skill_test_attempts (test_id, student_id, student_name, attempt_number)
                 VALUES (?, ?, ?, ?)`,
                [testId, studentId, studentName, attempts.length + 1]
            );

            res.json({ success: true, attemptId: result.insertId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get specific attempt status
    app.get('/api/skill-tests/attempt/:attemptId', async (req, res) => {
        try {
            const [attempts] = await pool.query(
                `SELECT a.*, t.title as test_title, t.skills as test_skills
                 FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id
                 WHERE a.id = ?`,
                [req.params.attemptId]
            );
            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });

            const a = attempts[0];
            res.json({
                ...a,
                test_skills: typeof a.test_skills === 'string' ? JSON.parse(a.test_skills) : a.test_skills,
                mcq_questions: a.mcq_questions ? (typeof a.mcq_questions === 'string' ? JSON.parse(a.mcq_questions) : a.mcq_questions) : null,
                coding_problems: a.coding_problems ? (typeof a.coding_problems === 'string' ? JSON.parse(a.coding_problems) : a.coding_problems) : null,
                sql_problems: a.sql_problems ? (typeof a.sql_problems === 'string' ? JSON.parse(a.sql_problems) : a.sql_problems) : null,
                interview_qa: a.interview_qa ? (typeof a.interview_qa === 'string' ? JSON.parse(a.interview_qa) : a.interview_qa) : null
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  STAGE 1: MCQ TEST
    // ════════════════════════════════════════

    app.post('/api/skill-tests/mcq/start/:attemptId', async (req, res) => {
        try {
            const { attemptId } = req.params;
            const [attempts] = await pool.query(
                `SELECT a.*, t.skills, t.mcq_count, t.mcq_duration_minutes 
                 FROM skill_test_attempts a 
                 JOIN skill_tests t ON a.test_id = t.id 
                 WHERE a.id = ?`,
                [attemptId]
            );

            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = attempts[0];
            const durationMinutes = attempt.mcq_duration_minutes || 30;

            // If already generated, return existing with calculated end_time
            if (attempt.mcq_questions) {
                const startTime = attempt.mcq_start_time ? new Date(attempt.mcq_start_time) : new Date();
                const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
                return res.json({
                    questions: typeof attempt.mcq_questions === 'string' ? JSON.parse(attempt.mcq_questions) : attempt.mcq_questions,
                    end_time: endTime.toISOString(),
                    existing_answers: attempt.mcq_answers ? (typeof attempt.mcq_answers === 'string' ? JSON.parse(attempt.mcq_answers) : attempt.mcq_answers) : {}
                });
            }

            // Generate using AI
            const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
            const questions = await generateMCQQuestions(skills, attempt.mcq_count || 10);

            await pool.query(
                'UPDATE skill_test_attempts SET mcq_questions = ?, mcq_start_time = CURRENT_TIMESTAMP WHERE id = ?',
                [JSON.stringify(questions), attemptId]
            );

            // End time = now + duration
            const endTime = new Date(Date.now() + durationMinutes * 60 * 1000);
            res.json({ questions, end_time: endTime.toISOString() });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/skill-tests/mcq/submit', async (req, res) => {
        try {
            const { attemptId, answers } = req.body;
            const [attempts] = await pool.query(
                'SELECT a.*, t.mcq_passing_score FROM skill_test_attempts a JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?',
                [attemptId]
            );
            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });

            const attempt = attempts[0];
            const questions = typeof attempt.mcq_questions === 'string' ? JSON.parse(attempt.mcq_questions) : attempt.mcq_questions;

            // Calculate score
            let correctCount = 0;
            questions.forEach(q => {
                if (answers[q.id] === q.correct_answer) correctCount++;
            });
            const score = (correctCount / questions.length) * 100;
            const passed = score >= attempt.mcq_passing_score;

            await pool.query(
                `UPDATE skill_test_attempts 
                 SET mcq_answers = ?, mcq_score = ?, mcq_status = ?, 
                     mcq_end_time = CURRENT_TIMESTAMP, current_stage = ?
                 WHERE id = ?`,
                [JSON.stringify(answers), score, passed ? 'completed' : 'failed', passed ? 'coding' : 'mcq', attemptId]
            );

            res.json({ success: true, score, passed, nextStage: passed ? 'coding' : null });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  STAGE 2: CODING TEST
    // ════════════════════════════════════════

    app.post('/api/skill-tests/coding/start/:attemptId', async (req, res) => {
        try {
            const { attemptId } = req.params;
            const [attempts] = await pool.query(
                `SELECT a.*, t.skills, t.coding_count 
                 FROM skill_test_attempts a 
                 JOIN skill_tests t ON a.test_id = t.id 
                 WHERE a.id = ?`,
                [attemptId]
            );

            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = attempts[0];

            if (attempt.coding_problems) {
                return res.json({ problems: typeof attempt.coding_problems === 'string' ? JSON.parse(attempt.coding_problems) : attempt.coding_problems });
            }

            const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
            const problems = await generateCodingProblems(skills, attempt.coding_count || 3);

            await pool.query(
                'UPDATE skill_test_attempts SET coding_problems = ? WHERE id = ?',
                [JSON.stringify(problems), attemptId]
            );

            res.json({ problems });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Regenerate coding problems
    app.post('/api/skill-tests/coding/regenerate/:attemptId', async (req, res) => {
        try {
            const { attemptId } = req.params;
            const [attempts] = await pool.query(
                `SELECT a.*, t.skills, t.coding_count 
                 FROM skill_test_attempts a 
                 JOIN skill_tests t ON a.test_id = t.id 
                 WHERE a.id = ?`,
                [attemptId]
            );

            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = attempts[0];

            const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
            const problems = await generateCodingProblems(skills, attempt.coding_count || 3);

            await pool.query(
                'UPDATE skill_test_attempts SET coding_problems = ? WHERE id = ?',
                [JSON.stringify(problems), attemptId]
            );

            res.json({ success: true, problems });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Stub for running code - would normally use a secure executor service
    app.post('/api/skill-tests/coding/run', async (req, res) => {
        try {
            const { code, language, problemId } = req.body;
            // Simulated run result
            res.json({
                success: true,
                output: "Code execution simulation finished.",
                testCases: [
                    { passed: true, input: "Example", expected: "Output", actual: "Output" }
                ]
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/skill-tests/coding/submit', async (req, res) => {
        try {
            const { attemptId, submissions } = req.body;
            const [attempts] = await pool.query('SELECT * FROM skill_test_attempts WHERE id = ?', [attemptId]);
            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });

            const attempt = attempts[0];
            const currentSubmissions = attempt.coding_submissions ? (typeof attempt.coding_submissions === 'string' ? JSON.parse(attempt.coding_submissions) : attempt.coding_submissions) : {};

            const newSubmissions = { ...currentSubmissions, ...submissions };

            await pool.query(
                'UPDATE skill_test_attempts SET coding_submissions = ? WHERE id = ?',
                [JSON.stringify(newSubmissions), attemptId]
            );

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/skill-tests/coding/finish/:attemptId', async (req, res) => {
        try {
            const { attemptId } = req.params;
            const [attempts] = await pool.query(
                'SELECT a.*, t.coding_passing_score FROM skill_test_attempts a JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?',
                [attemptId]
            );
            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = attempts[0];

            // AI Scoring of submissions
            const codingSubmissions = typeof attempt.coding_submissions === 'string' ? JSON.parse(attempt.coding_submissions) : (attempt.coding_submissions || {});
            const numProblems = (typeof attempt.coding_problems === 'string' ? JSON.parse(attempt.coding_problems) : attempt.coding_problems).length;

            // For now, simple scoring based on % of problems with submissions
            const submittedCount = Object.keys(codingSubmissions).length;
            const score = (submittedCount / numProblems) * 100;
            const passed = score >= attempt.coding_passing_score;

            await pool.query(
                `UPDATE skill_test_attempts 
                 SET coding_score = ?, coding_status = ?, current_stage = ?
                 WHERE id = ?`,
                [score, passed ? 'completed' : 'failed', passed ? 'sql' : 'coding', attemptId]
            );

            res.json({ success: true, score, passed, nextStage: passed ? 'sql' : null });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  STAGE 3: SQL TEST
    // ════════════════════════════════════════

    app.post('/api/skill-tests/sql/start/:attemptId', async (req, res) => {
        try {
            const { attemptId } = req.params;
            const [attempts] = await pool.query(
                `SELECT a.*, t.skills, t.sql_count 
                 FROM skill_test_attempts a 
                 JOIN skill_tests t ON a.test_id = t.id 
                 WHERE a.id = ?`,
                [attemptId]
            );

            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = attempts[0];

            if (attempt.sql_problems) {
                return res.json({ problems: typeof attempt.sql_problems === 'string' ? JSON.parse(attempt.sql_problems) : attempt.sql_problems });
            }

            const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
            const problems = await generateSQLProblems(skills, attempt.sql_count || 3);

            await pool.query(
                'UPDATE skill_test_attempts SET sql_problems = ? WHERE id = ?',
                [JSON.stringify(problems), attemptId]
            );

            res.json({ problems });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/skill-tests/sql/regenerate/:attemptId', async (req, res) => {
        try {
            const { attemptId } = req.params;
            const [attempts] = await pool.query(
                `SELECT a.*, t.skills, t.sql_count 
                 FROM skill_test_attempts a 
                 JOIN skill_tests t ON a.test_id = t.id 
                 WHERE a.id = ?`,
                [attemptId]
            );

            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = attempts[0];

            const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
            const problems = await generateSQLProblems(skills, attempt.sql_count || 3);

            await pool.query(
                'UPDATE skill_test_attempts SET sql_problems = ? WHERE id = ?',
                [JSON.stringify(problems), attemptId]
            );

            res.json({ success: true, problems });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/skill-tests/sql/run', async (req, res) => {
        try {
            const { query, problemId } = req.body;
            // Simulated result
            res.json({ success: true, columns: ['id', 'name'], rows: [[1, 'Sample Row']] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/skill-tests/sql/evaluate', async (req, res) => {
        try {
            const { attemptId, submissions } = req.body;
            const [attempts] = await pool.query('SELECT * FROM skill_test_attempts WHERE id = ?', [attemptId]);
            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });

            const attempt = attempts[0];
            const currentSubmissions = attempt.sql_submissions ? (typeof attempt.sql_submissions === 'string' ? JSON.parse(attempt.sql_submissions) : attempt.sql_submissions) : {};
            const newSubmissions = { ...currentSubmissions, ...submissions };

            await pool.query(
                'UPDATE skill_test_attempts SET sql_submissions = ? WHERE id = ?',
                [JSON.stringify(newSubmissions), attemptId]
            );

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/skill-tests/sql/finish/:attemptId', async (req, res) => {
        try {
            const { attemptId } = req.params;
            const [attempts] = await pool.query(
                'SELECT a.*, t.sql_passing_score FROM skill_test_attempts a JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?',
                [attemptId]
            );
            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = attempts[0];

            const sqlSubmissions = typeof attempt.sql_submissions === 'string' ? JSON.parse(attempt.sql_submissions) : (attempt.sql_submissions || {});
            const numProblems = (typeof attempt.sql_problems === 'string' ? JSON.parse(attempt.sql_problems) : attempt.sql_problems).length;

            const submittedCount = Object.keys(sqlSubmissions).length;
            const score = (submittedCount / numProblems) * 100;
            const passed = score >= attempt.sql_passing_score;

            await pool.query(
                `UPDATE skill_test_attempts 
                 SET sql_score = ?, sql_status = ?, current_stage = ?
                 WHERE id = ?`,
                [score, passed ? 'completed' : 'failed', passed ? 'interview' : 'sql', attemptId]
            );

            res.json({ success: true, score, passed, nextStage: passed ? 'interview' : null });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  STAGE 4: AI INTERVIEW
    // ════════════════════════════════════════

    app.post('/api/skill-tests/interview/start/:attemptId', async (req, res) => {
        try {
            const { attemptId } = req.params;
            const [attempts] = await pool.query(
                `SELECT a.*, t.skills, t.interview_count 
                 FROM skill_test_attempts a 
                 JOIN skill_tests t ON a.test_id = t.id 
                 WHERE a.id = ?`,
                [attemptId]
            );

            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = attempts[0];

            const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;

            let interviewQA = attempt.interview_qa ? (typeof attempt.interview_qa === 'string' ? JSON.parse(attempt.interview_qa) : attempt.interview_qa) : [];

            // If starting fresh, generate first question
            if (interviewQA.length === 0) {
                const questionData = await generateInterviewQuestion(skills, []);
                interviewQA = [{
                    question: questionData.question,
                    key_points: questionData.key_points,
                    answer: null,
                    feedback: null,
                    score: 0
                }];

                await pool.query(
                    'UPDATE skill_test_attempts SET interview_qa = ? WHERE id = ?',
                    [JSON.stringify(interviewQA), attemptId]
                );
            }

            res.json({
                qa: interviewQA,
                currentIndex: attempt.interview_current_index,
                totalCount: attempt.interview_count || 5
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/skill-tests/interview/answer', async (req, res) => {
        try {
            const { attemptId, answer } = req.body;
            const [attempts] = await pool.query(
                'SELECT a.*, t.skills, t.interview_count, t.interview_passing_score FROM skill_test_attempts a JOIN skill_tests t ON a.test_id = t.id WHERE a.id = ?',
                [attemptId]
            );
            if (attempts.length === 0) return res.status(404).json({ error: 'Attempt not found' });
            const attempt = attempts[0];

            let interviewQA = typeof attempt.interview_qa === 'string' ? JSON.parse(attempt.interview_qa) : attempt.interview_qa;
            const currentIndex = attempt.interview_current_index;
            const totalQuestions = attempt.interview_count || 5;

            // 1. Evaluate current answer
            const evaluation = await evaluateInterviewAnswer(
                interviewQA[currentIndex].question,
                answer,
                interviewQA[currentIndex].key_points
            );

            interviewQA[currentIndex].answer = answer;
            interviewQA[currentIndex].feedback = evaluation.feedback;
            interviewQA[currentIndex].score = evaluation.score;

            // 2. Prepare next question or finish
            const nextIndex = currentIndex + 1;
            let finished = nextIndex >= totalQuestions;
            let nextQuestionData = null;

            if (!finished) {
                const skills = typeof attempt.skills === 'string' ? JSON.parse(attempt.skills) : attempt.skills;
                nextQuestionData = await generateInterviewQuestion(skills, interviewQA);
                interviewQA.push({
                    question: nextQuestionData.question,
                    key_points: nextQuestionData.key_points,
                    answer: null,
                    feedback: null,
                    score: 0
                });
            }

            // Calculate overall interview score if finished
            let interviewScore = attempt.interview_score;
            let overallStatus = attempt.overall_status;
            let interviewStatus = attempt.interview_status;

            if (finished) {
                const totalScore = interviewQA.reduce((sum, qa) => sum + (qa.score || 0), 0);
                interviewScore = totalScore / totalQuestions;
                interviewStatus = interviewScore >= attempt.interview_passing_score ? 'completed' : 'failed';
                overallStatus = interviewStatus === 'completed' ? 'completed' : 'failed';

                // Generate Final Report AI Summary
                const report = await generateFinalReport({
                    ...attempt,
                    interview_qa: interviewQA,
                    interview_score: interviewScore
                });

                await pool.query(
                    `UPDATE skill_test_attempts 
                     SET interview_qa = ?, interview_current_index = ?, interview_score = ?, 
                         interview_status = ?, overall_status = ?, report = ?
                     WHERE id = ?`,
                    [JSON.stringify(interviewQA), nextIndex, interviewScore, interviewStatus, overallStatus, JSON.stringify(report), attemptId]
                );
            } else {
                await pool.query(
                    'UPDATE skill_test_attempts SET interview_qa = ?, interview_current_index = ? WHERE id = ?',
                    [JSON.stringify(interviewQA), nextIndex, attemptId]
                );
            }

            res.json({
                success: true,
                finished,
                evaluation,
                nextQuestion: nextQuestionData?.question
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ════════════════════════════════════════
    //  PROCTORING & REPORTS
    // ════════════════════════════════════════

    app.post('/api/skill-tests/proctoring/log', async (req, res) => {
        try {
            const { attemptId, testStage, eventType, details, severity } = req.body;
            await pool.query(
                `INSERT INTO skill_proctoring_logs (attempt_id, test_stage, event_type, details, severity)
                 VALUES (?, ?, ?, ?, ?)`,
                [attemptId, testStage, eventType, details, severity]
            );

            // Increment violation count in attempt record if critical
            if (severity === 'high' || eventType === 'tab_switch') {
                await pool.query('UPDATE skill_test_attempts SET mcq_violations = mcq_violations + 1 WHERE id = ?', [attemptId]);
            }

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/skill-tests/report/:attemptId', async (req, res) => {
        try {
            const { attemptId } = req.params;
            const [rows] = await pool.query(
                `SELECT a.*, t.title as test_title, t.skills as test_skills, t.description as test_description
                 FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id
                 WHERE a.id = ?`,
                [attemptId]
            );

            if (rows.length === 0) return res.status(404).json({ error: 'Report not found' });

            const r = rows[0];
            const [logs] = await pool.query('SELECT * FROM skill_proctoring_logs WHERE attempt_id = ? ORDER BY created_at ASC', [attemptId]);

            res.json({
                ...r,
                test_skills: typeof r.test_skills === 'string' ? JSON.parse(r.test_skills) : r.test_skills,
                mcq_questions: r.mcq_questions ? (typeof r.mcq_questions === 'string' ? JSON.parse(r.mcq_questions) : r.mcq_questions) : null,
                mcq_answers: r.mcq_answers ? (typeof r.mcq_answers === 'string' ? JSON.parse(r.mcq_answers) : r.mcq_answers) : null,
                coding_problems: r.coding_problems ? (typeof r.coding_problems === 'string' ? JSON.parse(r.coding_problems) : r.coding_problems) : null,
                coding_submissions: r.coding_submissions ? (typeof r.coding_submissions === 'string' ? JSON.parse(r.coding_submissions) : r.coding_submissions) : null,
                sql_problems: r.sql_problems ? (typeof r.sql_problems === 'string' ? JSON.parse(r.sql_problems) : r.sql_problems) : null,
                sql_submissions: r.sql_submissions ? (typeof r.sql_submissions === 'string' ? JSON.parse(r.sql_submissions) : r.sql_submissions) : null,
                interview_qa: r.interview_qa ? (typeof r.interview_qa === 'string' ? JSON.parse(r.interview_qa) : r.interview_qa) : null,
                report: r.report ? (typeof r.report === 'string' ? JSON.parse(r.report) : r.report) : null,
                proctoring_logs: logs
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Student specific submissions list
    app.get('/api/skill-tests/student/submissions', async (req, res) => {
        try {
            const { studentId } = req.query;
            const [rows] = await pool.query(
                `SELECT a.id, a.test_id, a.attempt_number, a.overall_status, a.created_at, t.title
                 FROM skill_test_attempts a
                 JOIN skill_tests t ON a.test_id = t.id
                 WHERE a.student_id = ?
                 ORDER BY a.created_at DESC`,
                [studentId]
            );
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Admin: Get all submissions
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

    // ═══════════════════════════════════════════
    //  RESET ALL SKILL TEST SUBMISSIONS (Admin only)
    // ═══════════════════════════════════════════
    app.delete('/api/skill-tests/admin/reset-all-submissions', async (req, res) => {
        try {
            // skill_proctoring_logs will be auto-deleted via ON DELETE CASCADE
            const [result] = await pool.query('DELETE FROM skill_test_attempts');
            res.json({ success: true, message: `Deleted ${result.affectedRows} submission(s) and all related proctoring logs.`, deleted: result.affectedRows });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Delete a single submission
    app.delete('/api/skill-tests/admin/submission/:attemptId', async (req, res) => {
        try {
            const [result] = await pool.query('DELETE FROM skill_test_attempts WHERE id = ?', [req.params.attemptId]);
            if (result.affectedRows === 0) return res.status(404).json({ error: 'Submission not found' });
            res.json({ success: true, message: 'Submission deleted successfully' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = registerSkillTestRoutes;
