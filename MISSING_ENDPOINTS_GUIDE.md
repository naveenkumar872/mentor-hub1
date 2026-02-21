# 🛠️ MISSING API ENDPOINTS - IMPLEMENTATION GUIDE

All endpoints need to return **dynamic data from database**, not static/hardcoded responses.

---

## 📌 MISSING ENDPOINTS SPECIFICATIONS

### 1. **GET /api/reports** - List Available Reports
```javascript
// What it should do:
// - Get all reports for authenticated user
// - If admin, get all reports
// - Return list with download links

// Returns:
[
  {
    reportId: "uuid",
    userId: "uuid", 
    userName: "Student Name",
    reportType: "performance",
    generateDate: "2024-02-21",
    format: "pdf",
    downloadUrl: "/api/reports/uuid/download"
  }
]

// SQL Query:
SELECT r.*, u.name as userName 
FROM export_reports r 
JOIN users u ON r.user_id = u.id 
WHERE r.user_id = ? OR ? = 'admin'
ORDER BY r.created_at DESC
```

### 2. **POST /api/reports/export** - Generate New Report
```javascript
// What it should do:
// - Create PDF report of user's performance
// - Include: submissions, scores, analytics
// - Return download link

// Request Body:
{
  userId: "uuid",
  reportType: "performance", // or "achievement" or "analytics"
  format: "pdf"
}

// Returns:
{
  success: true,
  reportId: "uuid",
  downloadUrl: "/api/reports/uuid/download",
  message: "Report generated successfully"
}

// SQL:
1. Get user submissions
2. Calculate stats
3. Generate PDF
4. Save to export_reports table
5. Return URL
```

### 3. **GET /api/badges** - Get User Badges
```javascript
// What it should do:
// - Return all badges earned by user
// - Or all badges available to earn
// - Include progress to next badge

// Returns:
{
  earned: [
    {
      badgeId: "uuid",
      badgeName: "Array Master",
      description: "Solve 10 array problems",
      icon: "🎯",
      earnedAt: "2024-02-20",
      rarity: "common"
    }
  ],
  available: [
    {
      badgeId: "uuid",
      badgeName: "Graph Expert",
      description: "Solve 10 graph problems",
      progress: "3/10", 
      icon: "📊"
    }
  ]
}

// SQL Query:
SELECT * FROM badges 
WHERE user_id = ?
ORDER BY earned_at DESC
```

### 4. **POST /api/badges/award** - Award Badge (Admin/Mentor)
```javascript
// What it should do:
// - Manually award badge to student
// - Only for admin/mentor
// - Add to badges table

// Request Body:
{
  studentId: "uuid",
  badgeName: "Array Master",
  reason: "Completed 10 array problems"
}

// Returns:
{
  success: true,
  badgeId: "uuid",
  message: "Badge awarded"
}

// SQL:
INSERT INTO badges 
  (id, user_id, badge_name, badge_icon, earned_at)
VALUES (?, ?, ?, ?, NOW())
```

### 5. **GET /api/mentors** - Search Mentors
```javascript
// What it should do:
// - Return list of mentors
// - Filter by expertise, availability
// - Show match score with current user

// Query Parameters:
// ?expertise=arrays
// ?availability=available
// ?limit=10

// Returns:
[
  {
    mentorId: "uuid",
    name: "John Mentor",
    expertise: ["Arrays", "Graphs", "DP"],
    bio: "5 years experience",
    rating: 4.8,
    reviewCount: 25,
    availability: "Available",
    matchScore: 85,
    studentCount: 8
  }
]

// SQL Query:
SELECT u.id, u.name, mp.expertise, mp.bio, mp.rating,
       IF(EXISTS(SELECT 1 FROM user_availability 
          WHERE user_id = u.id AND slots_json IS NOT NULL), 
          'Available', 'Busy') as availability
FROM users u
LEFT JOIN mentor_profiles mp ON u.id = mp.mentor_id
WHERE u.role = 'mentor'
LIMIT ?
```

