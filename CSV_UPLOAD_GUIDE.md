# CSV Upload Sample Files

This directory contains sample CSV files to test the bulk upload feature for tests, tasks, and problems.

## Files Overview

### 1. **sample-global-tasks.csv** (Admin)
Machine learning tasks visible to all students platform-wide.

**Columns:** `title`, `type`, `difficulty`, `description`, `requirements`, `deadline`

**Usage:** 
- Go to Admin → Global Tasks
- Click green "CSV Upload" button
- Select this file

### 2. **sample-global-problems.csv** (Admin)
Coding problems visible to all students platform-wide.

**Columns:** `title`, `type`, `language`, `difficulty`, `description`, `testInput`, `expectedOutput`

**Usage:**
- Go to Admin → Global Problems
- Click green "CSV Upload" button
- Select this file

### 3. **sample-global-tests.csv** (Admin)
Complete tests with aptitude, verbal, logical, coding, and SQL sections.

**Columns:** `section`, `question`, `option1`, `option2`, `option3`, `option4`, `correctAnswer`, `category`, `explanation`

**Sections:** `aptitude`, `verbal`, `logical`

**Usage:**
- Go to Admin → Global Complete Tests
- Click green "CSV Upload" button
- Select this file
- Created test will be in draft status for review

### 4. **sample-aptitude-tests.csv** (Admin)
Aptitude test questions (MCQ format).

**Columns:** `question`, `option1`, `option2`, `option3`, `option4`, `correctAnswer`, `category`, `explanation`

**Usage:**
- Go to Admin → Aptitude Tests
- Click green "CSV Upload" button
- Select this file

### 5. **sample-mentor-tasks.csv** (Mentor)
Machine learning tasks for students allocated to this mentor.

**Columns:** `title`, `type`, `language`, `difficulty`, `description`, `testInput`, `expectedOutput`

**Usage:**
- Go to Mentor → Upload ML Tasks
- Click green "CSV Upload" button
- Select this file

### 6. **sample-mentor-problems.csv** (Mentor)
Coding problems for students allocated to this mentor.

**Columns:** `title`, `type`, `language`, `difficulty`, `description`, `testInput`, `expectedOutput`

**Usage:**
- Go to Mentor → Upload Problems
- Click green "CSV Upload" button
- Select this file

---

## CSV Format Requirements

### Important Notes:
1. **First row MUST be headers** (case-insensitive)
2. **Quoted values** support commas inside: `"Learn, Python, and Django"`
3. **Empty cells** are allowed (will be filled with defaults)
4. **Special characters** should be in quotes if they contain commas or quotes
5. **Max 99 rows** recommended for smooth upload

### Field Mappings:
- `correctAnswer` can also be: `correct_answer`, `answer`
- `option1` can also be: `option_1`
- `testInput` can also be: `test_input`
- `expectedOutput` can also be: `expected_output`

---

## Testing Workflow

### Admin Testing:
```
1. Login as Admin (admin@example.com)
2. Navigate to each section
3. Click CSV Upload button (green button)
4. Select corresponding sample file
5. Verify items appear in the list
6. Click on item to view details
```

### Mentor Testing:
```
1. Login as Mentor
2. Go to Upload ML Tasks / Upload Problems
3. Click CSV Upload button
4. Select sample mentor file
5. Verify tasks/problems appear in list
6. Check if students can see them in assignments section
```

### Admin Messaging:
```
1. Login as Admin
2. Navigate to Admin → Messaging (new)
3. You'll see all students and mentors in contact list
4. Click on any contact to start chatting
5. Messages are ephemeral (24hr auto-delete)
6. Unread message count shows as red badge on "Messaging" nav item
```

---

## Notification Badges

All three portals (Admin, Mentor, Student) now show unread message count next to the "Messaging" nav item:

- 🔴 **Red badge with number** = Unread messages
- **Updates every 15 seconds** = Live polling
- **Click to chat** = Opens messaging interface

---

## Tips for Custom CSVs

1. **Copy a sample file** and modify the data
2. **Keep the same column names** (or use alternative names listed above)
3. **For questions**: Ensure options don't exceed 4
4. **For tests**: Only `aptitude`, `verbal`, or `logical` sections allowed in global-tests
5. **For deadlines**: Use format `YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS`

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No valid rows found" | Check headers match expected columns |
| "CSV upload failed" | Verify file is valid CSV (not XLSX) |
| Empty cells creating errors | Ensure empty cells are just `,` without spaces |
| Special characters breaking | Wrap values with commas/quotes in `"quotes"` |
| Questions not uploading | Check correctAnswer is 0-indexed (0,1,2,3) |

---

## Example Custom CSV

```csv
title,type,difficulty,description,requirements
Custom Project A,machine_learning,hard,Advanced NLP task,Use transformers
Custom Project B,machine_learning,easy,Simple classification,Use scikit-learn
```

Just follow the format and upload!
