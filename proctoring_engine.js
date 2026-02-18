/**
 * Proctoring Engine - Advanced Exam Monitoring & Violation Tracking
 * Handles violation scoring, session management, and report generation
 * 
 * Features:
 * - Real-time violation tracking & scoring (0-100 scale)
 * - Severity levels (CRITICAL/HIGH/MEDIUM/LOW)
 * - Automatic exam cancellation on threshold breach
 * - Device fingerprinting & session tracking
 * - Comprehensive exam reports
 */

const crypto = require('crypto');

class ProctoringEngine {
  constructor() {
    // Violation type point mapping
    this.VIOLATION_SCORES = {
      // Tab & Window Violations (10-15 points)
      TAB_SWITCH: 10,
      FULLSCREEN_EXIT: 15,
      WINDOW_MINIMIZE: 12,
      WINDOW_RESIZE: 8,
      
      // Copy/Paste Violations (8-15 points)
      COPY_ATTEMPT: 8,
      PASTE_DETECTED: 15,
      CONTEXT_MENU_ATTEMPT: 5,
      
      // URL Violations (10-15 points)
      BLOCKED_DOMAIN_ACCESS: 10,
      EXTERNAL_NAVIGATION: 12,
      
      // Face Violations (20-30 points)
      FACE_NOT_DETECTED: 10,
      MULTIPLE_FACES: 30,
      FACE_TOO_SMALL: 8,
      FACE_TOO_LARGE: 8,
      FACE_TOO_CLOSE: 12,
      FACE_NOT_CENTERED: 8,
      FACE_LOOKAWAY_SUSTAINED: 15,
      
      // Phone & Device Violations (15-25 points)
      PHONE_DETECTED: 20,
      SUSPICIOUS_OBJECT: 15,
      DEVICE_CHANGE: 25,
      MULTIPLE_DEVICES: 20,
      
      // Hand & Posture Violations (10-15 points)
      HAND_DETECTED_NEAR_FACE: 12,
      HAND_ON_KEYBOARD_EXCESSIVE: 8,
      UNUSUAL_POSTURE: 10,
      
      // Behavior Violations (5-20 points)
      EXCESSIVE_KEYSTROKE_SPEED: 8,
      CLIPBOARD_ACCESS: 15,
      AUDIO_DETECTED: 5,
      VOICE_PATTERN_CHANGE: 10,
      
      // Keystroke Pattern (8-15 points)
      POSSIBLE_PASTE_DETECTED: 12,
      RAPID_COMPLETION: 10,
      ANSWER_PATTERN_SUSPICIOUS: 18,
    };

    // Severity thresholds
    this.SEVERITY_THRESHOLDS = {
      CRITICAL: 80,  // Auto-cancel exam
      HIGH: 60,      // Pause exam, flag for review
      MEDIUM: 30,    // Warning
      LOW: 0,        // Log only
    };

    // Session storage (in production, use Redis/Database)
    this.sessions = new Map();
    this.violations = new Map();
  }

