# 🎹 Keyboard Shortcuts Feature Guide

## Overview
The Keyboard Shortcuts feature enables users to customize keyboard bindings for quick access to common actions in the mentor-hub platform. Users can modify, save, and reset shortcuts to their preferences.

## Features
- **16 Pre-defined Shortcuts** - Navigation, Editor, Quick Actions, and Common shortcuts
- **Full Customization** - Record any key combination
- **Live Preview** - See changes before saving
- **Reset to Defaults** - Revert custom shortcuts with one click
- **Change Tracking** - All modifications are logged for audit purposes
- **Persistent Storage** - Shortcuts saved to user preferences database

## Default Shortcuts

### Navigation
| Shortcut | Keys | Action |
|----------|------|--------|
| Next Problem | `Ctrl+]` | Jump to next problem |
| Previous Problem | `Ctrl+[` | Jump to previous problem |
| My Submissions | `Ctrl+S` | Navigate to submissions page |
| Dashboard | `Ctrl+H` | Go to home dashboard |

### Editor
| Shortcut | Keys | Action |
|----------|------|--------|
| Submit Code | `Ctrl+Enter` | Submit current solution |
| Run Code | `Ctrl+R` | Execute code in IDE |
| Format Code | `Ctrl+Alt+L` | Auto-format code |
| Fold All | `Ctrl+K Ctrl+0` | Collapse all code blocks |
| Unfold All | `Ctrl+K Ctrl+J` | Expand all code blocks |

### Quick Actions
| Shortcut | Keys | Action |
|----------|------|--------|
| Quick Search | `Ctrl+P` | Open search dialog |
| Open Settings | `Ctrl+,` | Open settings panel |
| Toggle Theme | `Ctrl+Shift+T` | Switch light/dark mode |
| Full Screen | `F11` | Toggle full screen |

### Common
| Shortcut | Keys | Action |
|----------|------|--------|
| Undo | `Ctrl+Z` | Undo last action |
| Redo | `Ctrl+Y` | Redo last action |
| Save | `Ctrl+S` | Save current work |
| Help | `F1` | Open help documentation |

## Database Schema

### users table (additions)
```sql
ALTER TABLE users ADD COLUMN custom_shortcuts JSON DEFAULT NULL;
ALTER TABLE users ADD COLUMN shortcuts_last_modified DATETIME DEFAULT NULL;
```

### keyboard_shortcuts_log table
```sql
CREATE TABLE keyboard_shortcuts_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,  -- CREATE, UPDATE, RESET
    shortcut_key VARCHAR(100) NOT NULL,
    old_value VARCHAR(50),
    new_value VARCHAR(50),
    change_reason VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
);
```

## API Endpoints

### 1. GET /api/keybindings/default
**Description:** Get all default keyboard shortcuts

**Request:**
```http
GET /api/keybindings/default
Authorization: Bearer {token}
```

**Response:**
```json
{
    "goto-next-problem": {
        "keys": "Ctrl+]",
        "description": "Next Problem"
    },
    "goto-prev-problem": {
        "keys": "Ctrl+[",
        "description": "Previous Problem"
    },
    ...
}
```

### 2. GET /api/users/:id/keybindings
**Description:** Get user's custom keyboard shortcuts

**Request:**
```http
GET /api/users/123/keybindings
Authorization: Bearer {token}
```

**Response:**
```json
{
    "customShortcuts": {
        "editor-submit": {
            "keys": "Ctrl+Shift+Enter",
            "description": "Submit Code"
        }
    },
    "timestamp": "2024-01-15T10:30:00Z"
}
```

### 3. PATCH /api/users/:id/keybindings
**Description:** Update user's custom keyboard shortcuts

**Request:**
```http
PATCH /api/users/123/keybindings
Authorization: Bearer {token}
Content-Type: application/json

{
    "keyboard_shortcuts": {
        "editor-submit": {
            "keys": "Ctrl+Shift+Enter",
            "description": "Submit Code"
        },
        "editor-run": {
            "keys": "Ctrl+Shift+R",
            "description": "Run Code"
        }
    }
}
```

**Response:**
```json
{
    "success": true,
    "message": "Keyboard shortcuts updated",
    "shortcutsCount": 2
}
```

## Frontend Integration

### Component: KeyboardShortcuts.jsx

**Props:**
- None (uses authentication context)

**Key Features:**
- Real-time shortcut recording
- Search and filter shortcuts
- Category-based organization
- Live preview of changes
- Undo/Reset functionality

