/**
 * Face Detection Module - MediaPipe Face Landmarker
 * Uses smile detection with EXACT same logic as Flutter app:
 * - mouthSmileLeft + mouthSmileRight blendshapes
 * - Trigger threshold: 0.6
 * - Reset threshold: 0.4
 * - Buffer size: 5
 * - NO calibration (blendshapes are pre-calibrated 0-1)
 */

class FaceDetector {
    constructor() {
        this.faceLandmarker = null;
        this.isInitialized = false;
        this.onSmileChange = null;
        this.videoElement = null;
        this.animationId = null;

        // Smile detection state (MATCHING FLUTTER APP EXACTLY)
        this.smileScore = 0;
        this.isSmiling = false;
        this.smileBuffer = [];
        this.bufferSize = 5; // Flutter app: _bufferSize = 5

        // Hysteresis thresholds (MATCHING FLUTTER APP EXACTLY)
        this.triggerThreshold = 0.6; // Flutter: _smileTriggerThreshold = 0.6
        this.resetThreshold = 0.4;   // Flutter: _smileResetThreshold = 0.4
    }

    async initialize(videoElement) {
        this.videoElement = videoElement;

        console.log('🔄 Initializing MediaPipe Face Landmarker...');

        try {
            // Request camera access - OPTIMIZED for low-end devices
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 480 },  // Reduced from 640 for performance
                    height: { ideal: 360 }  // Reduced from 480 for performance
                }
            });

            videoElement.srcObject = stream;
            await videoElement.play();
            console.log('📷 Camera started');

            // Load MediaPipe Face Landmarker
            const { FaceLandmarker, FilesetResolver } = await import(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/+esm'
            );

            const filesetResolver = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
            );

            this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU'
                },
                outputFaceBlendshapes: true, // Enable blendshapes (like Flutter app)
                runningMode: 'VIDEO',
                numFaces: 1
            });

            this.isInitialized = true;
            console.log('✅ Face Landmarker initialized with blendshapes');

            // Start detection loop
            this.startDetectionLoop();

        } catch (error) {
            console.error('❌ Face detection error:', error);
            throw error;
        }
    }

    startDetectionLoop() {
        // OPTIMIZATION: Limit face detection to ~15fps (every 66ms) instead of 60fps
        // This dramatically reduces CPU usage on low-end devices like Samsung A04
        const TARGET_FPS = 15;
        const FRAME_INTERVAL = 1000 / TARGET_FPS;
        let lastFrameTime = 0;

        const detectFrame = (currentTime) => {
            if (!this.isInitialized || !this.faceLandmarker) return;

            // Throttle: Only process if enough time has passed
            const elapsed = currentTime - lastFrameTime;
            if (elapsed < FRAME_INTERVAL) {
                this.animationId = requestAnimationFrame(detectFrame);
                return;
            }
            lastFrameTime = currentTime;

            const results = this.faceLandmarker.detectForVideo(this.videoElement, currentTime);
            this.processResults(results);

            this.animationId = requestAnimationFrame(detectFrame);
        };

        requestAnimationFrame(detectFrame);
    }

    processResults(results) {
        if (!results.faceBlendshapes || results.faceBlendshapes.length === 0) {
            // No face detected
            this.smileScore = 0;
            this.updateUI();
            return;
        }

        const blendshapes = results.faceBlendshapes[0].categories;

        // Get mouthSmileLeft and mouthSmileRight (EXACTLY like Flutter app)
        // Flutter: final smileLeft = result.getBlendshape('mouthSmileLeft');
        // Flutter: final smileRight = result.getBlendshape('mouthSmileRight');
        const smileLeft = this.getBlendshapeScore(blendshapes, 'mouthSmileLeft');
        const smileRight = this.getBlendshapeScore(blendshapes, 'mouthSmileRight');

        // Average the two sides (EXACTLY like Flutter app)
        // Flutter: final smileScore = (smileLeft + smileRight) / 2.0;
        const smileScore = (smileLeft + smileRight) / 2.0;

        this.detectSmile(smileScore);
    }

    getBlendshapeScore(blendshapes, name) {
        const shape = blendshapes.find(b => b.categoryName === name);
        return shape ? shape.score : 0;
    }

    detectSmile(score) {
        // Smooth the value (MATCHING FLUTTER APP)
        // Flutter: _widthBuffer.add(score);
        // Flutter: if (_widthBuffer.length > _bufferSize) _widthBuffer.removeAt(0);
        this.smileBuffer.push(score);
        if (this.smileBuffer.length > this.bufferSize) {
            this.smileBuffer.shift();
        }

        // Flutter: final smoothed = _widthBuffer.reduce((a, b) => a + b) / _widthBuffer.length;
        const smoothed = this.smileBuffer.reduce((a, b) => a + b, 0) / this.smileBuffer.length;
        this.smileScore = smoothed;

        // HYSTERESIS LOGIC (EXACTLY MATCHING FLUTTER APP)
        const wasSmiling = this.isSmiling;

        if (!this.isSmiling) {
            // Not currently smiling: Check for Trigger Threshold (Rising Edge)
            // Flutter: if (_smileScore > _smileTriggerThreshold)
            if (this.smileScore > this.triggerThreshold) {
                this.isSmiling = true;
                console.log(`😊 FLAP! Smile score: ${(this.smileScore * 100).toFixed(0)}%`);
            }
        } else {
            // Currently smiling: Check for Reset Threshold (Falling Edge)
            // Flutter: if (_smileScore < _smileResetThreshold)
            if (this.smileScore < this.resetThreshold) {
                this.isSmiling = false;
            }
        }

        // Notify on state change only (triggers flap)
        if (wasSmiling !== this.isSmiling && this.onSmileChange) {
            this.onSmileChange(this.isSmiling);
        }

        this.updateUI();
    }

    updateUI() {
        const emoji = document.getElementById('smile-emoji');
        const fill = document.getElementById('smile-fill');

        if (emoji) {
            emoji.textContent = this.isSmiling ? '😊' : '😐';
        }

        if (fill) {
            fill.style.width = `${Math.min(this.smileScore * 100, 100)}%`;
            fill.style.background = this.isSmiling
                ? 'linear-gradient(90deg, #00d4ff, #00ff88)'
                : 'linear-gradient(90deg, #666, #888)';
        }
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.videoElement && this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
        }
    }
}

// Export for use in game.js
window.FaceDetector = FaceDetector;
