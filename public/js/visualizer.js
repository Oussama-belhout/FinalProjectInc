/**
 * Visualizer Class
 * Handles dynamic audio visualization (oscilloscope/frequency)
 */
class Visualizer {
    constructor(audioEngine, canvasId) {
        this.audioEngine = audioEngine;
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isRunning = false;

        // Resize canvas to match display size
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.draw();
    }

    stop() {
        this.isRunning = false;
    }

    draw() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this.draw());

        const width = this.canvas.width;
        const height = this.canvas.height;
        const data = this.audioEngine.getAnalyserData();

        // Clear canvas
        this.ctx.fillStyle = 'rgba(18, 18, 18, 0.2)'; // Fade effect
        this.ctx.fillRect(0, 0, width, height);

        if (!data) return;

        // Draw oscilloscope
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#00ff88'; // Accent color
        this.ctx.beginPath();

        const sliceWidth = width * 1.0 / data.length;
        let x = 0;

        for (let i = 0; i < data.length; i++) {
            const v = data[i] / 128.0; // Normalize 0-255 to 0-2 approx
            const y = v * height / 2;

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.ctx.lineTo(width, height / 2);
        this.ctx.stroke();
    }
}
