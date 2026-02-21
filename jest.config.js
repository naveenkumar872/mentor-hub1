/**
 * Jest Configuration File
 * Run tests with: npm test
 */

module.exports = {
    testEnvironment: 'node',
    coveragePathIgnorePatterns: ['/node_modules/'],
    testMatch: ['**/__tests__/**/*.js', '**/*.test.js'],
    collectCoverageFrom: [
        'middleware/**/*.js',
        'routes/**/*.js',
        'services/**/*.js',
        'utils/**/*.js',
        '!node_modules/**'
    ],
    verbose: true,
    forceExit: true,
    clearMocks: true,
    resetMocks: true,
    testTimeout: 10000
};
