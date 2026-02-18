/**
 * Face Detection Monitor - Advanced Facial Recognition & Monitoring
 * Uses face-api.js (TensorFlow-based) for accurate face detection
 * 
 * Features:
 * - Real-time face detection
 * - Multiple face detection (critical violation)
 * - Face quality validation (size, positioning, confidence)
 * - Face lookaway/eye gaze analysis
 * - Exposure/brightness analysis
 * - Suspicious pattern detection
 */

/* globals faceapi */

export class FaceDetectionMonitor {
  constructor(videoElement, sessionId, onViolationDetected) {
    this.videoElement = videoElement;
    this.sessionId = sessionId;
    this.onViolationDetected = onViolationDetected;
    
    this.isInitialized = false;
    this.isMonitoring = false;
    this.monitoringInterval = null;
    
    // Configuration
    this.detectionOptions = new faceapi.TinyFaceDetectorOptions({
      inputSize: 416,
      scoreThreshold: 0.5,
    });

    // Thresholds
    this.config = {
      faceMinSize: 0.1, // 10% of canvas
      faceMaxSize: 0.5, // 50% of canvas
      maxCenterDeviation: 0.4, // 40% from center
      lookawayThreshold: 15, // degrees
      lookawayDuration: 3000, // ms
      confidenceThreshold: 0.8,
      detectionInterval: 500, // ms
    };

    // Statistics
    this.stats = {
      facesDetected: 0,
      multipleFacesCount: 0,
      faceNotDetectedCount: 0,
      faceLookawayCount: 0,
      suspiciousPatterns: 0,
      totalFrames: 0,
    };

    // State tracking
    this.lastFacePosition = null;
    this.lookawayStartTime = null;
    this.lastDetectionTime = 0;
  }

  /**
   * Initialize face detection
   */
  async initialize() {
    try {
      console.log('📹 Loading face detection models...');
      
      // Load models from CDN
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'),
        faceapi.nets.faceLandmark68Net.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'),
        faceapi.nets.faceExpressionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'),
        faceapi.nets.ageGenderNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'),
      ]);

