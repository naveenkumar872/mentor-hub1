/**
 * Violation Scoring Service
 * - Automated violation severity calculation
 * - Auto-disqualification logic
 * - Behavioral anomaly detection
 */

const { v4: uuidv4 } = require('uuid');

class ViolationScoringService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Process violation event and update cumulative score
     */
    async processViolationEvent(attemptId, testId, studentId, violationType, eventData = {}) {
        try {
            // Get violation rule configuration
            const [rule] = await this.db.query(
                'SELECT * FROM violation_rules WHERE violation_type = ?',
                [violationType]
            );

            if (rule.length === 0) {
                console.warn(`No rule found for violation type: ${violationType}`);
                return { processed: false };
            }

            const violationRule = rule[0];

            // Get test-specific override if exists
            const [testConfig] = await this.db.query(
                `SELECT * FROM test_violation_config 
                WHERE test_id = ? AND violation_rule_id = ?`,
                [testId, violationRule.id]
            );

            const severity = testConfig.length > 0 && testConfig[0].severity_override
                ? testConfig[0].severity_override
                : violationRule.base_severity;

            // Check if we should auto-disqualify based on rule
            const shouldAutoDisqualify = violationRule.is_auto_disqualify;

            // Get current attempt scores
            const [attempt] = await this.db.query(
                'SELECT * FROM skill_test_attempts WHERE id = ?',
                [attemptId]
            );

            if (attempt.length === 0) {
                console.warn(`Attempt not found: ${attemptId}`);
                return { processed: false };
            }

            // Log the violation
            const violationLogId = uuidv4();
            await this.db.query(
                `INSERT INTO proctoring_logs 
                (id, attempt_id, student_id, event_type, violation_score, cumulative_violation_score, should_disqualify)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [violationLogId, attemptId, studentId, violationType, severity, severity, shouldAutoDisqualify]
            );

            // Get cumulative score for this attempt
            const cumulativeScore = await this.calculateCumulativeViolationScore(attemptId);

            // Check if score exceeds threshold
            const [testData] = await this.db.query(
                'SELECT * FROM global_tests WHERE id = ?',
                [testId]
            );

            const maxThreshold = 100; // Default threshold
            const shouldDisqualify = shouldAutoDisqualify || cumulativeScore > maxThreshold;

            // Update attempt with cumulative score
            await this.db.query(
                `UPDATE skill_test_attempts 
                SET cumulative_violation_score = ?, should_disqualify = ?
                WHERE id = ?`,
                [cumulativeScore, shouldDisqualify ? 1 : 0, attemptId]
            );

            // Store decision
            if (shouldDisqualify) {
                await this.storeDisqualificationDecision(attemptId, testId, studentId, cumulativeScore, violationType);
            }

            return {
                processed: true,
                violationLogged: violationLogId,
                severity,
                cumulativeScore,
                shouldDisqualify,
                message: shouldDisqualify ? 'Auto-disqualified due to violations' : 'Violation logged'
            };
        } catch (error) {
            console.error('Error processing violation event:', error);
            throw error;
        }
    }

    /**
     * Calculate cumulative violation score for attempt
     */
    async calculateCumulativeViolationScore(attemptId) {
        try {
            const [violations] = await this.db.query(
                `SELECT SUM(violation_score) as total FROM proctoring_logs 
                WHERE attempt_id = ?`,
                [attemptId]
            );

            return violations[0].total || 0;
        } catch (error) {
            console.error('Error calculating cumulative score:', error);
            return 0;
        }
    }

    /**
     * Store auto-disqualification decision
     */
    async storeDisqualificationDecision(attemptId, testId, studentId, violationScore, reason) {
        try {
            const decisionId = uuidv4();

            await this.db.query(
                `INSERT INTO violation_scoring_decisions 
                (id, attempt_id, test_id, student_id, total_violation_score, auto_disqualified, disqualification_reason, manual_review_needed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [decisionId, attemptId, testId, studentId, violationScore, 1, reason, 1]
            );

            return decisionId;
        } catch (error) {
            console.error('Error storing disqualification decision:', error);
            throw error;
        }
    }

    /**
     * Check for behavioral anomalies
     */
    async detectBehavioralAnomalies(studentId, attemptId, behavioralMetrics) {
        try {
            // Get student's baseline profile
            const [profile] = await this.db.query(
                'SELECT * FROM behavioral_profiles WHERE student_id = ?',
                [studentId]
            );

            if (profile.length === 0) {
                // Create initial profile
                await this.db.query(
                    `INSERT INTO behavioral_profiles 
                    (id, student_id, baseline_typing_speed, baseline_pause_interval)
                    VALUES (?, ?, ?, ?)`,
                    [uuidv4(), studentId, behavioralMetrics.typingSpeed, behavioralMetrics.pauseInterval]
                );
                return { anomaliesDetected: false };
            }

            const baselineProfile = profile[0];
            let anomalieScore = 0;
            const anomalies = [];

            // Check typing speed deviation
            if (behavioralMetrics.typingSpeed) {
                const speedDev = Math.abs(behavioralMetrics.typingSpeed - (baselineProfile.baseline_typing_speed || 0));
                const speedDevPercent = speedDev / Math.max(baselineProfile.baseline_typing_speed, 1) * 100;

                if (speedDevPercent > 50) {
                    anomalieScore += 20;
                    anomalies.push({
                        type: 'unusual_typing_speed',
                        deviation: speedDevPercent,
                        severity: 'high'
                    });
                }
            }

            // Check pause intervals
            if (behavioralMetrics.pauseInterval) {
                const pauseDev = Math.abs(behavioralMetrics.pauseInterval - (baselineProfile.baseline_pause_interval || 0));
                const pauseDevPercent = pauseDev / Math.max(baselineProfile.baseline_pause_interval, 1) * 100;

                if (pauseDevPercent > 40) {
                    anomalieScore += 15;
                    anomalies.push({
                        type: 'unusual_pause_pattern',
                        deviation: pauseDevPercent,
                        severity: 'medium'
                    });
                }
            }

            // Log behavioral event
            if (anomalieScore > 0) {
                await this.db.query(
                    `INSERT INTO behavioral_events 
                    (id, student_id, attempt_id, event_type, event_data, suspicion_score)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        uuidv4(),
                        studentId,
                        attemptId,
                        'behavioral_anomaly',
                        JSON.stringify({ metrics: behavioralMetrics, anomalies }),
                        anomalieScore
                    ]
                );

                // If significant anomaly, log as violation
                if (anomalieScore > 30) {
                    await this.processViolationEvent(
                        attemptId,
                        null,
                        studentId,
                        'suspicious_keystroke_pattern',
                        { anomalieScore, anomalies }
                    );
                }
            }

            return {
                anomaliesDetected: anomalieScore > 0,
                anomalieScore,
                anomalies
            };
        } catch (error) {
            console.error('Error detecting behavioral anomalies:', error);
            throw error;
        }
    }

    /**
     * Get violation summary for attempt
     */
    async getViolationSummary(attemptId) {
        try {
            const [violations] = await this.db.query(
                `SELECT 
                    event_type,
                    COUNT(*) as count,
                    SUM(violation_score) as total_score,
                    MAX(violation_score) as max_score
                FROM proctoring_logs
                WHERE attempt_id = ?
                GROUP BY event_type`,
                [attemptId]
            );

            const cumulativeScore = await this.calculateCumulativeViolationScore(attemptId);

            const [decision] = await this.db.query(
                `SELECT * FROM violation_scoring_decisions 
                WHERE attempt_id = ?`,
                [attemptId]
            );

            return {
                attemptId,
                violations: violations.map(v => ({
                    type: v.event_type,
                    count: v.count,
                    totalScore: v.total_score,
                    maxScore: v.max_score
                })),
                cumulativeScore,
                decision: decision.length > 0 ? decision[0] : null
            };
        } catch (error) {
            console.error('Error getting violation summary:', error);
            throw error;
        }
    }

    /**
     * Review and approve/reject disqualification
     */
    async reviewDisqualificationDecision(decisionId, reviewedBy, decision, notes) {
        try {
            const validDecisions = ['approved', 'rejected', 'conditional'];

            if (!validDecisions.includes(decision)) {
                throw new Error(`Invalid decision: ${decision}`);
            }

            await this.db.query(
                `UPDATE violation_scoring_decisions 
                SET reviewed_by = ?, review_decision = ?, review_notes = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [reviewedBy, decision, notes, decisionId]
            );

            return { success: true, decision };
        } catch (error) {
            console.error('Error reviewing decision:', error);
            throw error;
        }
    }

    /**
     * Get pending review violations
     */
    async getPendingReviews(limit = 50) {
        try {
            const [rows] = await this.db.query(
                `SELECT 
                    vsd.*,
                    u.name as student_name,
                    u.email,
                    gt.title as test_name
                FROM violation_scoring_decisions vsd
                INNER JOIN users u ON vsd.student_id = u.id
                LEFT JOIN global_tests gt ON vsd.test_id = gt.id
                WHERE vsd.manual_review_needed = TRUE AND vsd.review_decision IS NULL
                ORDER BY vsd.created_at ASC
                LIMIT ?`,
                [limit]
            );
            return rows;
        } catch (error) {
            console.error('Error getting pending reviews:', error);
            throw error;
        }
    }

    /**
     * Configure violation rules for specific test
     */
    async configureTestViolationRules(testId, rules) {
        try {
            // Get all violation rules
            const [allRules] = await this.db.query(
                'SELECT id FROM violation_rules'
            );

            for (const rule of allRules) {
                // Remove existing config
                await this.db.query(
                    `DELETE FROM test_violation_config 
                    WHERE test_id = ? AND violation_rule_id = ?`,
                    [testId, rule.id]
                );
            }

            // Insert new configuration
            for (const ruleConfig of rules) {
                const [ruleData] = await this.db.query(
                    'SELECT id FROM violation_rules WHERE violation_type = ?',
                    [ruleConfig.violationType]
                );

                if (ruleData.length > 0) {
                    await this.db.query(
                        `INSERT INTO test_violation_config 
                        (id, test_id, violation_rule_id, severity_override, enabled)
                        VALUES (?, ?, ?, ?, ?)`,
                        [
                            uuidv4(),
                            testId,
                            ruleData[0].id,
                            ruleConfig.severityOverride || null,
                            ruleConfig.enabled !== false ? 1 : 0
                        ]
                    );
                }
            }

            return { success: true };
        } catch (error) {
            console.error('Error configuring test violation rules:', error);
            throw error;
        }
    }
}

module.exports = ViolationScoringService;
