/**
 * Application Entry Point
 * Initializes AudioEngine and GUI
 * This is the sampler application - read-only preset consumer
 */

// Global instances
let audioEngine;
let gui;

// Category text labels (professional UI)
const CATEGORY_ICONS = {
    'Drums': 'DR',
    'Electronic': 'EL',
    'Percussion': 'PE',
    'FX': 'FX',
    'Vocals': 'VO',
    'Bass': 'BA',
    'Synth': 'SY',
    'World': 'WO',
    'Custom': 'CU',
    'Uncategorized': '--'
};

/**
 * Initialize the application
 */
async function initApp() {
    console.log('[Sampler] Initializing...');

    // Create instances
    audioEngine = new AudioEngine();
    gui = new GUI(audioEngine);

    // Initialize GUI
    gui.init();

    // Initialize Visualizer
    const visualizer = new Visualizer(audioEngine, 'visualizer');
    visualizer.start();

    // Setup preset controls
    await setupPresetControls();

    // Setup recording controls
    setupRecordingControls();

    // Setup upload controls
    setupUploadControls();

    // Setup keyboard overlay toggle
    setupKeyboardOverlay();

    // Setup track recording controls
    setupTrackRecording();

    // Hide test button since we have presets now
    document.getElementById('test-section').style.display = 'none';

    console.log('[Sampler] Ready! Select a preset and click Load.');
}

/**
 * Setup preset dropdown and load button
 */
async function setupPresetControls() {
    const presetSelect = document.getElementById('preset-select');
    const loadBtn = document.getElementById('load-btn');
    const loadingContainer = document.getElementById('loading-container');
    const loadingText = document.getElementById('loading-text');
    const progressFill = document.getElementById('progress-fill');

    // Fetch presets from API
    const presets = await audioEngine.fetchPresets();

    // Group presets by category
    const categories = {};
    presets.forEach(preset => {
        const category = preset.category || 'Uncategorized';
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push(preset);
    });

    // Sort categories alphabetically
    const sortedCategories = Object.keys(categories).sort();

    // Populate dropdown with optgroups
    sortedCategories.forEach(category => {
        const icon = CATEGORY_ICONS[category] || '--';
        const optgroup = document.createElement('optgroup');
        optgroup.label = `${icon} ${category}`;

        categories[category].forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = `${preset.name} (${preset.soundCount} sounds)`;
            optgroup.appendChild(option);
        });

        presetSelect.appendChild(optgroup);
    });

    // Enable load button when preset is selected
    presetSelect.addEventListener('change', () => {
        loadBtn.disabled = !presetSelect.value;
    });

    // Load button click handler
    loadBtn.addEventListener('click', async () => {
        const presetId = presetSelect.value;
        if (!presetId) return;

        // Initialize audio context if needed
        if (!audioEngine.audioContext) {
            await audioEngine.init();
        }

        // Reset all pads to empty state
        for (let i = 0; i < 16; i++) {
            gui.updatePadState(i, false);
        }

        // Clear waveform display
        gui.clearWaveform();

        // Show loading progress
        loadingContainer.classList.remove('hidden');
        progressFill.style.width = '0%';
        loadingText.textContent = 'Loading sounds... 0/0';

        // Disable controls during loading
        loadBtn.disabled = true;
        presetSelect.disabled = true;

        // Progress callback
        const onProgress = (loaded, total) => {
            const percent = total > 0 ? (loaded / total) * 100 : 0;
            progressFill.style.width = `${percent}%`;
            loadingText.textContent = `Loading sounds... ${loaded}/${total}`;
        };

        // Load the preset
        await audioEngine.loadPreset(presetId,
            (padIndex, success) => gui.updatePadState(padIndex, success),
            onProgress
        );

        // Hide loading progress after a brief delay
        setTimeout(() => {
            loadingContainer.classList.add('hidden');
        }, 500);

        // Re-enable controls
        loadBtn.disabled = false;
        presetSelect.disabled = false;
    });

    // Stop All button - stops all playing sounds
    const stopAllBtn = document.getElementById('stop-all-btn');
    if (stopAllBtn) {
        stopAllBtn.addEventListener('click', () => {
            audioEngine.stopAllSounds(false);
            // Update visual state of pads
            for (let i = 0; i < 16; i++) {
                const pad = document.querySelector(`.pad[data-index="${i}"]`);
                if (pad) {
                    pad.classList.remove('active');
                }
            }
        });
    }
}

/**
 * Setup recording controls
 */
function setupRecordingControls() {
    const recordBtn = document.getElementById('record-btn');
    const padSelect = document.getElementById('record-pad-select');
    const status = document.getElementById('record-status');
    let isRecording = false;

    if (!recordBtn) return;

    recordBtn.addEventListener('click', async () => {
        // Initialize audio context if needed
        if (!audioEngine.audioContext) {
            await audioEngine.init();
        }

        // Request mic permission if not already done
        if (!audioEngine.mediaRecorder) {
            const success = await audioEngine.initRecording();
            if (!success) {
                alert('Microphone access denied. Cannot record.');
                return;
            }
        }

        if (!isRecording) {
            // Start Recording
            if (audioEngine.startRecording()) {
                isRecording = true;
                recordBtn.textContent = '■ Stop';
                recordBtn.classList.add('recording');
                status.classList.remove('hidden');
                padSelect.disabled = true;
            }
        } else {
            // Stop Recording
            const buffer = await audioEngine.stopRecording();
            if (buffer) {
                const padIndex = parseInt(padSelect.value);
                audioEngine.loadBuffer(buffer, padIndex);
                gui.updatePadState(padIndex, true);
                console.log(`[Success] Recorded sound assigned to Pad ${padIndex}`);
            }

            isRecording = false;
            recordBtn.innerHTML = '<span class="record-dot"></span> Record';
            recordBtn.classList.remove('recording');
            status.classList.add('hidden');
            padSelect.disabled = false;
        }
    });
}