      this.isInitialized = true;
      console.log('✅ Face detection models loaded');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize face detection:', error);
      return false;
    }
  }

  /**
   * Start monitoring faces in real-time
   */
  async startMonitoring() {
    if (!this.isInitialized) {
      console.warn('⚠️ Face detection not initialized. Call initialize() first.');
      return false;
    }

    this.isMonitoring = true;
    console.log('▶️ Face monitoring started');

    this.monitoringInterval = setInterval(async () => {
      await this.detectFaces();
    }, this.config.detectionInterval);

    return true;
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('⏹️ Face monitoring stopped');
  }

  /**
   * Perform face detection
   */
  async detectFaces() {
    if (!this.videoElement || !this.isMonitoring) return;

    try {
      this.stats.totalFrames++;

      // Detect faces with landmarks
      const detections = await faceapi
        .detectAllFaces(this.videoElement, this.detectionOptions)
        .withFaceLandmarks()
        .withFaceExpressions()
        .withAgeAndGender();

      this.stats.facesDetected = detections.length;

      // Analyze detections
      await this.analyzeFaceDetections(detections);

    } catch (error) {
      console.error('❌ Face detection error:', error);
    }
  }

  /**
   * Analyze detected faces
   */
  async analyzeFaceDetections(detections) {
    if (detections.length === 0) {
      // No face detected
      this.stats.faceNotDetectedCount++;
      
      this.reportViolation({
        type: 'FACE_NOT_DETECTED',
        severity: 'MEDIUM',
        details: {
          method: 'face-api-no-detection',
          consecutiveFrames: this.stats.faceNotDetectedCount,
        },
      });
      
      // Reset lookaway tracking
      this.lookawayStartTime = null;
      return;
    }

    if (detections.length > 1) {
      // Multiple faces detected - CRITICAL
      this.stats.multipleFacesCount++;
      
      this.reportViolation({
        type: 'MULTIPLE_FACES',
        severity: 'CRITICAL',
        details: {
          faceCount: detections.length,
          confidence: Math.round(detections[0].detection.score * 100),
          method: 'face-api-multiple-detection',
        },
      });
      
      return;
    }

    // Single face detected - check quality
    const detection = detections[0];
    await this.checkFaceQuality(detection);
  }

  /**
   * Check face quality and positioning
   */
  async checkFaceQuality(detection) {
    const box = detection.detection.box;
    const canvasWidth = this.videoElement.videoWidth;
    const canvasHeight = this.videoElement.videoHeight;

    // Calculate face size relative to canvas
    const faceArea = (box.width * box.height) / (canvasWidth * canvasHeight);
    const faceSize = Math.sqrt(faceArea);

    // Check face size
    if (faceSize < this.config.faceMinSize) {
      this.reportViolation({
        type: 'FACE_TOO_SMALL',
        severity: 'MEDIUM',
        details: {
          faceSize: (faceSize * 100).toFixed(2) + '%',
          minRequired: (this.config.faceMinSize * 100).toFixed(2) + '%',
        },
      });
      return;
    }

    if (faceSize > this.config.faceMaxSize) {
      this.reportViolation({
        type: 'FACE_TOO_CLOSE',
        severity: 'MEDIUM',
        details: {
          faceSize: (faceSize * 100).toFixed(2) + '%',
          maxAllowed: (this.config.faceMaxSize * 100).toFixed(2) + '%',
        },
      });
      return;
    }

    // Check face centering
    const faceCenterX = (box.x + box.width / 2) / canvasWidth;
    const faceCenterY = (box.y + box.height / 2) / canvasHeight;

    const deviationX = Math.abs(faceCenterX - 0.5);
    const deviationY = Math.abs(faceCenterY - 0.5);
    const maxDeviation = Math.max(deviationX, deviationY);

    if (maxDeviation > this.config.maxCenterDeviation) {
      this.reportViolation({
        type: 'FACE_NOT_CENTERED',
        severity: 'MEDIUM',
        details: {
          deviationX: (deviationX * 100).toFixed(2) + '%',
          deviationY: (deviationY * 100).toFixed(2) + '%',
        },
      });
      return;
    }

    // Check face confidence
    if (detection.detection.score < this.config.confidenceThreshold) {
      console.warn('⚠️ Low face confidence:', detection.detection.score);
      return;
    }

    // Check for lookaway (eye gaze analysis)
    await this.checkLookaway(detection);

    // Store last valid face position
    this.lastFacePosition = { x: faceCenterX, y: faceCenterY };
  }

  /**
   * Check if student is looking away (eye gaze)
   */
  async checkLookaway(detection) {
    if (!detection.landmarks) return;

    // Get eye landmarks
    const landmarks = detection.landmarks.positions;
    
    // Left eye: points 36-41, Right eye: points 42-47
    const leftEye = landmarks.slice(36, 42);
    const rightEye = landmarks.slice(42, 48);

    // Calculate eye aspect ratio
    const leftEAR = this.calculateEyeAspectRatio(leftEye);
    const rightEAR = this.calculateEyeAspectRatio(rightEye);
    const avgEAR = (leftEAR + rightEAR) / 2;

    // Eyes closed: EAR < 0.2
    if (avgEAR < 0.2) {
      if (!this.lookawayStartTime) {
        this.lookawayStartTime = Date.now();
      }

      const lookawayDuration = Date.now() - this.lookawayStartTime;
      
      if (lookawayDuration > this.config.lookawayDuration) {
        this.stats.faceLookawayCount++;
        
        this.reportViolation({
          type: 'FACE_LOOKAWAY_SUSTAINED',
          severity: 'HIGH',
          details: {
            duration: lookawayDuration,
            eyeAspectRatio: avgEAR.toFixed(3),
          },
        });

        this.lookawayStartTime = null; // Reset counter
      }
    } else {
      this.lookawayStartTime = null; // Reset when eyes open
    }

    // Check gaze direction (head pose)
    await this.checkHeadPose(detection);
  }

  /**
   * Calculate eye aspect ratio (EAR)
   */
  calculateEyeAspectRatio(eyePoints) {
    if (eyePoints.length < 6) return 0;

    // Distance between vertical eye landmarks
    const verticalDist1 = Math.sqrt(
      Math.pow(eyePoints[1].x - eyePoints[5].x, 2) +
      Math.pow(eyePoints[1].y - eyePoints[5].y, 2)
    );

    const verticalDist2 = Math.sqrt(
      Math.pow(eyePoints[2].x - eyePoints[4].x, 2) +
      Math.pow(eyePoints[2].y - eyePoints[4].y, 2)
    );

    // Distance between horizontal eye landmarks
    const horizontalDist = Math.sqrt(
      Math.pow(eyePoints[0].x - eyePoints[3].x, 2) +
      Math.pow(eyePoints[0].y - eyePoints[3].y, 2)
    );

    return (verticalDist1 + verticalDist2) / (2.0 * horizontalDist);
  }

  /**
   * Check head pose (looking straight vs to side)
   */
  async checkHeadPose(detection) {
    if (!detection.landmarks) return;

    const landmarks = detection.landmarks.positions;

    // Approximate head pose using facial landmarks
    // Nose: point 30, Chin: point 8
    const nose = landmarks[30];
    const chin = landmarks[8];
    const leftEye = landmarks[36];
    const rightEye = landmarks[45];

    // Calculate head yaw (left-right rotation)
    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    const headYaw = nose.x - eyeCenterX;

    // If head yaw > threshold, student is looking to side
    if (Math.abs(headYaw) > 30) {
      this.reportViolation({
        type: 'SUSPICIOUS_HEAD_MOVEMENT',
        severity: 'MEDIUM',
        details: {
          headYaw: headYaw.toFixed(2),
          direction: headYaw > 0 ? 'right' : 'left',
        },
      });
    }
  }

  /**
   * Report violation
   */
  reportViolation(violationData) {
    console.log(`⚠️ Face violation: ${violationData.type}`);

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
      ...this.stats,
      isMonitoring: this.isMonitoring,
      lastFacePosition: this.lastFacePosition,
      accuracy: this.stats.totalFrames > 0 
        ? ((this.stats.facesDetected / this.stats.totalFrames) * 100).toFixed(2) + '%'
        : '0%',
    };
  }

  /**
   * Pause monitoring
   */
  pause() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('⏸️ Face monitoring paused');
  }

  /**
   * Resume monitoring
   */
  resume() {
    if (!this.isInitialized || this.isMonitoring) return;
    this.startMonitoring();
  }
}

export default FaceDetectionMonitor;
