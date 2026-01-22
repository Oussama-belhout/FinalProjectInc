/**
 * GUI Class
 * Handles all user interface operations
 * Interacts with AudioEngine for audio functionality
 */
class GUI {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        
        // DOM element references
        this.padContainer = null;
        
        // Pad elements array
        this.pads = [];
        
        // Waveform canvas
        this.waveformCanvas = null;
        this.waveformCtx = null;
        this.isDrawingWaveform = false;
        
        // Trim controls
        this.selectedPadForTrim = null;
        this.trimContainer = null;
    }

    /**
     * Initialize the GUI
     */
    init() {
        // Cache DOM elements
        this.padContainer = document.getElementById('pad-container');
        
        // Setup waveform canvas
        this.setupWaveformCanvas();
        
        // Setup trim controls
        this.setupTrimControls();
        
        // Generate the pad grid
        this.generatePads();
    }

    /**
     * Setup trim controls panel
     */
    setupTrimControls() {
        this.trimContainer = document.getElementById('trim-container');
        const trimTitle = document.getElementById('trim-title');
        const trimClose = document.getElementById('trim-close');
        const trimStart = document.getElementById('trim-start');
        const trimEnd = document.getElementById('trim-end');
        const trimStartValue = document.getElementById('trim-start-value');
        const trimEndValue = document.getElementById('trim-end-value');
        
        // Close button
        trimClose.addEventListener('click', () => {
            this.closeTrimPanel();
        });
        
        // Start slider
        trimStart.addEventListener('input', (e) => {
            if (this.selectedPadForTrim === null) return;
            const value = parseInt(e.target.value) / 100;
            this.audioEngine.setTrimStart(this.selectedPadForTrim, value);
            const trimValues = this.audioEngine.getTrimValues(this.selectedPadForTrim);
            trimStartValue.textContent = `${Math.round(trimValues.start * 100)}%`;
            trimStart.value = trimValues.start * 100;
        });
        
        // End slider
        trimEnd.addEventListener('input', (e) => {
            if (this.selectedPadForTrim === null) return;
            const value = parseInt(e.target.value) / 100;
            this.audioEngine.setTrimEnd(this.selectedPadForTrim, value);
            const trimValues = this.audioEngine.getTrimValues(this.selectedPadForTrim);
            trimEndValue.textContent = `${Math.round(trimValues.end * 100)}%`;
            trimEnd.value = trimValues.end * 100;
        });
    }

    /**
     * Open trim panel for a specific pad
     * @param {number} padIndex - Index of pad to trim
     */
    openTrimPanel(padIndex) {
        // Only allow trim for loaded pads
        if (!this.audioEngine.buffers[padIndex]) {
            console.warn('Cannot trim empty pad');
            return;
        }
        
        this.selectedPadForTrim = padIndex;
        
        // Update title
        document.getElementById('trim-title').textContent = `Trim: Pad ${padIndex}`;
        
        // Load current trim values
        const trimValues = this.audioEngine.getTrimValues(padIndex);
        document.getElementById('trim-start').value = trimValues.start * 100;
        document.getElementById('trim-end').value = trimValues.end * 100;
        document.getElementById('trim-start-value').textContent = `${Math.round(trimValues.start * 100)}%`;
        document.getElementById('trim-end-value').textContent = `${Math.round(trimValues.end * 100)}%`;
        
        // Show panel
        this.trimContainer.classList.remove('hidden');
    }

    /**
     * Close trim panel
     */
    closeTrimPanel() {
        this.selectedPadForTrim = null;
        this.trimContainer.classList.add('hidden');
    }

    /**
     * Setup waveform canvas for visualization
     */
    setupWaveformCanvas() {
        this.waveformCanvas = document.getElementById('waveform');
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        
        // Set canvas resolution
        this.resizeWaveformCanvas();
        
        // Handle window resize
        window.addEventListener('resize', () => this.resizeWaveformCanvas());
        
        // Start waveform animation loop
        this.startWaveformAnimation();
    }

    /**
     * Resize canvas to match display size
     */
    resizeWaveformCanvas() {
        const rect = this.waveformCanvas.getBoundingClientRect();
        this.waveformCanvas.width = rect.width * window.devicePixelRatio;
        this.waveformCanvas.height = rect.height * window.devicePixelRatio;
        this.waveformCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    /**
     * Start the waveform animation loop
     */
    startWaveformAnimation() {
        this.isDrawingWaveform = true;
        this.drawWaveform();
    }

    /**
     * Draw waveform visualization
     */
    drawWaveform() {
        if (!this.isDrawingWaveform) return;
        
        requestAnimationFrame(() => this.drawWaveform());
        
        const canvas = this.waveformCanvas;
        const ctx = this.waveformCtx;
        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;
        
        // Clear canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
        
        // Get analyser data
        const data = this.audioEngine.getAnalyserData();
        if (!data) {
            // Draw flat line when no audio context
            ctx.strokeStyle = 'rgba(102, 126, 234, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();
            return;
        }
        
        // Draw waveform
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const sliceWidth = width / data.length;
        let x = 0;
        
        for (let i = 0; i < data.length; i++) {
            const v = data[i] / 128.0; // Normalize to 0-2
            const y = (v * height) / 2;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        
        // Add glow effect
        ctx.shadowColor = '#667eea';
        ctx.shadowBlur = 10;
    }

    /**
     * Generate 16 pad elements in a 4x4 grid
     */
    generatePads() {
        // Clear existing pads
        this.padContainer.innerHTML = '';
        this.pads = [];

        // Create 16 pads (0-15)
        for (let i = 0; i < 16; i++) {
            const pad = document.createElement('div');
            pad.className = 'pad empty';
            pad.dataset.padIndex = i;
            
            // Pad number label
            const label = document.createElement('span');
            label.className = 'pad-label';
            label.textContent = i;
            pad.appendChild(label);
            
            // Click event
            pad.addEventListener('click', () => this.handlePadClick(i));
            
            // Mouse down/up for visual feedback
            pad.addEventListener('mousedown', () => this.activatePad(i));
            pad.addEventListener('mouseup', () => this.deactivatePad(i));
            pad.addEventListener('mouseleave', () => this.deactivatePad(i));
            
            // Right-click to open trim panel
            pad.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.openTrimPanel(i);
            });
            
            this.padContainer.appendChild(pad);
            this.pads.push(pad);
        }
    }

    /**
     * Handle pad click - play sound if loaded
     * @param {number} padIndex - Index of clicked pad
     */
    async handlePadClick(padIndex) {
        // Ensure audio context is initialized
        if (!this.audioEngine.audioContext) {
            await this.audioEngine.init();
        }
        
        // Play the sound
        this.audioEngine.playSound(padIndex);
    }

    /**
     * Activate pad visual state
     * @param {number} padIndex - Index of pad
     */
    activatePad(padIndex) {
        this.pads[padIndex].classList.add('active');
    }

    /**
     * Deactivate pad visual state
     * @param {number} padIndex - Index of pad
     */
    deactivatePad(padIndex) {
        this.pads[padIndex].classList.remove('active');
    }

    /**
     * Update pad state (empty/loaded)
     * @param {number} padIndex - Index of pad
     * @param {boolean} hasSound - Whether pad has a sound loaded
     */
    updatePadState(padIndex, hasSound) {
        if (hasSound) {
            this.pads[padIndex].classList.remove('empty');
            this.pads[padIndex].classList.add('loaded');
        } else {
            this.pads[padIndex].classList.add('empty');
            this.pads[padIndex].classList.remove('loaded');
        }
    }
}
