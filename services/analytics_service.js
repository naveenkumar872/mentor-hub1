/**
 * Predictive Analytics Service
 * - Student at-risk identification
 * - Learning curve analysis
 * - Concept mastery tracking
 * - Personalized recommendations
 */

const { v4: uuidv4 } = require('uuid');

class PredictiveAnalyticsService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Calculate comprehensive student analytics
     */
    async analyzeStudentPerformance(studentId) {
        try {
            // Get all submissions
            const [submissions] = await this.db.query(
                `SELECT * FROM submissions 
                WHERE student_id = ? 
                ORDER BY submitted_at DESC`,
                [studentId]
            );

            // Get test submissions
            const [testSubmissions] = await this.db.query(
                `SELECT * FROM global_test_submissions 
                WHERE student_id = ? 
                ORDER BY submitted_at DESC`,
                [studentId]
            );

            // Calculate metrics
            const problemMetrics = this.calculateProblemMetrics(submissions);
            const testMetrics = this.calculateTestMetrics(testSubmissions);
            const learningCurve = this.calculateLearningCurve(submissions);
            const weakConcepts = await this.identifyWeakConcepts(studentId, submissions);
            const riskScore = this.calculateRiskScore(problemMetrics, testMetrics, learningCurve);

            // Identify behavioral patterns
            const patterns = this.identifyLearningPatterns(submissions);

            // Store analytics
            await this.storeAnalytics(studentId, {
                ...problemMetrics,
                ...testMetrics,
                learningCurve,
                weakConcepts,
                strongConcepts: patterns.strongAreas,
                riskScore,
                atRisk: riskScore >= 50,
                predictionConfidence: this.calculateConfidence(submissions.length),
                patterns
            });

            return {
                studentId,
                problemMetrics,
                testMetrics,
                learningCurve,
                weakConcepts,
                strongConcepts: patterns.strongAreas,
                riskScore,
                atRisk: riskScore >= 50,
                recommendations: await this.generateRecommendations(studentId, weakConcepts, riskScore)
            };
        } catch (error) {
            console.error('Error analyzing student performance:', error);
            throw error;
        }
    }

    /**
     * Calculate problem solving metrics
     */
    calculateProblemMetrics(submissions) {
        if (submissions.length === 0) {
            return {
                totalProblems: 0,
                problemCompletionRate: 0,
                averageProblemScore: 0,
                acceptedSubmissions: 0,
                rejectedSubmissions: 0
            };
        }

        const accepted = submissions.filter(s => s.status === 'accepted').length;
        const rejected = submissions.filter(s => s.status === 'rejected').length;

        // Calculate average score (if scoring field exists)
        let scores = submissions
            .filter(s => s.score !== null && s.score !== undefined)
            .map(s => parseFloat(s.score));

        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0;

        return {
            totalProblems: submissions.length,
            problemCompletionRate: parseFloat(((accepted / submissions.length) * 100).toFixed(2)),
            averageProblemScore: parseFloat(avgScore.toFixed(2)),
            acceptedSubmissions: accepted,
            rejectedSubmissions: rejected,
            improvementRate: this.calculateImprovementRate(submissions)
        };
    }

    /**
     * Calculate test metrics
     */
    calculateTestMetrics(testSubmissions) {
        if (testSubmissions.length === 0) {
            return {
                totalTests: 0,
                testCompletionRate: 0,
                averageTestScore: 0
            };
        }

        const completed = testSubmissions.filter(s => s.status === 'completed').length;
        const scores = testSubmissions
            .filter(s => s.total_score !== null)
            .map(s => parseFloat(s.total_score));

        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : 0;

        return {
            totalTests: testSubmissions.length,
            testCompletionRate: parseFloat(((completed / testSubmissions.length) * 100).toFixed(2)),
            averageTestScore: parseFloat(avgScore.toFixed(2)),
            scoreProgress: this.calculateScoreProgress(testSubmissions)
        };
    }

    /**
     * Calculate learning curve (trend over time)
     */
    calculateLearningCurve(submissions) {
        if (submissions.length < 2) return null;

        const timeSeries = [];
        const grouped = {};

        // Group by week
        submissions.forEach(sub => {
            const date = new Date(sub.submitted_at);
            const week = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));

            if (!grouped[week]) {
                grouped[week] = {
                    accepted: 0,
                    total: 0,
                    date: date.toISOString().split('T')[0]
                };
            }

            grouped[week].total++;
            if (sub.status === 'accepted') grouped[week].accepted++;
        });

        // Convert to time series
        Object.values(grouped).forEach(week => {
            timeSeries.push({
                date: week.date,
                successRate: parseFloat(((week.accepted / week.total) * 100).toFixed(2)),
                submissions: week.total
            });
        });

        // Calculate trend: positive, stable, or declining
        if (timeSeries.length > 1) {
            const firstHalf = timeSeries.slice(0, Math.floor(timeSeries.length / 2));
            const secondHalf = timeSeries.slice(Math.floor(timeSeries.length / 2));

            const firstAvg = firstHalf.reduce((a, b) => a + b.successRate, 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((a, b) => a + b.successRate, 0) / secondHalf.length;

            const trend = secondAvg > firstAvg ? 'improving' : secondAvg < firstAvg ? 'declining' : 'stable';

            return { timeSeries, trend, improvement: secondAvg - firstAvg };
        }

        return { timeSeries, trend: 'unknown' };
    }

    /**
     * Identify weak concepts
     */
    async identifyWeakConcepts(studentId, submissions) {
        try {
            const [concepts] = await this.db.query(
                `SELECT * FROM concept_mastery 
                WHERE student_id = ? 
                ORDER BY mastery_level ASC 
                LIMIT 10`,
                [studentId]
            );

            return concepts.map(c => ({
                concept: c.concept_name,
                masteryLevel: parseFloat(c.mastery_level),
                attempts: c.attempts,
                successRate: c.attempts > 0 ? parseFloat(((c.successes / c.attempts) * 100).toFixed(2)) : 0,
                needsImprovement: c.mastery_level < 60
            }));
        } catch (error) {
            console.warn('Error identifying weak concepts:', error);
            return [];
        }
    }

    /**
     * Calculate risk score (0-100, higher = more at-risk)
     */
    calculateRiskScore(problemMetrics, testMetrics, learningCurve) {
        let riskScore = 0;

        // Problem completion rate (40% weight)
        if (problemMetrics.problemCompletionRate < 40) {
            riskScore += 40;
        } else if (problemMetrics.problemCompletionRate < 70) {
            riskScore += 20;
        }

        // Recent failures penalty
        if (problemMetrics.rejectedSubmissions > 0) {
            riskScore += 20;
        }

        // Test performance (30% weight)
        if (testMetrics.averageTestScore < 50) {
            riskScore += 30;
        } else if (testMetrics.averageTestScore < 70) {
            riskScore += 15;
        }

        // Learning curve (30% weight)
        if (learningCurve && learningCurve.trend === 'declining') {
            riskScore += 30;
        } else if (learningCurve && learningCurve.trend === 'stable' && problemMetrics.averageProblemScore < 60) {
            riskScore += 15;
        }

        return Math.min(100, Math.max(0, riskScore));
    }

    /**
     * Calculate improvement rate
     */
    calculateImprovementRate(submissions) {
        if (submissions.length < 2) return 0;

        // Get first half success rate
        const firstHalf = submissions.slice(0, Math.floor(submissions.length / 2));
        const secondHalf = submissions.slice(Math.floor(submissions.length / 2));

        const firstRate = firstHalf.filter(s => s.status === 'accepted').length / firstHalf.length;
        const secondRate = secondHalf.filter(s => s.status === 'accepted').length / secondHalf.length;

        return parseFloat(((secondRate - firstRate) * 100).toFixed(2));
    }

    /**
     * Calculate score progress over time
     */
    calculateScoreProgress(testSubmissions) {
        if (testSubmissions.length < 2) return 0;

        const scores = testSubmissions
            .filter(s => s.total_score !== null)
            .map(s => parseFloat(s.total_score));

        if (scores.length < 2) return 0;

        const first = scores[scores.length - 1];
        const last = scores[0];

        return parseFloat(((last - first) / first * 100).toFixed(2));
    }

    /**
     * Identify learning patterns
     */
    identifyLearningPatterns(submissions) {
        const patterns = {
            strongAreas: [],
            practiceFrequency: 'unknown',
            timeOfDay: {},
            languages: {}
        };

        if (submissions.length === 0) return patterns;

        // Strong areas (high success rate)
        const grouped = {};
        submissions.forEach(sub => {
            const language = sub.language || 'unknown';
            if (!grouped[language]) {
                grouped[language] = { accepted: 0, total: 0 };
            }
            grouped[language].total++;
            if (sub.status === 'accepted') grouped[language].accepted++;
        });

        Object.entries(grouped).forEach(([lang, data]) => {
            const successRate = (data.accepted / data.total) * 100;
            if (successRate > 70) {
                patterns.strongAreas.push({ language: lang, successRate });
            }
            patterns.languages[lang] = { total: data.total, successRate };
        });

        // Practice frequency (check newest submission)
        const daysDiff = Math.floor(
            (Date.now() - new Date(submissions[0].submitted_at).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (daysDiff <= 7 && submissions.length > 5) {
            patterns.practiceFrequency = 'daily';
        } else if (daysDiff <= 30 && submissions.length > 10) {
            patterns.practiceFrequency = 'regular';
        } else {
            patterns.practiceFrequency = 'occasional';
        }

        return patterns;
    }

    /**
     * Calculate confidence in predictions
     */
    calculateConfidence(dataPoints) {
        // More data = more confidence
        if (dataPoints < 5) return 0.3;
        if (dataPoints < 10) return 0.5;
        if (dataPoints < 20) return 0.7;
        if (dataPoints < 50) return 0.85;
        return 0.95;
    }

    /**
     * Generate personalized recommendations
     */
    async generateRecommendations(studentId, weakConcepts, riskScore) {
        const recommendations = [];

        // High risk recommendations
        if (riskScore > 70) {
            recommendations.push({
                type: 'urgent',
                title: 'Schedule Mentor Session',
                description: 'You are at risk. Please schedule a session with your mentor to discuss strategies.',
                priority: 'high'
            });
        }

        // Weak concept recommendations
        if (weakConcepts.length > 0) {
            weakConcepts.slice(0, 3).forEach(concept => {
                recommendations.push({
                    type: 'learning',
                    title: `Improve ${concept.concept}`,
                    description: `Your mastery in ${concept.concept} is ${concept.masteryLevel}%. Try solving more problems on this concept.`,
                    priority: 'high',
                    concept: concept.concept
                });
            });
        }

        // Practice recommendations
        if (riskScore > 50) {
            recommendations.push({
                type: 'practice',
                title: 'Increase Practice Volume',
                description: 'Try to solve at least 2-3 problems daily to improve your skills.',
                priority: 'medium'
            });
        }

        return recommendations;
    }

    /**
     * Store analytics in database
     */
    async storeAnalytics(studentId, analytics) {
        try {
            const [existingAnalytics] = await this.db.query(
                'SELECT id FROM student_analytics WHERE student_id = ?',
                [studentId]
            );

            const query = existingAnalytics.length > 0
                ? `UPDATE student_analytics SET 
                   total_tests = ?, 
                   total_problems = ?, 
                   average_test_score = ?, 
                   average_problem_score = ?, 
                   problem_completion_rate = ?,
                   test_completion_rate = ?,
                   weak_concepts = ?,
                   strong_concepts = ?,
                   learning_curve_trend = ?,
                   risk_score = ?,
                   at_risk = ?,
                   prediction_confidence = ?,
                   last_analysis_date = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
                   WHERE student_id = ?`
                : `INSERT INTO student_analytics 
                   (id, student_id, total_tests, total_problems, average_test_score, average_problem_score,
                    problem_completion_rate, test_completion_rate, weak_concepts, strong_concepts, 
                    learning_curve_trend, risk_score, at_risk, prediction_confidence, last_analysis_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;

            const params = existingAnalytics.length > 0
                ? [
                    analytics.totalTests,
                    analytics.totalProblems,
                    analytics.averageTestScore,
                    analytics.averageProblemScore,
                    analytics.problemCompletionRate,
                    analytics.testCompletionRate,
                    JSON.stringify(analytics.weakConcepts),
                    JSON.stringify(analytics.strongConcepts),
                    JSON.stringify(analytics.learningCurve),
                    analytics.riskScore,
                    analytics.atRisk ? 1 : 0,
                    analytics.predictionConfidence,
                    studentId
                ]
                : [
                    uuidv4(),
                    studentId,
                    analytics.totalTests,
                    analytics.totalProblems,
                    analytics.averageTestScore,
                    analytics.averageProblemScore,
                    analytics.problemCompletionRate,
                    analytics.testCompletionRate,
                    JSON.stringify(analytics.weakConcepts),
                    JSON.stringify(analytics.strongConcepts),
                    JSON.stringify(analytics.learningCurve),
                    analytics.riskScore,
                    analytics.atRisk ? 1 : 0,
                    analytics.predictionConfidence
                ];

            await this.db.query(query, params);
        } catch (error) {
            console.warn('Error storing analytics:', error);
        }
    }

    /**
     * Get at-risk students for mentor dashboard
     */
    async getAtRiskStudents(mentorId, limit = 20) {
        try {
            const [rows] = await this.db.query(
                `SELECT 
                    u.id,
                    u.name,
                    u.email,
                    sa.risk_score,
                    sa.average_problem_score,
                    sa.problem_completion_rate,
                    sa.last_analysis_date
                FROM student_analytics sa
                INNER JOIN users u ON sa.student_id = u.id
                INNER JOIN mentor_student_allocations msa ON u.id = msa.student_id
                WHERE msa.mentor_id = ? AND sa.at_risk = TRUE
                ORDER BY sa.risk_score DESC
                LIMIT ?`,
                [mentorId, limit]
            );
            return rows;
        } catch (error) {
            console.error('Error getting at-risk students:', error);
            throw error;
        }
    }
}

module.exports = PredictiveAnalyticsService;
