/**
 * AudioEngine Class
 * Handles all Web Audio API operations
 * Designed to be headless (no GUI dependencies)
 */
class AudioEngine {
    constructor() {
        // Audio context will be initialized on user interaction
        this.audioContext = null;
        
        // Buffer storage for 16 pads
        this.buffers = new Array(16).fill(null);
        
        // Trim values for each pad (0-1 range)
        this.trimStart = new Array(16).fill(0);
        this.trimEnd = new Array(16).fill(1);
        
        // Analyser node for visualization
        this.analyser = null;
        this.analyserData = null;
    }

    /**
     * Initialize the audio engine
     * Creates the AudioContext (must be called after user interaction)
     */
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('🔊 AudioContext initialized, state:', this.audioContext.state);
            
            // Resume context if suspended (browser autoplay policy)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Create analyser node for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Connect analyser to destination
            this.analyser.connect(this.audioContext.destination);
            
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize AudioContext:', error);
            return false;
        }
    }

    /**
     * Load a sound from URL into a specific pad
     * @param {string} url - URL of the audio file
     * @param {number} padIndex - Pad index (0-15)
     * @returns {Promise<boolean>} - Success status
     */
    async loadSound(url, padIndex) {
        if (padIndex < 0 || padIndex > 15) {
            console.error('❌ Invalid pad index:', padIndex);
            return false;
        }

        try {
            console.log(`📥 Loading sound for pad ${padIndex}: ${url}`);
            
            // Use proxy for external URLs to bypass CORS
            let fetchUrl = url;
            if (url.startsWith('http://') || url.startsWith('https://')) {
                fetchUrl = `/api/proxy-audio?url=${encodeURIComponent(url)}`;
            }
            
            // Fetch the audio file
            const response = await fetch(fetchUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Get array buffer from response
            const arrayBuffer = await response.arrayBuffer();
            
            // Decode the audio data
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Store in buffers array
            this.buffers[padIndex] = audioBuffer;
            
            console.log(`✅ Sound loaded for pad ${padIndex}`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to load sound for pad ${padIndex}:`, error);
            return false;
        }
    }

    /**
     * Play the sound loaded in a specific pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {boolean} - Whether playback started
     */
    playSound(padIndex) {
        if (padIndex < 0 || padIndex > 15) {
            console.error('❌ Invalid pad index:', padIndex);
            return false;
        }

        const buffer = this.buffers[padIndex];
        if (!buffer) {
            console.warn(`⚠️ No sound loaded for pad ${padIndex}`);
            return false;
        }

        try {
            // Create a buffer source node
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            
            // Connect through analyser for visualization
            if (this.analyser) {
                source.connect(this.analyser);
            } else {
                source.connect(this.audioContext.destination);
            }
            
            // Calculate trim offsets
            const duration = buffer.duration;
            const startTime = this.trimStart[padIndex] * duration;
            const endTime = this.trimEnd[padIndex] * duration;
            const playDuration = endTime - startTime;
            
            // Play with trim applied
            source.start(0, startTime, playDuration);
            
            console.log(`▶️ Playing pad ${padIndex} (${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s)`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to play pad ${padIndex}:`, error);
            return false;
        }
    }

    /**
     * Fetch all available presets from the server
     * @returns {Promise<Array>} - Array of preset metadata
     */
    async fetchPresets() {
        try {
            const response = await fetch('/api/presets');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const presets = await response.json();
            console.log('📋 Fetched presets:', presets);
            return presets;
        } catch (error) {
            console.error('❌ Failed to fetch presets:', error);
            return [];
        }
    }

    /**
     * Load a preset by ID - loads all sounds into their designated pads
     * @param {string} presetId - The preset ID to load
     * @param {Function} onPadLoaded - Callback when each pad is loaded (padIndex, success)
     * @param {Function} onProgress - Callback for progress updates (loaded, total)
     * @returns {Promise<boolean>} - Success status
     */
    async loadPreset(presetId, onPadLoaded = null, onProgress = null) {
        try {
            console.log(`📦 Loading preset: ${presetId}`);
            
            // Fetch preset data
            const response = await fetch(`/api/presets/${presetId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const preset = await response.json();
            
            // Clear existing buffers
            this.buffers = new Array(16).fill(null);
            
            const totalSounds = preset.sounds.length;
            let loadedSounds = 0;
            
            // Initial progress callback
            if (onProgress) {
                onProgress(0, totalSounds);
            }
            
            // Load each sound
            for (const sound of preset.sounds) {
                const success = await this.loadSound(sound.url, sound.pad);
                loadedSounds++;
                
                if (onPadLoaded) {
                    onPadLoaded(sound.pad, success);
                }
                
                if (onProgress) {
                    onProgress(loadedSounds, totalSounds);
                }
            }
            
            console.log(`✅ Preset "${preset.name}" loaded!`);
            return true;
        } catch (error) {
            console.error('❌ Failed to load preset:', error);
            return false;
        }
    }

    /**
     * Get current analyser data for visualization
     * @returns {Uint8Array|null} - Time domain data array
     */
    getAnalyserData() {
        if (!this.analyser || !this.analyserData) {
            return null;
        }
        this.analyser.getByteTimeDomainData(this.analyserData);
        return this.analyserData;
    }

    /**
     * Set trim start point for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @param {number} value - Start value (0-1)
     */
    setTrimStart(padIndex, value) {
        if (padIndex < 0 || padIndex > 15) return;
        this.trimStart[padIndex] = Math.max(0, Math.min(value, this.trimEnd[padIndex] - 0.01));
    }

    /**
     * Set trim end point for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @param {number} value - End value (0-1)
     */
    setTrimEnd(padIndex, value) {
        if (padIndex < 0 || padIndex > 15) return;
        this.trimEnd[padIndex] = Math.min(1, Math.max(value, this.trimStart[padIndex] + 0.01));
    }

    /**
     * Get trim values for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {Object} - {start, end} values (0-1)
     */
    getTrimValues(padIndex) {
        return {
            start: this.trimStart[padIndex],
            end: this.trimEnd[padIndex]
        };
    }

    /**
     * Get buffer waveform data for visualization
     * @param {number} padIndex - Pad index (0-15)
     * @returns {Float32Array|null} - Waveform data
     */
    getBufferData(padIndex) {
        const buffer = this.buffers[padIndex];
        if (!buffer) return null;
        return buffer.getChannelData(0);
    }

    /**
     * Check if a pad has a sound loaded
     * @param {number} padIndex - Pad index (0-15)
     * @returns {boolean}
     */
    hasSound(padIndex) {
        return this.buffers[padIndex] !== null;
    }
}
