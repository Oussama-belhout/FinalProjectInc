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

// Proxy endpoint for fetching external audio files (bypasses CORS)
app.get('/api/proxy-audio', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
    }
    
    try {
        const https = require('https');
        const http = require('http');
        const protocol = url.startsWith('https') ? https : http;
        
        protocol.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                protocol.get(redirectUrl, (redirectResponse) => {
                    res.set('Content-Type', 'audio/mpeg');
                    redirectResponse.pipe(res);
                }).on('error', (err) => {
                    res.status(500).json({ error: 'Failed to fetch audio' });
                });
                return;
            }
            
            if (response.statusCode !== 200) {
                return res.status(response.statusCode).json({ error: 'Failed to fetch audio' });
            }
            
            res.set('Content-Type', 'audio/mpeg');
            response.pipe(res);
        }).on('error', (err) => {
            console.error('Proxy error:', err);
            res.status(500).json({ error: 'Failed to fetch audio' });
        });
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch audio' });
    }
});

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
                category: data.category || 'Uncategorized',
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
