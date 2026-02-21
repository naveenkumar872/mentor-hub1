# Notification System - Quick Reference

## 🚀 Quick Start

### 1. Run Migration
```bash
node migrate_notifications.js
```

### 2. Add NotificationCenter to Header
```jsx
import NotificationCenter from './components/NotificationCenter'

// In your navbar/header component
<NotificationCenter socket={socket} />
```

### 3. Send a Notification
```javascript
const NotificationsService = require('./services/notifications_service');
const notifService = new NotificationsService(pool, io);

// When submission completes:
await notifService.notifySubmissionResult(userId, {
  problemTitle: 'Arrays 101',
  status: 'success',
  score: 100,
  feedback: 'Perfect solution!'
});
```

---

## 📬 API Endpoints Cheat Sheet

### Get Notifications
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/notifications?page=1&limit=20&unread_only=true"
```

### Mark as Read
```bash
curl -X PATCH -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/notifications/NOTIFICATION_ID/read"
```

### Archive (Delete)
```bash
curl -X DELETE -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/notifications/NOTIFICATION_ID"
```

### Get Preferences
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/api/notification-preferences"
```

### Update Preferences
```bash
curl -X PATCH -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sound_enabled":true,"email_digest_frequency":"weekly"}' \
  "http://localhost:3000/api/notification-preferences"
```

---

## 🔔 Socket.io Events

### Client Subscribe
```javascript
socket.emit('subscribe_notifications', { userId: user.id });
```

### Listen for New Notifications
```javascript
socket.on('notification:new', (notification) => {
  console.log('New notification:', notification);
  // notification = { id, userId, type, title, message, data, actionUrl, priority, createdAt }
});
```

### Mark as Read (Socket.io)
```javascript
socket.emit('notification:mark_read', { notificationId, userId });
```

### Listen for Read Status
```javascript
socket.on('notification:read', ({ notificationId }) => {
  console.log('Marked as read:', notificationId);
});
```

---

## 🛠️ Service Methods

### Create Submission Notification
```javascript
await notifService.notifySubmissionResult(userId, {
  problemTitle: string,
  status: 'success' | 'failed',
  score: number,
  feedback: string
});
```

### Create Test Notification
```javascript
await notifService.notifyTestAllocated(userId, {
  testName: string,
  deadline: Date,
  testId: string
});
```

### Create Achievement Notification
```javascript
await notifService.notifyAchievementUnlocked(userId, {
  badgeName: string,
  badgeDescription: string,
  icon: emoji
});
```

### Create Message Notification
```javascript
await notifService.notifyDirectMessage(userId, {
  senderId: string,
  senderName: string,
  messagePreview: string,
  messageId: string
});
```

### Create Mentor Assignment
```javascript
await notifService.notifyMentorAssignment(userId, {
  mentorName: string,
  mentorId: string,
  message: string
});
```

### Create Deadline Reminder
```javascript
await notifService.notifyDeadlineReminder(userId, {
  itemName: string,
  deadline: Date,
  hoursRemaining: number,
  itemId: string,
  itemType: 'problem' | 'test' | 'assignment'
});
```

### Broadcast to Multiple Users
```javascript
await notifService.broadcastNotification(
  [userId1, userId2, userId3],
  'system',
  'Server Maintenance',
  'Maintenance scheduled for 2:00 AM'
);
```

### Get Unread Count
```javascript
const count = await notifService.getUnreadCount(userId);
```

---

## 🗄️ Database Tables

### notifications
```sql
id (UUID)
user_id (VARCHAR)
type (ENUM: submission, message, test_allocated, achievement, mentor_assignment, deadline, system, alert)
title (VARCHAR 255)
message (TEXT)
data (JSON)
action_url (VARCHAR 500)
priority (ENUM: low, normal, high, critical)
read_at (TIMESTAMP NULL)
archived_at (TIMESTAMP NULL)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

### notification_preferences
```sql
id (UUID PRIMARY KEY)
user_id (VARCHAR UNIQUE)
submission_notifications (BOOLEAN DEFAULT TRUE)
message_notifications (BOOLEAN DEFAULT TRUE)
test_allocated_notifications (BOOLEAN DEFAULT TRUE)
achievement_notifications (BOOLEAN DEFAULT TRUE)
mentor_assignment_notifications (BOOLEAN DEFAULT TRUE)
deadline_notifications (BOOLEAN DEFAULT TRUE)
email_digest_enabled (BOOLEAN DEFAULT TRUE)
email_digest_frequency (ENUM: daily, weekly, never)
sound_enabled (BOOLEAN DEFAULT TRUE)
desktop_notifications (BOOLEAN DEFAULT TRUE)
```

---

## 🎨 Notification Types X Priority Matrix

| Type | Typical Priority | Color | Icon |
|------|-----------------|-------|------|
| submission | normal/high | blue/orange | 📝 |
| message | normal | blue | 💬 |
| test_allocated | high | orange | 📋 |
| achievement | normal | blue | 🏆 |
| mentor_assignment | high | orange | 👨‍🏫 |
| deadline | normal/critical | orange/red | ⏰ |
| system | normal | blue | ⚙️ |
| alert | critical | red | ⚠️ |

---

## ✅ Integration Checklist

- [ ] Migration ran successfully
- [ ] NotificationCenter imported in header
- [ ] Socket.io connection established
- [ ] Subscribe to notifications on login
- [ ] Add notification calls to submission handler
- [ ] Add notification calls to test allocation
- [ ] Add notification calls to achievement unlock
- [ ] Add notification calls to message sent
- [ ] Test unread badge appears
- [ ] Test mark as read works
- [ ] Test archive works
- [ ] Test preferences save
- [ ] Test real-time updates via Socket.io
- [ ] Mobile responsive working

---

## 🐛 Debugging

### Check Database
```sql
-- See all notifications for a user
SELECT * FROM notifications WHERE user_id = 'USER_ID' ORDER BY created_at DESC;

