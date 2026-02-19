/**
 * INTEGRATION GUIDE FOR ADVANCED FEATURES
 * 
 * Follow these steps to integrate all advanced features into your server.js
 * This ensures no disruption to existing functionality
 */

// ============================================================
// STEP 1: Add these imports at the top of server.js
// ============================================================

const PlagiarismDetector = require('./services/plagiarism_detector');
const GamificationService = require('./services/gamification_service');
const PredictiveAnalyticsService = require('./services/analytics_service');
const ViolationScoringService = require('./services/violation_scoring_service');

// ============================================================
// STEP 2: Initialize services after database connection
// ============================================================

// After your existing database connection setup, add:
const plagiarismDetector = new PlagiarismDetector(db);
const gamificationService = new GamificationService(db);
const predictiveAnalyticsService = new PredictiveAnalyticsService(db);
const violationScoringService = new ViolationScoringService(db);

// ============================================================
// STEP 3: Register API routes
// ============================================================

// Add this line after your existing route registrations:
const advancedFeaturesRouter = require('./routes/advanced_features')(
    db,
    PlagiarismDetector,
    GamificationService,
    PredictiveAnalyticsService,
    ViolationScoringService
);

app.use('/api', advancedFeaturesRouter);

// ============================================================
// STEP 4: Database Migration
// ============================================================

// RUN ONCE:
// node migrate_advanced_features.js

// ============================================================
// STEP 5: Hook into existing submission handlers
// ============================================================

// After a problem submission is saved, add this:
// gamificationService.awardProblemCompletion(
//     studentId,
//     problemId,
//     isFirstAttempt,
//     solutionTimeInSeconds
// );

// After a test submission is saved, add this:
// gamificationService.awardTestCompletion(
//     studentId,
//     testId,
//     score
// );

// ============================================================
// STEP 6: Setup periodic tasks (optional but recommended)
// ============================================================

// Add cron job to analyze student performance daily:
const cron = require('node-cron');

// Run analytics every 6 hours
cron.schedule('0 */6 * * *', async () => {
    try {
        console.log('🔍 Running predictive analytics...');
        const students = await db.query('SELECT id FROM users WHERE role = "student"');
        
        for (const student of students) {
            await predictiveAnalyticsService.analyzeStudentPerformance(student.id);
        }
        
        console.log('✅ Analytics completed');
    } catch (error) {
        console.error('❌ Analytics error:', error);
    }
});

// Run plagiarism detection on submissions daily
cron.schedule('0 2 * * *', async () => {
    try {
        console.log('🔍 Running plagiarism detection...');
        const submissions = await db.query(
            'SELECT id FROM submissions WHERE plagiarism_analysis_id IS NULL AND status = "accepted" LIMIT 100'
        );
        
        for (const submission of submissions) {
            try {
                await plagiarismDetector.analyzeSubmission(submission.id);
            } catch (error) {
                console.error(`Error analyzing submission ${submission.id}:`, error.message);
            }
        }
        
        console.log('✅ Plagiarism detection completed');
    } catch (error) {
        console.error('❌ Plagiarism detection error:', error);
    }
});

// ============================================================
// INTEGRATION EXAMPLES
// ============================================================

/**
 * Example 1: Award gamification points after problem completion
 * 
 * Add this in your problem submission handler:
 */
