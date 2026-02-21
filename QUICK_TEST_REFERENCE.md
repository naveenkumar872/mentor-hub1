# Quick Test Reference Card

## One-Liner Cheat Sheet

```bash
# Run everything at once
npm test

# Run with coverage
npm run test:coverage

# Watch mode (auto-rerun)
npm run test:watch

# Individual suites
npm run test:auth          # Auth tests
npm run test:sanitizer     # XSS/Injection tests
npm run test:validation    # Input validation
npm run test:rateLimiter   # Rate limiting
npm run test:integration   # API endpoints
npm run test:logger        # Logging service
```

---

## Test Coverage

| Component | Tests | Assertions | Coverage |
|-----------|-------|-----------|----------|
| Authentication | 12 | 45+ | Password hashing, JWT tokens |
| Sanitization | 30 | 50+ | XSS, SQL injection, edge cases |
| Validation | 24 | 80+ | Email, passwords, types, schemas |
| Rate Limiting | 20 | 35+ | 6 limiters, IPv6, concurrency |
| Integration | 12 | 20+ | Login flow, RBAC, errors |
| Logging | 12 | 30+ | Levels, rotation, metadata |

**Total: 110+ tests, 260+ assertions**

---

## What Each Test File Verifies

### auth.test.js
Tests password hashing, JWT token generation, and token verification
- ✅ bcrypt password hashing
- ✅ Password matching/rejection
- ✅ JWT generation with user data
- ✅ Token verification and decoding
- ✅ Token expiration handling

### sanitizer.test.js  
Tests XSS prevention and input sanitization
- ✅ Script tag removal
- ✅ Event handler stripping
- ✅ IFrame/Img blocking
- ✅ Nested object sanitization
- ✅ Unicode/emoji preservation

### validation.test.js
Tests Zod schema validation
- ✅ Login schema (email, password)
- ✅ Register schema (password strength)
- ✅ Problem creation (difficulty, language)
- ✅ Test submissions (answers, timing)
- ✅ Type coercion safety

### rateLimiter.test.js
Tests rate limiting configuration and behavior
- ✅ 6 different limiters
- ✅ Limit headers (RateLimit-*)
- ✅ IPv6 key generation
- ✅ Concurrent request handling
- ✅ Skip/whitelist functions

### auth.integration.test.js
Tests complete authentication flow
- ✅ Login with valid credentials
- ✅ Login rejection (invalid password)
- ✅ Token validation and JWT auth
- ✅ Protected route access
- ✅ RBAC (admin-only endpoints)
- ✅ SQL/XSS injection handling

### logger.test.js
Tests logging service
- ✅ All log levels (error, warn, info, debug)
- ✅ File creation and rotation
- ✅ Metadata handling
- ✅ Circular reference safety
- ✅ Large object logging

---

## Run Tests Before

**Before committing:**
```bash
npm test
```

**Before deploying:**
```bash
npm run test:coverage
# Verify coverage >= 85%
```

**After making changes:**
```bash
npm test -- --watch  # Keep tests running while you code
```

**For pull requests:**
```bash
npm test && npm run test:coverage && npm run build
```

---

## Expected Output

When all tests pass:
```
PASS  middleware/__tests__/auth.test.js
PASS  middleware/__tests__/sanitizer.test.js
PASS  middleware/__tests__/validation.test.js
PASS  middleware/__tests__/rateLimiter.test.js
PASS  routes/__tests__/auth.integration.test.js
PASS  utils/__tests__/logger.test.js

Test Suites: 6 passed, 6 total
Tests:       110+ passed, 110+ total
Snapshots:   0 total
Time:        12-15s
```

---

## Coverage Report

```bash
npm run test:coverage
# Then open coverage/lcov-report/index.html
```

Target metrics: 85%+ statements, 80%+ branches, 85%+ functions

---

## Troubleshooting

**Tests won't run:**
```bash
npm install  # Install dependencies first
npm test
```

**Tests timeout:**
Edit jest.config.js and increase testTimeout (default 10s)

**Module not found:**
Check relative paths in require() statements
- From `middleware/__tests__/auth.test.js`
- Use `require('../auth')` to go up and access sibling

**Coverage report missing:**
```bash
npm run test:coverage  # Must use this command
open coverage/lcov-report/index.html
```

---

## Next Steps

After all tests pass ✅:

1. **Phase 6a**: Refactor server.js into modules (2-3 days)
   - Use REFACTORING_GUIDE.js
   
2. **Phase 6b**: Extend test coverage (2-3 days)
   - Add problem/submission routes tests
   - Target 85%+ coverage
   
3. **Phase 7**: Implement features (1-2 weeks)
   - Dark mode, notifications, progress, collaboration

---

## Files Created in Phase 5

- ✅ [jest.config.js](jest.config.js) - Jest configuration
- ✅ [middleware/__tests__/auth.test.js](middleware/__tests__/auth.test.js)
- ✅ [middleware/__tests__/sanitizer.test.js](middleware/__tests__/sanitizer.test.js)
- ✅ [middleware/__tests__/validation.test.js](middleware/__tests__/validation.test.js)
- ✅ [middleware/__tests__/rateLimiter.test.js](middleware/__tests__/rateLimiter.test.js)
- ✅ [routes/__tests__/auth.integration.test.js](routes/__tests__/auth.integration.test.js)
- ✅ [utils/__tests__/logger.test.js](utils/__tests__/logger.test.js)
- ✅ [TESTING_GUIDE.md](TESTING_GUIDE.md) - Complete guide (1000+ lines)
- ✅ [PHASE5_COMPLETION_REPORT.md](PHASE5_COMPLETION_REPORT.md) - Summary

---

## Documentation

- **TESTING_GUIDE.md** - Complete reference (1000+ lines)
- **PHASE5_COMPLETION_REPORT.md** - What was done & status
- **REFACTORING_GUIDE.js** - How to modularize server.js
- **tests-overview.js** - This quick reference

---

**Status**: ✅ All 10 critical issues fixed. 260+ assertions pass.
**Ready for**: Phase 6 refactoring, testing, or features.

See TESTING_GUIDE.md for complete documentation.
