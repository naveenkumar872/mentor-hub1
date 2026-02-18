/**
 * Violation Detector - Advanced Exam Cheating Detection
 * Monitors and detects various cheating attempts in real-time
 * 
 * Features:
 * - Tab switching detection
 * - Copy/Paste blocking & pattern detection
 * - URL filtering (block ChatGPT, Google, etc.)
 * - Keystroke timing analysis
 * - Context menu blocking
 * - Fullscreen enforcement
 * - Keyboard shortcut interception
 */

export class ViolationDetector {
  constructor(sessionId, onViolationDetected) {
    this.sessionId = sessionId;
    this.onViolationDetected = onViolationDetected;
    this.isInitialized = false;
    this.isActive = true;

    // State tracking
    this.lastKeyTime = 0;
    this.keyTimings = [];
    this.copyAttempts = 0;
    this.pasteAttempts = 0;
    this.contextMenuAttempts = 0;
    this.tabSwitches = 0;
    this.lastVisibilityState = 'visible';

    // Blocked domains
    this.blockedDomains = [
      'chatgpt.com', 'openai.com', 'claude.ai', 'gemini.google.com',
      'google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com',
      'stackoverflow.com', 'github.com', 'medium.com', 'udemy.com',
      'coursera.org', 'edx.org', 'wikipedia.org', 'reddit.com',
      'quora.com', 'chegg.com', 'brainly.com', 'coursehero.com',
      'telegram.org', 'whatsapp.com', 'discord.com', 'slack.com',
    ];

    // Keyboard shortcuts to block
    this.blockedShortcuts = ['ctrl+a', 'ctrl+c', 'ctrl+v', 'ctrl+x', 'alt+tab', 'cmd+tab', 'cmd+c', 'cmd+v'];
  }

  /**
   * Initialize all detection systems
   */
  async initialize() {
    try {
      this.setupTabSwitchDetection();
      this.setupContextMenuBlock();
      this.setupCopyPasteBlock();
      this.setupFullscreenEnforcement();
      this.setupURLFiltering();
      this.setupKeystrokeMonitoring();
      this.setupKeyboardInterception();
      this.isInitialized = true;
      console.log('✅ ViolationDetector initialized');
      return true;
    } catch (error) {
      console.error('❌ ViolationDetector initialization error:', error);
      return false;
    }
  }

