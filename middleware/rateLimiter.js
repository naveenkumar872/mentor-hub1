/**
 * Rate Limiting Middleware
 * Protects against brute-force, DoS, and API abuse
 * Implements tier-based rate limiting based on user subscription
 */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'mentor-hub-secret-key-change-in-production';

// Extract user ID from JWT token or use IP address (IPv6-safe)
const getUserKeyFromRequest = (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            return `user:${decoded.id}`; // Use user ID if authenticated
        }
    } catch (e) {
        // Token invalid, fall through to IP-based
    }
    // Use ipKeyGenerator for IPv6-safe IP-based limiting
    return ipKeyGenerator(req, res);
};

// Tier limits configuration (can be fetched from DB in production)
const TIER_LIMITS = {
    free: {
        general: 100,           // API calls per day
        auth: 10,               // Login attempts per 15 min
        ai: 5,                  // AI requests per day
        code: 10,               // Code executions per 5 min
        admin: 0,               // Admin operations (no access for free tier)
        upload: 5,              // File uploads per 15 min
        daily_submissions: 30,  // Submissions per day
        windowMs: 24 * 60 * 60 * 1000  // 1 day
    },
    pro: {
        general: 1000,
        auth: 50,
        ai: 50,
        code: 100,
        admin: 50,
        upload: 50,
        daily_submissions: 200,
        windowMs: 24 * 60 * 60 * 1000
    },
    enterprise: {
        general: 999999,
        auth: 999999,
        ai: 999999,
        code: 999999,
        admin: 999999,
        upload: 999999,
        daily_submissions: 999999,
        windowMs: 24 * 60 * 60 * 1000
    }
};

// Default tier if user is not authenticated or tier is not found
const DEFAULT_TIER = 'free';

// General API rate limit (with tier support)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req, res) => {
        const tier = req.user?.tier || DEFAULT_TIER;
        return TIER_LIMITS[tier]?.general || TIER_LIMITS[DEFAULT_TIER].general;
    },
    message: { error: 'Too many API requests. Please check your rate limit.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getUserKeyFromRequest,
    skip: (req, res) => {
        // Skip limiting for admin users bypassing
        return req.user?.role === 'admin' && req.user?.tier === 'enterprise';
    }
});

// Strict limiter for auth routes (10 attempts per 15 min)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: (req, res) => {
        // For auth, all users share same limit (prevent account enumeration)
        return TIER_LIMITS[DEFAULT_TIER].auth;
    },
    message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator  // Use IPv6-safe IP-based for auth (no user yet)
});

// AI endpoints rate limiter (tier-based)
const aiLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // Per day
    max: (req, res) => {
        const tier = req.user?.tier || DEFAULT_TIER;
        return TIER_LIMITS[tier]?.ai || TIER_LIMITS[DEFAULT_TIER].ai;
    },
    message: { error: 'AI request limit reached. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getUserKeyFromRequest
});

// Code execution rate limiter (tier-based)
const codeLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: (req, res) => {
        const tier = req.user?.tier || DEFAULT_TIER;
        return TIER_LIMITS[tier]?.code || TIER_LIMITS[DEFAULT_TIER].code;
    },
    message: { error: 'Too many code execution requests. Please wait before running again.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getUserKeyFromRequest
});

// Admin operations rate limiter (tier-based)
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: (req, res) => {
        const tier = req.user?.tier || DEFAULT_TIER;
        if (TIER_LIMITS[tier]?.admin === 0) {
            return 0; // Block free users completely
        }
        return TIER_LIMITS[tier]?.admin || TIER_LIMITS[DEFAULT_TIER].admin;
    },
    message: { error: 'Admin operations not allowed for your tier.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getUserKeyFromRequest,
    skip: (req, res) => {
        // Only admins can use admin limiter
        return req.user?.role !== 'admin';
    }
});

// Upload rate limiter (tier-based)
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: (req, res) => {
        const tier = req.user?.tier || DEFAULT_TIER;
        return TIER_LIMITS[tier]?.upload || TIER_LIMITS[DEFAULT_TIER].upload;
    },
    message: { error: 'Upload limit reached. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getUserKeyFromRequest
});

// Submissions rate limiter (per day)
const submissionLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: (req, res) => {
        const tier = req.user?.tier || DEFAULT_TIER;
        return TIER_LIMITS[tier]?.daily_submissions || TIER_LIMITS[DEFAULT_TIER].daily_submissions;
    },
    message: { error: 'Daily submission limit reached. Please try again tomorrow.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getUserKeyFromRequest
});

module.exports = {
    generalLimiter,
    authLimiter,
    aiLimiter,
    codeLimiter,
    adminLimiter,
    uploadLimiter,
    submissionLimiter,
    TIER_LIMITS,
    DEFAULT_TIER
};