### 6. **GET /api/test-generator** - Get Test Case Generator
```javascript
// What it should do:
// - Generate test cases for a problem
// - Use AI to create comprehensive cases
// - Return multiple test scenarios

// Query Parameters:
// ?problemId=uuid
// ?language=python

// Returns:
{
  problemId: "uuid",
  testCases: [
    {
      input: "[2,7,11,15], target=9",
      expectedOutput: "[0,1]",
      explanation: "Two numbers sum to target",
      edgeCase: false
    },
    {
      input: "[], target=0", 
      expectedOutput: "[]",
      explanation: "Empty array edge case",
      edgeCase: true
    }
  ],
  totalCases: 5,
  coversEdgeCases: true
}

// Implementation:
1. Get problem details
2. Call AI service (Cerebras/Groq)
3. Parse response into test cases
4. Return formatted test cases
```

### 7. **POST /api/plagiarism/check** - Check Plagiarism
```javascript
// What it should do:
// - Check submitted code against existing submissions
// - Calculate similarity percentage
// - Return matched code sections

// Request Body:
{
  studentId: "uuid",
  submissionId: "uuid",
  code: "function solve(...) {...}"
}

// Returns:
{
  submissionId: "uuid",
  similarityScore: 45,
  flagged: false,
  matches: [
    {
      otherSubmissionId: "uuid",
      similarity: 45,
      matchedCode: "function solve..."
    }
  ]
}

// Implementation:
1. Use plagiarism_detector service
2. Compare against all submissions
3. Calculate percentage match
4. Flag if > threshold
```

### 8. **GET /api/plagiarism/results** - Get Plagiarism Results
```javascript
// What it should do:
// - Return plagiarism check results for user's submissions
// - Show history of checks
// - Indicate which ones were flagged

// Returns:
{
  submissions: [
    {
      submissionId: "uuid",
      problemId: "uuid",
      problemTitle: "Two Sum",
      similarityScore: 23,
      status: "checked",
      flagged: false,
      checkedAt: "2024-02-20"
    }
  ]
}

// SQL Query:
SELECT s.*, p.title as problemTitle, plag.similarity_score
FROM submissions s
JOIN problems p ON s.problem_id = p.id
LEFT JOIN plagiarism_checks plag ON s.id = plag.submission_id
WHERE s.student_id = ?
ORDER BY s.submitted_at DESC
```

### 9. **GET /api/analytics/student** - Student Analytics Dashboard
```javascript
// What it should do:
// - Return comprehensive student statistics
// - Problems solved, success rate, weak areas
// - Performance trends over time

// Returns:
{
  overview: {
    totalProblems: 45,
    problemsSolved: 23,
    successRate: 51,
    averageScore: 75
  },
  trends: [
    { week: "Week 1", solved: 5, avgScore: 70 },
    { week: "Week 2", solved: 8, avgScore: 75 }
  ],
  weakAreas: [
    { topic: "Graphs", solved: 2, attempted: 10 },
    { topic: "DP", solved: 3, attempted: 8 }
  ],
  strongAreas: [
    { topic: "Arrays", solved: 10, attempted: 10 }
  ],
  recentSubmissions: [
    { problemId: "uuid", score: 90, submittedAt: "..." }
  ]
}

// SQL Queries:
1. COUNT solved submissions
2. AVG score of all submissions
3. GROUP BY difficulty
4. GROUP BY problem categories
```

### 10. **GET /api/analytics/mentor** - Mentor Team Analytics
```javascript
// What it should do:
// - Show mentor's team statistics
// - Student progress, performance metrics
// - Help identify struggling students

// Returns:
{
  teamSize: 10,
  averageScore: 68,
  studentsAboveTarget: 7,
  studentsBelowTarget: 3,
  students: [
    {
      studentId: "uuid",
      name: "Alice",
      solved: 12,
      avgScore: 82,
      lastSubmitted: "2 hours ago",
      status: "on-track"
    }
  ],
  teamTrend: [
    { week: "Week 1", avgScore: 65 },
    { week: "Week 2", avgScore: 68 }
  ]
}

// SQL Queries:
1. Get all students assigned to mentor
2. COUNT their submissions
3. AVG their scores
4. IDENTIFY weak performers
```

