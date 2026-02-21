# 🏆 Leaderboard Feature Guide

## Overview
The Leaderboard system enables competitive ranking and achievement tracking. Users can see their standing globally, by category, and during specific time periods (weekly, monthly). Real-time scoring motivates engagement and tracks skill progression across the platform.

## Key Features
- **Global Leaderboard** - All-time rankings based on total points
- **Category Rankings** - Top performers in each problem category
- **Time-based Rankings** - Weekly and monthly competitive periods
- **Personal Rank Tracking** - See your current standing and percentile
- **Streak Tracking** - Consecutive days solving problems
- **Success Metrics** - Pass rate and accuracy displayed
- **Real-time Updates** - Rankings refresh as submissions occur

## Scoring System

### Points Calculation
```
Base Points = 10 + (Problem Difficulty × 5)
Time Bonus = 5 if solved < average time
Streak Bonus = current_streak × 2
First Attempt Bonus = 5 if no failed attempts

Total Points = Base + Time Bonus + Streak Bonus + First Attempt Bonus
```

### Difficulty Modifier
- Difficulty 1-2: +10 points
- Difficulty 3-4: +15 points
- Difficulty 5-6: +25 points
- Difficulty 7-8: +40 points
- Difficulty 9-10: +50 points

## Database Schema

### leaderboard_stats table
```sql
CREATE TABLE leaderboard_stats (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    problems_solved INT DEFAULT 0,
    total_points INT DEFAULT 0,
    current_streak INT DEFAULT 0,
    best_streak INT DEFAULT 0,
    success_rate DECIMAL(5,2) DEFAULT 0,
    total_submissions INT DEFAULT 0,
    successful_submissions INT DEFAULT 0,
    avg_solve_time_minutes INT DEFAULT 0,
    last_problem_solved DATETIME,
    ranking INT,
    ranking_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_total_points (total_points),
    INDEX idx_ranking (ranking),
    INDEX idx_success_rate (success_rate)
);
```

### category_leaderboard table
```sql
CREATE TABLE category_leaderboard (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    category_id INT NOT NULL,
    problems_solved INT DEFAULT 0,
    category_points INT DEFAULT 0,
    category_rank INT,
    success_rate DECIMAL(5,2) DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES problem_categories(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_category (user_id, category_id),
    INDEX idx_category_id (category_id),
    INDEX idx_category_points (category_points)
);
```

### weekly_leaderboard table
```sql
CREATE TABLE weekly_leaderboard (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    weekly_points INT DEFAULT 0,
    problems_solved_week INT DEFAULT 0,
    week_start DATE,
    week_rank INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_week_start (week_start),
    INDEX idx_weekly_points (weekly_points)
);
```

## API Endpoints

### 1. GET /api/leaderboard
**Description:** Get global leaderboard with optional time range filtering

**Request:**
```http
GET /api/leaderboard?limit=100&timeRange=alltime
Authorization: Bearer {token}
```

**Parameters:**
- `limit` (optional, default: 100) - Number of results (max: 500)
- `timeRange` (optional) - 'alltime', 'week', 'month'

**Response:**
```json
{
    "rankings": [
        {
            "user_id": 123,
            "username": "john_doe",
            "tier": "Pro",
            "avatar": "https://...",
            "problems_solved": 47,
            "total_points": 850,
            "current_streak": 12,
            "success_rate": 88.5,
            "rank": 1
        },
        {
            "user_id": 124,
            "username": "jane_smith",
            "tier": "Free",
            "avatar": "https://...",
            "problems_solved": 35,
            "total_points": 720,
            "current_streak": 8,
            "success_rate": 85.2,
            "rank": 2
        }
    ],
    "userRank": {
        "rank": 15,
        "userId": 456,
        "problems_solved": 28,
        "total_points": 520,
        "current_streak": 5,
        "success_rate": 79.3
    },
    "total": 100
}
```

### 2. GET /api/leaderboard/category/:categoryName
**Description:** Get category-specific leaderboard

**Request:**
```http
GET /api/leaderboard/category/Arrays?limit=50
Authorization: Bearer {token}
```

**Response:**
```json
{
    "rankings": [
        {
            "user_id": 123,
            "username": "john_doe",
            "problems_solved": 15,
            "category_points": 320,
            "success_rate": 92.0,
            "rank": 1
        }
    ]
}
```

### 3. GET /api/users/:userId/rank
**Description:** Get specific user's rank information

**Request:**
```http
GET /api/users/123/rank
Authorization: Bearer {token}
```

**Response:**
```json
{
    "userId": 123,
    "problems_solved": 47,
    "total_points": 850,
    "current_streak": 12,
    "best_streak": 25,
    "success_rate": 88.5,
    "ranking": 1,
    "percentileRank": 99.2
}
```

## Frontend Integration

### Component: Leaderboard.jsx

**Props:**
- None (uses authentication context)

**Usage:**
```jsx
import Leaderboard from './components/Leaderboard';

function LeaderboardPage() {
    return <Leaderboard />;
}
```

### Key Features:
- Multiple tabs: Global, Category, Weekly, Monthly
- User's current rank card with key stats
- Sortable leaderboard table (rank, user, solved, points, streak, accuracy)
- Category filters for targeted rankings
- Responsive design with mobile optimization
- Real-time rank updates

