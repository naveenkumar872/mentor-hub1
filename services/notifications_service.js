/**
 * Notifications Service
 * Centralized notification creation and management
 * Used across the application to send notifications to users
 */

const { v4: uuid } = require('uuid');

class NotificationsService {
    constructor(pool, io) {
        this.pool = pool;
        this.io = io;
    }

    /**
     * Create and send a notification
     * @param {string} userId - Target user ID
     * @param {string} type - Notification type (submission, message, test_allocated, achievement, etc.)
     * @param {string} title - Notification title
     * @param {string} message - Notification message body
     * @param {object} data - Additional JSON data
     * @param {string} actionUrl - URL to navigate to when notification clicked
     * @param {string} priority - Priority level (low, normal, high, critical)
     * @returns {Promise<object>} Created notification object
     */
    async createNotification(userId, type, title, message, data = {}, actionUrl = null, priority = 'normal') {
        try {
            const id = uuid();
            await this.pool.query(
                `INSERT INTO notifications 
                 (id, user_id, type, title, message, data, action_url, priority) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, userId, type, title, message, JSON.stringify(data), actionUrl, priority]
            );

            const notification = {
                id,
                userId,
                type,
                title,
                message,
                data,
                actionUrl,
                priority,
                createdAt: new Date().toISOString()
            };

            // Emit via Socket.io for real-time
            if (this.io) {
                this.io.to(userId).emit('notification:new', notification);
            }

            return notification;
        } catch (error) {
            console.error('Error creating notification:', error.message);
            throw error;
        }
    }

    /**
     * Create notification for submission result
     */
    async notifySubmissionResult(userId, { problemTitle, status, score, feedback }) {
        const title = status === 'success' ? '✅ Submission Passed!' : '❌ Submission Failed';
        const message = `Your submission for "${problemTitle}" has been evaluated. Score: ${score}%`;
        
        return this.createNotification(
            userId,
            'submission',
            title,
            message,
            { problemTitle, status, score, feedback },
            `/problems/${problemTitle}`,
            status === 'success' ? 'normal' : 'high'
        );
    }

    /**
     * Create notification for test allocation
     */
    async notifyTestAllocated(userId, { testName, deadline, testId }) {
        const message = `You have been allocated the test "${testName}". Deadline: ${new Date(deadline).toLocaleDateString()}`;
        
        return this.createNotification(
            userId,
            'test_allocated',
            '📝 New Test Allocated',
            message,
            { testName, deadline, testId },
            `/tests/${testId}`,
            'high'
        );
    }

    /**
     * Create notification for achievement/badge unlocked
     */
    async notifyAchievementUnlocked(userId, { badgeName, badgeDescription, icon }) {
        const message = `Congratulations! You've unlocked the "${badgeName}" badge!`;
        
        return this.createNotification(
            userId,
            'achievement',
            '🏆 Achievement Unlocked',
            message,
            { badgeName, badgeDescription, icon },
            '/badges',
            'normal'
        );
    }

    /**
     * Create notification for direct message
     */
    async notifyDirectMessage(userId, { senderId, senderName, messagePreview, messageId }) {
        const message = `New message from ${senderName}: "${messagePreview.substring(0, 50)}..."`;
        
        return this.createNotification(
            userId,
            'message',
            '💬 New Message',
            message,
            { senderId, senderName, messageId },
            `/messages/${senderId}`,
            'normal'
        );
    }

    /**
     * Create notification for mentor assignment
     */
    async notifyMentorAssignment(userId, { mentorName, mentorId, message }) {
        const text = message || `You have been assigned ${mentorName} as your mentor`;
        
        return this.createNotification(
            userId,
            'mentor_assignment',
            '👨‍🏫 Mentor Assignment',
            text,
            { mentorName, mentorId },
            `/mentor/${mentorId}`,
            'high'
        );
    }

    /**
     * Create notification for deadline reminder
     */
    async notifyDeadlineReminder(userId, { itemName, deadline, hoursRemaining, itemId, itemType = 'problem' }) {
        const hours = Math.round(hoursRemaining);
        const message = `${itemName} is due in ${hours} hours`;
        
        return this.createNotification(
            userId,
            'deadline',
            '⏰ Deadline Reminder',
            message,
            { itemName, deadline, hoursRemaining, itemId, itemType },
            `/${itemType}/${itemId}`,
            hoursRemaining < 2 ? 'critical' : hoursRemaining < 24 ? 'high' : 'normal'
        );
    }

    /**
     * Create notification for plagiarism alert
     */
    async notifyPlagiarismAlert(userId, { submissionId, matchPercentage, similarStudentId, problemId }) {
        const message = `Plagiarism detected! ${matchPercentage}% similarity found.`;
        
        return this.createNotification(
            userId,
            'alert',
            '⚠️ Plagiarism Alert',
            message,
            { submissionId, matchPercentage, similarStudentId, problemId },
            `/submissions/${submissionId}`,
            'critical'
        );
    }

    /**
     * Create system notification
     */
    async notifySystem(userId, { title, message, actionUrl = null, data = {} }) {
        return this.createNotification(
            userId,
            'system',
            title,
            message,
            data,
            actionUrl,
            'normal'
        );
    }

    /**
     * Broadcast notification to multiple users
     */
    async broadcastNotification(userIds, type, title, message, data = {}, actionUrl = null, priority = 'normal') {
        try {
            const notifications = [];
            for (const userId of userIds) {
                const notification = await this.createNotification(
                    userId,
                    type,
                    title,
                    message,
                    data,
                    actionUrl,
                    priority
                );
                notifications.push(notification);
            }
            return notifications;
        } catch (error) {
            console.error('Error broadcasting notifications:', error.message);
            throw error;
        }
    }

    /**
     * Get user's unread notification count
     */
    async getUnreadCount(userId) {
        try {
            const [result] = await this.pool.query(
                'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_at IS NULL AND archived_at IS NULL',
                [userId]
            );
            return result[0]?.count || 0;
        } catch (error) {
            console.error('Error getting unread count:', error.message);
            return 0;
        }
    }

    /**
     * Schedule digest email (called by cron job or scheduler)
     */
    async scheduleDigestEmail(userId, frequency = 'daily') {
        try {
            const id = uuid();
            const scheduledFor = new Date();
            
            if (frequency === 'daily') {
                scheduledFor.setHours(9, 0, 0, 0); // 9 AM tomorrow
                scheduledFor.setDate(scheduledFor.getDate() + 1);
            } else if (frequency === 'weekly') {
                scheduledFor.setDate(scheduledFor.getDate() + 7);
            }

            await this.pool.query(
                'INSERT INTO notification_digests (id, user_id, digest_type, scheduled_for) VALUES (?, ?, ?, ?)',
                [id, userId, frequency, scheduledFor]
            );

            return id;
        } catch (error) {
            console.error('Error scheduling digest:', error.message);
            throw error;
        }
    }

    /**
     * Get digest for a user (for email)
     */
    async getDigestNotifications(userId, limit = 50) {
        try {
            const [notifications] = await this.pool.query(
                `SELECT * FROM notifications 
                 WHERE user_id = ? AND archived_at IS NULL
                 ORDER BY created_at DESC LIMIT ?`,
                [userId, limit]
            );

            return notifications.map(n => ({
                ...n,
                data: n.data ? JSON.parse(n.data) : {}
            }));
        } catch (error) {
            console.error('Error getting digest notifications:', error.message);
            return [];
        }
    }
}

module.exports = NotificationsService;