  /**
   * Initialize a new proctoring session
   */
  initializeSession(sessionId, examData) {
    const session = {
      id: sessionId,
      examId: examData.examId,
      studentId: examData.studentId,
      mentorId: examData.mentorId || null,
      startTime: Date.now(),
      endTime: null,
      status: 'ACTIVE',
      violationScore: 0,
      totalViolations: 0,
      criticalViolations: 0,
      highViolations: 0,
      deviceFingerprint: examData.deviceFingerprint || {},
      ipAddress: examData.ipAddress || null,
      userAgent: examData.userAgent || null,
      violations: [],
      isZoomingDetected: false,
      isBrowserZoomPercentage: 100,
      facialRecognitionThreshold: 0.8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    this.violations.set(sessionId, []);

    console.log(`✅ Proctoring session initialized: ${sessionId}`);
    return session;
  }

  /**
   * Log a violation and calculate if exam should be halted
   */
  logViolation(sessionId, violationData) {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const session = this.sessions.get(sessionId);
    const points = this.VIOLATION_SCORES[violationData.type] || 0;
    
    const violation = {
      id: crypto.randomUUID(),
      sessionId,
      type: violationData.type,
      points,
      severity: this.calculateSeverity(points),
      details: violationData.details || {},
      timestamp: Date.now(),
      screenshotUrl: violationData.screenshotUrl || null,
      acknowledged: false,
      proactorNote: null,
      createdAt: new Date().toISOString(),
    };

    // Add to violations list
    const sessionViolations = this.violations.get(sessionId) || [];
    sessionViolations.push(violation);
    this.violations.set(sessionId, sessionViolations);

    // Update session scores
    session.totalViolations += 1;
    session.violationScore += points;
    
    if (violation.severity === 'CRITICAL') {
      session.criticalViolations += 1;
    } else if (violation.severity === 'HIGH') {
      session.highViolations += 1;
    }

    session.updatedAt = new Date().toISOString();
    this.sessions.set(sessionId, session);

    // Determine action
    const action = this.shouldHaltExam(sessionId);
    
    console.log(`⚠️ Violation logged (${violationData.type}): ${points} pts | Total: ${session.violationScore}`);

    return {
      violation,
      sessionScore: session.violationScore,
      action, // CONTINUE, PAUSE, HALT
      recommendations: this.getRecommendations(session),
    };
  }

  /**
   * Calculate severity based on points
   */
  calculateSeverity(points) {
    if (points >= 20) return 'CRITICAL';
    if (points >= 12) return 'HIGH';
    if (points >= 8) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Determine if exam should be halted
   */
  shouldHaltExam(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return 'INVALID_SESSION';

    const score = session.violationScore;

    // Critical violations trigger auto-halt
    if (session.criticalViolations >= 2) return 'HALT_AUTO';
    
    // Score-based decisions
    if (score >= this.SEVERITY_THRESHOLDS.CRITICAL) return 'HALT_SCORE';
    if (score >= this.SEVERITY_THRESHOLDS.HIGH) return 'PAUSE';
    if (score >= this.SEVERITY_THRESHOLDS.MEDIUM) return 'WARNING';
    
    return 'CONTINUE';
  }

  /**
   * Get recommendations for action
   */
  getRecommendations(session) {
    const score = session.violationScore;
    const recommendations = [];

    if (score >= 80) {
      recommendations.push('EXAM_CANCELLED_FLAGGED');
      recommendations.push('PROCTOR_REVIEW_REQUIRED');
      recommendations.push('STUDENT_NOTIFICATION_NEEDED');
    } else if (score >= 60) {
      recommendations.push('FLAG_FOR_REVIEW');
      recommendations.push('PROCTOR_SHOULD_MONITOR');
      recommendations.push('POSSIBLE_SUBMISSION_REJECTION');
    } else if (score >= 30) {
      recommendations.push('CAUTION_WARNING');
      recommendations.push('CONTINUE_WITH_MONITORING');
    }

    return recommendations;
  }

  /**
   * Get current session status
   */
  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      ...session,
      violations: this.violations.get(sessionId) || [],
      durationMinutes: Math.floor((Date.now() - session.startTime) / 60000),
    };
  }

  /**
   * End exam and generate final report
   */
  endExam(sessionId, endData = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    session.endTime = Date.now();
    session.status = 'COMPLETED';
    session.updatedAt = new Date().toISOString();

    const violations = this.violations.get(sessionId) || [];
    const durationMinutes = (session.endTime - session.startTime) / 60000;

    // Calculate final recommendation
    let finalDecision = 'APPROVED';
    if (session.violationScore >= 80) {
      finalDecision = 'REJECTED_FLAGGED';
    } else if (session.violationScore >= 60) {
      finalDecision = 'REQUIRES_REVIEW';
    } else if (session.violationScore >= 30) {
      finalDecision = 'APPROVED_WITH_WARNING';
    }

    const report = {
      sessionId,
      examId: session.examId,
      studentId: session.studentId,
      mentorId: session.mentorId,
      examDurationMinutes: Math.round(durationMinutes),
      startTime: new Date(session.startTime).toISOString(),
      endTime: new Date(session.endTime).toISOString(),
      
      // Violations summary
      totalViolations: session.totalViolations,
      criticalViolations: session.criticalViolations,
      highViolations: session.highViolations,
      violationsByType: this.groupViolationsByType(violations),
      
      // Scoring
      violationScore: session.violationScore,
      scorePercentage: Math.min(100, session.violationScore),
      severity: this.getSeverityRating(session.violationScore),
      
      // Decision
      finalDecision,
      recommendations: this.getRecommendations(session),
      flaggedFor: this.getFlagReasons(session),
      
      // Details
      violations: violations.map(v => ({
        type: v.type,
        severity: v.severity,
        points: v.points,
        timestamp: new Date(v.timestamp).toISOString(),
        details: v.details,
      })),
      
      // Device info
      deviceFingerprint: session.deviceFingerprint,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      
      // Metadata
      createdAt: session.createdAt,
      completedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);

    console.log(`✅ Exam completed: ${sessionId} | Score: ${session.violationScore} | Decision: ${finalDecision}`);

    return report;
  }

