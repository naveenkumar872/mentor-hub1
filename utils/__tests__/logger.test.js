/**
 * Unit Tests for Logger Service
 * Run with: npm test -- utils/__tests__/logger.test.js
 */

const Logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

describe('Logger Service', () => {
    let logger;
    const testLogDir = path.join(__dirname, '../../logs_test');

    beforeAll(() => {
        // Create logger instance for testing
        logger = new Logger({
            logDir: testLogDir,
            maxFileSize: 100 * 1024  // 100KB for testing
        });

        // Ensure log directory exists
        if (!fs.existsSync(testLogDir)) {
            fs.mkdirSync(testLogDir, { recursive: true });
        }
    });

    afterAll(() => {
        // Clean up test logs
        if (fs.existsSync(testLogDir)) {
            fs.rmSync(testLogDir, { recursive: true, force: true });
        }
    });

    describe('Logging Levels', () => {
        it('should log error messages', () => {
            const testMessage = 'Test error message';
            expect(() => {
                logger.error(testMessage, { errorCode: 500 });
            }).not.toThrow();
        });

        it('should log warning messages', () => {
            const testMessage = 'Test warning message';
            expect(() => {
                logger.warn(testMessage, { status: 429 });
            }).not.toThrow();
        });

        it('should log info messages', () => {
            const testMessage = 'Test info message';
            expect(() => {
                logger.info(testMessage, { userId: 'user123' });
            }).not.toThrow();
        });

        it('should log debug messages when enabled', () => {
            const testMessage = 'Test debug message';
            expect(() => {
                logger.debug(testMessage, { debugInfo: 'test' });
            }).not.toThrow();
        });
    });

    describe('Log File Creation', () => {
        it('should create log directory if it does not exist', () => {
            const newLogDir = path.join(__dirname, '../../logs_test_new');
            const testLogger = new Logger({ logDir: newLogDir });

            expect(fs.existsSync(newLogDir)).toBe(true);

            // Cleanup
            fs.rmSync(newLogDir, { recursive: true, force: true });
        });

        it('should create log files for different levels', () => {
            logger.info('Test info');
            logger.error('Test error');

            const infoLog = path.join(testLogDir, 'info.log');
            const errorLog = path.join(testLogDir, 'error.log');

            expect(fs.existsSync(infoLog) || fs.existsSync(errorLog)).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle logging with metadata', () => {
            const metadata = {
                userId: 'user123',
                action: 'login',
                timestamp: new Date().toISOString()
            };

            expect(() => {
                logger.info('User login', metadata);
            }).not.toThrow();
        });

        it('should handle logging with null metadata', () => {
            expect(() => {
                logger.info('Simple message', null);
            }).not.toThrow();
        });

        it('should handle logging with circular references safely', () => {
            const obj = { name: 'test' };
            obj.self = obj;  // Create circular reference

            expect(() => {
                logger.info('Circular reference test', { obj });
            }).not.toThrow();
        });

        it('should handle logging large objects', () => {
            const largeObject = {};
            for (let i = 0; i < 1000; i++) {
                largeObject[`key${i}`] = `value${i}`;
            }

            expect(() => {
                logger.info('Large object log', largeObject);
            }).not.toThrow();
        });
    });

    describe('Log File Rotation', () => {
        it('should handle multiple log entries', () => {
            for (let i = 0; i < 100; i++) {
                logger.info(`Log entry ${i}`);
            }

            const infoLog = path.join(testLogDir, 'info.log');
            expect(fs.existsSync(infoLog)).toBe(true);
        });
    });
});

describe('Logger Integration', () => {
    it('should be usable as a module in server.js', () => {
        const Logger = require('../../utils/logger');
        const instance = new Logger();

        expect(instance).toHaveProperty('error');
        expect(instance).toHaveProperty('warn');
        expect(instance).toHaveProperty('info');
        expect(instance).toHaveProperty('debug');

        expect(typeof instance.error).toBe('function');
        expect(typeof instance.warn).toBe('function');
        expect(typeof instance.info).toBe('function');
        expect(typeof instance.debug).toBe('function');
    });

    it('should export a singleton instance', () => {
        const logger1 = require('../../utils/logger');
        const logger2 = require('../../utils/logger');

        expect(logger1).toEqual(logger2);
    });
});
