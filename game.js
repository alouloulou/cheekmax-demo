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

        // Use UNIFORM scaling to preserve aspect ratio (like Flutter app)
        // This ensures the gap size remains proportional to the fish
        const rawScaleX = this.canvas.width / this.SCREEN_WIDTH;
        const rawScaleY = this.canvas.height / this.SCREEN_HEIGHT;

        // Use the minimum scale to fit the game area, maintaining proportions
        this.uniformScale = Math.min(rawScaleX, rawScaleY);

        // Calculate offset to center the game area
        this.offsetX = (this.canvas.width - this.SCREEN_WIDTH * this.uniformScale) / 2;
        this.offsetY = (this.canvas.height - this.SCREEN_HEIGHT * this.uniformScale) / 2;

        // For backwards compatibility, set scaleX/Y to uniform scale
        this.scaleX = this.uniformScale;
        this.scaleY = this.uniformScale;
    }

    async loadAssets() {
        return new Promise((resolve) => {
            let loaded = 0;
            const total = 2;

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
        });
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

        // Fullscreen on tap (for mobile)
        this.gameScreen.addEventListener('click', () => {
            if (document.fullscreenElement === null) {
                document.body.requestFullscreen?.() ||
                    document.body.webkitRequestFullscreen?.();
            }
        });
    }

    setupCTA() {
        const userAgent = navigator.userAgent.toLowerCase();
        const isAndroid = /android/.test(userAgent);
        const isIOS = /iphone|ipad|ipod/.test(userAgent);

        const androidCta = document.getElementById('android-cta');
        const iosCta = document.getElementById('ios-cta');
        const otherCta = document.getElementById('other-cta');

        // Hide all first
        androidCta.classList.add('hidden');
        iosCta.classList.add('hidden');
        otherCta.classList.add('hidden');

        // Show appropriate CTA
        if (isAndroid) {
            androidCta.classList.remove('hidden');
        } else if (isIOS) {
            iosCta.classList.remove('hidden');
        } else {
            // Desktop or other - show both options
            otherCta.classList.remove('hidden');
        }
    }

    async startGame() {
        // Show game screen
        this.introScreen.classList.remove('active');
        this.gameScreen.classList.add('active');

        // Show loading
        this.loadingOverlay.classList.remove('hidden');
        document.getElementById('loading-text').textContent = 'Initializing camera...';

        try {
            // Initialize face detection
            this.faceDetector = new FaceDetector();

            document.getElementById('loading-text').textContent = 'Loading face detection...';
            await this.faceDetector.initialize(this.videoElement);

            // Set up smile callback
            this.faceDetector.onSmileChange = (isSmiling) => {
                if (isSmiling) {
                    this.flap();
                }
            };

            // Hide loading
            this.loadingOverlay.classList.add('hidden');

            // Start countdown
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

        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownNumber.textContent = count;
            } else {
                clearInterval(countdownInterval);
                this.countdownOverlay.classList.add('hidden');
                this.beginGameplay();
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
        this.gameLoop();
    }

    flap() {
        const now = Date.now();
        if (now - this.lastFlapTime < this.MIN_FLAP_INTERVAL) return;
        if (!this.gameStarted || this.gameOver) return;

        this.birdVelocity = this.FLAP_STRENGTH;
        this.lastFlapTime = now;
        console.log('🐟 Flap!');
    }

    gameLoop() {
        if (!this.gameStarted) return;

        this.update();
        this.render();

        if (this.gameOver) {
            this.handleGameOver();
        } else {
            this.animationId = requestAnimationFrame(() => this.gameLoop());
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
        const scale = this.uniformScale;
        const offsetX = this.offsetX || 0;
        const offsetY = this.offsetY || 0;

        const x = offsetX + obs.x * scale;
        const width = this.OBSTACLE_WIDTH * scale;
        const gapTop = offsetY + obs.gapTop * scale;
        const gapBottom = offsetY + obs.gapBottom * scale;
        const screenTop = offsetY;
        const screenBottom = offsetY + this.SCREEN_HEIGHT * scale;

        // Pipe colors
        const pipeColor = '#228B22';
        const capColor = '#196E19';
        const highlightColor = 'rgba(255,255,255,0.2)';
        const shadowColor = 'rgba(0,0,0,0.2)';

        // Top pipe (from screen top to gap top)
        ctx.fillStyle = pipeColor;
        ctx.fillRect(x, screenTop, width, gapTop - screenTop);

        // Top pipe cap
        const capHeight = 20 * scale;
        const capExtension = 4 * scale;
        ctx.fillStyle = capColor;
        ctx.fillRect(x - capExtension, gapTop - capHeight, width + capExtension * 2, capHeight);

        // Top pipe 3D effect
        ctx.fillStyle = highlightColor;
        ctx.fillRect(x, screenTop, width * 0.1, gapTop - screenTop);
        ctx.fillStyle = shadowColor;
        ctx.fillRect(x + width * 0.9, screenTop, width * 0.1, gapTop - screenTop);

        // Bottom pipe (from gap bottom to screen bottom)
        ctx.fillStyle = pipeColor;
        ctx.fillRect(x, gapBottom, width, screenBottom - gapBottom);

        // Bottom pipe cap
        ctx.fillStyle = capColor;
        ctx.fillRect(x - capExtension, gapBottom, width + capExtension * 2, capHeight);

        // Bottom pipe 3D effect
        ctx.fillStyle = highlightColor;
        ctx.fillRect(x, gapBottom, width * 0.1, screenBottom - gapBottom);
        ctx.fillStyle = shadowColor;
        ctx.fillRect(x + width * 0.9, gapBottom, width * 0.1, screenBottom - gapBottom);

        // Pipe borders
        ctx.strokeStyle = 'rgba(0,255,0,0.6)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, screenTop, width, gapTop - screenTop);
        ctx.strokeRect(x, gapBottom, width, screenBottom - gapBottom);
    }

    drawFish() {
        const ctx = this.ctx;
        const scale = this.uniformScale;
        const offsetX = this.offsetX || 0;
        const offsetY = this.offsetY || 0;

        const x = offsetX + this.BIRD_X * scale;
        const y = offsetY + this.birdY * scale;
        const size = this.BIRD_SIZE * scale;

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
        this.roundOverOverlay.classList.add('hidden');
        this.currentRound++;
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
    }
}

// Start game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new FlappyGame();
});