### Component Features:
- Search bar (future enhancement)
- Filter by tier (Free, Pro, Enterprise)
- Avatar display for top 3
- Medal emojis (🥇 🥈 🥉) for top rankings
- Accuracy progress bars
- Streak counters with fire emoji

## Ranking Algorithm

### Global Ranking Calculation
```sql
RANK = ROW_NUMBER() OVER (ORDER BY total_points DESC)
```

### Category Rank Calculation
```sql
CATEGORY_RANK = ROW_NUMBER() OVER (
    PARTITION BY category_id 
    ORDER BY category_points DESC
)
```

### Percentile Calculation
```
Percentile = (Users with lower rank / Total users) × 100
```

## Implementation Steps

### 1. Run Migration
```bash
node migrate_leaderboard.js
```

This will:
- Create leaderboard_stats table
- Create category_leaderboard table
- Create weekly_leaderboard table
- Add tier column to users
- Add avatar column to users
- Create ranking update procedure
- Initialize stats for existing users

### 2. Import Component
```jsx
import Leaderboard from '../components/Leaderboard';
```

### 3. Add to Main Navigation
```jsx
<NavLink to="/leaderboard">
    🏆 Leaderboard
</NavLink>
```

### 4. Create Leaderboard Page
```jsx
function LeaderboardPage() {
    return (
        <div className="page-container">
            <Leaderboard />
        </div>
    );
}
```

## Update Mechanics

### When Points are Added
1. Fetch problem difficulty and time data
2. Calculate points using scoring formula
3. Update user's leaderboard_stats
4. Update category_leaderboard
5. Update weekly_leaderboard
6. Recalculate all rankings (every 5 minutes via scheduled task)

### Scheduled Tasks
- **Every 5 minutes:** Recalculate global rankings
- **Daily at 00:00:** Reset weekly leaderboard for new week
- **Monthly at 00:00:** Archive month leaderboard, reset counter

## Analytics Queries

### Top Performers This Week
```sql
SELECT 
    u.username, 
    wl.weekly_points,
    wl.problems_solved_week,
    COUNT(DISTINCT s.id) as submissions_week
FROM weekly_leaderboard wl
JOIN users u ON wl.user_id = u.id
LEFT JOIN submissions s ON u.id = s.student_id 
    AND s.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
WHERE 
    WEEK(wl.week_start) = WEEK(CURDATE())
    AND YEAR(wl.week_start) = YEAR(CURDATE())
GROUP BY u.id
ORDER BY wl.weekly_points DESC
LIMIT 10;
```

### Category Dominance Analysis
```sql
SELECT 
    pc.name as category,
    u.username,
    cl.problems_solved,
    cl.category_points,
    cl.category_rank
FROM category_leaderboard cl
JOIN users u ON cl.user_id = u.id
JOIN problem_categories pc ON cl.category_id = pc.id
WHERE cl.category_rank <= 5
ORDER BY pc.name, cl.category_rank;
```

### Streak Leaders
```sql
SELECT 
    username,
    current_streak,
    best_streak,
    (best_streak - current_streak) as drop_from_best
FROM leaderboard_stats
JOIN users ON users.id = user_id
ORDER BY current_streak DESC
LIMIT 10;
```

## Gamification Elements

### Badges (Future Integration)
- 🥇 **Rank 1** - #1 on global leaderboard
- 🏆 **Top 10** - Maintain top 10 ranking
- 🔥 **Streaker** - 7+ day solving streak
- 💎 **Category Master** - #1 in any category
- ⚡ **Speed Demon** - Solve 5 problems in < avg time

### Notifications
- "You've entered the top 10!" 
- "Your streak is at 10 days! 🔥"
- "You're the #2 in Arrays category"
- "Someone passed your score - reclaim your spot!"

## Performance Optimization

**Index Strategy:**
- `idx_total_points` - Faster ranking queries
- `idx_success_rate` - Filter by performance
- `idx_user_id` - Individual lookups

**Caching:**
- Cache top 100 for 5 minutes
- Cache user's personal rank for 1 minute
- Invalidate cache on new submission

**Query Optimization:**
- Use window functions for ranking
- Batch update leaderboard every 5 minutes
- Store pre-calculated ranks instead of computing on demand

## Troubleshooting

### Rankings Not Updating?
1. Check leaderboard_stats table has entries
2. Verify `update_leaderboard_rankings` procedure exists
3. Check if scheduled task is running
4. Manually run: `CALL update_leaderboard_rankings();`

### User Rank Shows as NULL?
1. Ensure user has at least 1 solved problem
2. Check that leaderboard_stats row exists for user
3. Run migration to initialize missing stats

### Weekly Leaderboard Not Resetting?
1. Check system cron jobs are running
2. Verify week_start date is correct
3. Manually reset: `DELETE FROM weekly_leaderboard WHERE DATEDIFF(CURDATE(), week_start) > 7;`

## Future Enhancements

- [ ] Regional leaderboards (by country/organization)
- [ ] Team leaderboards (group competitors)
- [ ] Seasonal rankings with rewards
- [ ] Skill-specific rankings (by topics)
- [ ] Difficulty-adjusted rankings
- [ ] Historical rank trends (charts)
- [ ] XP system replacement for points
- [ ] Leaderboard tournaments

## Related Features

- **Feature #5:** Progress Dashboard - Shows personal progress
- **Feature #6:** Problem Complexity - Difficulty-based scoring
- **Feature #14:** Skill Badges - Achievements linked to ranking
- **Feature #15:** Mentor Matching - Match mentors by ranking
