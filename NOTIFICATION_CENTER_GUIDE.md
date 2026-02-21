# Feature #3: Notification Center - Integration Guide

## Overview
Complete notification center system with persistent storage, real-time Socket.io updates, preferences management, and email digest support.

## What Was Implemented

### 1. **Database Schema** (4 new tables)
- `notifications` - Main notification storage with type, priority, read status
- `notification_preferences` - User notification settings and digest frequency  
- `notification_digests` - Scheduled digest emails tracking
- `notification_subscribers` - Multi-user notification support

### 2. **Backend Endpoints** (8 new REST APIs)

#### List Notifications
```
GET /api/notifications?page=1&limit=20&type=submission&unread_only=false
Headers: Authorization: Bearer {token}
Response: { notifications: [], pagination: { page, limit, total, pages } }
```

#### Get Unread Count
```
GET /api/notifications/unread/count
Response: { unreadCount: 5 }
```

#### Mark as Read
```
PATCH /api/notifications/:id/read
Response: { success: true }
```

#### Archive Notification
```
DELETE /api/notifications/:id
Response: { success: true }
```

#### Mark Multiple as Read
```
PATCH /api/notifications/read-multiple
Body: { notificationIds: ["id1", "id2", ...] }
```

#### Get Preferences
```
GET /api/notification-preferences
Response: {
  submission_notifications: true,
  message_notifications: true,
  test_allocated_notifications: true,
  achievement_notifications: true,
  mentor_assignment_notifications: true,
  deadline_notifications: true,
  email_digest_enabled: true,
  email_digest_frequency: "daily",
  sound_enabled: true,
  desktop_notifications: true
}
```

#### Update Preferences
```
PATCH /api/notification-preferences
Body: { email_digest_enabled: false, sound_enabled: true, ... }
```

#### Trigger Digest Email
```
GET /api/notifications/digest/send?userId=student123
Headers: Authorization (admin only)
Response: { success: true, digestSize: 15, notificationsByType: {...} }
```

### 3. **Socket.io Real-Time Events**

#### Server → Client
```javascript
// New notification received
io.to(userId).emit('notification:new', {
  id, userId, type, title, message, data, actionUrl, priority, createdAt
})

// Notification marked as read (broadcast to user's sessions)
io.to(userId).emit('notification:read', { notificationId })

// Notification archived
io.to(userId).emit('notification:archived', { notificationId })

// Unread count updated
io.to(userId).emit('unread_count', { count: 5 })
```

#### Client → Server
```javascript
// Subscribe to notifications
socket.emit('subscribe_notifications', { userId })

// Mark as read
socket.emit('notification:mark_read', { notificationId, userId })

// Archive
socket.emit('notification:archive', { notificationId, userId })

// Get current unread count
socket.emit('get_unread_count', { userId })
```

### 4. **Notification Types**
- `submission` - Code submission results
- `message` - Direct messages  
- `test_allocated` - New test assigned
- `achievement` - Badge/achievement unlocked
- `mentor_assignment` - Mentor assigned
- `deadline` - Approaching deadline reminder
- `system` - System-wide announcements
- `alert` - Plagiarism, violations, etc.

### 5. **Priority Levels**
- `low` - Information only (gray)
- `normal` - Standard notification (blue)
- `high` - Requires attention (orange)
- `critical` - Urgent action needed (red)

## Frontend Component

### NotificationCenter.jsx
Located: `client/src/components/NotificationCenter.jsx`

**Features:**
- Bell icon with unread count badge
- Slide-out notification panel (400px width)
- Pagination (20 notifications per page)
- Filter by type (all, unread, submission, message, test, achievement)
- Mark as read / Archive actions
- Real-time updates via Socket.io
- Preferences management sidebar
- Email digest frequency selection
- Responsive design (mobile-friendly)

**Integration:**
```jsx
import NotificationCenter from './components/NotificationCenter'
import { useContext } from 'react'

// In your header/navbar
function NavBar({ socket }) {
  return (
    <header>
      {/* Other navbar items */}
      <NotificationCenter socket={socket} />
    </header>
  )
}
```

### CSS Styling
Located: `client/src/styles/NotificationCenter.css`

**Classes:**
- `.notification-center` - Container
- `.notification-bell` - Bell button
- `.notification-badge` - Unread count badge
- `.notification-panel` - Slide-out panel
- `.notification-item` - Individual notification
- `.notification-preferences` - Preferences sidebar
- `.notification-filters` - Type filter buttons

## Backend Service

### NotificationsService Class
Located: `services/notifications_service.js`

**Usage:**
```javascript
const NotificationsService = require('./services/notifications_service');
const notifService = new NotificationsService(pool, io);

// Create submission result notification
await notifService.notifySubmissionResult(userId, {
  problemTitle: 'Fibonacci Sequence',
  status: 'success',
  score: 95,
  feedback: 'Excellent solution!'
});

// Create test allocation
await notifService.notifyTestAllocated(userId, {
  testName: 'Advanced DSA',
  deadline: new Date('2024-12-31'),
  testId: 'test123'
});

// Create achievement
await notifService.notifyAchievementUnlocked(userId, {
  badgeName: '10 Problems Solved',
  badgeDescription: 'You solved 10 problems!',
  icon: '🏆'
});

// Create direct message notification
await notifService.notifyDirectMessage(userId, {
  senderId: 'mentor123',
  senderName: 'John Mentor',
  messagePreview: 'Great job on the last submission!',
  messageId: 'msg123'
});

// Broadcast to multiple users
await notifService.broadcastNotification(
  [userId1, userId2, userId3],
  'system',
  'Server Maintenance',
  'Maintenance window: 2:00 AM - 3:00 AM',
  {}
);

// Get unread count
const count = await notifService.getUnreadCount(userId);

// Schedule digest email
await notifService.scheduleDigestEmail(userId, 'daily');

// Get digest notifications
const notifications = await notifService.getDigestNotifications(userId, 50);
```

