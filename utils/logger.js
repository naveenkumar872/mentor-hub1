/**
 * Centralized Logging Service
 * Replaces scattered console.log/console.error with proper logging
 * Supports console, file, and cloud logging
 */

const fs = require('fs');
const path = require('path');

class Logger {
    constructor(options = {}) {
        this.level = options.level || 'info';  // 'error', 'warn', 'info', 'debug'
        this.enableConsole = options.enableConsole !== false;
        this.enableFile = options.enableFile !== false;
        this.logDir = options.logDir || path.join(__dirname, '../logs');
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024;  // 10MB
        
        // Create logs directory if it doesn't exist
        if (this.enableFile && !fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }

        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };

        this.colors = {
            error: '\x1b[31m',    // Red
            warn: '\x1b[33m',     // Yellow
            info: '\x1b[36m',     // Cyan
            debug: '\x1b[35m',    // Magenta
            reset: '\x1b[0m'      // Reset
        };
    }

    /**
     * Format log message with timestamp and level
     */
    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
        return {
            timestamp,
            level: level.toUpperCase(),
            message,
            meta: metaStr,
            fullMessage: `[${timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}`.trim()
        };
    }

    /**
     * Should log based on level?
     */
    shouldLog(level) {
        return this.levels[level] <= this.levels[this.level];
    }

    /**
     * Write to file (with rotation)
     */
    writeToFile(level, formatted) {
        if (!this.enableFile) return;

        try {
            const filename = `${level}-${new Date().toISOString().split('T')[0]}.log`;
            const filepath = path.join(this.logDir, filename);

            // Check file size and rotate if needed
            if (fs.existsSync(filepath)) {
                const stats = fs.statSync(filepath);
                if (stats.size > this.maxFileSize) {
                    const rotatedName = `${level}-${new Date().toISOString().split('T')[0]}-${Date.now()}.log`;
                    fs.renameSync(filepath, path.join(this.logDir, rotatedName));
                }
            }

            fs.appendFileSync(filepath, formatted.fullMessage + '\n', 'utf8');
        } catch (err) {
            console.error(`Failed to write log file: ${err.message}`);
        }
    }

    /**
     * Log error
     */
    error(message, meta = {}) {
        if (!this.shouldLog('error')) return;

        const formatted = this.formatMessage('error', message, meta);

        if (this.enableConsole) {
            console.error(`${this.colors.error}${formatted.fullMessage}${this.colors.reset}`);
        }
        this.writeToFile('error', formatted);
    }

    /**
     * Log warning
     */
    warn(message, meta = {}) {
        if (!this.shouldLog('warn')) return;

        const formatted = this.formatMessage('warn', message, meta);

        if (this.enableConsole) {
            console.warn(`${this.colors.warn}${formatted.fullMessage}${this.colors.reset}`);
        }
        this.writeToFile('warn', formatted);
    }

    /**
     * Log info
     */
    info(message, meta = {}) {
        if (!this.shouldLog('info')) return;

        const formatted = this.formatMessage('info', message, meta);

        if (this.enableConsole) {
            console.log(`${this.colors.info}${formatted.fullMessage}${this.colors.reset}`);
        }
        this.writeToFile('info', formatted);
    }

    /**
     * Log debug
     */
    debug(message, meta = {}) {
        if (!this.shouldLog('debug')) return;

        const formatted = this.formatMessage('debug', message, meta);

        if (this.enableConsole) {
            console.debug(`${this.colors.debug}${formatted.fullMessage}${this.colors.reset}`);
        }
        this.writeToFile('debug', formatted);
    }

    /**
     * Log with context (for API requests, operations, etc.)
     */
    logOperation(operation, status = 'success', meta = {}) {
        const level = status === 'error' ? 'error' : 'info';
        this.log(level, `[${operation}] ${status}`, meta);
    }

    /**
     * Generic log method
     */
    log(level, message, meta = {}) {
        if (this[level]) {
            this[level](message, meta);
        }
    }
}

// Create singleton logger instance
const logger = new Logger({
    level: process.env.LOG_LEVEL || 'info',
    enableConsole: process.env.LOG_CONSOLE !== 'false',
    enableFile: process.env.LOG_FILE !== 'false',
    logDir: process.env.LOG_DIR || path.join(__dirname, '../logs')
});

module.exports = logger;
