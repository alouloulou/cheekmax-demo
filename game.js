/**
 * Flappy Cheek Game - Main Game Logic
 * Matches Flutter app physics exactly
 */

class FlappyGame {
    constructor() {
        // DOM elements
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.videoElement = document.getElementById('camera-feed');

        // Screens
        this.introScreen = document.getElementById('intro-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.ctaScreen = document.getElementById('cta-screen');

        // Overlays
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.countdownOverlay = document.getElementById('countdown-overlay');
        this.roundOverOverlay = document.getElementById('round-over-overlay');

        // Face detector
        this.faceDetector = null;

        // Game constants (matching Flutter app EXACTLY)
        this.SCREEN_WIDTH = 640;
        this.SCREEN_HEIGHT = 480;
        this.GRAVITY = 0.2;
        this.FLAP_STRENGTH = -7;
        this.OBSTACLE_SPEED = 2.5;
        this.OBSTACLE_WIDTH = 80;
        this.GAP_SIZE = 200;
        this.BIRD_SIZE = 60;
        this.BIRD_X = 150; // Fixed X position
        this.SPAWN_DISTANCE = 300;
        this.MIN_FLAP_INTERVAL = 500; // ms

        // Game state
        this.birdY = this.SCREEN_HEIGHT / 2;
        this.birdVelocity = 0;
        this.obstacles = [];
        this.score = 0;
        this.gameStarted = false;
        this.gameOver = false;
        this.lastFlapTime = 0;

        // Session state
        this.currentRound = 1;
        this.maxRounds = 3;
        this.bestScore = 0;

        // Assets
        this.fishImage = null;
        this.oceanImage = null;
        this.sounds = {};
        this.assetsLoaded = false;

        // Animation
        this.animationId = null;
        this.scaleX = 1;
        this.scaleY = 1;

        this.init();
    }

    async init() {
        // Setup canvas sizing
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Load assets
        await this.loadAssets();

        // Setup event listeners
        this.setupEventListeners();

        // Detect OS for CTA
        this.setupCTA();

        console.log('✅ Game initialized');
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Use INDEPENDENT scaling to fill the screen (Fill/Stretch) across logic (640x480)
        // This stops "cropping" and ensures full screen play
        this.scaleX = this.canvas.width / this.SCREEN_WIDTH;
        this.scaleY = this.canvas.height / this.SCREEN_HEIGHT;

        // Remove uniform offsets
        this.uniformScale = null;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    async loadAssets() {
        return new Promise((resolve) => {
            let loaded = 0;
            const soundFiles = {
                'jump': 'assets/jump.mp3',
                'bgm': 'assets/bgm.mp3'
            };
            const imageTotal = 2;
            const soundTotal = Object.keys(soundFiles).length;
            // Only require images to resolve initial load, sounds can be async/non-blocking or included.
            // Let's require all for simplicity.
            // Actually, waiting for sounds might delay startup. 
            // Better to load images and resolve, while sounds load in background?
            // Or just check images. User wants sounds. Let's wait for images only to resolve 'assetsLoaded', 
            // but initiate sound loading.

            const total = 2; // Verify images only for game start readiness

            const checkComplete = () => {
                loaded++;
                if (loaded >= total) {
                    this.assetsLoaded = true;
                    resolve();
                }
            };

            // Load fish
            this.fishImage = new Image();
            this.fishImage.onload = checkComplete;
            this.fishImage.onerror = checkComplete;
            this.fishImage.src = 'assets/fish_no_BG.png';

            // Load ocean background
            this.oceanImage = new Image();
            this.oceanImage.onload = checkComplete;
            this.oceanImage.onerror = checkComplete;
            this.oceanImage.src = 'assets/ocean_image_with_alpha.png';

            // Load sounds (fire and forget for promise, or store them)
            for (const [key, src] of Object.entries(soundFiles)) {
                const audio = new Audio();
                audio.src = src;
                if (key === 'bgm') {
                    audio.loop = true;
                    audio.volume = 0.5;
                }
                this.sounds[key] = audio;
            }
        });
    }

    playSound(name) {
        if (this.sounds[name]) {
            if (name === 'bgm') {
                this.sounds[name].play().catch(() => { });
                return;
            }
            // Clone for overlapping SFX
            const clone = this.sounds[name].cloneNode();
            clone.volume = 1.0;
            clone.play().catch(() => { });
        }
    }

    stopBGM() {
        if (this.sounds['bgm']) {
            this.sounds['bgm'].pause();
            this.sounds['bgm'].currentTime = 0;
        }
    }

    logEvent(name, params = {}) {
        if (typeof gtag === 'function') {
            gtag('event', name, params);
            console.log(`📊 Event: ${name}`, params);
        }
    }

    setupEventListeners() {
        // Start button
        document.getElementById('start-btn').addEventListener('click', () => {
            this.startGame();
        });

        // Next round button
        document.getElementById('next-round-btn').addEventListener('click', () => {
            this.startNextRound();
        });

        // CTA Replay button
        const ctaReplay = document.getElementById('cta-replay-btn');
        if (ctaReplay) {
            console.log('✅ CTA Replay button found, adding listener');
            ctaReplay.addEventListener('click', () => {
                console.log('🔄 Play Again clicked! Restarting game...');
                this.currentRound = 1;
                this.startGame();
            });
        } else {
            console.warn('⚠️ CTA Replay button NOT found!');
        }

        // Fullscreen on tap (for mobile)
        this.gameScreen.addEventListener('click', () => {
            if (document.fullscreenElement === null) {
                document.body.requestFullscreen?.() ||
                    document.body.webkitRequestFullscreen?.();
            }
        });

        document.getElementById('quit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.quitGame();
        });

        // Quit overlay button
        document.getElementById('quit-overlay-btn').addEventListener('click', () => {
            this.quitGame();
        });

        // CTA Buttons tracking
        const trackDownload = (platform) => this.logEvent('download_click', { platform });

        const setupTracking = (id, platform) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', () => trackDownload(platform));
        };

        const setupOtherTracking = (id) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('click', (e) => {
                    if (e.target.tagName === 'A') {
                        this.logEvent('download_click', { platform: 'other', link: e.target.href });
                    }
                });
            }
        };

        setupTracking('android-cta', 'android');
        setupTracking('android-cta-top', 'android');

        setupTracking('ios-cta', 'ios_notify');
        setupTracking('ios-cta-top', 'ios_notify');

        setupOtherTracking('other-cta');
        setupOtherTracking('other-cta-top');
    }

    setupCTA() {
        const userAgent = navigator.userAgent.toLowerCase();
        const isAndroid = /android/.test(userAgent);
        const isIOS = /iphone|ipad|ipod/.test(userAgent);

        const androidCta = document.getElementById('android-cta');
        const iosCta = document.getElementById('ios-cta');
        const otherCta = document.getElementById('other-cta');

        const androidCtaTop = document.getElementById('android-cta-top');
        const iosCtaTop = document.getElementById('ios-cta-top');
        const otherCtaTop = document.getElementById('other-cta-top');

        // Hide all first
        const allCta = [androidCta, iosCta, otherCta, androidCtaTop, iosCtaTop, otherCtaTop];
        allCta.forEach(el => {
            if (el) el.classList.add('hidden');
        });

        // Show appropriate CTA
        if (isAndroid) {
            if (androidCta) androidCta.classList.remove('hidden');
            if (androidCtaTop) androidCtaTop.classList.remove('hidden');
        } else if (isIOS) {
            if (iosCta) iosCta.classList.remove('hidden');
            if (iosCtaTop) iosCtaTop.classList.remove('hidden');
        } else {
            // Desktop or other - show both options
            if (otherCta) otherCta.classList.remove('hidden');
            if (otherCtaTop) otherCtaTop.classList.remove('hidden');
        }
    }

    quitGame() {
        console.log('🛑 User quit game');
        this.gameStarted = false;
        this.gameOver = true;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }

        // Hide game, show CTA
        this.gameScreen.classList.remove('active');
        this.roundOverOverlay.classList.remove('active'); // In case it was open
        this.introScreen.classList.remove('active'); // Just in case

        this.showCTAScreen();
        this.stopBGM();
        this.logEvent('game_quit', { score: this.score, round: this.currentRound });
    }

    async startGame() {
        console.log('🎮 startGame() called');

        // Reset flags & State immediately
        this.gameOver = false;
        this.gameStarted = false;
        this.score = 0;
        this.obstacles = [];
        this.birdY = this.SCREEN_HEIGHT / 2;
        this.birdVelocity = 0;

        // Stop any existing face detector
        if (this.faceDetector) {
            console.log('🛑 Stopping existing face detector');
            this.faceDetector.stop();
            this.faceDetector = null;
        }

        // Cancel any existing animation frame
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Clear any existing countdown
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        // Clear canvas
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.drawFish(); // Draw fish at start position
        }

        // Update UI
        document.getElementById('score').textContent = '0';
        document.getElementById('current-round').textContent = this.currentRound;

        // Show game screen
        this.introScreen.classList.remove('active');
        this.ctaScreen.classList.remove('active'); // Ensure CTA is hidden
        this.roundOverOverlay.classList.add('hidden'); // Hide round over
        this.gameScreen.classList.add('active');

        // Show loading
        this.loadingOverlay.classList.remove('hidden');
        document.getElementById('loading-text').textContent = 'Initializing camera...';

        try {
            // Initialize face detection
            console.log('🔍 Creating new FaceDetector');
            this.faceDetector = new FaceDetector();

            document.getElementById('loading-text').textContent = 'Loading face detection...';
            await this.faceDetector.initialize(this.videoElement);
            console.log('✅ FaceDetector initialized');

            // Set up smile callback
            this.faceDetector.onSmileChange = (isSmiling) => {
                if (isSmiling) {
                    this.flap();
                }
            };

            // Hide loading
            this.loadingOverlay.classList.add('hidden');

            // Start countdown
            console.log('⏱️ Starting countdown');
            this.startCountdown();

        } catch (error) {
            console.error('Failed to start game:', error);
            document.getElementById('loading-text').textContent =
                'Camera access denied. Please allow camera and refresh.';
        }
    }

    startCountdown() {
        this.countdownOverlay.classList.remove('hidden');
        const countdownNumber = document.getElementById('countdown-number');
        let count = 3;

        countdownNumber.textContent = count;

        this.countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownNumber.textContent = count;
            } else {
                clearInterval(this.countdownInterval);
                this.countdownOverlay.classList.add('hidden');
                // Only start if not quit
                if (!this.gameOver) {
                    this.beginGameplay();
                }
            }
        }, 1000);
    }

    beginGameplay() {
        // Reset game state
        this.birdY = this.SCREEN_HEIGHT / 2;
        this.birdVelocity = 0;
        this.obstacles = [];
        this.score = 0;
        this.gameStarted = true;
        this.gameOver = false;

        // Update UI
        document.getElementById('score').textContent = '0';
        document.getElementById('current-round').textContent = this.currentRound;

        // Start game loop
        requestAnimationFrame((t) => this.gameLoop(t));
        this.playSound('bgm');
        this.logEvent('game_start', { round: this.currentRound });
    }

    flap() {
        const now = Date.now();
        if (now - this.lastFlapTime < this.MIN_FLAP_INTERVAL) return;
        if (!this.gameStarted || this.gameOver) return;

        this.birdVelocity = this.FLAP_STRENGTH;
        this.lastFlapTime = now;
        this.playSound('jump');
        console.log('🐟 Flap!');
    }

    gameLoop(currentTime) {
        if (!this.gameStarted) return;

        // OPTIMIZATION: Cap game loop at 30fps for low-end devices
        if (!this.lastGameLoopTime) this.lastGameLoopTime = 0;
        const elapsed = currentTime - this.lastGameLoopTime;
        const GAME_FRAME_INTERVAL = 1000 / 30; // 30fps cap

        if (elapsed < GAME_FRAME_INTERVAL) {
            this.animationId = requestAnimationFrame((t) => this.gameLoop(t));
            return;
        }
        this.lastGameLoopTime = currentTime;

        this.update();
        this.render();

        if (this.gameOver) {
            this.handleGameOver();
        } else {
            this.animationId = requestAnimationFrame((t) => this.gameLoop(t));
        }
    }

    update() {
        // Bird physics (exactly like Flutter app)
        this.birdVelocity += this.GRAVITY;
        if (this.birdVelocity > 10) {
            this.birdVelocity = 10; // Terminal velocity
        }
        this.birdY += this.birdVelocity;

        // Clamp bird position
        const birdRadius = this.BIRD_SIZE / 2;
        if (this.birdY < birdRadius) {
            this.birdY = birdRadius;
            this.birdVelocity = 0;
        }
        if (this.birdY > this.SCREEN_HEIGHT - birdRadius) {
            this.birdY = this.SCREEN_HEIGHT - birdRadius;
            this.gameOver = true;
        }

        // Spawn obstacles
        if (this.obstacles.length === 0) {
            this.spawnObstacle();
        } else {
            const lastObstacle = this.obstacles[this.obstacles.length - 1];
            if (this.SCREEN_WIDTH - lastObstacle.x > this.SPAWN_DISTANCE) {
                this.spawnObstacle();
            }
        }

        // Update obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.x -= this.OBSTACLE_SPEED;

            // Check if passed
            if (!obs.passed && obs.x + this.OBSTACLE_WIDTH < this.BIRD_X) {
                obs.passed = true;
                this.score += 10;
                document.getElementById('score').textContent = this.score;
            }

            // Remove off-screen
            if (obs.x + this.OBSTACLE_WIDTH < 0) {
                this.obstacles.splice(i, 1);
            }
        }

        // Check collisions
        if (this.checkCollision()) {
            this.gameOver = true;
        }
    }

    spawnObstacle() {
        const minGapTop = 80;
        const maxGapTop = this.SCREEN_HEIGHT - this.GAP_SIZE - 80;
        const gapTop = minGapTop + Math.random() * (maxGapTop - minGapTop);
        const gapBottom = gapTop + this.GAP_SIZE;

        console.log(`Spawned Pipe: GapTop=${gapTop.toFixed(1)}, GapHeight=${this.GAP_SIZE}`);

        this.obstacles.push({
            x: this.SCREEN_WIDTH,
            gapTop: gapTop,
            gapBottom: gapBottom,
            passed: false,
            id: Date.now()
        });
    }

    checkCollision() {
        const birdLeft = this.BIRD_X - this.BIRD_SIZE / 2;
        const birdRight = this.BIRD_X + this.BIRD_SIZE / 2;
        const birdTop = this.birdY - this.BIRD_SIZE / 2;
        const birdBottom = this.birdY + this.BIRD_SIZE / 2;

        // Add some forgiveness
        const forgiveness = this.BIRD_SIZE * 0.1;
        const safeTop = birdTop + forgiveness;
        const safeBottom = birdBottom - forgiveness;
        const safeLeft = birdLeft + forgiveness;
        const safeRight = birdRight - forgiveness;

        // Check screen bounds
        if (safeTop < 0 || safeBottom > this.SCREEN_HEIGHT) {
            return true;
        }

        // Check obstacle collisions
        for (const obs of this.obstacles) {
            const tubeLeft = obs.x;
            const tubeRight = obs.x + this.OBSTACLE_WIDTH;

            if (safeRight > tubeLeft && safeLeft < tubeRight) {
                if (safeTop < obs.gapTop || safeBottom > obs.gapBottom) {
                    return true;
                }
            }
        }

        return false;
    }

    render() {
        const ctx = this.ctx;

        // Clear canvas (transparent - camera shows through)
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Optional: Draw semi-transparent ocean overlay for atmosphere
        if (this.oceanImage && this.oceanImage.complete) {
            ctx.globalAlpha = 0.15; // Very subtle overlay
            ctx.drawImage(this.oceanImage, 0, 0, this.canvas.width, this.canvas.height);
            ctx.globalAlpha = 1;
        }

        // Draw obstacles (pipes)
        for (const obs of this.obstacles) {
            this.drawPipe(obs);
        }

        // Draw fish (bird)
        this.drawFish();
    }

    drawPipe(obs) {
        const ctx = this.ctx;

        // Use Independent Scales (Fill Screen)
        const x = obs.x * this.scaleX;
        const width = this.OBSTACLE_WIDTH * this.scaleX;
        const gapTop = obs.gapTop * this.scaleY;
        const gapBottom = obs.gapBottom * this.scaleY;

        // Full screen limits
        const screenTop = 0;
        const screenBottom = this.canvas.height;

        // Colors from Flutter FlappyCheekPainter
        const tubeColor = '#228B22';      // _tubePaint
        const capColor = '#196E19';       // _capPaint
        const borderColor = 'rgba(0, 255, 0, 0.6)'; // _borderPaint
        const edgeHighlight = 'rgba(255, 255, 255, 0.2)'; // _edgePaint
        const edgeShadow = 'rgba(0, 0, 0, 0.2)'; // _shadowPaint

        const capHeight = 20 * this.scaleX; // Scale with WIDTH (X) to maintain proportion, don't stretch with Y
        const capExtension = 4 * this.scaleX; // Scale horizontal features with X
        const edgeWidth = width * 0.1;

        // --- TOP PIPE ---
        const topPipeHeight = gapTop - screenTop;

        // 1. Main body
        ctx.fillStyle = tubeColor;
        ctx.fillRect(x, screenTop, width, topPipeHeight);

        // 2. 3D effects (Highlight & Shadow)
        ctx.fillStyle = edgeHighlight;
        ctx.fillRect(x, screenTop, edgeWidth, topPipeHeight);

        ctx.fillStyle = edgeShadow;
        ctx.fillRect(x + width - edgeWidth, screenTop, edgeWidth, topPipeHeight);

        // 3. Cap
        const topCapY = gapTop - capHeight;
        ctx.fillStyle = capColor;
        ctx.fillRect(x - capExtension, topCapY, width + capExtension * 2, capHeight);

        // 4. Borders
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;

        // Border for main body
        ctx.strokeRect(x, screenTop, width, topPipeHeight);

        // Border for cap
        ctx.strokeRect(x - capExtension, topCapY, width + capExtension * 2, capHeight);


        // --- BOTTOM PIPE ---
        const bottomPipeHeight = screenBottom - gapBottom;

        // 1. Main body
        ctx.fillStyle = tubeColor;
        ctx.fillRect(x, gapBottom, width, bottomPipeHeight);

        // 2. 3D effects
        ctx.fillStyle = edgeHighlight;
        ctx.fillRect(x, gapBottom, edgeWidth, bottomPipeHeight);

        ctx.fillStyle = edgeShadow;
        ctx.fillRect(x + width - edgeWidth, gapBottom, edgeWidth, bottomPipeHeight);

        // 3. Cap
        ctx.fillStyle = capColor;
        ctx.fillRect(x - capExtension, gapBottom, width + capExtension * 2, capHeight);

        // 4. Borders
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;

        // Border for main body
        ctx.strokeRect(x, gapBottom, width, bottomPipeHeight);

        // Border for cap
        ctx.strokeRect(x - capExtension, gapBottom, width + capExtension * 2, capHeight);
    }

    drawFish() {
        const ctx = this.ctx;

        const x = this.BIRD_X * this.scaleX;
        const y = this.birdY * this.scaleY; // Y position scales with Height
        const size = this.BIRD_SIZE * this.scaleX; // Size scales with Width (Maintain Aspect Ratio)

        if (this.fishImage && this.fishImage.complete) {
            ctx.globalAlpha = 0.85;
            ctx.drawImage(
                this.fishImage,
                x - size / 2,
                y - size / 2,
                size,
                size
            );
            ctx.globalAlpha = 1;
        } else {
            // Fallback circle
            ctx.fillStyle = '#00d4ff';
            ctx.beginPath();
            ctx.arc(x, y, size / 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    handleGameOver() {
        this.gameStarted = false;
        this.stopBGM();

        this.logEvent('round_complete', {
            score: this.score,
            round: this.currentRound
        });

        // Update best score
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
        }

        // Check if more rounds available
        if (this.currentRound < this.maxRounds) {
            // Show round over overlay
            document.getElementById('round-score').textContent = this.score;
            document.getElementById('rounds-left').textContent = this.maxRounds - this.currentRound;
            this.roundOverOverlay.classList.remove('hidden');
        } else {
            // Show CTA screen
            this.showCTAScreen();
        }
    }

    startNextRound() {
        console.log('🔄 startNextRound() called');

        // Hide the overlay
        this.roundOverOverlay.classList.add('hidden');

        // Reset game state for new round
        this.gameOver = false;
        this.gameStarted = false;
        this.score = 0;
        this.obstacles = [];
        this.birdY = this.SCREEN_HEIGHT / 2;
        this.birdVelocity = 0;

        // Cancel any existing animation frame
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Clear canvas and draw fresh fish
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.drawFish();
        }

        // Update UI
        document.getElementById('score').textContent = '0';
        this.currentRound++;
        document.getElementById('current-round').textContent = this.currentRound;

        // Start countdown for new round
        this.startCountdown();
    }

    showCTAScreen() {
        // Stop game
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        // Stop face detection
        if (this.faceDetector) {
            this.faceDetector.stop();
        }

        // Update best score display
        document.getElementById('best-score').textContent = this.bestScore;

        // Switch screens
        this.gameScreen.classList.remove('active');
        this.ctaScreen.classList.add('active');
        this.logEvent('cta_view');
    }
}

// Start game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new FlappyGame();
});