  /**
   * Get severity rating as string
   */
  getSeverityRating(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Get reasons why exam was flagged
   */
  getFlagReasons(session) {
    const reasons = [];
    const violations = this.violations.get(session.id) || [];

    if (session.criticalViolations >= 2) {
      reasons.push('MULTIPLE_CRITICAL_VIOLATIONS');
    }

    const violationTypes = new Set(violations.map(v => v.type));
    
    if (violationTypes.has('MULTIPLE_FACES')) {
      reasons.push('MULTIPLE_PEOPLE_DETECTED');
    }
    if (violationTypes.has('PHONE_DETECTED')) {
      reasons.push('PHONE_USAGE_DETECTED');
    }
    if (violationTypes.has('PASTE_DETECTED') || violationTypes.has('POSSIBLE_PASTE_DETECTED')) {
      reasons.push('SUSPICIOUS_PASTE_PATTERN');
    }
    if (violationTypes.has('TAB_SWITCH')) {
      reasons.push('EXCESSIVE_TAB_SWITCHING');
    }
    if (violationTypes.has('DEVICE_CHANGE')) {
      reasons.push('DEVICE_CHANGE_DETECTED');
    }

    return reasons;
  }

  /**
   * Group violations by type
   */
  groupViolationsByType(violations) {
    const grouped = {};
    violations.forEach(v => {
      grouped[v.type] = (grouped[v.type] || 0) + 1;
    });
    return grouped;
  }

  /**
   * Get all sessions (for admin dashboard)
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session by exam ID (for analytics)
   */
  getSessionsByExamId(examId) {
    return Array.from(this.sessions.values()).filter(s => s.examId === examId);
  }

  /**
   * Get session by student ID (for monitoring)
   */
  getSessionsByStudentId(studentId) {
    return Array.from(this.sessions.values()).filter(s => s.studentId === studentId);
  }

  /**
   * Update session status
   */
  updateSessionStatus(sessionId, status) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    session.status = status;
    session.updatedAt = new Date().toISOString();
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Acknowledge violation (for mentor review)
   */
  acknowledgeViolation(sessionId, violationId, note = '') {
    const violations = this.violations.get(sessionId) || [];
    const violation = violations.find(v => v.id === violationId);

    if (!violation) throw new Error(`Violation ${violationId} not found`);

    violation.acknowledged = true;
    violation.proactorNote = note;
    violation.acknowledgedAt = new Date().toISOString();

    this.violations.set(sessionId, violations);
    return violation;
  }

  /**
   * Get analytics for dashboard
   */
  getAnalytics() {
    const sessions = Array.from(this.sessions.values());
    const allViolations = Array.from(this.violations.values()).flat();

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'ACTIVE').length,
      completedSessions: sessions.filter(s => s.status === 'COMPLETED').length,
      flaggedSessions: sessions.filter(s => s.violationScore >= 60).length,
      
      averageViolationScore: sessions.length > 0 
        ? Math.round(sessions.reduce((sum, s) => sum + s.violationScore, 0) / sessions.length)
        : 0,
      
      totalViolations: allViolations.length,
      violationsByType: this.groupViolationsByType(allViolations),
      
      severityDistribution: {
        critical: allViolations.filter(v => v.severity === 'CRITICAL').length,
        high: allViolations.filter(v => v.severity === 'HIGH').length,
        medium: allViolations.filter(v => v.severity === 'MEDIUM').length,
        low: allViolations.filter(v => v.severity === 'LOW').length,
      },
    };
  }

  /**
   * Clear old sessions (cleanup)
   */
  clearOldSessions(hoursOld = 24) {
    const cutoffTime = Date.now() - (hoursOld * 60 * 60 * 1000);
    let cleared = 0;

    this.sessions.forEach((session, sessionId) => {
      if (session.endTime && session.endTime < cutoffTime) {
        this.sessions.delete(sessionId);
        this.violations.delete(sessionId);
        cleared++;
      }
    });

    console.log(`🧹 Cleared ${cleared} old sessions`);
    return cleared;
  }
}

// Singleton instance
const proctoringEngine = new ProctoringEngine();

module.exports = proctoringEngine;