**Usage:**
```jsx
import KeyboardShortcuts from './components/KeyboardShortcuts';

function SettingsPage() {
    return <KeyboardShortcuts />;
}
```

### CSS Classes
- `.keyboard-shortcuts` - Root container
- `.shortcuts-header` - Header section
- `.shortcuts-controls` - Filter/search controls
- `.shortcuts-list` - Main shortcuts list
- `.shortcut-row` - Individual shortcut row
- `.key-combo` - Key combination display
- `.changed-badge` - Changed indicator badge

## Recording New Shortcuts

### User Workflow:
1. Click "Edit" button next to a shortcut
2. Component enters recording mode (shows "Listening for keys...")
3. Press desired key combination (e.g., Ctrl+Shift+D)
4. Keys are displayed in real-time
5. After 500ms of no new keys, shortcut is recorded
6. Click "Save Changes" to persist to database

### Conflict Detection:
- Warns users if new shortcut conflicts with existing bindings
- Prevents accidental overwriting of important shortcuts

## Implementation Steps

### 1. Run Migration
```bash
node migrate_keyboard_shortcuts.js
```

This will:
- Add `custom_shortcuts` JSON column to users table
- Add `shortcuts_last_modified` DATETIME column to users table
- Create `keyboard_shortcuts_log` table for audit tracking
- Log migration in audit_logs

### 2. Import Component
```jsx
import KeyboardShortcuts from '../components/KeyboardShortcuts';
```

### 3. Add to Settings/Preferences Page
```jsx
<div className="settings-section">
    <KeyboardShortcuts />
</div>
```

### 4. Test the Feature
- Navigate to settings
- Try customizing a shortcut
- Verify shortcuts are saved to database
- Check keyboard_shortcuts_log for audit trail

## Security & Validation

### Authorization
- Only authenticated users can access their shortcuts
- Each user can only modify their own shortcuts
- Admin users can view all shortcuts in audit logs

### Data Validation
- Shortcuts object must be valid JSON
- Keys must be string format: "Ctrl+X" or "Ctrl+Shift+Y"
- Descriptions are optional but recommended

### Audit Logging
All changes are logged with:
- User ID
- Action type (UPDATE_KEYBINDINGS)
- Resource type (keybindings)
- Number of shortcuts changed
- Timestamp

## Error Handling

### Common Errors
| Error | Cause | Solution |
|-------|-------|----------|
| "keyboard_shortcuts field required" | Missing shortcuts object in request | Include `keyboard_shortcuts` field |
| "keyboard_shortcuts must be an object" | Invalid data type | Ensure shortcuts is a JSON object |
| "Unauthorized" | User accessing another user's shortcuts | Only use your own user ID |
| "User not found" | Invalid user ID | Check user ID is correct |

## Performance Considerations

- Shortcuts stored as JSON in users table (no extra queries)
- Changes tracked only in audit_log (not in separate shortcuts table)
- Read operations use single SELECT query
- Write operations batch update with audit log insert

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Works with any keyboard layout (QWERTY, DVORAK, etc.)

## Troubleshooting

### Shortcuts Not Saving?
1. Check network tab for failed requests
2. Verify authorization token is valid
3. Check browser console for errors

### Keys Not Being Recorded?
1. Ensure component is in focus
2. Check if keys conflict with browser shortcuts
3. Some keys may be reserved by OS (e.g., Alt+Tab)

### Custom Shortcuts Not Loading?
1. Clear browser cache
2. Check that migration was run successfully
3. Verify custom_shortcuts column exists in users table

## Future Enhancements

- [ ] Export/Import shortcuts configuration
- [ ] Share shortcuts with team
- [ ] Preset shortcut profiles (VS Code, IntelliJ, etc.)
- [ ] Detect conflicting shortcuts
- [ ] Macro recording (multiple commands in sequence)
- [ ] Accessibility settings for special keyboards

## Statistics & Analytics

Track keyboard shortcut usage:
```sql
SELECT 
    shortcut_key,
    COUNT(*) as change_count,
    COUNT(DISTINCT user_id) as users_modified
FROM keyboard_shortcuts_log
WHERE action = 'UPDATE'
GROUP BY shortcut_key
ORDER BY change_count DESC;
```

## Related Features

- **Feature #1:** Dark Mode Preference Sync - Related theme preferences
- **Feature #20:** IDE Theme Customization - Code editor appearance
- **Feature #4:** Audit Log Dashboard - View all shortcut changes
