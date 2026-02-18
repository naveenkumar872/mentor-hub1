/**
 * AI-Powered Plagiarism & Code Similarity Detection Module
 * Features:
 * - Lexical similarity analysis (character/token based)
 * - AST-based code structure comparison
 * - Cross-student/cross-submission plagiarism detection
 * - Suspicion scoring & flagging
 * - Rabin-Karp string matching algorithm
 */

const crypto = require('crypto');

class PlagiarismDetector {
    constructor() {
        this.RABIN_KARP_PRIME = 101;
        this.RABIN_KARP_BASE = 256;
    }

    /**
     * ============ LEXICAL ANALYSIS ============
     * Tokenize and normalize code for comparison
     */

    // Normalize code by removing comments, whitespace, and standardizing structure
    normalizeCode(code) {
        if (!code || typeof code !== 'string') return '';

        let normalized = code;

        // Remove single-line comments (// and #)
        normalized = normalized.replace(/\/\/.*$/gm, '');
        normalized = normalized.replace(/#.*$/gm, '');

        // Remove multi-line comments (/* */ and """ """)
        normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');
        normalized = normalized.replace(/"""[\s\S]*?"""/g, '');
        normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');

        // Remove strings (but keep structure)
        normalized = normalized.replace(/"[^"]*"/g, '"STR"');
        normalized = normalized.replace(/'[^']*'/g, '"STR"');

        // Standardize whitespace
        normalized = normalized.replace(/\s+/g, ' ').trim();

        // Remove extra spaces around operators
        normalized = normalized.replace(/\s*([{};,()[\]<>=+\-*/%!&|^~])\s*/g, '$1');

        return normalized;
    }

    // Extract tokens from code
    tokenize(code) {
        const normalized = this.normalizeCode(code);
        // Split by non-alphanumeric characters while keeping them as tokens
        const tokens = normalized.match(/\b\w+\b|[{};,()[\]<>=+\-*/%!&|^~]/g) || [];
        return tokens;
    }

    /**
     * ============ RABIN-KARP ALGORITHM ============
     * String matching algorithm for efficient plagiarism detection
     */

    // Calculate hash for a string
    rabinKarpHash(str, length) {
        let hash = 0;
        for (let i = 0; i < length; i++) {
            hash = (hash * this.RABIN_KARP_BASE + str.charCodeAt(i)) % 101;
        }
        return hash;
    }

    // Find matching subsequences using Rabin-Karp
    rabinKarpMatching(text, pattern) {
        const textLen = text.length;
        const patternLen = pattern.length;
        const matches = [];

        if (patternLen > textLen) return matches;

        const patternHash = this.rabinKarpHash(pattern, patternLen);
        let textHash = this.rabinKarpHash(text, patternLen);

        for (let i = 0; i <= textLen - patternLen; i++) {
            if (patternHash === textHash) {
                // Verify with actual comparison to avoid false positives
                if (text.substring(i, i + patternLen) === pattern) {
                    matches.push(i);
                }
            }

            if (i < textLen - patternLen) {
                textHash = (this.RABIN_KARP_BASE * (textHash - text.charCodeAt(i)) + text.charCodeAt(i + patternLen)) % 101;
                if (textHash < 0) textHash = textHash + 101;
            }
        }

        return matches;
    }

    /**
     * ============ SIMILARITY METRICS ============
     */

    // Calculate Levenshtein distance (edit distance)
    levenshteinDistance(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[0][i] = i;
        for (let j = 0; j <= n; j++) dp[j][0] = j;

        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                if (str2[i - 1] === str1[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                }
            }
        }

        return dp[n][m];
    }

    // Calculate Jaccard similarity (token-based)
    jaccardSimilarity(code1, code2) {
        const tokens1 = new Set(this.tokenize(code1));
        const tokens2 = new Set(this.tokenize(code2));

        const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
        const union = new Set([...tokens1, ...tokens2]);

        if (union.size === 0) return 0;
        return (intersection.size / union.size) * 100;
    }