### 11. **GET /api/mentor/students** - Mentor's Assigned Students
```javascript
// What it should do:
// - List all students assigned to mentor
// - Show their progress and recent activity
// - Quick statistics

// Returns:
{
  students: [
    {
      studentId: "uuid",
      name: "Alice Student",
      email: "alice@test.com",
      joinDate: "2024-01-15",
      problemsSolved: 12,
      lastActive: "2 hours ago",
      status: "active",
      score: 82
    }
  ]
}

// SQL Query:
SELECT DISTINCT u.*, COUNT(s.id) as problemsSolved,
       MAX(s.submitted_at) as lastActive,
       AVG(s.score) as avgScore
FROM users u
JOIN mentor_student_allocations msa ON u.id = msa.student_id
JOIN submissions s ON u.id = s.student_id
WHERE msa.mentor_id = ?
GROUP BY u.id
```

### 12. **GET /api/mentor/allocations** - View All Allocations (Admin)
```javascript
// What it should do:
// - Show all mentor-student pairings
// - Admin can manage allocations
// - Show workload distribution

// Returns:
{
  allocations: [
    {
      allocationId: "uuid",
      mentorId: "uuid",
      mentorName: "John Mentor",
      studentCount: 8,
      students: ["Alice", "Bob", ...],
      allocatedAt: "2024-01-20"
    }
  ],
  mentorStats: {
    averageWorkload: 7.5,
    maxWorkload: 12,
    minWorkload: 3
  }
}

// SQL Query:
SELECT m.id, m.name, COUNT(msa.student_id) as studentCount,
       GROUP_CONCAT(u.name) as students
FROM users m
LEFT JOIN mentor_student_allocations msa ON m.id = msa.mentor_id
LEFT JOIN users u ON msa.student_id = u.id
WHERE m.role = 'mentor'
GROUP BY m.id
```

---

## 🔧 HOW TO ADD AN ENDPOINT

### Step 1: Add Route Handler in server.js
```javascript
// Add near similar endpoints
app.get('/api/reports', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const [reports] = await pool.query(
            'SELECT * FROM export_reports WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        res.json(reports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: error.message });
    }
});
```

### Step 2: Add Error Handling
```javascript
- Check for required parameters
- Validate input data
- Handle database errors
- Return appropriate HTTP status codes
```

### Step 3: Test the Endpoint
```bash
# Use the test script
node test_all_features.js

# Or test manually
curl -H "Authorization: Bearer TOKEN" \
     http://localhost:3000/api/reports
```

### Step 4: Connect Frontend Component
```javascript
// In React component
useEffect(() => {
  axios.get('/api/reports', {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(res => setReports(res.data))
    .catch(err => console.error(err));
}, []);
```

---

## ⚠️ IMPORTANT REQUIREMENTS

✅ **Must Do:**
- Query database for real data
- Use authenticated user ID from token
- Handle errors gracefully
- Validate inputs
- Use connection pool properly
- Only return permitted data

❌ **Don't Do:**
- Hardcode test data
- Return dummy/static responses
- Skip authentication
- Ignore errors silently
- Use direct SQL injection
- Forget error bounds checking

---

## 📚 Reference Files

- **Current working endpoints**: See server.js lines 1-5000
- **Database schema**: Check migrations in root directory
- **Authentication**: see middleware/auth.js
- **Error handling example**: Look at other working endpoints

---

## 🎯 Priority Order

1. Fix user profile endpoint (blocks 3+ features)
2. Add `/api/analytics/student` (blocks analytics view)
3. Add `/api/reports` (export feature)
4. Add `/api/badges` (gamification)
5. Add `/api/mentors` (mentor discovery)
6. Add test-generator, plagiarism, etc.

---

## ✅ Success Criteria

When all 9 endpoints are added:
- ✅ Test suite should show 80%+ features working
- ✅ All portals accessible with data
- ✅ No 404 errors
- ✅ All data is dynamic from database
- ✅ Authentication working on all endpoints
- ✅ Admin portal fully functional