-- Check if user has preferences
SELECT * FROM notification_preferences WHERE user_id = 'USER_ID';

-- See unread count
SELECT COUNT(*) FROM notifications WHERE user_id = 'USER_ID' AND read_at IS NULL;
```

### Check Socket.io Connection
```javascript
// In browser console after login
console.log(socket.id); // Should show socket ID
socket.on('notification:new', (n) => console.log('Got:', n));
```

### Check API Response
```bash
# Get token from login first
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass"}' | jq -r '.token')

# Test API
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/notifications/unread/count
```

---

## 📊 Query Patterns

### Get unread notifications by priority
```sql
SELECT * FROM notifications 
WHERE user_id = ? AND read_at IS NULL AND archived_at IS NULL
ORDER BY FIELD(priority, 'critical', 'high', 'normal', 'low'), created_at DESC;
```

### Get notification summary by type
```sql
SELECT type, COUNT(*) as count, SUM(IF(read_at IS NULL, 1, 0)) as unread
FROM notifications
WHERE user_id = ? AND archived_at IS NULL
GROUP BY type;
```

### Get notifications from last 7 days
```sql
SELECT * FROM notifications
WHERE user_id = ? AND archived_at IS NULL
AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY created_at DESC;
```

---

## 🔐 Security Defaults

- ✅ All endpoints authenticated with JWT
- ✅ Users isolated to their own notifications
- ✅ Admin endpoints require admin role
- ✅ Rate limiting by user tier
- ✅ SQL injection prevention (prepared statements)
- ✅ XSS prevention in notification rendering

---

## 📈 Performance Tips

1. **Use pagination** - Don't load all notifications at once
2. **Cache unread count** - Update on mark_read, not on every page load  
3. **Archive old** - Archive notifications after 90 days
4. **Batch Socket.io** - Don't emit for every keystroke
5. **Index carefully** - Already optimized with 5 indexes
6. **Lazy load** - Only fetch when notification panel opens

---

## 🚦 Common Patterns

### Pattern: Notify on Submission Complete
```javascript
// In submission evaluation endpoint
app.post('/api/submissions/:id/evaluate', async (req, res) => {
  const submission = await evaluateCode(req.body);
  
  // PATTERN: Create notification
  await notifService.notifySubmissionResult(submission.userId, {
    problemTitle: submission.problem.title,
    status: submission.passed ? 'success' : 'failed',
    score: submission.score,
    feedback: submission.feedback
  });
  
  res.json({ success: true, submission });
});
```

### Pattern: Notify on Multiple Users
```javascript
// Broadcast new test to all students in batch
const students = await getStudentsInBatch(batchId);
const userIds = students.map(s => s.id);

await notifService.broadcastNotification(
  userIds,
  'test_allocated',
  '📋 New Test: Advanced DSA',
  'You have been allocated a new test: Advanced DSA. Deadline: Dec 31, 2024',
  { testId, deadline },
  `/tests/${testId}`,
  'high'
);
```

### Pattern: Socket.io Subscribe on Login
```javascript
// In StudentPortal or after user login
useEffect(() => {
  const userId = user.id;
  
  // Subscribe to this user's notifications
  socket.emit('subscribe_notifications', { userId });
  
  // Listen for new notifications
  socket.on('notification:new', (notification) => {
    // Update UI, show toast, etc.
  });
  
  return () => socket.off('notification:new');
}, [socket, user.id]);
```

---

## 📚 Related Features

This foundation enables:
- **Feature #4**: Audit logs can send security alerts
- **Feature #7**: Leaderboard can notify rank changes  
- **Feature #13**: Messages will notify with NotificationCenter
- **Feature #17**: Collaborative coding can notify session invites
- **Feature #23**: AI Test Cases can notify test results

---

## 🎓 Learning Resources

- [Socket.io Rooms & Namespaces](https://socket.io/docs/v4/rooms/)
- [MySQL Best Practices](https://dev.mysql.com/doc/)
- [React Context & Hooks](https://react.dev/reference/react)
- [Express Middleware](https://expressjs.com/en/guide/using-middleware.html)

---

**Last Updated**: 2024
**Implemented By**: Copilot
**Status**: ✅ Complete and Ready for Integration
