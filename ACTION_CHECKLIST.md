# ✅ ACTION CHECKLIST - 30% TO 100% COMPLETION

## 📊 Current Status
- **Completed Features**: 15/50 (30%)
- **Broken Features**: 35/50 (70%)
- **Root Cause**: 9 missing API endpoints + 2 broken endpoints
- **Time to Fix**: 3-4 hours

---

## 🎯 YOUR MISSION

Convert **15 working features (30%)** → **50+ working features (100%)**

---

## ✅ PHASE 1: FIX EXISTING ENDPOINTS (30 minutes)

### Task 1.1: Fix User Profile Endpoint
- **File**: server.js (find `/api/users/profile`)
- **Issue**: Returns "User not found"
- **Fix**: Check JWT extraction, verify token valid, query correct user_id
- **Test**: `curl with token` should return user data
- **Status**: ❌ NOT DONE

### Task 1.2: Fix Leaderboard Endpoint  
- **File**: server.js (find `/api/leaderboard`)
- **Issue**: SQL error - "rank" is reserved word
- **Fix**: Use backticks: `rank` or rename column
- **SQL**: `SELECT id, name, \`rank\`, score FROM leaderboard`
- **Status**: ❌ NOT DONE

---

## 🔧 PHASE 2: ADD 9 MISSING ENDPOINTS (2-3 hours)

### Task 2.1: Add `/api/reports` Endpoint
```
Route: GET /api/reports
Returns: List of all export reports for user
Database: Query export_reports table
Test: Should return array of reports with download links
Status: ❌ NOT DONE
```

### Task 2.2: Add `/api/reports/export` Endpoint
```
Route: POST /api/reports/export
Returns: New report generated
Database: Insert to export_reports, generate PDF
Test: Should return success with download URL
Status: ❌ NOT DONE
```

### Task 2.3: Add `/api/badges` Endpoint
```
Route: GET /api/badges
Returns: Earned and available badges
Database: Query badges table
Test: Should return array of badge objects
Status: ❌ NOT DONE
```

### Task 2.4: Add `/api/badges/award` Endpoint
```
Route: POST /api/badges/award
Returns: Badge awarded confirmation
Database: Insert to badges table
Auth: Mentor/Admin only
Test: Should add badge and return success
Status: ❌ NOT DONE
```

### Task 2.5: Add `/api/mentors` Endpoint
```
Route: GET /api/mentors
Returns: List of all mentors
Query Params: expertise, availability, limit
Database: Query users table where role='mentor'
Test: Should return mentor list with ratings
Status: ❌ NOT DONE
```

### Task 2.6: Add `/api/test-generator` Endpoint
```
Route: GET /api/test-generator
Returns: AI-generated test cases
Query: problemId, language
Integration: Call Cerebras AI service
Test: Should return array of test cases
Status: ❌ NOT DONE
```

### Task 2.7: Add `/api/plagiarism/check` Endpoint
```
Route: POST /api/plagiarism/check
Returns: Plagiarism check results
Body: code, submissionId, language
Database: Compare against plagiarism_checks table
Test: Should return similarity score
Status: ❌ NOT DONE
```

### Task 2.8: Add `/api/analytics/student` Endpoint
```
Route: GET /api/analytics/student
Returns: Student dashboard statistics
Database: Query submissions, calculate stats
Test: Should return solved count, scores, trends
Status: ❌ NOT DONE
```

### Task 2.9: Add `/api/analytics/mentor` Endpoint
```
Route: GET /api/analytics/mentor
Returns: Mentor team statistics
Database: Query mentor's assigned students, their stats
Test: Should return team size, avg score, trends
Status: ❌ NOT DONE
```

### Task 2.10: Add `/api/mentor/students` Endpoint
```
Route: GET /api/mentor/students
Returns: Mentor's assigned students
Database: Query mentor_student_allocations + users
Test: Should return list of student objects
Status: ❌ NOT DONE
```

### Task 2.11: Add `/api/mentor/allocations` Endpoint
```
Route: GET /api/mentor/allocations
Returns: All mentor-student allocations (admin)
Database: Query mentor_student_allocations with joins
Auth: Admin only
Test: Should return allocation list
Status: ❌ NOT DONE
```

---

## 🧪 PHASE 3: VERIFY ALL CHANGES (30 minutes)

### Task 3.1: Fix User Profile Issue
```bash
# After fixing endpoint
node test_all_features.js
# Check for "User profile" to pass ✅
```