  /**
   * ==================== TAB SWITCH DETECTION ====================
   */
  setupTabSwitchDetection() {
    // Method 1: Visibility API (most reliable)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.reportViolation({
          type: 'TAB_SWITCH',
          severity: 'CRITICAL',
          details: {
            method: 'visibility-api',
            timestamp: Date.now(),
          },
        });
        this.tabSwitches++;
      }
      this.lastVisibilityState = document.visibilityState;
    });

    // Method 2: Blur/Focus events
    window.addEventListener('blur', () => {
      this.reportViolation({
        type: 'TAB_SWITCH',
        severity: 'CRITICAL',
        details: {
          method: 'blur-event',
          timestamp: Date.now(),
        },
      });
      this.tabSwitches++;
    });

    // Method 3: Page focus monitoring
    window.addEventListener('focus', () => {
      // Tab was just re-focused - already reported on blur
    });
  }

  /**
   * ==================== COPY/PASTE DETECTION ====================
   */
  setupCopyPasteBlock() {
    // Block copy
    document.addEventListener('copy', (e) => {
      e.preventDefault();
      e.clipboardData.setData('text/plain', '[Copying is disabled during exam]');
      
      this.reportViolation({
        type: 'COPY_ATTEMPT',
        severity: 'MEDIUM',
        details: {
          method: 'copy-event-intercepted',
          timestamp: Date.now(),
        },
      });
      this.copyAttempts++;
    });

    // Block paste
    document.addEventListener('paste', (e) => {
      e.preventDefault();
      
      this.reportViolation({
        type: 'PASTE_DETECTED',
        severity: 'HIGH',
        details: {
          method: 'paste-event-intercepted',
          timestamp: Date.now(),
        },
      });
      this.pasteAttempts++;
    });

    // Monitor for clipboard access via keyboard
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x')) {
        e.preventDefault();
        
        if (e.key === 'c') {
          this.reportViolation({
            type: 'COPY_ATTEMPT',
            severity: 'MEDIUM',
            details: { method: 'keyboard-shortcut-copy' },
          });
        } else if (e.key === 'v') {
          this.reportViolation({
            type: 'PASTE_DETECTED',
            severity: 'HIGH',
            details: { method: 'keyboard-shortcut-paste' },
          });
        }
      }
    });
  }

  /**
   * ==================== CONTEXT MENU BLOCKING ====================
   */
  setupContextMenuBlock() {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      
      this.reportViolation({
        type: 'CONTEXT_MENU_ATTEMPT',
        severity: 'LOW',
        details: {
          x: e.clientX,
          y: e.clientY,
          timestamp: Date.now(),
        },
      });
      this.contextMenuAttempts++;
      
      return false;
    });
  }

  /**
   * ==================== FULLSCREEN ENFORCEMENT ====================
   */
  setupFullscreenEnforcement() {
    const container = document.getElementById('exam-container') || document.body;

    // Request fullscreen on init
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {
        console.warn('⚠️ Fullscreen request denied');
      });
    }

    // Monitor fullscreen exit
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        this.reportViolation({
          type: 'FULLSCREEN_EXIT',
          severity: 'CRITICAL',
          details: {
            timestamp: Date.now(),
          },
        });

        // Re-request fullscreen
        setTimeout(() => {
          container.requestFullscreen().catch(() => {
            console.warn('⚠️ Could not re-enter fullscreen');
          });
        }, 500);
      }
    });

    // Block F11 (fullscreen browser toggle)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F11' || e.key === 'F12' || e.key === 'F5') {
        e.preventDefault();
      }
    });
  }

  /**
   * ==================== URL FILTERING ====================
   */
  setupURLFiltering() {
    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = (...args) => {
      const url = args[0];
      if (this.isBlockedURL(url)) {
        this.reportViolation({
          type: 'BLOCKED_DOMAIN_ACCESS',
          severity: 'CRITICAL',
          details: {
            url: typeof url === 'string' ? url : url.url,
            method: 'fetch',
            timestamp: Date.now(),
          },
        });
        return Promise.reject(new Error('Domain blocked during exam'));
      }
      return originalFetch.apply(window, args);
    };

    // Intercept XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (this.isBlockedURL(url)) {
        this.reportViolation({
          type: 'BLOCKED_DOMAIN_ACCESS',
          severity: 'CRITICAL',
          details: {
            url,
            method: 'xhr',
            timestamp: Date.now(),
          },
        });
        throw new Error('Domain blocked during exam');
      }
      return originalOpen.call(this, method, url);
    };

    // Monitor navigation attempts
    window.addEventListener('beforeunload', (e) => {
      if (this.isActive) {
        // Allow normal form submissions, but monitor external links
        this.reportViolation({
          type: 'EXTERNAL_NAVIGATION',
          severity: 'HIGH',
          details: {
            timestamp: Date.now(),
          },
        });
        e.preventDefault();
        return false;
      }
    });
  }

  /**
   * Check if URL is blocked
   */
  isBlockedURL(url) {
    if (typeof url !== 'string') return false;

    for (let domain of this.blockedDomains) {
      if (url.includes(domain)) {
        return true;
      }
    }
    return false;
  }

  /**
   * ==================== KEYSTROKE MONITORING ====================
   */
  setupKeystrokeMonitoring() {
    document.addEventListener('keydown', (e) => {
      const currentTime = Date.now();
      const timeSinceLastKey = currentTime - this.lastKeyTime;

      // Suspicious paste pattern: multiple keystrokes in very short time (0-10ms)
      if (timeSinceLastKey > 0 && timeSinceLastKey < 10) {
        this.reportViolation({
          type: 'POSSIBLE_PASTE_DETECTED',
          severity: 'HIGH',
          details: {
            timingSinceLastKey: timeSinceLastKey,
            keyCode: e.keyCode,
            timestamp: Date.now(),
          },
        });
      }

      this.lastKeyTime = currentTime;
      this.keyTimings.push({
        time: currentTime,
        keyCode: e.keyCode,
      });

      // Keep only last 100 keystrokes in memory
      if (this.keyTimings.length > 100) {
        this.keyTimings.shift();
      }
    });
  }

  /**
   * ==================== KEYBOARD SHORTCUT INTERCEPTION ====================
   */
  setupKeyboardInterception() {
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Block common cheating shortcuts
      if (isCtrlOrCmd) {
        if (['c', 'v', 'x', 'a', 'd'].includes(key)) {
          e.preventDefault();
        }
      }

      // Block Alt+Tab, Cmd+Tab
      if ((e.altKey && key === 'arrowright') || (e.metaKey && key === 'tab')) {
        e.preventDefault();
        this.reportViolation({
          type: 'TAB_SWITCH_ATTEMPT',
          severity: 'CRITICAL',
          details: {
            shortcut: e.altKey ? 'alt+right' : 'cmd+tab',
            timestamp: Date.now(),
          },
        });
      }

      // Block Ctrl+W (close tab)
      if ((e.ctrlKey && key === 'w') || (e.metaKey && key === 'w')) {
        e.preventDefault();
      }
    });
  }

  /**
   * Report violation to server
   */
  reportViolation(violationData) {
    if (!this.isActive) return;

    console.log(`⚠️ Violation detected: ${violationData.type}`);

    if (this.onViolationDetected) {
      this.onViolationDetected({
        sessionId: this.sessionId,
        type: violationData.type,
        severity: violationData.severity || 'MEDIUM',
        details: violationData.details || {},
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get detection statistics
   */
  getStatistics() {
    return {
      tabSwitches: this.tabSwitches,
      copyAttempts: this.copyAttempts,
      pasteAttempts: this.pasteAttempts,
      contextMenuAttempts: this.contextMenuAttempts,
      keystrokesRecorded: this.keyTimings.length,
    };
  }

  /**
   * Pause detection (when exam is paused)
   */
  pause() {
    this.isActive = false;
    console.log('⏸️ ViolationDetector paused');
  }

  /**
   * Resume detection
   */
  resume() {
    this.isActive = true;
    console.log('▶️ ViolationDetector resumed');
  }

  /**
   * Stop all detection
   */
  stop() {
    this.isActive = false;
    console.log('⏹️ ViolationDetector stopped');
  }

  /**
   * Add domain to blocked list
   */
  blockDomain(domain) {
    if (!this.blockedDomains.includes(domain)) {
      this.blockedDomains.push(domain);
    }
  }

  /**
   * Remove domain from blocked list
   */
  allowDomain(domain) {
    this.blockedDomains = this.blockedDomains.filter(d => d !== domain);
  }
}

export default ViolationDetector;
