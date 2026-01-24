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
        
        // Currently selected pad for waveform display
        this.selectedPad = null;
        
        // Trim handle dragging state
        this.isDragging = null; // 'start', 'end', or null
        this.handleWidth = 12;
        
        // Keyboard mapping (key -> pad index)
        // Layout matches AZERTY keyboard rows
        this.keyboardMapping = {
            'a': 0,  'z': 1,  'e': 2,  'r': 3,   // First row (pads 0-3) - AZERTY first letter row
            'q': 4,  's': 5,  'd': 6,  'f': 7,   // Second row (pads 4-7) - AZERTY second letter row
            'w': 8,  'x': 9,  'c': 10, 'v': 11,  // Third row (pads 8-11) - AZERTY third letter row
            'u': 12, 'i': 13, 'o': 14, 'p': 15   // Fourth row (pads 12-15)
        };
        
        // Reverse mapping (pad index -> key)
        this.padToKey = {};
        for (const [key, pad] of Object.entries(this.keyboardMapping)) {
            this.padToKey[pad] = key.toUpperCase();
        }
        
        // Track pressed keys to prevent repeat
        this.pressedKeys = new Set();
    }

    /**
     * Initialize the GUI
     */
    init() {
        // Cache DOM elements
        this.padContainer = document.getElementById('pad-container');
        
        // Setup waveform canvas
        this.setupWaveformCanvas();
        
        // Generate the pad grid
        this.generatePads();
        
        // Setup keyboard controls
        this.setupKeyboardControls();
        
        // Setup pad settings panel
        this.setupPadSettings();
    }

    /**
     * Setup keyboard event listeners
     */
    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    /**
     * Handle keydown event
     * @param {KeyboardEvent} e 
     */
    async handleKeyDown(e) {
        // Ignore if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
            return;
        }
        
        const key = e.key.toLowerCase();
        
        // Check if key is mapped and not already pressed (prevent repeat)
        if (this.keyboardMapping.hasOwnProperty(key) && !this.pressedKeys.has(key)) {
            e.preventDefault();
            this.pressedKeys.add(key);
            
            const padIndex = this.keyboardMapping[key];
            
            // Initialize audio context if needed
            if (!this.audioEngine.audioContext) {
                await this.audioEngine.init();
            }
            
            // Visual feedback
            this.activatePad(padIndex);
            
            // Play sound and show waveform
            if (this.audioEngine.hasSound(padIndex)) {
                this.selectPadForWaveform(padIndex);
            }
            this.audioEngine.playSound(padIndex);
        }
    }

    /**
     * Handle keyup event
     * @param {KeyboardEvent} e 
     */
    handleKeyUp(e) {
        const key = e.key.toLowerCase();
        
        if (this.keyboardMapping.hasOwnProperty(key)) {
            this.pressedKeys.delete(key);
            const padIndex = this.keyboardMapping[key];
            this.deactivatePad(padIndex);
            
            // Stop sound if in gate mode
            if (this.audioEngine.getPlayMode(padIndex) === 'gate') {
                this.audioEngine.stopSound(padIndex, true); // Use release envelope
            }
        }
    }

    /**
     * Setup waveform canvas for visualization with trim handles
     */
    setupWaveformCanvas() {
        this.waveformCanvas = document.getElementById('waveform');
        this.waveformCtx = this.waveformCanvas.getContext('2d');
        
        // Set canvas resolution
        this.resizeWaveformCanvas();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeWaveformCanvas();
            this.drawWaveform();
        });
        
        // Mouse events for trim handles
        this.waveformCanvas.addEventListener('mousedown', (e) => this.onCanvasMouseDown(e));
        this.waveformCanvas.addEventListener('mousemove', (e) => this.onCanvasMouseMove(e));
        this.waveformCanvas.addEventListener('mouseup', () => this.onCanvasMouseUp());
        this.waveformCanvas.addEventListener('mouseleave', () => this.onCanvasMouseUp());
        
        // Touch events for mobile
        this.waveformCanvas.addEventListener('touchstart', (e) => this.onCanvasTouchStart(e));
        this.waveformCanvas.addEventListener('touchmove', (e) => this.onCanvasTouchMove(e));
        this.waveformCanvas.addEventListener('touchend', () => this.onCanvasMouseUp());
        
        // Initial draw
        this.drawWaveform();
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
     * Select a pad to display its waveform
     * @param {number} padIndex - Pad index
     */
    selectPadForWaveform(padIndex) {
        if (!this.audioEngine.hasSound(padIndex)) {
            return;
        }
        
        // First, clear the canvas completely
        const canvas = this.waveformCanvas;
        const ctx = this.waveformCtx;
        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, width, height);
        
        // Now set the new pad and draw
        this.selectedPad = padIndex;
        document.getElementById('waveform-label').textContent = `Pad ${padIndex} - Drag handles to trim`;
        this.drawWaveform();
        this.updateTrimDisplay();
        
        // Highlight selected pad
        this.pads.forEach((pad, i) => {
            pad.classList.toggle('selected', i === padIndex);
        });
        
        // Show and update pad settings panel
        this.showPadSettings(padIndex);
    }

    /**
     * Clear waveform display (reset to placeholder)
     */
    clearWaveform() {
        this.selectedPad = null;
        document.getElementById('waveform-label').textContent = 'Select a pad to view waveform';
        document.getElementById('trim-start-display').textContent = 'Start: 0%';
        document.getElementById('trim-end-display').textContent = 'End: 100%';
        
        // Remove selected state from all pads
        this.pads.forEach(pad => {
            pad.classList.remove('selected');
        });
        
        // Hide pad settings panel
        this.hidePadSettings();
        
        // Clear the canvas completely
        const canvas = this.waveformCanvas;
        const ctx = this.waveformCtx;
        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;
        ctx.clearRect(0, 0, width, height);
        
        this.drawWaveform();
    }

    /**
     * Draw the waveform with trim handles
     */
    drawWaveform() {
        const canvas = this.waveformCanvas;
        const ctx = this.waveformCtx;
        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;
        
        // Clear canvas
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, width, height);
        
        if (this.selectedPad === null || !this.audioEngine.hasSound(this.selectedPad)) {
            // Draw placeholder
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Click a loaded pad to view waveform', width / 2, height / 2);
            return;
        }
        
        const bufferData = this.audioEngine.getBufferData(this.selectedPad);
        const trimValues = this.audioEngine.getTrimValues(this.selectedPad);
        
        if (!bufferData) return;
        
        // Calculate trim positions in pixels
        const trimStartX = trimValues.start * width;
        const trimEndX = trimValues.end * width;
        
        // Draw dimmed regions (outside trim)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, trimStartX, height);
        ctx.fillRect(trimEndX, 0, width - trimEndX, height);
        
        // Draw waveform
        const step = Math.ceil(bufferData.length / width);
        const amp = height / 2;
        
        ctx.beginPath();
        ctx.moveTo(0, amp);
        
        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            
            for (let j = 0; j < step; j++) {
                const datum = bufferData[(i * step) + j];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }
            
            // Draw the waveform as filled area
            const x = i;
            const isInTrimRegion = x >= trimStartX && x <= trimEndX;
            
            if (isInTrimRegion) {
                ctx.fillStyle = 'rgba(102, 126, 234, 0.8)';
            } else {
                ctx.fillStyle = 'rgba(102, 126, 234, 0.3)';
            }
            
            const yMin = (1 + min) * amp;
            const yMax = (1 + max) * amp;
            ctx.fillRect(x, yMin, 1, yMax - yMin || 1);
        }
        
        // Draw center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, amp);
        ctx.lineTo(width, amp);
        ctx.stroke();
        
        // Draw trim handles
        this.drawTrimHandle(ctx, trimStartX, height, 'start');
        this.drawTrimHandle(ctx, trimEndX, height, 'end');
    }

    /**
     * Draw a trim handle
     */
    drawTrimHandle(ctx, x, height, type) {
        const handleWidth = this.handleWidth;
        const handleX = type === 'start' ? x : x - handleWidth;
        
        // Handle background
        const gradient = ctx.createLinearGradient(handleX, 0, handleX + handleWidth, 0);
        if (type === 'start') {
            gradient.addColorStop(0, 'rgba(102, 126, 234, 0.9)');
            gradient.addColorStop(1, 'rgba(102, 126, 234, 0.4)');
        } else {
            gradient.addColorStop(0, 'rgba(102, 126, 234, 0.4)');
            gradient.addColorStop(1, 'rgba(102, 126, 234, 0.9)');
        }
        
        ctx.fillStyle = gradient;
        ctx.fillRect(handleX, 0, handleWidth, height);
        
        // Handle line
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        
        // Handle grip lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        const centerX = type === 'start' ? x + handleWidth / 2 : x - handleWidth / 2;
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(centerX + i * 2, height / 2 - 10);
            ctx.lineTo(centerX + i * 2, height / 2 + 10);
            ctx.stroke();
        }
    }

    /**
     * Get mouse position relative to canvas
     */
    getCanvasPosition(e) {
        const rect = this.waveformCanvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    /**
     * Check which handle is at position
     */
    getHandleAtPosition(x) {
        if (this.selectedPad === null) return null;
        
        const width = this.waveformCanvas.getBoundingClientRect().width;
        const trimValues = this.audioEngine.getTrimValues(this.selectedPad);
        const trimStartX = trimValues.start * width;
        const trimEndX = trimValues.end * width;
        
        if (Math.abs(x - trimStartX) < this.handleWidth) return 'start';
        if (Math.abs(x - trimEndX) < this.handleWidth) return 'end';
        return null;
    }

    /**
     * Handle mouse down on canvas
     */
    onCanvasMouseDown(e) {
        const pos = this.getCanvasPosition(e);
        this.isDragging = this.getHandleAtPosition(pos.x);
        
        if (this.isDragging) {
            this.waveformCanvas.style.cursor = 'ew-resize';
        }
    }

    /**
     * Handle mouse move on canvas
     */
    onCanvasMouseMove(e) {
        const pos = this.getCanvasPosition(e);
        
        if (this.isDragging && this.selectedPad !== null) {
            const width = this.waveformCanvas.getBoundingClientRect().width;
            const value = Math.max(0, Math.min(1, pos.x / width));
            
            if (this.isDragging === 'start') {
                this.audioEngine.setTrimStart(this.selectedPad, value);
            } else {
                this.audioEngine.setTrimEnd(this.selectedPad, value);
            }
            
            this.drawWaveform();
            this.updateTrimDisplay();
        } else {
            // Update cursor based on hover
            const handle = this.getHandleAtPosition(pos.x);
            this.waveformCanvas.style.cursor = handle ? 'ew-resize' : 'crosshair';
        }
    }

    /**
     * Handle mouse up on canvas
     */
    onCanvasMouseUp() {
        this.isDragging = null;
        this.waveformCanvas.style.cursor = 'crosshair';
    }

    /**
     * Handle touch start
     */
    onCanvasTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.waveformCanvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        this.isDragging = this.getHandleAtPosition(x);
    }

    /**
     * Handle touch move
     */
    onCanvasTouchMove(e) {
        e.preventDefault();
        if (!this.isDragging || this.selectedPad === null) return;
        
        const touch = e.touches[0];
        const rect = this.waveformCanvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const width = rect.width;
        const value = Math.max(0, Math.min(1, x / width));
        
        if (this.isDragging === 'start') {
            this.audioEngine.setTrimStart(this.selectedPad, value);
        } else {
            this.audioEngine.setTrimEnd(this.selectedPad, value);
        }
        
        this.drawWaveform();
        this.updateTrimDisplay();
    }

    /**
     * Update trim value display
     */
    updateTrimDisplay() {
        if (this.selectedPad === null) return;
        
        const trimValues = this.audioEngine.getTrimValues(this.selectedPad);
        document.getElementById('trim-start-display').textContent = `Start: ${Math.round(trimValues.start * 100)}%`;
        document.getElementById('trim-end-display').textContent = `End: ${Math.round(trimValues.end * 100)}%`;
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
            
            // Keyboard key label
            const keyLabel = document.createElement('span');
            keyLabel.className = 'pad-key';
            keyLabel.textContent = this.padToKey[i] || '';
            pad.appendChild(keyLabel);
            
            // Click event
            pad.addEventListener('click', () => this.handlePadClick(i));
            
            // Mouse down/up for visual feedback
            pad.addEventListener('mousedown', () => this.activatePad(i));
            pad.addEventListener('mouseup', () => this.deactivatePad(i));
            pad.addEventListener('mouseleave', () => this.deactivatePad(i));
            
            // Right-click to select for waveform/trim
            pad.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.selectPadForWaveform(i);
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
        
        // Select pad for waveform display
        if (this.audioEngine.hasSound(padIndex)) {
            this.selectPadForWaveform(padIndex);
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

    // =============================================
    // PAD SETTINGS PANEL METHODS
    // =============================================

    /**
     * Setup pad settings panel event listeners
     */
    setupPadSettings() {
        // Mode buttons (One-Shot / Gate)
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                if (this.selectedPad !== null) {
                    this.audioEngine.setPlayMode(this.selectedPad, mode);
                    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                }
            });
        });

        // Loop toggle
        document.getElementById('loop-toggle').addEventListener('change', (e) => {
            if (this.selectedPad !== null) {
                this.audioEngine.setLoop(this.selectedPad, e.target.checked);
            }
        });

        // Reverse toggle
        document.getElementById('reverse-toggle').addEventListener('change', (e) => {
            if (this.selectedPad !== null) {
                this.audioEngine.setReverse(this.selectedPad, e.target.checked);
            }
        });

        // Volume slider
        document.getElementById('volume-slider').addEventListener('input', (e) => {
            const value = parseInt(e.target.value) / 100;
            if (this.selectedPad !== null) {
                this.audioEngine.setVolume(this.selectedPad, value);
                document.getElementById('volume-value').textContent = `${e.target.value}%`;
            }
        });

        // Pitch slider
        document.getElementById('pitch-slider').addEventListener('input', (e) => {
            const value = parseInt(e.target.value) / 100;
            if (this.selectedPad !== null) {
                this.audioEngine.setPitch(this.selectedPad, value);
                document.getElementById('pitch-value').textContent = `${value.toFixed(2)}x`;
            }
        });

        // Attack slider
        document.getElementById('attack-slider').addEventListener('input', (e) => {
            const value = parseInt(e.target.value) / 1000; // Convert ms to seconds
            if (this.selectedPad !== null) {
                this.audioEngine.setAttack(this.selectedPad, value);
                document.getElementById('attack-value').textContent = `${e.target.value}ms`;
            }
        });

        // Release slider
        document.getElementById('release-slider').addEventListener('input', (e) => {
            const value = parseInt(e.target.value) / 1000; // Convert ms to seconds
            if (this.selectedPad !== null) {
                this.audioEngine.setRelease(this.selectedPad, value);
                document.getElementById('release-value').textContent = `${e.target.value}ms`;
            }
        });

        // Reset button
        document.getElementById('reset-pad-settings').addEventListener('click', () => {
            if (this.selectedPad !== null) {
                this.audioEngine.resetPadSettings(this.selectedPad);
                this.updatePadSettingsUI(this.selectedPad);
            }
        });
    }

    /**
     * Show pad settings panel and populate with current values
     * @param {number} padIndex - Pad index
     */
    showPadSettings(padIndex) {
        const panel = document.getElementById('pad-settings');
        panel.classList.remove('hidden');
        document.getElementById('settings-pad-number').textContent = padIndex;
        this.updatePadSettingsUI(padIndex);
    }

    /**
     * Hide pad settings panel
     */
    hidePadSettings() {
        document.getElementById('pad-settings').classList.add('hidden');
    }

    /**
     * Update all pad settings UI controls to reflect current engine values
     * @param {number} padIndex - Pad index
     */
    updatePadSettingsUI(padIndex) {
        const settings = this.audioEngine.getPadSettings(padIndex);

        // Update play mode buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === settings.playMode);
        });

        // Update loop toggle
        document.getElementById('loop-toggle').checked = settings.loop;

        // Update reverse toggle
        document.getElementById('reverse-toggle').checked = settings.reverse;

        // Update volume slider
        const volumePercent = Math.round(settings.volume * 100);
        document.getElementById('volume-slider').value = volumePercent;
        document.getElementById('volume-value').textContent = `${volumePercent}%`;

        // Update pitch slider
        const pitchPercent = Math.round(settings.pitch * 100);
        document.getElementById('pitch-slider').value = pitchPercent;
        document.getElementById('pitch-value').textContent = `${settings.pitch.toFixed(2)}x`;

        // Update attack slider
        const attackMs = Math.round(settings.attack * 1000);
        document.getElementById('attack-slider').value = attackMs;
        document.getElementById('attack-value').textContent = `${attackMs}ms`;

        // Update release slider
        const releaseMs = Math.round(settings.release * 1000);
        document.getElementById('release-slider').value = releaseMs;
        document.getElementById('release-value').textContent = `${releaseMs}ms`;
    }
}
