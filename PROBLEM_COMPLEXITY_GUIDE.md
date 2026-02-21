# 📊 Problem Complexity Calculator Feature Guide

## Overview
The Problem Complexity Calculator analyzes problem difficulty based on submission statistics, pass rates, time metrics, and structural factors. It helps students find appropriately-challenging problems and provides insights into skill progression.

## Key Features
- **Difficulty Scoring** - 0-10 scale with multi-factor analysis
- **Pass Rate Tracking** - Percentage of successful submissions
- **Time Analytics** - Average, min, max solve times
- **Complexity Factors** - Structure, algorithm, edge cases, implementation
- **Smart Recommendations** - Suggest problems based on skill level
- **Similar Problems** - Find problems with matching difficulty
- **User Feedback** - Crowdsourced difficulty adjustments

## Database Schema

### problems table (additions)
```sql
ALTER TABLE problems ADD COLUMN difficulty_score DECIMAL(3,1) DEFAULT 5.0;
ALTER TABLE problems ADD COLUMN pass_rate DECIMAL(5,2) DEFAULT 0;
ALTER TABLE problems ADD COLUMN avg_time_minutes INT DEFAULT 30;
ALTER TABLE problems ADD COLUMN min_time_minutes INT DEFAULT 5;
ALTER TABLE problems ADD COLUMN max_time_minutes INT DEFAULT 300;
ALTER TABLE problems ADD COLUMN total_submissions INT DEFAULT 0;
ALTER TABLE problems ADD COLUMN successful_submissions INT DEFAULT 0;
ALTER TABLE problems ADD COLUMN avg_attempts DECIMAL(3,2) DEFAULT 1.0;
ALTER TABLE problems ADD COLUMN structure_complexity INT DEFAULT 5;
ALTER TABLE problems ADD COLUMN algorithm_complexity INT DEFAULT 5;
ALTER TABLE problems ADD COLUMN edge_cases_complexity INT DEFAULT 5;
ALTER TABLE problems ADD COLUMN implementation_complexity INT DEFAULT 5;
ALTER TABLE problems ADD COLUMN complexity_last_updated DATETIME DEFAULT CURRENT_TIMESTAMP;
```

### complexity_analytics table
```sql
CREATE TABLE complexity_analytics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    problem_id INT NOT NULL,
    submission_time_minutes INT,
    attempt_number INT,
    submission_id INT,
    user_id INT,
    solved BOOLEAN,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_problem_id (problem_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);
```

### problem_recommendations table
```sql
CREATE TABLE problem_recommendations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    recommended_problem_id INT NOT NULL,
    reason VARCHAR(255),
    difficulty_match DECIMAL(3,1),
    skill_match DECIMAL(3,1),
    recommended_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    viewed BOOLEAN DEFAULT FALSE,
    solved BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recommended_problem_id) REFERENCES problems(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_recommended_at (recommended_at)
);
```

## Difficulty Levels

| Score | Label | Color | Description |
|-------|-------|-------|-------------|
| 1-2 | Beginner | 🟢 Green | Fundamental concepts |
| 3-4 | Intermediate | 🟡 Yellow | Intermediate skills |
| 5-6 | Advanced | 🟠 Orange | Advanced problem-solving |
| 7-8 | Expert | 🔴 Red | Very challenging |
| 9-10 | Master | 🟣 Purple | Extremely difficult |

## Complexity Factors (0-10 scale)

### 1. Problem Structure (30% weight)
- Input/output format complexity
- Number of test cases
- Edge case coverage
- Data structure requirements

### 2. Algorithm Complexity (30% weight)
- Time complexity (O(n), O(n²), etc.)
- Space complexity requirements
- Advanced algorithms needed
- Problem-solving approach difficulty

### 3. Edge Cases (20% weight)
- Number of edge cases to handle
- Subtlety of edge cases
- Boundary condition handling
- Error case coverage

### 4. Implementation Difficulty (20% weight)
- Code length required
- Syntax complexity
- Debugging difficulty
- Iterative refinement needed

## API Endpoints

### 1. GET /api/problems/:id/complexity-analysis
**Description:** Get detailed complexity analysis for a problem

**Request:**
```http
GET /api/problems/123/complexity-analysis
Authorization: Bearer {token}
```

**Response:**
```json
{
    "id": "123",
    "difficulty_score": 6.5,
    "pass_rate": 45.3,
    "avg_time_minutes": 85,
    "min_time_minutes": 15,
    "max_time_minutes": 240,
    "total_submissions": 150,
    "successful_submissions": 68,
    "avg_attempts": 2.2,
    "structure_complexity": 6,
    "algorithm_complexity": 7,
    "edge_cases_complexity": 6,
    "implementation_complexity": 5,
    "category_avg_difficulty": 5.5,
    "similar_problems": [
        {
            "id": "124",
            "title": "Array Manipulation Problem",
            "category": "Arrays",
            "difficulty_score": 6.3
        }
    ],
    "last_updated": "2024-01-15T10:30:00Z"
}
```

### 2. GET /api/problems/complexity/by-difficulty
**Description:** Get problems by difficulty level

**Request:**
```http
GET /api/problems/complexity/by-difficulty?difficulty=6.5&limit=10
Authorization: Bearer {token}
```

**Response:**
```json
{
    "target_difficulty": 6.5,
    "problems_found": 8,
    "problems": [
        {
            "id": "123",
            "title": "Problem Title",
            "category": "Arrays",
            "difficulty_score": 6.5,
            "pass_rate": 45.3,
            "avg_time_minutes": 85
        }
    ]
}
```

