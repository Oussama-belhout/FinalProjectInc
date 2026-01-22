const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving
app.use(express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// ============ API ROUTES ============

// GET /api/presets - List all presets
app.get('/api/presets', (req, res) => {
    const presetsDir = path.join(__dirname, 'presets');
    
    try {
        const files = fs.readdirSync(presetsDir).filter(f => f.endsWith('.json'));
        const presets = files.map(file => {
            const filePath = path.join(presetsDir, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return {
                id: data.id,
                name: data.name,
                description: data.description,
                soundCount: data.sounds ? data.sounds.length : 0
            };
        });
        res.json(presets);
    } catch (error) {
        console.error('Error reading presets:', error);
        res.status(500).json({ error: 'Failed to load presets' });
    }
});

// GET /api/presets/:id - Get single preset by ID
app.get('/api/presets/:id', (req, res) => {
    const presetId = req.params.id;
    const presetPath = path.join(__dirname, 'presets', `${presetId}.json`);
    
    try {
        if (!fs.existsSync(presetPath)) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        const data = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
        res.json(data);
    } catch (error) {
        console.error('Error reading preset:', error);
        res.status(500).json({ error: 'Failed to load preset' });
    }
});

// ============ END API ROUTES ============

// Server start
app.listen(PORT, () => {
    console.log(`🎹 Sampler server running at http://localhost:${PORT}`);
});
