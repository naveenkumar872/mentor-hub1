/**
 * Advanced Features API Routes
 * - Plagiarism Detection APIs
 * - Gamification APIs
 * - Analytics APIs
 * - Violation Scoring APIs
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

module.exports = (db, PlagiarismDetector, GamificationService, PredictiveAnalyticsService, ViolationScoringService) => {
    const plagiarism = new PlagiarismDetector(db);
    const gamification = new GamificationService(db);
    const analytics = new PredictiveAnalyticsService(db);
    const violationScoring = new ViolationScoringService(db);

    // ============================================================
    // PLAGIARISM DETECTION ENDPOINTS
    // ============================================================

    /**
     * Analyze single submission for plagiarism
     * POST /api/plagiarism/analyze
     */
    router.post('/plagiarism/analyze', async (req, res) => {
        try {
            const { submissionId } = req.body;

            if (!submissionId) {
                return res.status(400).json({ error: 'submissionId required' });
            }

            const result = await plagiarism.analyzeSubmission(submissionId);

            // Store analysis in database
            const analysisId = uuidv4();
            await db.query(
                `INSERT INTO plagiarism_analysis 
                (id, submission_id, problem_id, student_id, lexical_similarity, structural_similarity, 
                 temporal_suspicion, overall_score, flagged, severity, matched_submissions)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    analysisId,
                    submissionId,
                    result.problemId,
                    result.studentId,
                    result.lexicalSimilarity,
                    result.structuralSimilarity,
                    result.temporalSuspicion,
                    result.overallScore,
                    result.flagged ? 1 : 0,
                    result.severity,
                    JSON.stringify(result.matchedSubmissions)
                ]
            );

            res.json({ success: true, analysis: result, analysisId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Get plagiarism report
     * GET /api/plagiarism/report/:analysisId
     */
    router.get('/plagiarism/report/:analysisId', async (req, res) => {
        try {
            const { analysisId } = req.params;

            const [analysis] = await db.query(
                'SELECT * FROM plagiarism_analysis WHERE id = ?',
                [analysisId]
            );

            if (analysis.length === 0) {
                return res.status(404).json({ error: 'Analysis not found' });
            }

            res.json(analysis[0]);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * List plagiarism reports (filtered)
     * GET /api/plagiarism/reports?studentId=&mentorId=&flagged=&severity=
     */
    router.get('/plagiarism/reports', async (req, res) => {
        try {
            const { studentId, mentorId, flagged, severity, limit = 50, offset = 0 } = req.query;

            let query = `
                SELECT pa.*, u.name as student_name, u.mentor_id 
                FROM plagiarism_analysis pa
                JOIN users u ON pa.student_id = u.id
                WHERE 1=1
            `;
            const params = [];

            if (studentId) {
                query += ' AND pa.student_id = ?';
                params.push(studentId);
            }
            if (mentorId) {
                query += ' AND u.mentor_id = ?';
                params.push(mentorId);
            }
            if (flagged) {
                query += ' AND pa.flagged = ?';
                params.push(flagged === 'true' ? 1 : 0);
            }
            if (severity) {
                query += ' AND pa.severity = ?';
                params.push(severity);
            }

            query += ' ORDER BY pa.created_at DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const [reports] = await db.query(query, params);

            res.json({ success: true, reports, total: reports.length });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Review plagiarism decision
     * PUT /api/plagiarism/review/:analysisId
     */
    router.put('/plagiarism/review/:analysisId', async (req, res) => {
        try {
            const { analysisId } = req.params;
            const { decision, notes, reviewedBy } = req.body;

            const validDecisions = ['approved', 'rejected', 'appealed'];
            if (!validDecisions.includes(decision)) {
                return res.status(400).json({ error: 'Invalid decision' });
            }

            await db.query(
                `UPDATE plagiarism_analysis 
                SET review_status = ?, review_notes = ?, reviewed_by = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [decision, notes, reviewedBy, analysisId]
            );

            res.json({ success: true, message: 'Review submitted' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================================
    // GAMIFICATION ENDPOINTS
    // ============================================================

    /**
     * Get student gamification profile
     * GET /api/gamification/student/:studentId
     */
    router.get('/gamification/student/:studentId', async (req, res) => {
        try {
            const { studentId } = req.params;

            const profile = await gamification.getStudentProfile(studentId);

            if (!profile) {
                return res.status(404).json({ error: 'Student gamification profile not found' });
            }

            res.json(profile);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Get leaderboard
     * GET /api/gamification/leaderboard?limit=100
     */
    router.get('/gamification/leaderboard', async (req, res) => {
        try {
            const { limit = 100 } = req.query;

            const leaderboard = await gamification.getLeaderboard(parseInt(limit));

            res.json({ success: true, leaderboard });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Get recent achievements
     * GET /api/gamification/achievements/:studentId
     */
    router.get('/gamification/achievements/:studentId', async (req, res) => {
        try {
            const { studentId } = req.params;
            const { limit = 10 } = req.query;

            const achievements = await gamification.getRecentAchievements(studentId, parseInt(limit));

            res.json({ success: true, achievements });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Award points manually (admin only)
     * POST /api/gamification/award-points
     */
    router.post('/gamification/award-points', async (req, res) => {
        try {
            const { studentId, points, source, sourceId } = req.body;

            if (!studentId || !points) {
                return res.status(400).json({ error: 'studentId and points required' });
            }

            const result = await gamification.awardPoints(
                studentId,
                points,
                source || 'manual',
                sourceId || uuidv4()
            );

            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================================
    // ANALYTICS ENDPOINTS
    // ============================================================

    /**
     * Analyze student performance
     * POST /api/analytics/analyze/:studentId
     */
    router.post('/analytics/analyze/:studentId', async (req, res) => {
        try {
            const { studentId } = req.params;

            const analysis = await analytics.analyzeStudentPerformance(studentId);

            res.json({ success: true, analysis });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Get student analytics
     * GET /api/analytics/student/:studentId
     */
    router.get('/analytics/student/:studentId', async (req, res) => {
        try {
            const { studentId } = req.params;

            const [studentAnalytics] = await db.query(
                'SELECT * FROM student_analytics WHERE student_id = ?',
                [studentId]
            );

            if (studentAnalytics.length === 0) {
                return res.status(404).json({ error: 'Analytics not found' });
            }

            res.json(studentAnalytics[0]);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Get at-risk students
     * GET /api/analytics/at-risk?mentorId=&limit=20
     */
    router.get('/analytics/at-risk', async (req, res) => {
        try {
            const { mentorId, limit = 20 } = req.query;

            if (!mentorId) {
                return res.status(400).json({ error: 'mentorId required' });
            }

            const atRiskStudents = await analytics.getAtRiskStudents(mentorId, parseInt(limit));

            res.json({ success: true, atRiskStudents });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Get student recommendations
     * GET /api/analytics/recommendations/:studentId
     */
    router.get('/analytics/recommendations/:studentId', async (req, res) => {
        try {
            const { studentId } = req.params;

            const [studentAnalytics] = await db.query(
                'SELECT * FROM student_analytics WHERE student_id = ?',
                [studentId]
            );

            if (studentAnalytics.length === 0) {
                return res.status(404).json({ error: 'Analytics not found' });
            }

            const weakConcepts = JSON.parse(studentAnalytics[0].weak_concepts || '[]');
            const recommendations = await analytics.generateRecommendations(
                studentId,
                weakConcepts,
                studentAnalytics[0].risk_score
            );

            res.json({ success: true, recommendations });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ============================================================
    // VIOLATION SCORING ENDPOINTS
    // ============================================================

    /**
     * Process violation event
     * POST /api/violations/process
     */
    router.post('/violations/process', async (req, res) => {
        try {
            const { attemptId, testId, studentId, violationType, eventData } = req.body;

            if (!attemptId || !studentId || !violationType) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            const result = await violationScoring.processViolationEvent(
                attemptId,
                testId,
                studentId,
                violationType,
                eventData
            );

            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Get violation summary for attempt
     * GET /api/violations/summary/:attemptId
     */
    router.get('/violations/summary/:attemptId', async (req, res) => {
        try {
            const { attemptId } = req.params;

            const summary = await violationScoring.getViolationSummary(attemptId);

            res.json(summary);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Detect behavioral anomalies
     * POST /api/violations/detect-behavioral
     */
    router.post('/violations/detect-behavioral', async (req, res) => {
        try {
            const { studentId, attemptId, behavioralMetrics } = req.body;

            if (!studentId || !attemptId) {
                return res.status(400).json({ error: 'studentId and attemptId required' });
            }

            const result = await violationScoring.detectBehavioralAnomalies(
                studentId,
                attemptId,
                behavioralMetrics
            );

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Get pending violation reviews
     * GET /api/violations/pending?limit=50
     */
    router.get('/violations/pending', async (req, res) => {
        try {
            const { limit = 50 } = req.query;

            const pending = await violationScoring.getPendingReviews(parseInt(limit));

            res.json({ success: true, pending });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Review violation decision
     * PUT /api/violations/review/:decisionId
     */
    router.put('/violations/review/:decisionId', async (req, res) => {
        try {
            const { decisionId } = req.params;
            const { reviewedBy, decision, notes } = req.body;

            if (!decision) {
                return res.status(400).json({ error: 'decision required' });
            }

            const result = await violationScoring.reviewDisqualificationDecision(
                decisionId,
                reviewedBy,
                decision,
                notes
            );

            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * Configure test violation rules
     * POST /api/violations/configure/:testId
     */
    router.post('/violations/configure/:testId', async (req, res) => {
        try {
            const { testId } = req.params;
            const { rules } = req.body;

            if (!Array.isArray(rules)) {
                return res.status(400).json({ error: 'rules must be an array' });
            }

            const result = await violationScoring.configureTestViolationRules(testId, rules);

            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};