## Integration Example: Submission Result

### 1. Backend Integration (server.js)

```javascript
// Initialize service
const NotificationsService = require('./services/notifications_service');
const notifService = new NotificationsService(pool, io);

// After submission is evaluated
app.post('/api/submissions/:submissionId/evaluate', async (req, res) => {
  // ... evaluation logic

  // Send notification
  await notifService.notifySubmissionResult(submission.userId, {
    problemTitle: problem.title,
    status: passed ? 'success' : 'failed',
    score: obtained_score,
    feedback: feedback_message
  });

  res.json({ success: true });
});
```

### 2. Frontend Integration (StudentPortal.jsx)

```jsx
import NotificationCenter from './components/NotificationCenter';

function StudentPortal({ socket }) {
  useEffect(() => {
    // Subscribe to notifications
    socket.emit('subscribe_notifications', { userId: user.id });

    // Listen for new notifications
    socket.on('notification:new', (notification) => {
      // Update UI, show toast, etc.
      showToast(`${notification.title}: ${notification.message}`);
    });

    return () => {
      socket.off('notification:new');
    };
  }, [socket, user.id]);

  return (
    <header>
      <NotificationCenter socket={socket} />
    </header>
  );
}
```

## Database Migration

Run migration to create all tables:
```bash
cd mentor-hub1
node migrate_notifications.js
```

This creates:
- `notifications` (75 records max per user)
- `notification_preferences` (1 record per user)
- `notification_digests` (scheduled emails)
- `notification_subscribers` (multi-user support)

## Email Digest (TODO - Implementation)

The digest system is ready for integration with an email service:

```javascript
// Email service integration needed:
// - SMTP configuration
// - Email template generation
// - Scheduled digest job (cron)
// - HTML email formatting

// Example: Using nodemailer
const nodemailer = require('nodemailer');

async function sendDigestEmail(userId, notifications) {
  const html = generateDigestHTML(notifications);
  
  await transporter.sendMail({
    to: user.email,
    subject: `Your Daily Notification Digest - ${new Date().toLocaleDateString()}`,
    html: html
  });
}
```

## Testing Checklist

- [ ] Database: All 4 tables created successfully
- [ ] API: GET /api/notifications returns paginated list
- [ ] API: PATCH mark as read works correctly
- [ ] API: DELETE archives notification
- [ ] API: GET preferences returns user settings
- [ ] Socket.io: Subscribe notifications works
- [ ] Socket.io: Real-time notification:new event received
- [ ] Frontend: NotificationCenter component displays
- [ ] Frontend: Bell icon shows unread badge
- [ ] Frontend: Click mark-as-read updates UI
- [ ] Frontend: Filter buttons work (all, unread, by type)
- [ ] Frontend: Preferences panel opens/closes
- [ ] Preferences: Changes persist to database

## Next Steps

1. **Integrate NotificationCenter into all portals** (Student, Mentor, Admin)
2. **Add notification creation calls** in submission evaluation logic
3. **Add notification creation calls** in test allocation logic
4. **Add notification creation calls** in achievement/badge unlock logic
5. **Implement email digest** using nodemailer or SendGrid
6. **Add cron job** for scheduled digest emails
7. **Add desktop notification** permission request and support
8. **Add notification sounds** (optional)
9. **Add notification analytics** (which types are read most, etc.)
10. **Mobile app integration** for push notifications

## Performance Considerations

- **Pagination**: Default 20 per page to avoid loading all notifications
- **Indexes**: 5 indexes on notifications table for fast queries (user_id, type, read_at, created_at, composite)
- **Socket.io rooms**: Each user gets their own room for targeted broadcasts
- **Archiving**: Old notifications archived instead of deleted for audit trail
- **Caching**: Consider caching unread count in Redis for high-traffic apps

## Security Notes

- ✅ All endpoints require authentication
- ✅ Users can only see/modify their own notifications
- ✅ Admin digest endpoint guarded with authorize() middleware
- ✅ SQL injection prevented with parameterized queries
- ✅ Rate limiting applied via tier-based middleware
- ✅ Socket.io only broadcasts to intended recipient room

## Files Created/Modified

**New Files:**
- `migrate_notifications.js` - Database migration
- `services/notifications_service.js` - Backend service
- `client/src/components/NotificationCenter.jsx` - React component
- `client/src/styles/NotificationCenter.css` - Component styles

**Modified Files:**
- `server.js` - Added 8 API endpoints + Socket.io handlers
- (To be updated) - App.jsx - Add NotificationCenter to header
- (To be updated) - PortalHeader component - Include NotificationCenter

## Statistics

- **Lines of backend code**: ~400 (8 endpoints + Socket.io handlers)
- **Lines of frontend code**: ~450 (React component + hooks)
- **Lines of CSS**: ~350
- **Service methods**: 10 core methods for easy integration
- **Database tables**: 4 new tables with proper indexing
- **API endpoints**: 8 REST + 4 Socket.io events
- **Time estimate**: 2-3 days to full implementation and testing
