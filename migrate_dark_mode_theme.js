/**
 * Migration: Add Theme Preference to Users
 * Allows syncing theme preference across devices
 * Run: node migrate_dark_mode_theme.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
    const dbUrl = new URL(process.env.DATABASE_URL);
    const pool = mysql.createPool({
        host: dbUrl.hostname,
        user: dbUrl.username,
        password: dbUrl.password,
        database: dbUrl.pathname.slice(1),
        port: Number(dbUrl.port) || 4000,
        ssl: {},
        waitForConnections: true,
        connectionLimit: 5,
        timezone: '+00:00'
    });

    console.log('🚀 Running Dark Mode Theme migration...\n');

    try {
        // Add theme_preference column to users
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(20) DEFAULT 'system'
            COMMENT 'Theme preference: light, dark, system'
        `);
        console.log('✅ Added theme_preference column to users table');

        // Add IDE theme preference for code editor
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS ide_theme VARCHAR(50) DEFAULT 'vs-dark'
            COMMENT 'IDE theme for Monaco editor: vs, vs-dark, hc-black, dracula, monokai'
        `);
        console.log('✅ Added ide_theme column to users table');

        // Add keyboard shortcuts preference
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS keyboard_shortcuts_enabled TINYINT(1) DEFAULT 1
            COMMENT 'Enable keyboard shortcuts display'
        `);
        console.log('✅ Added keyboard_shortcuts_enabled column to users table');

        console.log('\n✅ Dark Mode Theme migration complete!');
        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        await pool.end();
        process.exit(1);
    }
}

migrate();
