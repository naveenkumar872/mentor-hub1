# Testing Guide for Mentor Hub

## Overview

This guide covers the complete test suite for the Mentor Hub platform, including unit tests, integration tests, and end-to-end testing strategies.

## Test Suite Structure

```
mentor-hub1/
├── middleware/__tests__/
│   ├── auth.test.js              # JWT and password hashing tests
│   ├── sanitizer.test.js         # XSS prevention and input sanitization
│   ├── validation.test.js        # Zod schema validation tests
│   └── rateLimiter.test.js       # Rate limiting tests (optional)
├── routes/__tests__/
│   ├── auth.integration.test.js  # Login, token, RBAC tests
│   ├── problems.integration.test.js
│   ├── submissions.integration.test.js
│   └── admin.integration.test.js
├── utils/__tests__/
│   └── logger.test.js             # Logging service tests
└── jest.config.js                 # Jest configuration
```

## Installation

1. **Install test dependencies** (already done if following Phase 5):

```bash
npm install --save-dev jest supertest
```

2. **Verify jest.config.js exists**:

```bash
ls jest.config.js
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- middleware/__tests__/auth.test.js
npm test -- routes/__tests__/auth.integration.test.js
npm test -- utils/__tests__/logger.test.js
```

### Run Tests with Coverage Report
```bash
npm test -- --coverage
```

### Run Tests in Watch Mode (auto-rerun on file changes)
```bash
npm test -- --watch
```

### Run Tests with Verbose Output
```bash
npm test -- --verbose
```

### Run Tests Matching Pattern
```bash
npm test -- --testNamePattern="should validate correct login"
np test -- --testNamePattern="Sanitizer"
```

## Test Categories

### 1. **Middleware Tests** (middleware/__tests__/)

#### auth.test.js (150+ assertions)
Tests authentication and authorization:
- ✅ Password hashing with bcrypt
- ✅ Password validation (correct/incorrect)
- ✅ Legacy plaintext password support
- ✅ JWT token generation
- ✅ JWT token verification
- ✅ Token expiration handling
- ✅ Invalid token rejection
- ✅ Token decoding accuracy

**Run**: `npm test -- middleware/__tests__/auth.test.js`

#### sanitizer.test.js (50+ assertions)
Tests XSS/injection prevention:
- ✅ Script tag removal
- ✅ Event handler stripping (onclick, onerror)
- ✅ IFrame/Img tag removal
- ✅ URL encoding/decoding safety
- ✅ Nested object sanitization
- ✅ Array element sanitization
- ✅ Unicode/Emoji preservation
- ✅ SQL injection attempt handling
- ✅ Large payload size limits

**Run**: `npm test -- middleware/__tests__/sanitizer.test.js`

#### validation.test.js (80+ assertions)
Tests Zod schema validation:
- ✅ Login schema (email, password validation)
- ✅ Register schema (password strength, confirmation)
- ✅ Problem creation schema (difficulty, language, max attempts)
- ✅ Aptitude test submission schema (answers, timing)
- ✅ Global test submission schema (code, score range)
- ✅ Type coercion (string → number)
- ✅ Error message clarity
- ✅ Invalid role rejection

**Run**: `npm test -- middleware/__tests__/validation.test.js`

### 2. **Integration Tests** (routes/__tests__/)

#### auth.integration.test.js (20+ assertions)
Tests API endpoints end-to-end:
- ✅ POST /api/auth/login with valid credentials
- ✅ Login rejection with invalid credentials
- ✅ Missing email/password rejection
- ✅ Protected route access with JWT
- ✅ Protected route rejection without token
- ✅ Invalid token rejection
- ✅ Malformed Authorization header handling
- ✅ Role-based access control (RBAC)
- ✅ Admin-only endpoint protection
- ✅ SQL injection attempt handling
- ✅ XSS attempt handling

**Run**: `npm test -- routes/__tests__/auth.integration.test.js`

### 3. **Utility Tests** (utils/__tests__/)

#### logger.test.js (30+ assertions)
Tests centralized logging service:
- ✅ All log levels (error, warn, info, debug)
- ✅ Log file creation and rotation
- ✅ Metadata handling
- ✅ Circular reference safety
- ✅ Large object logging
- ✅ Multiple log entries
- ✅ Singleton pattern verification

**Run**: `npm test -- utils/__tests__/logger.test.js`

## Test Execution Workflow

### Quick Test (Before Commits)
```bash
npm test -- --testPathPattern="auth|validation" --maxWorkers=1
```

### Full Test Suite (Before Deployment)
```bash
npm test -- --coverage --forceExit
```

### Coverage Report
After running tests with `--coverage`, check:
```
coverage/
├── lcov-report/index.html   # Visual report
├── coverage-summary.json    # Summary stats
└── ...
```

Open in browser:
```bash
open coverage/lcov-report/index.html
```

## Expected Test Results

### Minimal Test Run (First-Time)
```
PASS middleware/__tests__/auth.test.js
  Auth Middleware
    Password Hashing
      ✓ should hash a password successfully (45ms)
      ✓ should correctly validate matching passwords (32ms)
      ...
    JWT Token Generation & Verification
      ✓ should generate a valid token (5ms)
      ...

PASS middleware/__tests__/validation.test.js
  Login Schema Validation
    ✓ should validate correct login input (8ms)
    ...

PASS utils/__tests__/logger.test.js
  Logger Service
    ✓ should log error messages (12ms)
    ...

Test Suites: 3 passed, 3 total
Tests:       150+ passed, 150+ total
Snapshots:   0 total
Time:        8.234 s
```