### Task 3.2: Fix Leaderboard Issue
```bash
# After fixing SQL
node test_all_features.js
# Check for "Leaderboard" to pass ✅
```

### Task 3.3: Test Each New Endpoint
```bash
# Run for each new endpoint
node test_all_features.js
# Watch for feature to move from ❌ to ✅
```

### Task 3.4: Run Full Test Suite
```bash
node test_all_features.js
# Confirm: 50/50 features working (100%)
# Output should show all green ✅
```

---

## 📝 IMPLEMENTATION CHECKLIST

### Creating the Endpoints

```javascript
// Template for each endpoint

app.get('/api/ENDPOINT_NAME', authenticate, async (req, res) => {
    try {
        // 1. Get user from token
        const userId = req.user.id;
        
        // 2. Validate inputs
        const { param1, param2 } = req.query;
        if (!param1) return res.status(400).json({ error: 'Missing param1' });
        
        // 3. Query database
        const [data] = await pool.query(
            'SELECT * FROM table_name WHERE user_id = ?',
            [userId]
        );
        
        // 4. Return response
        res.json(data);
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});
```

### Testing Each Endpoint

```bash
# After creating endpoint, test it:
curl -H "Authorization: Bearer <TOKEN>" \
     http://localhost:3000/api/ENDPOINT_NAME

# Should return data (not 404, not error)
```

---

## 🎬 EXECUTION STEPS

### Step 1: Read Implementation Guide
- Open: `MISSING_ENDPOINTS_GUIDE.md`
- Understand what each endpoint should return
- Review SQL queries provided

### Step 2: Fix Existing Issues (30 min)
- [ ] Fix user profile endpoint
- [ ] Fix leaderboard SQL syntax error
- [ ] Test fixes with curl
- [ ] Run test_all_features.js to verify

### Step 3: Add Endpoints One by One (2-3 hours)
- [ ] Add `/api/reports`
- [ ] Test it
- [ ] Add `/api/badges`
- [ ] Test it
- [ ] ... continue for all 9
- [ ] After each endpoint, run test suite to confirm

### Step 4: Verify Everything Works (30 min)
- [ ] Run `node test_all_features.js`
- [ ] All 50 features should show ✅
- [ ] If any ❌, investigate why
- [ ] Fix any remaining issues

### Step 5: Check Each Portal
- [ ] Student Portal: Can see all features, data from API
- [ ] Mentor Portal: Can see all features, data from API
- [ ] Admin Portal: Can see all features, data from API

---

## 🚀 SUCCESS CRITERIA

When complete, you will have:

✅ **15 → 50 features working** (30% → 100%)
✅ **0 404 errors** on any feature endpoint
✅ **All data dynamic** (from database, not hardcoded)
✅ **All 3 portals fully functional** (Student, Mentor, Admin)
✅ **All endpoints authenticated** and returning proper data
✅ **Test suite shows 100%** completion

---

## ⏱️ TIME ESTIMATE

| Phase | Task | Time |
|-------|------|------|
| 1 | Fix existing endpoints | 30 min |
| 2.1-2.5 | Add first 5 endpoints | 1 hour |
| 2.6-2.11 | Add remaining 6 endpoints | 1.5 hours |
| 3 | Test and verify | 30 min |
| **TOTAL** | **All work complete** | **~3-4 hours** |

---

## 💡 HELPFUL TIPS

1. **Start with simple ones**: `/api/badges`, `/api/reports` are simplest
2. **Test frequently**: After each endpoint, run test_all_features.js
3. **Copy working endpoints**: Use existing `/api/problems` as template
4. **Check database**: Verify table exists before querying
5. **Enable logging**: Add console.log for debugging
6. **Use Postman**: Test endpoint manually before running suite

---

## 🆘 IF STUCK

1. Check MISSING_ENDPOINTS_GUIDE.md for exact specifications
2. Look at existing endpoints in server.js for examples
3. Verify database table exists (check migrations)
4. Check authentication is working (copy from other endpoints)
5. Review error message from test output
6. Check database connection is active

---

## 📞 REFERENCE DOCUMENTS

- **Detailed specs**: `MISSING_ENDPOINTS_GUIDE.md`
- **Current status**: `COMPLETE_STATUS_REPORT.md`
- **Test script**: `test_all_features.js`
- **Issues found**: `FEATURE_ISSUES_REPORT.md`

---

**Ready to start? Next step: Open MISSING_ENDPOINTS_GUIDE.md and begin Phase 1!**