app.post('/api/submissions', async (req, res) => {
    try {
        // ... existing submission logic ...
        
        const submission = {
            // ... submission data
            status: 'accepted',
            score: 100,
            created_at: new Date()
        };
        
        // Save submission to database
        await db.query('INSERT INTO submissions ...', [/* data */]);
        
        // Award points and badges
        const solutionTime = calculateTime(submission); // in seconds
        const isFirstAttempt = await checkIfFirstAttempt(submission.student_id, submission.problem_id);
        
        await gamificationService.awardProblemCompletion(
            submission.student_id,
            submission.problem_id,
            isFirstAttempt,
            solutionTime
        );
        
        // Update streak
        await gamificationService.updateStreak(submission.student_id);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Example 2: Process violation event during test
 * 
 * Add this in your proctoring event handler:
 */
app.post('/api/proctoring/log-event', async (req, res) => {
    try {
        const { attemptId, testId, studentId, eventType } = req.body;
        
        // Log violation and calculate score
        const result = await violationScoringService.processViolationEvent(
            attemptId,
            testId,
            studentId,
            eventType,
            req.body.eventData
        );
        
        // If auto-disqualified, notify mentors
        if (result.shouldDisqualify) {
            io.emit('violation:autoDisqualified', {
                attemptId,
                studentId,
                reason: eventType,
                score: result.cumulativeScore
            });
        }
        
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Example 3: Analyze student at submission view
 * 
 * Add this in your get submission endpoint:
 */
app.get('/api/submissions/:submissionId', async (req, res) => {
    try {
        const submission = await db.query(
            'SELECT * FROM submissions WHERE id = ?',
            [req.params.submissionId]
        );
        
        if (submission.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }
        
        const sub = submission[0];
        
        // Get plagiarism analysis if exists
        let plagiarismAnalysis = null;
        const analysis = await db.query(
            'SELECT * FROM plagiarism_analysis WHERE submission_id = ?',
            [sub.id]
        );
        if (analysis.length > 0) {
            plagiarismAnalysis = analysis[0];
        }
        
        // Get violation summary
        let violations = null;
        const attempt = await db.query(
            'SELECT id FROM skill_test_attempts WHERE submission_id = ?',
            [sub.id]
        );
        if (attempt.length > 0) {
            violations = await violationScoringService.getViolationSummary(attempt[0].id);
        }
        
        res.json({
            submission: sub,
            plagiarism: plagiarismAnalysis,
            violations
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Example 4: Detect behavioral anomalies during test
 * 
 * Add this in your behavioral monitoring handler:
 */
app.post('/api/proctoring/detect-behavioral', async (req, res) => {
    try {
        const { studentId, attemptId, typingSpeed, pauseInterval } = req.body;
        
        const result = await violationScoringService.detectBehavioralAnomalies(
            studentId,
            attemptId,
            { typingSpeed, pauseInterval }
        );
        
        if (result.anomaliesDetected) {
            console.warn(`⚠️ Behavioral anomaly detected for student ${studentId}:`, result.anomalies);
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// FRONTEND INTEGRATION
// ============================================================

/*
STEP 1: Import components in your portals

In StudentPortal.jsx:
  import { GamificationProfile, AchievementBadges, MiniLeaderboard } from '../components/GamificationComponents';
  import { RiskScoreCard, RecommendationsPanel, LearningCurveChart } from '../components/AnalyticsComponents';

In MentorPortal.jsx:
  import { AtRiskStudentsDashboard } from '../components/AnalyticsComponents';
  import { PlagiarismReport } from '../components/PlagiarismViolationComponents';
  import { ViolationScoringDashboard } from '../components/PlagiarismViolationComponents';

In AdminPortal.jsx:
  import { ViolationScoringDashboard } from '../components/PlagiarismViolationComponents';

STEP 2: Add to dashboard layouts

Example in StudentPortal:
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
    <GamificationProfile studentId={user.id} />
    <RiskScoreCard studentId={user.id} />
  </div>
  
  <div style={{ marginBottom: '2rem' }}>
    <RecommendationsPanel studentId={user.id} />
  </div>
  
  <GamificationLeaderboard limit={50} />

Example in MentorPortal:
  <div style={{ marginBottom: '2rem' }}>
    <AtRiskStudentsDashboard mentorId={user.id} />
  </div>

Example in AdminPortal:
  <div style={{ marginBottom: '2rem' }}>
    <ViolationScoringDashboard />
  </div>
*/

// ============================================================
// TESTING THE INTEGRATION
// ============================================================

/*
1. Database Migration:
   cd mentor-hub1
   node migrate_advanced_features.js

2. Start Server:
   npm start

3. Test Endpoints:
   
   Test Gamification:
   POST /api/gamification/award-points
   {
     "studentId": "student-id",
     "points": 100,
     "source": "test"
   }
   
   GET /api/gamification/leaderboard?limit=10
   GET /api/gamification/student/:studentId
   
   Test Plagiarism:
   POST /api/plagiarism/analyze
   {
     "submissionId": "submission-id"
   }
   
   Test Analytics:
   POST /api/analytics/analyze/:studentId
   GET /api/analytics/student/:studentId
   GET /api/analytics/at-risk?mentorId=mentor-id
   
   Test Violations:
   POST /api/violations/process
   {
     "attemptId": "attempt-id",
     "testId": "test-id",
     "studentId": "student-id",
     "violationType": "tab_switch"
   }
*/

// ============================================================
// BACKUP & SAFETY
// ============================================================

/*
Before deploying:

1. Backup database:
   mysqldump -u root -p mentor_hub > backup_$(date +%s).sql

2. Test on staging first

3. Monitor logs:
   tail -f server.log | grep "plagiarism\|gamification\|analytics\|violation"

4. Rollback plan:
   - If issues arise, comment out the new route registrations
   - Keep old functionality intact
   - Run: ALTER TABLE submissions DROP COLUMN IF EXISTS plagiarism_analysis_id;
*/

module.exports = {
    // Export services for use in other modules
    plagiarismDetector,
    gamificationService,
    predictiveAnalyticsService,
    violationScoringService
};
