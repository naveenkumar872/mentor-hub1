// utils/cache.js
// Simple in-memory cache (NO external dependencies!)
// Perfect for single-server deployments
// For distributed systems, upgrade to Redis later

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.timers = new Map();
    }

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {any|null} - Cached value or null if not found/expired
     */
    get(key) {
        const value = this.cache.get(key);
        if (value === undefined) {
            return null;
        }

        // Check if expired
        if (value.expiresAt && Date.now() > value.expiresAt) {
            this.delete(key);
            return null;
        }

        return value.data;
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     * @param {number} expiresIn - TTL in milliseconds (default: 1 hour)
     */
    set(key, data, expiresIn = 3600000) {
        // Cancel previous timer
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }

        const expiresAt = expiresIn ? Date.now() + expiresIn : null;
        this.cache.set(key, { data, expiresAt });

        // Auto-delete expired cache
        if (expiresIn) {
            const timer = setTimeout(() => {
                this.delete(key);
            }, expiresIn);
            this.timers.set(key, timer);
        }
    }

    /**
     * Delete specific key
     * @param {string} key - Cache key to delete
     */
    delete(key) {
        this.cache.delete(key);
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
    }

    /**
     * Delete all keys matching pattern
     * @param {string} pattern - Pattern (e.g., "user:*" or "leaderboard:*")
     */
    deletePattern(pattern) {
        const regex = new RegExp(
            '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );
        const keysToDelete = [];
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.delete(key));
    }

    /**
     * Clear entire cache
     */
    clear() {
        this.cache.clear();
        this.timers.forEach(timer => {
            if (timer) clearTimeout(timer);
        });
        this.timers.clear();
    }

    /**
     * Get cache statistics
     * @returns {object} - Cache stats
     */
    stats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys()),
            memory: {
                keyCount: this.cache.size,
                timerCount: this.timers.size
            }
        };
    }

    /**
     * Check if key exists and is valid
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        const value = this.cache.get(key);
        if (!value) return false;

        // Check if expired
        if (value.expiresAt && Date.now() > value.expiresAt) {
            this.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Get remaining TTL in milliseconds
     * @param {string} key - Cache key
     * @returns {number|null} - Milliseconds until expiry, or null if no TTL
     */
    getTTL(key) {
        const value = this.cache.get(key);
        if (!value) return null;
        if (!value.expiresAt) return null;

        const remaining = value.expiresAt - Date.now();
        return remaining > 0 ? remaining : null;
    }

    /**
     * Get or set pattern - execute function if cache miss
     * @param {string} key - Cache key
     * @param {function} fn - Async function to execute on cache miss
     * @param {number} expiresIn - TTL in milliseconds
     * @returns {any} - Cached or fresh value
     */
    async getOrSet(key, fn, expiresIn = 3600000) {
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        const value = await fn();
        this.set(key, value, expiresIn);
        return value;
    }
}

// Create singleton instance
const cacheManager = new CacheManager();

module.exports = { cacheManager, CacheManager };