### Full Test Run (All Tests)
```
Test Suites: 7 passed, 7 total
Tests:       250+ passed, 250+ total
Snapshots:   0 total
Time:        15.845 s
Coverage:
  Statements   : 85.3% ( 1234/1447 )
  Branches     : 78.9% ( 456/578 )
  Functions    : 82.1% ( 234/285 )
  Lines        : 86.4% ( 892/1032 )
```

## Security Test Coverage

### XSS Protection (25+ tests)
- ✅ Script tag injection blocked
- ✅ Event handler injection blocked
- ✅ URL-based XSS blocked
- ✅ Data attribute injection blocked
- ✅ Style attribute injection blocked

### SQL Injection (8+ tests)
- ✅ OR-based injection blocked
- ✅ UNION-based injection blocked
- ✅ Comment-based injection blocked
- ✅ Encoded injection blocked

### Authentication (12+ tests)
- ✅ Token validation
- ✅ Expired token rejection
- ✅ Invalid signature rejection
- ✅ Missing token rejection
- ✅ Malformed token rejection
- ✅ RBAC enforcement

### Input Validation (30+ tests)
- ✅ Email format validation
- ✅ Password strength validation
- ✅ Type coercion safety
- ✅ Range validation
- ✅ Length validation
- ✅ Required field enforcement

## Continuous Integration (CI) Setup

### GitHub Actions Example (.github/workflows/test.yml)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      
      - run: npm install
      - run: npm test -- --coverage
      - run: npm run build
      
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Adding New Tests

### Template for New Test File

```javascript
/**
 * Unit Tests for [Feature]
 * Run with: npm test -- [path]/__tests__/[feature].test.js
 */

const { functionToTest } = require('../../[path]/[file]');

describe('Feature Name', () => {
    describe('Specific Functionality', () => {
        it('should do something specific', () => {
            // Arrange
            const input = 'test data';
            
            // Act
            const result = functionToTest(input);
            
            // Assert
            expect(result).toBe('expected');
        });

        it('should handle edge case', () => {
            expect(() => {
                functionToTest(null);
            }).not.toThrow();
        });
    });
});
```

### Test Best Practices

1. **Naming**: Use descriptive test names
   - ✅ "should reject login with invalid email format"
   - ❌ "test login"

2. **Arrange-Act-Assert Pattern**:
   ```javascript
   it('should...', () => {
       // Arrange: Setup test data
       const input = { email: 'test@example' };
       
       // Act: Execute function
       const result = validate(input);
       
       // Assert: Verify result
       expect(result.success).toBe(false);
   });
   ```

3. **Test One Thing**: Each test should verify single behavior
   - ✅ Test password hashing separately from validation
   - ❌ Test both hashing and validation in one test

4. **Use Descriptive Assertions**:
   ```javascript
   expect(hash).not.toBe(password);  // Clear intent
   expect(hash.startsWith('$2')).toBe(true);  // Specific check
   ```

## Performance Testing

### Test Execution Time Targets
- Unit tests: < 100ms per test
- Integration tests: < 500ms per test
- Full suite: < 30 seconds total

### Run with Performance Report
```bash
npm test -- --verbose --testTimeout=10000
```

## Debugging Tests

### Debug Specific Test
```bash
node --inspect-brk node_modules/.bin/jest --runInBand middleware/__tests__/auth.test.js
```

### Use Jest Utilities
```javascript
it('should debug', () => {
    const result = functionToTest(input);
    console.log('Result:', result);  // Visible with --verbose
    console.error('Debug:', result);
    debugger;  // Pause execution
    expect(result).toBeTruthy();
});
```

## Common Issues & Solutions

### Issue: Tests fail with "Cannot find module"
**Solution**: Ensure file path in `require()` is correct
```javascript
// If test is in middleware/__tests__/auth.test.js
// Require from middleware/auth.js like this:
const { hashPassword } = require('../../middleware/auth');  // Wrong
const { hashPassword } = require('../auth');  // Correct
```

### Issue: Jest timeout errors
**Solution**: Increase timeout in jest.config.js or specific test
```javascript
it('slow test', async () => {
    // test code
}, 30000);  // 30 second timeout
```

### Issue: Socket.IO tests hanging
**Solution**: Properly close server/client in afterAll
```javascript
afterAll(() => {
    server.close();
    app.close();
});
```

## Coverage Goals

### Target Coverage Metrics
- **Statements**: 85%+
- **Branches**: 80%+  
- **Functions**: 85%+
- **Lines**: 85%+

### Critical Paths for 100% Coverage
1. Authentication (100% - security critical)
2. Sanitization (100% - security critical)
3. Validation (100% - data integrity)
4. Payment processing (100%)
5. Admin operations (95%+)

## Test Maintenance

### Regular Tasks
- Review test failures in CI/CD logs
- Update tests when refactoring code
- Add tests for bug fixes (regression prevention)
- Remove obsolete tests (cleanup)

### Monthly Review
```bash
# Check coverage trends
npm test -- --coverage --updateSnapshot
# Review coverage report
open coverage/lcov-report/index.html
```

## Next Steps

### Phase 7: Test-Driven Development
1. Write tests for new features first
2. Implement feature to pass tests
3. Refactor while maintaining green tests

### Phase 8: E2E Testing Strategy
1. Add Playwright/Cypress tests for user flows
2. Visual regression testing
3. Performance benchmarking

---

**Last Updated**: Phase 5 - Critical Issues Resolution
**Maintained By**: Development Team
**Version**: 1.0.0
