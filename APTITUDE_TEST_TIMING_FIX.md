# Aptitude Test Start Time & End Time Fix

## Problem
The start time and end time (deadline) for aptitude tests were not working properly. When an admin created a test with specific start and end times, the student page would incorrectly show "Not Yet Started" even when the test should be available.

## Root Cause
The issue was caused by timezone handling problems:

1. **Admin Portal**: Used `datetime-local` input which provides local time, then converted to ISO string (UTC)
2. **Backend**: Stored dates in MySQL DATETIME format (no timezone info)
3. **Student Portal**: Compared dates without proper timezone normalization
4. **Result**: Timezone mismatches caused incorrect availability checks

## Changes Made

### 1. Backend (server.js)

#### Date Storage (Lines 1741-1793)
```javascript
// Before: Stored dates directly without proper formatting
startTime || null, deadline || null

// After: Convert to MySQL DATETIME format (UTC)
let formattedStartTime = null;
let formattedDeadline = null;

if (startTime) {
    formattedStartTime = new Date(startTime).toISOString().slice(0, 19).replace('T', ' ');
}

if (deadline) {
    formattedDeadline = new Date(deadline).toISOString().slice(0, 19).replace('T', ' ');
}
```

#### Date Retrieval (Lines 1675-1692 & 1717-1734)
```javascript
// Before: Returned raw database values
startTime: t.start_time,
deadline: t.deadline,

// After: Convert to ISO strings for consistent client-side handling
startTime: t.start_time ? new Date(t.start_time).toISOString() : null,
deadline: t.deadline ? new Date(t.deadline).toISOString() : null,
```

### 2. Student Portal (client/src/pages/StudentPortal.jsx)

#### Date Comparison Functions (Lines 1861-1909)
```javascript
// Before: Simple comparison with 5-minute tolerance
const hasTestStarted = (test) => {
    if (!test.startTime) return true
    const startTime = new Date(test.startTime)
    const now = new Date()
    const tolerance = 5 * 60 * 1000
    return now.getTime() >= startTime.getTime() - tolerance
}

// After: Proper UTC comparison
const hasTestStarted = (test) => {
    if (!test.startTime) return true
    
    const startTime = new Date(test.startTime)
    const now = new Date()
    
    // Compare in UTC to avoid timezone issues
    const startTimeUTC = Date.UTC(
        startTime.getUTCFullYear(),
        startTime.getUTCMonth(),
        startTime.getUTCDate(),
        startTime.getUTCHours(),
        startTime.getUTCMinutes()
    )
    
    const nowUTC = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes()
    )
    
    return nowUTC >= startTimeUTC
}
```

#### UI Display (Lines 2201-2235)
```javascript
// Before: Only showed deadline status
{test.deadline && (
    <div>
        {!hasTestStarted(test) ? 'Not Yet Started' : 'Due: ...'}
    </div>
)}

// After: Shows both start time and deadline separately
{test.startTime && (
    <div>
        {!hasTestStarted(test)
            ? `Starts: ${new Date(test.startTime).toLocaleString()}`
            : `Started: ${new Date(test.startTime).toLocaleDateString()}`
        }
    </div>
)}
{test.deadline && (
    <div>
        {hasTestExpired(test)
            ? 'Expired'
            : `Due: ${new Date(test.deadline).toLocaleString()}`
        }
    </div>
)}
```

### 3. Admin Portal (client/src/pages/AdminPortal.jsx)

#### Date Input (Lines 3248-3262)
```html
<!-- Start Time Input -->
<input
    type="datetime-local"
    value={newTest.startTime}
    onChange={e => setNewTest({ ...newTest, startTime: e.target.value })}
/>

<!-- End Time Input -->
<input
    type="datetime-local"
    value={newTest.deadline}
    onChange={e => setNewTest({ ...newTest, deadline: e.target.value })}
/>
```

#### Date Submission (Lines 2923-2930)
```javascript
// Convert local datetime to ISO string for backend
if (testPayload.startTime) {
    testPayload.startTime = new Date(testPayload.startTime).toISOString()
}
if (testPayload.deadline) {
    testPayload.deadline = new Date(testPayload.deadline).toISOString()
}
```

## How It Works Now

1. **Admin creates test**:
   - Selects start time: `2026-02-07T14:00` (local time)
   - Selects deadline: `2026-02-10T18:00` (local time)
   - Frontend converts to ISO: `2026-02-07T08:30:00.000Z` (UTC)
   - Backend stores in MySQL: `2026-02-07 08:30:00`

2. **Backend returns test**:
   - Reads from DB: `2026-02-07 08:30:00`
   - Converts to ISO: `2026-02-07T08:30:00.000Z`
   - Sends to frontend

3. **Student views test**:
   - Receives: `2026-02-07T08:30:00.000Z`
   - Compares in UTC: Current UTC vs Start UTC
   - Displays in local time: `2/7/2026, 2:00:00 PM`

## Testing Instructions

### 1. Create a Test (Admin)
```
1. Login as admin
2. Go to "Aptitude Tests"
3. Click "Create New Test"
4. Set:
   - Start Time: [Current time + 5 minutes]
   - Deadline: [Current time + 1 hour]
5. Add questions and save
```

### 2. Verify Student View
```
1. Login as student
2. Go to "Aptitude Tests"
3. Check the test card shows:
   - "Starts: [date/time]" (if not started)
   - "Due: [date/time]" (if started but not expired)
   - Button shows "Not Yet Started" (if before start time)
   - Button shows "Start Test" (if after start time)
```

### 3. Test Scenarios

#### Scenario A: Test Not Started
- Current time: 2:00 PM
- Start time: 2:10 PM
- Expected: "Not Yet Started" button, orange color

#### Scenario B: Test Available
- Current time: 2:15 PM
- Start time: 2:10 PM
- Deadline: 3:00 PM
- Expected: "Start Test" button, green color

#### Scenario C: Test Expired
- Current time: 3:05 PM
- Deadline: 3:00 PM
- Expected: "Expired" button, gray color

## Database Schema
```sql
CREATE TABLE aptitude_tests (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255),
    start_time DATETIME,  -- Stores UTC time
    deadline DATETIME,    -- Stores UTC time
    ...
);
```

## Important Notes

1. **Timezone Handling**: All dates are stored in UTC in the database and converted to local time for display
2. **Date Format**: Backend uses ISO 8601 format for API responses
3. **Comparison**: All date comparisons are done in UTC to avoid timezone issues
4. **Display**: Dates are displayed in user's local timezone using `toLocaleString()`

## Files Modified

1. `server.js` - Backend date handling
2. `client/src/pages/StudentPortal.jsx` - Student view and date comparison
3. `client/src/pages/AdminPortal.jsx` - Admin test creation

## Verification Checklist

- [ ] Admin can set start time and deadline
- [ ] Student sees correct "Not Yet Started" status before start time
- [ ] Student can start test after start time
- [ ] Student sees "Expired" status after deadline
- [ ] Dates display in correct local timezone
- [ ] Test availability works across different timezones
