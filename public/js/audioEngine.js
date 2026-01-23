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
            
            // Store original URL for preset saving
            this.soundUrls[padIndex] = url;
            
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
     * Run headless test - proves the engine works without any GUI
     * @param {string} testPresetId - Optional preset ID to load for testing
     * @returns {Promise<Object>} - Test results
     */
    async runHeadlessTest(testPresetId = null) {
        console.log('🧪 ═══════════════════════════════════════════');
        console.log('🧪 HEADLESS AUDIO ENGINE TEST');
        console.log('🧪 ═══════════════════════════════════════════');
        
        const results = {
            timestamp: new Date().toISOString(),
            tests: [],
            passed: 0,
            failed: 0
        };

        // Test 1: Initialization
        console.log('\n📋 Test 1: AudioContext Initialization');
        try {
            const initResult = await this.init();
            results.tests.push({
                name: 'AudioContext Initialization',
                passed: initResult && this.audioContext !== null,
                details: `State: ${this.getState()}`
            });
            if (initResult) {
                console.log('   ✅ PASSED - AudioContext created');
                results.passed++;
            } else {
                console.log('   ❌ FAILED - Could not create AudioContext');
                results.failed++;
            }
        } catch (error) {
            console.log('   ❌ FAILED -', error.message);
            results.tests.push({ name: 'AudioContext Initialization', passed: false, error: error.message });
            results.failed++;
        }

        // Test 2: Fetch Presets
        console.log('\n📋 Test 2: Fetch Presets from API');
        try {
            const presets = await this.fetchPresets();
            const passed = Array.isArray(presets);
            results.tests.push({
                name: 'Fetch Presets',
                passed,
                details: `Found ${presets.length} presets`
            });
            if (passed) {
                console.log(`   ✅ PASSED - Found ${presets.length} presets`);
                presets.forEach(p => console.log(`      - ${p.id}: ${p.name} (${p.category})`));
                results.passed++;
            } else {
                console.log('   ❌ FAILED - Invalid response');
                results.failed++;
            }
        } catch (error) {
            console.log('   ❌ FAILED -', error.message);
            results.tests.push({ name: 'Fetch Presets', passed: false, error: error.message });
            results.failed++;
        }

        // Test 3: Load Preset (if available)
        if (testPresetId) {
            console.log(`\n📋 Test 3: Load Preset "${testPresetId}"`);
            try {
                const loaded = await this.loadPreset(testPresetId);
                const loadedCount = this.buffers.filter(b => b !== null).length;
                results.tests.push({
                    name: 'Load Preset',
                    passed: loaded,
                    details: `Loaded ${loadedCount} sounds`
                });
                if (loaded) {
                    console.log(`   ✅ PASSED - Loaded ${loadedCount} sounds`);
                    results.passed++;
                } else {
                    console.log('   ❌ FAILED - Could not load preset');
                    results.failed++;
                }
            } catch (error) {
                console.log('   ❌ FAILED -', error.message);
                results.tests.push({ name: 'Load Preset', passed: false, error: error.message });
                results.failed++;
            }
        }

        // Test 4: Play sounds (if loaded)
        const loadedPads = this.buffers.map((b, i) => b !== null ? i : -1).filter(i => i >= 0);
        if (loadedPads.length > 0) {
            console.log(`\n📋 Test 4: Play Sounds (pads: ${loadedPads.join(', ')})`);
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
                console.log(`   ✅ PASSED - Played ${playedCount} sounds`);
                results.passed++;
            } else {
                console.log('   ❌ FAILED - Could not play sounds');
                results.failed++;
            }
        }

        // Test 5: Trim controls
        console.log('\n📋 Test 5: Trim Controls');
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
            console.log(`   ✅ PASSED - Trim: ${trimValues.start} - ${trimValues.end}`);
            results.passed++;
        } else {
            console.log('   ❌ FAILED - Trim values incorrect');
            results.failed++;
        }

        // Test 6: Engine Status
        console.log('\n📋 Test 6: Engine Status');
        const status = this.getStatus();
        const statusPassed = status.initialized === true;
        results.tests.push({
            name: 'Engine Status',
            passed: statusPassed,
            details: status
        });
        if (statusPassed) {
            console.log('   ✅ PASSED - Engine status retrieved');
            console.log(`      Initialized: ${status.initialized}`);
            console.log(`      State: ${status.state}`);
            console.log(`      Loaded Pads: ${status.loadedPads}`);
            results.passed++;
        } else {
            console.log('   ❌ FAILED - Engine not properly initialized');
            results.failed++;
        }

        // Summary
        console.log('\n🧪 ═══════════════════════════════════════════');
        console.log(`🧪 TEST SUMMARY: ${results.passed} passed, ${results.failed} failed`);
        console.log('🧪 ═══════════════════════════════════════════\n');

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