/**
 * Setup upload controls
 */
function setupUploadControls() {
    console.log('[Setup] Setting up upload controls...');
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('upload-file-input');
    const padSelect = document.getElementById('upload-pad-select');

    console.log('Upload elements:', { uploadBtn, fileInput, padSelect });

    if (!uploadBtn || !fileInput) {
        console.error('[Error] Upload controls not found!');
        return;
    }

    console.log('[OK] Upload controls found, adding event listeners...');

    // Trigger file input when button is clicked
    uploadBtn.addEventListener('click', () => {
        console.log('[Upload] Button clicked!');
        fileInput.click();
    });

    // Handle file selection
    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Initialize audio context if needed
        if (!audioEngine.audioContext) {
            await audioEngine.init();
        }

        const padIndex = parseInt(padSelect.value);

        // Create a local URL for the file
        const objectUrl = URL.createObjectURL(file);

        // Load sound into engine
        const success = await audioEngine.loadSound(objectUrl, padIndex);

        if (success) {
            gui.updatePadState(padIndex, true);
            console.log(`[OK] Uploaded file "${file.name}" assigned to Pad ${padIndex}`);
        } else {
            alert('Failed to load audio file.');
        }

        // Reset input
        fileInput.value = '';
    });
}

/**
 * Setup keyboard overlay toggle
 */
function setupKeyboardOverlay() {
    const toggleBtn = document.getElementById('keyboard-toggle-btn');
    const overlay = document.getElementById('keyboard-overlay');
    const closeBtn = document.getElementById('keyboard-close-btn');

    if (!toggleBtn || !overlay) return;

    // Toggle overlay on button click
    toggleBtn.addEventListener('click', () => {
        overlay.classList.toggle('hidden');
    });

    // Close overlay on close button click
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            overlay.classList.add('hidden');
        });
    }

    // Close overlay on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
            overlay.classList.add('hidden');
        }
    });

    // Close overlay when clicking outside content
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.add('hidden');
        }
    });

    // Highlight keys in overlay when pressed
    const keys = overlay.querySelectorAll('.key');
    const keyMap = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];

    document.addEventListener('keydown', (e) => {
        const keyIndex = keyMap.indexOf(e.key.toLowerCase());
        if (keyIndex !== -1 && keys[keyIndex]) {
            keys[keyIndex].classList.add('active');
        }
    });

    document.addEventListener('keyup', (e) => {
        const keyIndex = keyMap.indexOf(e.key.toLowerCase());
        if (keyIndex !== -1 && keys[keyIndex]) {
            keys[keyIndex].classList.remove('active');
        }
    });
}

/**
 * Setup track recording controls
 */
function setupTrackRecording() {
    const recordBtn = document.getElementById('track-record-btn');
    const playBtn = document.getElementById('track-play-btn');
    const downloadBtn = document.getElementById('track-download-btn');
    const timeDisplay = document.getElementById('track-record-time');

    if (!recordBtn || !playBtn || !downloadBtn || !timeDisplay) return;

    let recordingStartTime = null;
    let timeUpdateInterval = null;
    let currentPlayback = null;

    // Format time as MM:SS
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Update time display during recording
    const updateTime = () => {
        if (recordingStartTime) {
            const elapsed = (Date.now() - recordingStartTime) / 1000;
            timeDisplay.textContent = formatTime(elapsed);
        }
    };

    // Record button click
    recordBtn.addEventListener('click', async () => {
        // Initialize audio context if needed
        if (!audioEngine.audioContext) {
            await audioEngine.init();
        }

        if (!audioEngine.isTrackRecording()) {
            // Start recording
            const started = audioEngine.startTrackRecording();
            if (started) {
                recordBtn.textContent = '■ Stop Recording';
                recordBtn.classList.add('recording');
                timeDisplay.classList.add('recording');
                playBtn.disabled = true;
                downloadBtn.disabled = true;
                
                recordingStartTime = Date.now();
                timeUpdateInterval = setInterval(updateTime, 100);
            }
        } else {
            // Stop recording
            const blob = await audioEngine.stopTrackRecording();
            if (blob) {
                recordBtn.textContent = '⏺ Start Recording';
                recordBtn.classList.remove('recording');
                timeDisplay.classList.remove('recording');
                playBtn.disabled = false;
                downloadBtn.disabled = false;
                
                clearInterval(timeUpdateInterval);
                recordingStartTime = null;
            }
        }
    });

    // Play button click
    playBtn.addEventListener('click', async () => {
        if (currentPlayback) {
            // Stop current playback
            try {
                currentPlayback.stop();
            } catch (e) {}
            currentPlayback = null;
            playBtn.textContent = 'Play';
            playBtn.classList.remove('playing');
            return;
        }

        currentPlayback = await audioEngine.playRecordedTrack();
        if (currentPlayback) {
            playBtn.textContent = 'Stop';
            playBtn.classList.add('playing');
            
            currentPlayback.onended = () => {
                playBtn.textContent = 'Play';
                playBtn.classList.remove('playing');
                currentPlayback = null;
            };
        }
    });

    // Download button click
    downloadBtn.addEventListener('click', () => {
        const blob = audioEngine.getRecordedTrack();
        if (!blob) return;

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sampler-track-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('[Download] Track downloaded');
    });
}

// Start app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);
