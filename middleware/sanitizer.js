/**
 * Input Sanitization Middleware
 * Prevents XSS, HTML injection, and malicious code injection
 */

/**
 * Sanitize string input - removes HTML and dangerous content
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    // Remove HTML tags, keep only text
    return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')  // Remove script tags
        .replace(/<[^>]*>/g, '')  // Remove HTML tags
        .replace(/[<>]/g, '')  // Remove angle brackets
        .trim()
        .substring(0, 10000);  // Limit to 10KB
}

/**
 * Sanitize object/JSON recursively
 */
function sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return typeof obj === 'string' ? sanitizeString(obj) : obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        // Skip sensitive fields
        if (['password', 'token', 'secret', 'apiKey', 'apiSecret'].includes(key.toLowerCase())) {
            sanitized[key] = value;  // Don't sanitize passwords/tokens
        } else if (typeof value === 'string') {
            sanitized[key] = sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

/**
 * Express middleware: Sanitize all incoming request data
 */
function sanitizeMiddleware(req, res, next) {
    try {
        // Sanitize request body
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body);
        }

        // Sanitize query parameters
        if (req.query && typeof req.query === 'object') {
            req.query = sanitizeObject(req.query);
        }

        // Sanitize URL parameters
        if (req.params && typeof req.params === 'object') {
            req.params = sanitizeObject(req.params);
        }

        next();
    } catch (error) {
        console.error('[Sanitizer] Error during sanitization:', error.message);
        res.status(400).json({ error: 'Invalid input format' });
    }
}

/**
 * Escape HTML special characters (for display)
 */
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = {
    sanitizeMiddleware,
    sanitizeString,
    sanitizeObject,
    escapeHtml
};