### 3. GET /api/problems/complexity/recommendations
**Description:** Get recommended problems based on user skill level

**Request:**
```http
GET /api/problems/complexity/recommendations?limit=5
Authorization: Bearer {token}
```

**Response:**
```json
{
    "user_avg_difficulty": 4.2,
    "target_difficulty": 5.7,
    "recommendations_count": 5,
    "recommendations": [
        {
            "id": "456",
            "title": "Intermediate Problem",
            "category": "Strings",
            "difficulty_score": 5.8,
            "pass_rate": 52.1,
            "avg_time_minutes": 45
        }
    ]
}
```

### 4. POST /api/problems/:id/difficulty-feedback
**Description:** Submit difficulty feedback to improve scoring

**Request:**
```http
POST /api/problems/123/difficulty-feedback
Authorization: Bearer {token}
Content-Type: application/json

{
    "actualDifficulty": 7,
    "feedback": "Found this harder than expected"
}
```

**Response:**
```json
{
    "success": true,
    "message": "Difficulty feedback recorded",
    "updated_difficulty": 6.7
}
```

## Frontend Integration

### Component: ProblemComplexity.jsx

**Props:**
- `problemId` (required) - The problem ID to analyze

**Usage:**
```jsx
import ProblemComplexity from './components/ProblemComplexity';

function ProblemPage({ problemId }) {
    return <ProblemComplexity problemId={problemId} />;
}
```

### Component Features:
- Real-time complexity metrics display
- Interactive difficulty visualization
- Complexity factor breakdown with progress bars
- Smart recommendations based on problem difficulty
- Similar problems suggestion
- Category difficulty comparison
- Feedback submission

### CSS Classes:
- `.complexity-container` - Root container
- `.metric-card` - Individual metric display
- `.complexity-factors` - Factors breakdown section
- `.complexity-recommendations` - Recommendations section
- `.similar-problems` - Similar problems list
- `.difficulty-badge` - Difficulty level badge

## Implementation Steps

### 1. Run Migration
```bash
node migrate_problem_complexity.js
```

### 2. Import Component
```jsx
import ProblemComplexity from '../components/ProblemComplexity';
```

### 3. Add to Problem Detail Page
```jsx
<div className="problem-section">
    <ProblemComplexity problemId={problemId} />
</div>
```

### 4. Test Integration
- Navigate to a problem detail page
- Verify complexity metrics load
- Check recommendations display
- Validate feedback submission

## Complexity Calculation Algorithm

```
Final Difficulty Score = (
    (Structure Weight × 0.30) +
    (Algorithm Weight × 0.30) +
    (Edge Cases Weight × 0.20) +
    (Implementation Weight × 0.20)
) / 10

Pass Rate Adjustment = -log(submissions) / 10
Adjusted Score = Final Score × (1 - Pass Rate Adjustment)
```

## Analytics Queries

### Problems by Difficulty Distribution
```sql
SELECT 
    FLOOR(difficulty_score) as difficulty_level,
    COUNT(*) as problem_count,
    AVG(pass_rate) as avg_pass_rate,
    AVG(avg_time_minutes) as avg_solve_time
FROM problems
GROUP BY FLOOR(difficulty_score)
ORDER BY difficulty_level;
```

### User Skill Progression
```sql
SELECT 
    user_id,
    AVG(p.difficulty_score) as avg_problem_difficulty,
    COUNT(DISTINCT s.problem_id) as problems_solved,
    COUNT(DISTINCT s.submission_id) as total_attempts
FROM submissions s
JOIN problems p ON s.problem_id = p.id
WHERE s.is_successful = 1
GROUP BY user_id
ORDER BY avg_problem_difficulty DESC;
```

### Most Challenging Problems
```sql
SELECT 
    id, title, category, difficulty_score,
    pass_rate, total_submissions
FROM problems
WHERE difficulty_score >= 7
ORDER BY pass_rate ASC, total_submissions DESC;
```

## Troubleshooting

### Complexity Data Not Showing?
1. Ensure migration was run: `node migrate_problem_complexity.js`
2. Check that complexity columns exist in problems table
3. Verify problem has submissions for data calculation

### Recommendations Not Accurate?
1. Ensure user has solved at least 5 problems
2. Check problem data is calculated (complexity_last_updated)
3. Verify category exists for recommendations

### Difficulty Scores Seem Wrong?
1. Recalculate scores: Run `CALL recalculate_difficulty_scores()`
2. Check total_submissions count
3. Verify successful_submissions includes only passed attempts

## Performance Optimization

- **Index on difficulty_score**: Faster sorting by difficulty
- **Summary table**: Pre-calculate category averages hourly
- **Cache recommendations**: Store for 1 hour per user
- **Batch updates**: Recalculate complexity scores hourly

## Future Enhancements

- [ ] Weighted difficulty by language
- [ ] Time-based difficulty decay
- [ ] Category-specific difficulty curves
- [ ] Collaborative difficulty consensus
- [ ] Machine learning complexity prediction
- [ ] Difficulty prediction for new problems
- [ ] Skill path recommendations based on complexity
- [ ] Difficulty heatmaps by category

## Related Features

- **Feature #1:** Dark Mode - UI theme for complexity display
- **Feature #5:** Progress Dashboard - Shows difficulty progression
- **Feature #7:** Leaderboard - Competitive difficulty tracking
- **Feature #12:** AI Recommendations - Uses complexity for suggestions
