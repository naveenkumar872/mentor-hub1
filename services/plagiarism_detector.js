/**
 * Plagiarism Detection Service
 * - Lexical similarity analysis
 * - Structural analysis
 * - Behavioral pattern detection
 */

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

class PlagiarismDetector {
    constructor(db) {
        this.db = db;
    }

    /**
     * Jaccard Similarity - Compare code as sets of tokens
     */
    calculateJaccardSimilarity(code1, code2) {
        const tokens1 = this.tokenizeCode(code1);
        const tokens2 = this.tokenizeCode(code2);

        const intersection = tokens1.filter(t => tokens2.includes(t)).length;
        const union = new Set([...tokens1, ...tokens2]).size;

        return union === 0 ? 0 : (intersection / union) * 100;
    }

    /**
     * Longest Common Subsequence - Structural similarity
     */
    calculateStructuralSimilarity(code1, code2) {
        const lcs = this.getLCS(code1, code2);
        const maxLength = Math.max(code1.length, code2.length);
        return (lcs.length / maxLength) * 100;
    }

    /**
     * Rabin-Karp Algorithm for substring matching
     */
    calculateSubstringMatches(code1, code2, windowSize = 10) {
        const hashes1 = this.getHashWindow(code1, windowSize);
        const hashes2 = this.getHashWindow(code2, windowSize);

        const commonHashes = hashes1.filter(h => hashes2.includes(h)).length;
        const totalHashes = Math.max(hashes1.length, hashes2.length);

        return totalHashes === 0 ? 0 : (commonHashes / totalHashes) * 100;
    }

    /**
     * Tokenize code into meaningful tokens
     */
    tokenizeCode(code) {
        // Remove comments
        let cleaned = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

        // Split on common code separators but keep keywords
        const tokens = cleaned
            .match(/\b\w+\b|[{}()\[\];:,=+\-*/\s]/g)
            .filter(t => t.trim().length > 0);

        return tokens;
    }

    /**
     * Get Longest Common Subsequence
     */
    getLCS(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1)
            .fill(null)
            .map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        let lcs = '';
        let i = m,
            j = n;
        while (i > 0 && j > 0) {
            if (str1[i - 1] === str2[j - 1]) {
                lcs = str1[i - 1] + lcs;
                i--;
                j--;
            } else if (dp[i - 1][j] > dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        return lcs;
    }

    /**
     * Rolling hash for Rabin-Karp
     */
    getHashWindow(code, windowSize) {
        const hashes = [];
        const prime = 31;
        let hash = 0;

        for (let i = 0; i < code.length; i++) {
            if (i >= windowSize) {
                hash = (hash - code[i - windowSize].charCodeAt(0) * Math.pow(prime, windowSize - 1)) % 101;
            }
            hash = (hash * prime + code[i].charCodeAt(0)) % 101;
            if (i >= windowSize - 1) {
                hashes.push(hash);
            }
        }

        return hashes;
    }

    /**
     * Behavioral analysis - timing patterns
     */
    calculateTemporalSuspicion(submission1, submission2) {
        if (!submission1.created_at || !submission2.created_at) return 0;

        const time1 = new Date(submission1.created_at).getTime();
        const time2 = new Date(submission2.created_at).getTime();
        const timeDiff = Math.abs(time1 - time2);

        // If submitted within 1 hour, higher suspicion
        if (timeDiff < 3600000) return 40;
        // If submitted within 1 day
        if (timeDiff < 86400000) return 20;
        // If submitted within 1 week
        if (timeDiff < 604800000) return 10;

        return 0;
    }

    /**
     * Analyze submission for plagiarism
     */
    async analyzeSubmission(submissionId) {
        const [submission] = await this.db.query(
            'SELECT * FROM submissions WHERE id = ?',
            [submissionId]
        );

        if (submission.length === 0) throw new Error('Submission not found');

        const sub = submission[0];
        const [allSubmissions] = await this.db.query(
            `SELECT * FROM submissions 
            WHERE problem_id = ? AND student_id != ? AND status = 'accepted'
            LIMIT 50`,
            [sub.problem_id, sub.student_id]
        );

        let maxSimilarity = {
            lexical: 0,
            structural: 0,
            temporal: 0,
            matchingSubmission: null
        };

        const matches = [];

        for (const otherSub of allSubmissions) {
            const lexical = this.calculateJaccardSimilarity(sub.code, otherSub.code);
            const structural = this.calculateStructuralSimilarity(sub.code, otherSub.code);
            const temporal = this.calculateTemporalSuspicion(sub, otherSub);

            if (lexical > 70 || structural > 70) {
                matches.push({
                    submissionId: otherSub.id,
                    studentId: otherSub.student_id,
                    studentName: otherSub.student_name,
                    lexicalSimilarity: parseFloat(lexical.toFixed(2)),
                    structuralSimilarity: parseFloat(structural.toFixed(2)),
                    temporalSuspicion: parseFloat(temporal.toFixed(2)),
                    submittedAt: otherSub.created_at
                });

                if (lexical > maxSimilarity.lexical) {
                    maxSimilarity.lexical = lexical;
                    maxSimilarity.matchingSubmission = otherSub.id;
                }
            }
        }

        // Calculate overall score (weighted average)
        const overallScore =
            maxSimilarity.lexical * 0.5 +
            maxSimilarity.structural * 0.3 +
            maxSimilarity.temporal * 0.2;

        return {
            submissionId,
            studentId: sub.student_id,
            problemId: sub.problem_id,
            lexicalSimilarity: parseFloat(maxSimilarity.lexical.toFixed(2)),
            structuralSimilarity: parseFloat(maxSimilarity.structural.toFixed(2)),
            temporalSuspicion: parseFloat(maxSimilarity.temporal.toFixed(2)),
            overallScore: parseFloat(overallScore.toFixed(2)),
            flagged: overallScore > 75,
            severity: overallScore > 85 ? 'critical' : overallScore > 75 ? 'high' : 'medium',
            matches,
            matchedSubmissions: matches.slice(0, 5)
        };
    }

    /**
     * Find similar submissions for a student across all problems
     */
    async detectStudentPatterns(studentId) {
        const [submissions] = await this.db.query(
            `SELECT s.* FROM submissions s
            WHERE s.student_id = ? AND s.status = 'accepted'
            LIMIT 100`,
            [studentId]
        );

        const patterns = {
            suspiciousSubmissions: [],
            commonStructures: {},
            timingPatterns: []
        };

        // Check for similar structures across different problems
        for (let i = 0; i < submissions.length; i++) {
            for (let j = i + 1; j < submissions.length; j++) {
                const similarity = this.calculateStructuralSimilarity(
                    submissions[i].code,
                    submissions[j].code
                );

                if (similarity > 80) {
                    patterns.commonStructures[`${submissions[i].problem_id}-${submissions[j].problem_id}`] = similarity;
                }
            }
        }

        return patterns;
    }
}

module.exports = PlagiarismDetector;
