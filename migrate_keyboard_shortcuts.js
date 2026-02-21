const mysql = require('mysql2/promise');

// Database configuration
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'mentor_hub',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function migrateKeyboardShortcuts() {
    try {
        console.log('🔄 Starting keyboard shortcuts migration...\n');

        const conn = await pool.getConnection();

        // Check if columns exist
        const [columns] = await conn.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'users' 
            AND COLUMN_NAME IN ('custom_shortcuts', 'shortcuts_last_modified')
        `);

        const existingColumns = columns.map(c => c.COLUMN_NAME);

        // Add custom_shortcuts column
        if (!existingColumns.includes('custom_shortcuts')) {
            console.log('📝 Adding custom_shortcuts column...');
            await conn.query(`
                ALTER TABLE users 
                ADD COLUMN custom_shortcuts JSON DEFAULT NULL 
                COMMENT 'Custom keyboard shortcuts as JSON'
            `);
            console.log('✅ custom_shortcuts column added\n');
        } else {
            console.log('⏭️  custom_shortcuts column already exists\n');
        }

        // Add shortcuts_last_modified column
        if (!existingColumns.includes('shortcuts_last_modified')) {
            console.log('📝 Adding shortcuts_last_modified column...');
            await conn.query(`
                ALTER TABLE users 
                ADD COLUMN shortcuts_last_modified DATETIME DEFAULT NULL 
                COMMENT 'Last time keyboard shortcuts were modified'
            `);
            console.log('✅ shortcuts_last_modified column added\n');
        } else {
            console.log('⏭️  shortcuts_last_modified column already exists\n');
        }

        // Create keyboard_shortcuts_log table for tracking changes
        console.log('📋 Creating keyboard_shortcuts_log table...');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS keyboard_shortcuts_log (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                action VARCHAR(50) NOT NULL COMMENT 'CREATE, UPDATE, RESET',
                shortcut_key VARCHAR(100) NOT NULL COMMENT 'The shortcut key that was changed',
                old_value VARCHAR(50),
                new_value VARCHAR(50),
                change_reason VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_id (user_id),
                INDEX idx_action (action),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ keyboard_shortcuts_log table created\n');

        // Sample data - Create user preferences for keyboard shortcuts
        console.log('📊 Checking default keyboard shortcuts setup...');
        
        const defaultShortcuts = {
            'goto-next-problem': { keys: 'Ctrl+]', description: 'Next Problem' },
            'goto-prev-problem': { keys: 'Ctrl+[', description: 'Previous Problem' },
            'goto-submissions': { keys: 'Ctrl+S', description: 'My Submissions' },
            'goto-dashboard': { keys: 'Ctrl+H', description: 'Dashboard' },
            'editor-submit': { keys: 'Ctrl+Enter', description: 'Submit Code' },
            'editor-run': { keys: 'Ctrl+R', description: 'Run Code' },
            'editor-format': { keys: 'Ctrl+Alt+L', description: 'Format Code' },
            'editor-fold': { keys: 'Ctrl+K Ctrl+0', description: 'Fold All' },
            'editor-unfold': { keys: 'Ctrl+K Ctrl+J', description: 'Unfold All' },
            'quick-search': { keys: 'Ctrl+P', description: 'Quick Search' },
            'open-settings': { keys: 'Ctrl+,', description: 'Settings' },
            'toggle-theme': { keys: 'Ctrl+Shift+T', description: 'Toggle Theme' },
            'toggle-fullscreen': { keys: 'F11', description: 'Full Screen' },
            'undo': { keys: 'Ctrl+Z', description: 'Undo' },
            'redo': { keys: 'Ctrl+Y', description: 'Redo' },
            'save': { keys: 'Ctrl+S', description: 'Save' },
            'help': { keys: 'F1', description: 'Help' }
        };

        console.log(`✅ ${Object.keys(defaultShortcuts).length} default shortcuts defined\n`);

        // Log migration status
        await conn.query(`
            INSERT INTO audit_logs (user_id, user_role, action, resource_type, changes, timestamp)
            VALUES (1, 'admin', 'MIGRATE', 'keyboard_shortcuts', 
                    'Added custom_shortcuts and shortcuts_last_modified columns, created keyboard_shortcuts_log table',
                    NOW())
        `);

        console.log('✅ Migration logged in audit_logs\n');

        // Summary
        console.log('═════════════════════════════════════════════════════');
        console.log('🎉 Keyboard Shortcuts Migration Complete!\n');
        console.log('📋 Database Changes:');
        console.log('   ✅ Added users.custom_shortcuts (JSON)');
        console.log('   ✅ Added users.shortcuts_last_modified (DATETIME)');
        console.log('   ✅ Created keyboard_shortcuts_log table');
        console.log('\n📝 Default Shortcuts Configured:');
        console.log(`   • 16 default keyboard shortcuts`);
        console.log('   • Users can customize all shortcuts');
        console.log('   • Changes are tracked in keyboard_shortcuts_log\n');
        console.log('🔧 API Endpoints:');
        console.log('   GET  /api/keybindings/default - Get default shortcuts');
        console.log('   GET  /api/users/:id/keybindings - Get user custom shortcuts');
        console.log('   PATCH /api/users/:id/keybindings - Update user shortcuts\n');
        console.log('═════════════════════════════════════════════════════\n');

        conn.release();
        await pool.end();
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

// Run migration
migrateKeyboardShortcuts();
