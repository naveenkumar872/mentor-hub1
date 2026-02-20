/**
 * Gamification Service
 * - Points calculation
 * - Badge awards
 * - Streak tracking
 * - Leaderboard management
 */

const { v4: uuidv4 } = require('uuid');

class GamificationService {
    constructor(db) {
        this.db = db;
        this.POINTS_CONFIG = {
            problemSolved: 50,
            problemPerfect: 100,
            testCompleted: 75,
            testPerfect: 200,
            speedBonus: 25, // For solving in < 2 mins
            helpfulComment: 10,
            codeReview: 15,
            firstAttemptSuccess: 20
        };
    }

    /**
     * Award points to student
     */
    async awardPoints(studentId, pointsEarned, source, sourceId, multiplier = 1.0) {
        const finalPoints = Math.round(pointsEarned * multiplier);
        const historyId = uuidv4();

        try {
            // Record in history
            await this.db.query(
                `INSERT INTO points_history 
                (id, student_id, points_earned, source, source_id, multiplier) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [historyId, studentId, finalPoints, source, sourceId, multiplier]
            );

            // Update student gamification
            await this.db.query(
                `INSERT INTO student_gamification 
                (id, student_id, total_points, current_xp) 
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                total_points = total_points + ?,
                current_xp = current_xp + ?,
                updated_at = CURRENT_TIMESTAMP`,
                [uuidv4(), studentId, finalPoints, finalPoints, finalPoints, finalPoints]
            );

            // Check for level up
            const [student] = await this.db.query(
                'SELECT * FROM student_gamification WHERE student_id = ?',
                [studentId]
            );

            if (student.length > 0) {
                await this.checkLevelUp(studentId, student[0]);
            }

            return { success: true, pointsAwarded: finalPoints };
        } catch (error) {
            console.error('Error awarding points:', error);
            throw error;
        }
    }

    /**
     * Check and apply level up
     */
    async checkLevelUp(studentId, studentGamification) {
        const nextLevelXp = studentGamification.level * 1000;

        if (studentGamification.current_xp >= nextLevelXp) {
            const newLevel = studentGamification.level + 1;
            const bonusPoints = newLevel * 50; // Level up bonus

            await this.db.query(
                `UPDATE student_gamification 
                SET level = ?, current_xp = 0, next_level_xp = ?, total_points = total_points + ?
                WHERE student_id = ?`,
                [newLevel, newLevel * 1000, bonusPoints, studentId]
            );

            // Award level up badge if exists
            await this.checkAndAwardLevelBadges(studentId, newLevel);

            return { leveledUp: true, newLevel, bonusPoints };
        }

        return { leveledUp: false };
    }

    /**
     * Award badge to student
     */
    async awardBadge(studentId, badgeName) {
        try {
            // Get badge ID
            const [badge] = await this.db.query(
                'SELECT id, reward_points FROM badges WHERE badge_name = ?',
                [badgeName]
            );

            if (badge.length === 0) {
                console.warn(`Badge not found: ${badgeName}`);
                return { success: false, message: 'Badge not found' };
            }

            const badgeId = badge[0].id;
            const badgePoints = badge[0].reward_points || 0;

            // Check if already awarded
            const [existing] = await this.db.query(
                'SELECT id FROM student_badges WHERE student_id = ? AND badge_id = ?',
                [studentId, badgeId]
            );

            if (existing.length > 0) {
                return { success: false, message: 'Badge already awarded' };
            }

            // Award badge
            await this.db.query(
                `INSERT INTO student_badges (id, student_id, badge_id) 
                VALUES (?, ?, ?)`,
                [uuidv4(), studentId, badgeId]
            );

            // Award bonus points
            if (badgePoints > 0) {
                await this.awardPoints(studentId, badgePoints, 'badge', badgeId);
            }

            return { success: true, pointsAwarded: badgePoints };
        } catch (error) {
            console.error('Error awarding badge:', error);
            throw error;
        }
    }

    /**
     * Check and award level-based badges
     */
    async checkAndAwardLevelBadges(studentId, level) {
        const levelBadges = {
            1: 'First Step',
            5: 'Rising Star',
            10: 'Elite Coder'
        };

        if (levelBadges[level]) {
            await this.awardBadge(studentId, levelBadges[level]);
        }
    }

    /**
     * Award problem completion points and badges
     */
    async awardProblemCompletion(studentId, problemId, isFirstAttempt, solutionTime) {
        let totalPoints = this.POINTS_CONFIG.problemSolved;

        // Perfect score bonus
        totalPoints += this.POINTS_CONFIG.problemPerfect;

        // Speed bonus (< 2 minutes)
        if (solutionTime < 120) {
            totalPoints += this.POINTS_CONFIG.speedBonus;
        }

        // First attempt bonus
        if (isFirstAttempt) {
            totalPoints += this.POINTS_CONFIG.firstAttemptSuccess;
        }

        await this.awardPoints(studentId, totalPoints, 'problem', problemId);

        // Check for badges
        const [totalProblems] = await this.db.query(
            'SELECT COUNT(*) as count FROM submissions WHERE student_id = ? AND status = "accepted"',
            [studentId]
        );

        if (totalProblems[0].count === 10) {
            await this.awardBadge(studentId, 'Code Master');
        }

        if (solutionTime < 120) {
            await this.awardBadge(studentId, 'Speed Coder');
        }

        return { totalPoints };
    }

    /**
     * Award test completion points
     */
    async awardTestCompletion(studentId, testId, score) {
        let totalPoints = this.POINTS_CONFIG.testCompleted;

        // Perfect score bonus
        if (score === 100) {
            totalPoints += this.POINTS_CONFIG.testPerfect;
            await this.awardBadge(studentId, 'Perfect Score');
        }

        await this.awardPoints(studentId, totalPoints, 'test', testId);

        return { totalPoints };
    }

    /**
     * Update streak
     */
    async updateStreak(studentId) {
        try {
            const today = new Date().toISOString().split('T')[0];

            const [streak] = await this.db.query(
                'SELECT * FROM streak_tracking WHERE student_id = ?',
                [studentId]
            );

            if (streak.length === 0) {
                // First activity
                await this.db.query(
                    `INSERT INTO streak_tracking 
                    (id, student_id, streak_type, current_streak, longest_streak, last_activity_date)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [uuidv4(), studentId, 'daily', 1, 1, today]
                );
            } else {
                const lastDate = streak[0].last_activity_date
                    ? new Date(streak[0].last_activity_date).toISOString().split('T')[0]
                    : null;
                const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

                let newStreak = streak[0].current_streak;

                // Continue streak if activity was yesterday or today
                if (lastDate === yesterday || lastDate === today) {
                    newStreak = streak[0].current_streak + 1;
                } else if (lastDate !== today) {
                    // Streak broken if no activity since yesterday
                    newStreak = 1;
                }

                const longestStreak = Math.max(newStreak, streak[0].longest_streak || 0);

                await this.db.query(
                    `UPDATE streak_tracking 
                    SET current_streak = ?, longest_streak = ?, last_activity_date = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE student_id = ?`,
                    [newStreak, longestStreak, today, studentId]
                );

                // Check for streak badges
                if (newStreak === 7) {
                    await this.awardBadge(studentId, 'Consistent Performer');
                }

                return { currentStreak: newStreak, longestStreak };
            }
        } catch (error) {
            console.error('Error updating streak:', error);
        }
    }

    /**
     * Get leaderboard
     */
    async getLeaderboard(limit = 100, filter = 'global') {
        try {
            let query = `
                SELECT 
                    sg.student_id,
                    u.name,
                    u.email,
                    sg.total_points,
                    sg.level,
                    sg.current_streak,
                    sg.longest_streak,
                    COUNT(sb.id) as badge_count
                FROM student_gamification sg
                LEFT JOIN users u ON sg.student_id = u.id
                LEFT JOIN student_badges sb ON sg.student_id = sb.student_id
                WHERE u.role = 'student'
                GROUP BY sg.student_id, u.name, u.email, sg.total_points, sg.level, sg.current_streak, sg.longest_streak
                ORDER BY sg.total_points DESC
                LIMIT ?
            `;

            const [leaderboard] = await this.db.query(query, [limit]);

            // Add ranks
            return leaderboard.map((entry, index) => ({
                ...entry,
                rank: index + 1
            }));
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            throw error;
        }
    }

    /**
     * Get student gamification profile
     */
    async getStudentProfile(studentId) {
        try {
            const [gamification] = await this.db.query(
                'SELECT * FROM student_gamification WHERE student_id = ?',
                [studentId]
            );

            if (gamification.length === 0) {
                return null;
            }

            const [badges] = await this.db.query(
                `SELECT b.* FROM badges b
                INNER JOIN student_badges sb ON b.id = sb.badge_id
                WHERE sb.student_id = ?`,
                [studentId]
            );

            const [streak] = await this.db.query(
                'SELECT * FROM streak_tracking WHERE student_id = ?',
                [studentId]
            );

            const [rank] = await this.db.query(
                `SELECT COUNT(*) as \`rank\` FROM student_gamification 
                WHERE total_points > (SELECT total_points FROM student_gamification WHERE student_id = ?)`,
                [studentId]
            );

            return {
                ...gamification[0],
                badges,
                streak: streak.length > 0 ? streak[0] : null,
                currentRank: rank[0].rank + 1
            };
        } catch (error) {
            console.error('Error getting student profile:', error);
            throw error;
        }
    }

    /**
     * Get recent achievements
     */
    async getRecentAchievements(studentId, limit = 10) {
        try {
            const [rows] = await this.db.query(
                `SELECT * FROM points_history 
                WHERE student_id = ? 
                ORDER BY created_at DESC 
                LIMIT ?`,
                [studentId, limit]
            );
            return rows;
        } catch (error) {
            console.error('Error getting achievements:', error);
            throw error;
        }
    }
}

module.exports = GamificationService;