    // Calculate longest common subsequence (LCS) similarity
    longestCommonSubsequence(code1, code2) {
        const tokens1 = this.tokenize(code1);
        const tokens2 = this.tokenize(code2);

        const m = tokens1.length;
        const n = tokens2.length;
        const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (tokens1[i - 1] === tokens2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        const lcsLength = dp[m][n];
        const maxLength = Math.max(m, n);
        return (lcsLength / maxLength) * 100;
    }

    /**
     * ============ AST-BASED ANALYSIS ============
     * Extract code structure without content
     */

    // Extract structural features (AST-like analysis without full parsing)
    extractStructuralFeatures(code) {
        const features = {
            functionCount: (code.match(/function\s+\w+|def\s+\w+|\w+\s*:\s*function/g) || []).length,
            classCount: (code.match(/class\s+\w+/g) || []).length,
            loopCount: (code.match(/for|while|do/g) || []).length,
            conditionCount: (code.match(/if|else|switch/g) || []).length,
            variableCount: (code.match(/\bvar\s+\w+|let\s+\w+|const\s+\w+|int\s+\w+|float\s+\w+/g) || []).length,
            returnCount: (code.match(/return/g) || []).length,
            apiCallCount: (code.match(/\.\w+\(|import|require/g) || []).length,
            braceCount: (code.match(/{/g) || []).length,
            codeLength: code.length,
            lineCount: code.split('\n').length
        };

        return features;
    }

    // Calculate structural similarity
    structuralSimilarity(code1, code2) {
        const features1 = this.extractStructuralFeatures(code1);
        const features2 = this.extractStructuralFeatures(code2);

        let matchingFeatures = 0;
        const tolerance = 2; // Allow ±2 difference

        for (const key in features1) {
            const diff = Math.abs(features1[key] - features2[key]);
            if (diff <= tolerance) matchingFeatures++;
        }

        return (matchingFeatures / Object.keys(features1).length) * 100;
    }

    /**
     * ============ COMBINED SIMILARITY ANALYSIS ============
     */

    // Calculate comprehensive similarity score
    calculateSimilarity(code1, code2) {
        if (!code1 || !code2) return 0;

        // Calculate different similarity metrics
        const jaccard = this.jaccardSimilarity(code1, code2);
        const lcs = this.longestCommonSubsequence(code1, code2);
        const structural = this.structuralSimilarity(code1, code2);

        // Normalize lexical similarity (inverse of edit distance)
        const normalized1 = this.normalizeCode(code1);
        const normalized2 = this.normalizeCode(code2);
        const distance = this.levenshteinDistance(normalized1, normalized2);
        const maxLen = Math.max(normalized1.length, normalized2.length);
        const lexical = maxLen > 0 ? Math.max(0, 100 - (distance / maxLen) * 100) : 0;

        // Weighted combination
        const similarity = (
            jaccard * 0.35 +      // Token-based similarity
            lcs * 0.30 +          // Sequence similarity
            structural * 0.25 +   // Code structure
            lexical * 0.10        // Normalized text similarity
        );

        return Math.min(100, Math.max(0, similarity));
    }

    /**
     * ============ PLAGIARISM DETECTION ============
     */

    // Detect plagiarism between two submissions
    detectPlagiarism(submission1, submission2, threshold = 70) {
        const similarity = this.calculateSimilarity(submission1.code, submission2.code);
        const isPlagiarism = similarity >= threshold;

        return {
            similarity: Math.round(similarity * 100) / 100,
            isPlagiarism,
            threshold,
            details: {
                jaccard: Math.round(this.jaccardSimilarity(submission1.code, submission2.code) * 100) / 100,
                lcs: Math.round(this.longestCommonSubsequence(submission1.code, submission2.code) * 100) / 100,
                structural: Math.round(this.structuralSimilarity(submission1.code, submission2.code) * 100) / 100
            }
        };
    }

    // Batch analysis - compare submission against multiple others
    analyzePlgiarismBatch(targetSubmission, comparisonSubmissions, threshold = 70) {
        const results = {
            targetId: targetSubmission.id,
            similarities: [],
            maxSimilarity: 0,
            flagged: false,
            suspiciousMatches: []
        };

        for (const compareSubmission of comparisonSubmissions) {
            if (compareSubmission.id === targetSubmission.id) continue;

            const detection = this.detectPlagiarism(targetSubmission, compareSubmission, threshold);
            const match = {
                comparisonId: compareSubmission.id,
                comparisonStudentId: compareSubmission.student_id,
                comparisonStudentName: compareSubmission.student_name,
                submittedAt: compareSubmission.submitted_at,
                similarity: detection.similarity,
                details: detection.details
            };

            results.similarities.push(match);

            if (detection.similarity > results.maxSimilarity) {
                results.maxSimilarity = detection.similarity;
            }

            if (detection.isPlagiarism) {
                results.suspiciousMatches.push(match);
                results.flagged = true;
            }
        }

        // Sort by similarity
        results.similarities.sort((a, b) => b.similarity - a.similarity);
        results.suspiciousMatches.sort((a, b) => b.similarity - a.similarity);

        return results;
    }

    /**
     * ============ SUSPICION SCORING ============
     */

    // Calculate comprehensive suspicion score (0-100)
    calculateSuspicionScore(plagiarismResult, additionalFactors = {}) {
        let score = 0;

        // Base score from maximum similarity (weight: 60%)
        score += plagiarismResult.maxSimilarity * 0.6;

        // Number of suspicious matches (weight: 20%)
        const matchCount = plagiarismResult.suspiciousMatches.length;
        const matchScore = Math.min(100, (matchCount / 5) * 100); // Normalize to 5+ matches = 100
        score += matchScore * 0.2;

        // Additional factors (weight: 20%)
        let additionalScore = 0;
        if (additionalFactors.multipleLanguages) additionalScore += 10;
        if (additionalFactors.quickSubmission) additionalScore += 10;
        if (additionalFactors.unusualVariableNames) additionalScore += 5;
        if (additionalFactors.perfectFormatting) additionalScore += 5;

        score += Math.min(20, additionalScore);

        return Math.round(Math.min(100, score) * 100) / 100;
    }

    /**
     * ============ REPORT GENERATION ============
     */

    // Generate detailed plagiarism report
    generateReport(plagiarismResult, suspicionScore) {
        const intensity = suspicionScore > 85 ? 'CRITICAL' : suspicionScore > 70 ? 'HIGH' : suspicionScore > 50 ? 'MEDIUM' : 'LOW';

        return {
            submissionId: plagiarismResult.targetId,
            suspicionScore: suspicionScore,
            intensity,
            timestamp: new Date(),
            summary: {
                maxSimilarity: plagiarismResult.maxSimilarity,
                flagged: plagiarismResult.flagged,
                suspiciousMatchCount: plagiarismResult.suspiciousMatches.length,
                totalComparisons: plagiarismResult.similarities.length
            },
            topMatches: plagiarismResult.suspiciousMatches.slice(0, 5).map(m => ({
                submissionId: m.comparisonId,
                studentId: m.comparisonStudentId,
                studentName: m.comparisonStudentName,
                similarity: m.similarity,
                submittedAt: m.submittedAt,
                details: m.details
            })),
            recommendation: this.getRecommendation(intensity, plagiarismResult.maxSimilarity)
        };
    }

    // Get recommendation based on report
    getRecommendation(intensity, maxSimilarity) {
        if (intensity === 'CRITICAL') {
            return {
                action: 'IMMEDIATE_REVIEW_REQUIRED',
                message: 'Critical plagiarism detected. Immediate manual review and action required.',
                severity: 'CRITICAL'
            };
        } else if (intensity === 'HIGH') {
            return {
                action: 'DETAILED_REVIEW',
                message: 'High plagiarism suspicion. Recommend detailed manual review and discussion with student.',
                severity: 'HIGH'
            };
        } else if (intensity === 'MEDIUM') {
            return {
                action: 'MONITOR',
                message: 'Medium plagiarism risk. Monitor student submissions and require explanations.',
                severity: 'MEDIUM'
            };
        } else {
            return {
                action: 'NORMAL',
                message: 'Plagiarism risk within acceptable range.',
                severity: 'LOW'
            };
        }
    }

    /**
     * ============ INTEGRATION WITH EXTERNAL APIs ============
     * Placeholder for MOSS and CodeChef API integration
     */

    // Format for MOSS API submission
    formatForMOSS(submissions) {
        return submissions.map(sub => ({
            submissionId: sub.id,
            studentId: sub.student_id,
            languageId: this.getLanguageId(sub.language),
            code: sub.code
        }));
    }

    // Get language ID for MOSS
    getLanguageId(language) {
        const langMap = {
            'javascript': 'javascript',
            'python': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'sql': 'sql'
        };
        return langMap[language.toLowerCase()] || 'javascript';
    }

    // Format for CodeChef API
    formatForCodeChef(submission) {
        return {
            code: submission.code,
            language: submission.language,
            problemId: submission.problem_id
        };
    }

    /**
     * ============ UTILITY FUNCTIONS ============
     */

    // Create hash of code for fast comparison
    createCodeHash(code) {
        const normalized = this.normalizeCode(code);
        return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
    }

    // Extract common patterns
    extractPatterns(code) {
        const patterns = {
            loops: (code.match(/for|while/g) || []).length,
            conditionals: (code.match(/if|else|switch/g) || []).length,
            functions: (code.match(/function|def|=>|async/g) || []).length,
            imports: (code.match(/import|require/g) || []).length,
            comments: (code.match(/\/\/|#|\/\*/g) || []).length
        };
        return patterns;
    }

    // Grade plagiarism severity
    gradeSeverity(similarity) {
        if (similarity >= 95) return { grade: 'A', severity: 'CRITICAL_IDENTICAL' };
        if (similarity >= 85) return { grade: 'B', severity: 'VERY_HIGH' };
        if (similarity >= 70) return { grade: 'C', severity: 'HIGH' };
        if (similarity >= 50) return { grade: 'D', severity: 'MEDIUM' };
        if (similarity >= 30) return { grade: 'E', severity: 'LOW' };
        return { grade: 'F', severity: 'MINIMAL' };
    }
}

module.exports = new PlagiarismDetector();
