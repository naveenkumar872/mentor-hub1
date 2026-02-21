/**
 * JWT Authentication & Authorization Middleware
 * - Generates JWT tokens on login
 * - Validates tokens on protected routes
 * - Role-based access control
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'mentor-hub-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const BCRYPT_ROUNDS = 12;

/**
 * Hash a plaintext password
 */
async function hashPassword(plainPassword) {
    return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

/**
 * Compare plaintext password with hash
 */
async function comparePassword(plainPassword, hashedPassword) {
    // Backward compatibility: if stored password is not a bcrypt hash, do direct compare
    // This allows existing users to login while we migrate passwords
    if (!hashedPassword.startsWith('$2a$') && !hashedPassword.startsWith('$2b$')) {
        return plainPassword === hashedPassword;
    }
    return bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
    const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 */
function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

/**
 * Middleware: Authenticate request via Bearer token
 * Attaches `req.user` with decoded token payload
 */
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required. Provide Bearer token.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = verifyToken(token);
        req.user = decoded;
        console.log('[AUTH] ✅ Token verified. User ID:', decoded.id);
        next();
    } catch (error) {
        console.log('[AUTH] ❌ Token verification failed:', error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired. Please login again.' });
        }
        return res.status(401).json({ error: 'Invalid token.' });
    }
}

/**
 * Middleware: Require specific role(s)
 * Usage: authorize('admin') or authorize('admin', 'mentor')
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Access denied. Insufficient permissions.',
                required: allowedRoles,
                current: req.user.role
            });
        }

        next();
    };
}

/**
 * Middleware: Optional auth - attaches user if token present, but doesn't block
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            req.user = verifyToken(token);
        } catch (error) {
            // Token invalid but request continues without auth
            req.user = null;
        }
    }

    next();
}

module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    verifyToken,
    authenticate,
    authorize,
    optionalAuth,
    JWT_SECRET,
    BCRYPT_ROUNDS
};
