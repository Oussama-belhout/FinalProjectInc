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

        // URL storage for saving presets
        this.soundUrls = new Array(16).fill(null);

        // Trim values for each pad (0-1 range)
        this.trimStart = new Array(16).fill(0);
        this.trimEnd = new Array(16).fill(1);

        // === NEW SAMPLER FEATURES ===
        // Loop settings for each pad
        this.loopEnabled = new Array(16).fill(false);
        
        // Pitch/playback rate for each pad (1.0 = normal, 0.5 = half speed, 2.0 = double)
        this.pitch = new Array(16).fill(1.0);
        
        // Volume for each pad (0.0 - 1.0)
        this.volume = new Array(16).fill(1.0);
        
        // Reverse playback for each pad
        this.reverse = new Array(16).fill(false);
        
        // Play mode: 'oneshot' (full sample) or 'gate' (play while held)
        this.playMode = new Array(16).fill('oneshot');
        
        // ADSR envelope settings (in seconds)
        this.attack = new Array(16).fill(0.01);
        this.release = new Array(16).fill(0.1);
        
        // Active source nodes for stopping (needed for gate mode and loops)
        this.activeSources = new Array(16).fill(null);
        this.activeGains = new Array(16).fill(null);
        // === END NEW FEATURES ===

        // Analyser node for visualization
        this.analyser = null;
        this.analyserData = null;

        // === TRACK RECORDING ===
        this.trackRecorder = null;
        this.trackRecordingChunks = [];
        this.trackRecordedBlob = null;
        this.isRecordingTrack = false;
        this.masterGain = null;
        this.recordDestination = null;
    }

    /**
     * Initialize the audio engine
     * Creates the AudioContext (must be called after user interaction)
     */
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('[Audio] AudioContext initialized, state:', this.audioContext.state);

            // Resume context if suspended (browser autoplay policy)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Create master gain node for all audio output
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 1.0;

            // Create analyser node for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            this.analyserData = new Uint8Array(this.analyser.frequencyBinCount);

            // Audio routing: sources -> masterGain -> analyser -> destination
            this.masterGain.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            // Create media stream destination for track recording
            this.recordDestination = this.audioContext.createMediaStreamDestination();
            this.masterGain.connect(this.recordDestination);

            return true;
        } catch (error) {
            console.error('[Error] Failed to initialize AudioContext:', error);
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
            console.error('[Error] Invalid pad index:', padIndex);
            return false;
        }

        try {
            console.log(`[Loading] Sound for pad ${padIndex}: ${url}`);

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

            // Store original URL for preset saving
            this.soundUrls[padIndex] = url;

            console.log(`[OK] Sound loaded for pad ${padIndex}`);
            return true;
        } catch (error) {
            console.error(`[Error] Failed to load sound for pad ${padIndex}:`, error);
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
            console.error('[Error] Invalid pad index:', padIndex);
            return false;
        }

        const buffer = this.buffers[padIndex];
        if (!buffer) {
            console.warn(`[Warning] No sound loaded for pad ${padIndex}`);
            return false;
        }

        try {
            // Stop any existing playback on this pad
            this.stopSound(padIndex);

            // Get the buffer to play (reversed if needed)
            let playBuffer = buffer;
            if (this.reverse[padIndex]) {
                playBuffer = this.getReversedBuffer(buffer);
            }

            // Create a buffer source node
            const source = this.audioContext.createBufferSource();
            source.buffer = playBuffer;
            
            // Apply pitch/playback rate
            source.playbackRate.value = this.pitch[padIndex];
            
            // Apply loop setting
            source.loop = this.loopEnabled[padIndex];

            // Create gain node for volume and envelope
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 0;
            
            // Apply attack envelope
            const now = this.audioContext.currentTime;
            const attackTime = this.attack[padIndex];
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(this.volume[padIndex], now + attackTime);

            // Connect nodes: source -> gain -> masterGain (which routes to analyser/destination)
            source.connect(gainNode);
            if (this.masterGain) {
                gainNode.connect(this.masterGain);
            } else if (this.analyser) {
                gainNode.connect(this.analyser);
            } else {
                gainNode.connect(this.audioContext.destination);
            }

            // Calculate trim offsets
            const duration = playBuffer.duration;
            const startTime = this.trimStart[padIndex] * duration;
            const endTime = this.trimEnd[padIndex] * duration;
            const playDuration = endTime - startTime;

            // Set loop points if looping
            if (source.loop) {
                source.loopStart = startTime;
                source.loopEnd = endTime;
            }

            // Play with trim applied
            if (source.loop) {
                source.start(0, startTime);
            } else {
                source.start(0, startTime, playDuration);
            }

            // Store references for stopping
            this.activeSources[padIndex] = source;
            this.activeGains[padIndex] = gainNode;

            // Handle end of playback (for non-looping)
            source.onended = () => {
                if (this.activeSources[padIndex] === source) {
                    this.activeSources[padIndex] = null;
                    this.activeGains[padIndex] = null;
                }
            };

            console.log(`[Play] Pad ${padIndex} (${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s) | Loop: ${source.loop} | Pitch: ${this.pitch[padIndex]} | Vol: ${this.volume[padIndex]}`);
            return true;
        } catch (error) {
            console.error(`[Error] Failed to play pad ${padIndex}:`, error);
            return false;
        }
    }

    /**
     * Stop the sound playing on a specific pad
     * @param {number} padIndex - Pad index (0-15)
     * @param {boolean} useRelease - Whether to apply release envelope
     */
    stopSound(padIndex, useRelease = false) {
        if (padIndex < 0 || padIndex > 15) return;

        const source = this.activeSources[padIndex];
        const gain = this.activeGains[padIndex];

        if (source && gain) {
            try {
                if (useRelease) {
                    // Apply release envelope
                    const now = this.audioContext.currentTime;
                    const releaseTime = this.release[padIndex];
                    gain.gain.cancelScheduledValues(now);
                    gain.gain.setValueAtTime(gain.gain.value, now);
                    gain.gain.linearRampToValueAtTime(0, now + releaseTime);
                    source.stop(now + releaseTime);
                } else {
                    source.stop();
                }
            } catch (e) {
                // Source may have already stopped
            }
            this.activeSources[padIndex] = null;
            this.activeGains[padIndex] = null;
        }
    }

    /**
     * Check if a pad is currently playing
     * @param {number} padIndex - Pad index (0-15)
     * @returns {boolean}
     */
    isPlaying(padIndex) {
        return this.activeSources[padIndex] !== null;
    }

    /**
     * Stop all currently playing sounds
     * @param {boolean} useRelease - Whether to apply release envelope
     */
    stopAllSounds(useRelease = false) {
        for (let i = 0; i < 16; i++) {
            if (this.isPlaying(i)) {
                this.stopSound(i, useRelease);
            }
        }
        console.log('[Stop] Stopped all sounds');
    }

    /**
     * Create a reversed copy of an AudioBuffer
     * @param {AudioBuffer} buffer - Original buffer
     * @returns {AudioBuffer} - Reversed buffer
     */
    getReversedBuffer(buffer) {
        const reversed = this.audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const original = buffer.getChannelData(channel);
            const reversedData = reversed.getChannelData(channel);
            for (let i = 0; i < buffer.length; i++) {
                reversedData[i] = original[buffer.length - 1 - i];
            }
        }
        return reversed;
    }

    // =============================================
    // TRACK RECORDING METHODS
    // =============================================

    /**
     * Start recording all audio output as a track
     * @returns {boolean} - Whether recording started
     */
    startTrackRecording() {
        if (!this.audioContext || !this.recordDestination) {
            console.error('[Error] Audio context not initialized');
            return false;
        }

        if (this.isRecordingTrack) {
            console.warn('[Warning] Already recording track');
            return false;
        }

        try {
            this.trackRecordingChunks = [];
            this.trackRecorder = new MediaRecorder(this.recordDestination.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.trackRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.trackRecordingChunks.push(event.data);
                }
            };

            this.trackRecorder.onstop = () => {
                this.trackRecordedBlob = new Blob(this.trackRecordingChunks, { type: 'audio/webm' });
                console.log('[Track] Recording saved, size:', this.trackRecordedBlob.size);
            };

            this.trackRecorder.start(100); // Collect data every 100ms
            this.isRecordingTrack = true;
            console.log('[Track] Recording started');
            return true;
        } catch (error) {
            console.error('[Error] Failed to start track recording:', error);
            return false;
        }
    }

    /**
     * Stop recording the track
     * @returns {Promise<Blob>} - The recorded audio blob
     */
    stopTrackRecording() {
        return new Promise((resolve) => {
            if (!this.isRecordingTrack || !this.trackRecorder) {
                resolve(null);
                return;
            }

            this.trackRecorder.onstop = () => {
                this.trackRecordedBlob = new Blob(this.trackRecordingChunks, { type: 'audio/webm' });
                this.isRecordingTrack = false;
                console.log('[Track] Recording stopped');
                resolve(this.trackRecordedBlob);
            };

            this.trackRecorder.stop();
        });
    }

    /**
     * Play the recorded track
     * @returns {Promise<void>}
     */
    async playRecordedTrack() {
        if (!this.trackRecordedBlob) {
            console.warn('[Warning] No recorded track to play');
            return null;
        }

        const arrayBuffer = await this.trackRecordedBlob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        source.start();
        
        console.log('[Track] Playing recorded track');
        return source;
    }

    /**
     * Get the recorded track as a downloadable blob
     * @returns {Blob|null}
     */
    getRecordedTrack() {
        return this.trackRecordedBlob;
    }

    /**
     * Check if currently recording track
     * @returns {boolean}
     */
    isTrackRecording() {
        return this.isRecordingTrack;
    }

    /**
     * Fetch all available presets from the server
     * @returns {Promise<Array>} - Array of preset metadata
     */
    async fetchPresets() {
        try {
            // Include auth header if user is logged in
            const headers = window.Auth ? window.Auth.getAuthHeader() : {};
            const response = await fetch('/api/presets', { headers });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const presets = await response.json();
            console.log('[Presets] Fetched presets:', presets);
            return presets;
        } catch (error) {
            console.error('[Error] Failed to fetch presets:', error);
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
            console.log(`[Preset] Loading preset: ${presetId}`);

            // Fetch preset data with auth header
            const headers = window.Auth ? window.Auth.getAuthHeader() : {};
            const response = await fetch(`/api/presets/${presetId}`, { headers });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const preset = await response.json();

            // Clear existing buffers and URLs
            this.buffers = new Array(16).fill(null);
            this.soundUrls = new Array(16).fill(null);

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

            console.log(`[OK] Preset "${preset.name}" loaded!`);
            return true;
        } catch (error) {
            console.error('[Error] Failed to load preset:', error);
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

    // === NEW SAMPLER FEATURE METHODS ===

    /**
     * Set loop enabled for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @param {boolean} enabled - Loop enabled state
     */
    setLoop(padIndex, enabled) {
        if (padIndex < 0 || padIndex > 15) return;
        this.loopEnabled[padIndex] = enabled;
    }

    /**
     * Get loop enabled state for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {boolean}
     */
    getLoop(padIndex) {
        return this.loopEnabled[padIndex];
    }

    /**
     * Set pitch/playback rate for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @param {number} value - Pitch value (0.25 - 4.0, 1.0 = normal)
     */
    setPitch(padIndex, value) {
        if (padIndex < 0 || padIndex > 15) return;
        this.pitch[padIndex] = Math.max(0.25, Math.min(4.0, value));
        // Update live if playing
        if (this.activeSources[padIndex]) {
            this.activeSources[padIndex].playbackRate.value = this.pitch[padIndex];
        }
    }

    /**
     * Get pitch value for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {number}
     */
    getPitch(padIndex) {
        return this.pitch[padIndex];
    }

    /**
     * Set volume for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @param {number} value - Volume value (0.0 - 1.0)
     */
    setVolume(padIndex, value) {
        if (padIndex < 0 || padIndex > 15) return;
        this.volume[padIndex] = Math.max(0, Math.min(1, value));
        // Update live if playing
        if (this.activeGains[padIndex]) {
            this.activeGains[padIndex].gain.value = this.volume[padIndex];
        }
    }

    /**
     * Get volume for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {number}
     */
    getVolume(padIndex) {
        return this.volume[padIndex];
    }

    /**
     * Set reverse playback for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @param {boolean} enabled - Reverse enabled state
     */
    setReverse(padIndex, enabled) {
        if (padIndex < 0 || padIndex > 15) return;
        this.reverse[padIndex] = enabled;
    }

    /**
     * Get reverse state for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {boolean}
     */
    getReverse(padIndex) {
        return this.reverse[padIndex];
    }

    /**
     * Set play mode for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @param {string} mode - 'oneshot' or 'gate'
     */
    setPlayMode(padIndex, mode) {
        if (padIndex < 0 || padIndex > 15) return;
        if (mode === 'oneshot' || mode === 'gate') {
            this.playMode[padIndex] = mode;
        }
    }

    /**
     * Get play mode for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {string}
     */
    getPlayMode(padIndex) {
        return this.playMode[padIndex];
    }

    /**
     * Set attack time for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @param {number} value - Attack time in seconds (0.001 - 2.0)
     */
    setAttack(padIndex, value) {
        if (padIndex < 0 || padIndex > 15) return;
        this.attack[padIndex] = Math.max(0.001, Math.min(2.0, value));
    }

    /**
     * Get attack time for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {number}
     */
    getAttack(padIndex) {
        return this.attack[padIndex];
    }

    /**
     * Set release time for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @param {number} value - Release time in seconds (0.001 - 5.0)
     */
    setRelease(padIndex, value) {
        if (padIndex < 0 || padIndex > 15) return;
        this.release[padIndex] = Math.max(0.001, Math.min(5.0, value));
    }

    /**
     * Get release time for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {number}
     */
    getRelease(padIndex) {
        return this.release[padIndex];
    }

    /**
     * Get all settings for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {Object} - All pad settings
     */
    getPadSettings(padIndex) {
        return {
            loop: this.loopEnabled[padIndex],
            pitch: this.pitch[padIndex],
            volume: this.volume[padIndex],
            reverse: this.reverse[padIndex],
            playMode: this.playMode[padIndex],
            attack: this.attack[padIndex],
            release: this.release[padIndex],
            trimStart: this.trimStart[padIndex],
            trimEnd: this.trimEnd[padIndex]
        };
    }

    /**
     * Reset all settings for a pad to defaults
     * @param {number} padIndex - Pad index (0-15)
     */
    resetPadSettings(padIndex) {
        if (padIndex < 0 || padIndex > 15) return;
        this.loopEnabled[padIndex] = false;
        this.pitch[padIndex] = 1.0;
        this.volume[padIndex] = 1.0;
        this.reverse[padIndex] = false;
        this.playMode[padIndex] = 'oneshot';
        this.attack[padIndex] = 0.01;
        this.release[padIndex] = 0.1;
        this.trimStart[padIndex] = 0;
        this.trimEnd[padIndex] = 1;
    }

    // === END NEW SAMPLER FEATURE METHODS ===

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

    /**
     * Get the sound URL for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {string|null}
     */
    getSoundUrl(padIndex) {
        return this.soundUrls[padIndex];
    }

    /**
     * Get buffer duration for a pad
     * @param {number} padIndex - Pad index (0-15)
     * @returns {number} - Duration in seconds, or 0 if no buffer
     */
    getBufferDuration(padIndex) {
        const buffer = this.buffers[padIndex];
        return buffer ? buffer.duration : 0;
    }

    /**
     * Get audio context state
     * @returns {string} - State: 'running', 'suspended', 'closed', or 'uninitialized'
     */
    getState() {
        return this.audioContext ? this.audioContext.state : 'uninitialized';
    }

    /**
     * Get engine status for debugging
     * @returns {Object} - Engine status information
     */
    getStatus() {
        return {
            initialized: this.audioContext !== null,
            state: this.getState(),
            loadedPads: this.buffers.filter(b => b !== null).length,
            pads: this.buffers.map((buffer, index) => ({
                index,
                loaded: buffer !== null,
                duration: buffer ? buffer.duration.toFixed(2) + 's' : null,
                url: this.soundUrls[index],
                trimStart: this.trimStart[index],
                trimEnd: this.trimEnd[index]
            }))
        };
    }

    /**
     * Initialize recording (request microphone access)
     * @returns {Promise<boolean>}
     */
    async initRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            console.log('[Mic] Microphone access granted');
            return true;
        } catch (error) {
            console.error('[Error] Microphone access denied:', error);
            return false;
        }
    }

    /**
     * Start recording
     */
    startRecording() {
        if (!this.mediaRecorder) return false;
        this.audioChunks = [];
        this.mediaRecorder.start();
        console.log('[Rec] Recording started');
        return true;
    }

    /**
     * Stop recording and return the audio buffer
     * @returns {Promise<AudioBuffer|null>}
     */
    stopRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                const arrayBuffer = await audioBlob.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                console.log('[Rec] Recording stopped, buffer created');
                resolve(audioBuffer);
            };

            this.mediaRecorder.stop();
        });
    }

    /**
     * Load a raw AudioBuffer into a pad
     * @param {AudioBuffer} buffer 
     * @param {number} padIndex 
     */
    loadBuffer(buffer, padIndex) {
        if (padIndex < 0 || padIndex > 15) return false;
        this.buffers[padIndex] = buffer;
        this.soundUrls[padIndex] = 'recorded-audio'; // Placeholder
        this.trimStart[padIndex] = 0;
        this.trimEnd[padIndex] = 1;
        return true;
    }

    /**
     * Run headless test - proves the engine works without any GUI
     * @param {string} testPresetId - Optional preset ID to load for testing
     * @returns {Promise<Object>} - Test results
     */
    async runHeadlessTest(testPresetId = null) {
        console.log('=== HEADLESS AUDIO ENGINE TEST ===');
        console.log('===================================');
        console.log('===================================');

        const results = {
            timestamp: new Date().toISOString(),
            tests: [],
            passed: 0,
            failed: 0
        };

        // Test 1: Initialization
        console.log('\n[Test 1] AudioContext Initialization');
        try {
            const initResult = await this.init();
            results.tests.push({
                name: 'AudioContext Initialization',
                passed: initResult && this.audioContext !== null,
                details: `State: ${this.getState()}`
            });
            if (initResult) {
                console.log('   [PASS] AudioContext created');
                results.passed++;
            } else {
                console.log('   [FAIL] Could not create AudioContext');
                results.failed++;
            }
        } catch (error) {
            console.log('   [FAIL]', error.message);
            results.tests.push({ name: 'AudioContext Initialization', passed: false, error: error.message });
            results.failed++;
        }

        // Test 2: Fetch Presets
        console.log('\n[Test 2] Fetch Presets from API');
        try {
            const presets = await this.fetchPresets();
            const passed = Array.isArray(presets);
            results.tests.push({
                name: 'Fetch Presets',
                passed,
                details: `Found ${presets.length} presets`
            });
            if (passed) {
                console.log(`   [PASS] Found ${presets.length} presets`);
                presets.forEach(p => console.log(`      - ${p.id}: ${p.name} (${p.category})`));
                results.passed++;
            } else {
                console.log('   [FAIL] Invalid response');
                results.failed++;
            }
        } catch (error) {
            console.log('   [FAIL]', error.message);
            results.tests.push({ name: 'Fetch Presets', passed: false, error: error.message });
            results.failed++;
        }

        // Test 3: Load Preset (if available)
        if (testPresetId) {
            console.log(`\n[Test 3] Load Preset "${testPresetId}"`);
            try {
                const loaded = await this.loadPreset(testPresetId);
                const loadedCount = this.buffers.filter(b => b !== null).length;
                results.tests.push({
                    name: 'Load Preset',
                    passed: loaded,
                    details: `Loaded ${loadedCount} sounds`
                });
                if (loaded) {
                    console.log(`   [PASS] Loaded ${loadedCount} sounds`);
                    results.passed++;
                } else {
                    console.log('   [FAIL] Could not load preset');
                    results.failed++;
                }
            } catch (error) {
                console.log('   [FAIL]', error.message);
                results.tests.push({ name: 'Load Preset', passed: false, error: error.message });
                results.failed++;
            }
        }

        // Test 4: Play sounds (if loaded)
        const loadedPads = this.buffers.map((b, i) => b !== null ? i : -1).filter(i => i >= 0);
        if (loadedPads.length > 0) {
            console.log(`\n[Test 4] Play Sounds (pads: ${loadedPads.join(', ')})`);
            let playedCount = 0;
            for (const padIndex of loadedPads.slice(0, 3)) { // Test up to 3 pads
                const played = this.playSound(padIndex);
                if (played) playedCount++;
            }
            const passed = playedCount > 0;
            results.tests.push({
                name: 'Play Sounds',
                passed,
                details: `Played ${playedCount}/${Math.min(loadedPads.length, 3)} sounds`
            });
            if (passed) {
                console.log(`   [PASS] Played ${playedCount} sounds`);
                results.passed++;
            } else {
                console.log('   [FAIL] Could not play sounds');
                results.failed++;
            }
        }

        // Test 5: Trim controls
        console.log('\n[Test 5] Trim Controls');
        this.setTrimStart(0, 0.1);
        this.setTrimEnd(0, 0.9);
        const trimValues = this.getTrimValues(0);
        const trimPassed = trimValues.start === 0.1 && trimValues.end === 0.9;
        results.tests.push({
            name: 'Trim Controls',
            passed: trimPassed,
            details: `Start: ${trimValues.start}, End: ${trimValues.end}`
        });
        if (trimPassed) {
            console.log(`   [PASS] Trim: ${trimValues.start} - ${trimValues.end}`);
            results.passed++;
        } else {
            console.log('   [FAIL] Trim values incorrect');
            results.failed++;
        }

        // Test 6: Engine Status
        console.log('\n[Test 6] Engine Status');
        const status = this.getStatus();
        const statusPassed = status.initialized === true;
        results.tests.push({
            name: 'Engine Status',
            passed: statusPassed,
            details: status
        });
        if (statusPassed) {
            console.log('   [PASS] Engine status retrieved');
            console.log(`      Initialized: ${status.initialized}`);
            console.log(`      State: ${status.state}`);
            console.log(`      Loaded Pads: ${status.loadedPads}`);
            results.passed++;
        } else {
            console.log('   [FAIL] Engine not properly initialized');
            results.failed++;
        }

        // Summary
        console.log('\n=== TEST SUMMARY ===');
        console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed`);
        console.log('===================================\n');

        results.summary = {
            total: results.passed + results.failed,
            passed: results.passed,
            failed: results.failed,
            success: results.failed === 0
        };

        return results;
    }
}

// Export for Node.js / module environments (if available)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioEngine;
}
