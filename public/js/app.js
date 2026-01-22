/**
 * Application Entry Point
 * Initializes AudioEngine and GUI
 * This is the sampler application - read-only preset consumer
 */

// Global instances
let audioEngine;
let gui;

// Category emoji icons
const CATEGORY_ICONS = {
    'Drums': '🥁',
    'Electronic': '🎛️',
    'Percussion': '🪘',
    'FX': '✨',
    'Vocals': '🎤',
    'Bass': '🎸',
    'Synth': '🎹',
    'World': '🌍',
    'Custom': '⚙️',
    'Uncategorized': '📁'
};

/**
 * Initialize the application
 */
async function initApp() {
    console.log('🎹 Initializing Sampler...');
    
    // Create instances
    audioEngine = new AudioEngine();
    gui = new GUI(audioEngine);
    
    // Initialize GUI
    gui.init();
    
    // Setup preset controls
    await setupPresetControls();
    
    // Hide test button since we have presets now
    document.getElementById('test-section').style.display = 'none';
    
    console.log('✅ Sampler ready! Select a preset and click Load.');
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
        const icon = CATEGORY_ICONS[category] || '📁';
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
}

// Start app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);
