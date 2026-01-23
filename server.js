const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

// ============ MULTER CONFIGURATION ============
// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'audio', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename with original extension
        const ext = path.extname(file.originalname);
        const uniqueName = `${uuidv4()}${ext}`;
        cb(null, uniqueName);
    }
});

// File filter for audio files only
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave',
        'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac',
        'audio/x-wav', 'audio/x-m4a', 'audio/mp4'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only audio files are allowed.`), false);
    }
};

// Multer instance - max 16 files (one per pad), 50MB per file
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max per file
        files: 16 // Max 16 files (one per pad)
    }
});

// ============ MIDDLEWARE ============
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

// POST /api/presets - Create new preset (supports both JSON and file uploads)
// Handle multipart with files
app.post('/api/presets', upload.array('files', 16), (req, res) => {
    const presetsDir = path.join(__dirname, 'presets');
    
    try {
        // Parse preset data - could be in body or form field
        let preset;
        if (req.body.preset) {
            // FormData with preset field (for file uploads)
            preset = typeof req.body.preset === 'string' 
                ? JSON.parse(req.body.preset) 
                : req.body.preset;
        } else {
            // Direct JSON body
            preset = req.body;
        }
        
        // Validate required fields
        if (!preset.name) {
            return res.status(400).json({ error: 'Preset name is required' });
        }
        
        // Generate unique ID if not provided
        if (!preset.id) {
            const files = fs.readdirSync(presetsDir).filter(f => f.endsWith('.json'));
            const existingIds = files.map(f => {
                const match = f.match(/preset-(\d+)\.json/);
                return match ? parseInt(match[1]) : 0;
            });
            const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
            preset.id = `preset-${maxId + 1}`;
        }
        
        // Set defaults
        preset.category = preset.category || 'Custom';
        preset.sounds = preset.sounds || [];
        preset.createdAt = new Date().toISOString();
        
        // Handle uploaded files - add them to sounds array
        if (req.files && req.files.length > 0) {
            // Parse pad assignments from form data
            const padAssignments = req.body.padAssignments 
                ? JSON.parse(req.body.padAssignments) 
                : {};
            
            req.files.forEach((file, index) => {
                const padNumber = padAssignments[file.originalname] ?? index;
                const soundUrl = `/audio/uploads/${file.filename}`;
                
                // Check if this pad already has a sound (from URL array)
                const existingIndex = preset.sounds.findIndex(s => s.pad === padNumber);
                
                if (existingIndex >= 0) {
                    // Replace existing
                    preset.sounds[existingIndex] = {
                        pad: padNumber,
                        url: soundUrl,
                        name: path.basename(file.originalname, path.extname(file.originalname))
                    };
                } else {
                    // Add new
                    preset.sounds.push({
                        pad: padNumber,
                        url: soundUrl,
                        name: path.basename(file.originalname, path.extname(file.originalname))
                    });
                }
            });
        }
        
        // Sort sounds by pad number
        preset.sounds.sort((a, b) => a.pad - b.pad);
        
        const presetPath = path.join(presetsDir, `${preset.id}.json`);
        
        // Check if preset already exists
        if (fs.existsSync(presetPath)) {
            return res.status(409).json({ error: 'Preset ID already exists' });
        }
        
        fs.writeFileSync(presetPath, JSON.stringify(preset, null, 2));
        res.status(201).json(preset);
    } catch (error) {
        console.error('Error creating preset:', error);
        res.status(500).json({ error: 'Failed to create preset: ' + error.message });
    }
});

// PUT /api/presets/:id - Update preset (supports both JSON and file uploads)
app.put('/api/presets/:id', upload.array('files', 16), (req, res) => {
    const presetId = req.params.id;
    const presetPath = path.join(__dirname, 'presets', `${presetId}.json`);
    
    try {
        if (!fs.existsSync(presetPath)) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        
        // Load existing preset
        const existingPreset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
        
        // Parse update data
        let updateData;
        if (req.body.preset) {
            updateData = typeof req.body.preset === 'string' 
                ? JSON.parse(req.body.preset) 
                : req.body.preset;
        } else {
            updateData = req.body;
        }
        
        // Merge with existing preset
        const preset = {
            ...existingPreset,
            ...updateData,
            id: presetId, // Ensure ID matches path
            updatedAt: new Date().toISOString()
        };
        
        // Handle uploaded files - add/replace sounds
        if (req.files && req.files.length > 0) {
            const padAssignments = req.body.padAssignments 
                ? JSON.parse(req.body.padAssignments) 
                : {};
            
            req.files.forEach((file, index) => {
                const padNumber = padAssignments[file.originalname] ?? index;
                const soundUrl = `/audio/uploads/${file.filename}`;
                
                // Find existing sound for this pad
                const existingIndex = preset.sounds.findIndex(s => s.pad === padNumber);
                
                const newSound = {
                    pad: padNumber,
                    url: soundUrl,
                    name: path.basename(file.originalname, path.extname(file.originalname))
                };
                
                if (existingIndex >= 0) {
                    // Delete old uploaded file if it was also an upload
                    const oldSound = preset.sounds[existingIndex];
                    if (oldSound.url.startsWith('/audio/uploads/')) {
                        const oldFilePath = path.join(__dirname, oldSound.url);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    }
                    preset.sounds[existingIndex] = newSound;
                } else {
                    preset.sounds.push(newSound);
                }
            });
        }
        
        // Sort sounds by pad number
        preset.sounds.sort((a, b) => a.pad - b.pad);
        
        fs.writeFileSync(presetPath, JSON.stringify(preset, null, 2));
        res.json(preset);
    } catch (error) {
        console.error('Error updating preset:', error);
        res.status(500).json({ error: 'Failed to update preset: ' + error.message });
    }
});

// DELETE /api/presets/:id - Delete preset (and associated uploaded files)
app.delete('/api/presets/:id', (req, res) => {
    const presetId = req.params.id;
    const presetPath = path.join(__dirname, 'presets', `${presetId}.json`);
    
    try {
        if (!fs.existsSync(presetPath)) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        
        // Load preset to find uploaded files
        const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
        
        // Delete associated uploaded audio files
        if (preset.sounds && preset.sounds.length > 0) {
            preset.sounds.forEach(sound => {
                if (sound.url && sound.url.startsWith('/audio/uploads/')) {
                    const filePath = path.join(__dirname, sound.url);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`Deleted uploaded file: ${filePath}`);
                    }
                }
            });
        }
        
        // Delete preset file
        fs.unlinkSync(presetPath);
        res.json({ message: 'Preset deleted successfully', id: presetId });
    } catch (error) {
        console.error('Error deleting preset:', error);
        res.status(500).json({ error: 'Failed to delete preset' });
    }
});

// POST /api/presets/:id/sounds - Add sound to existing preset
app.post('/api/presets/:id/sounds', upload.single('file'), (req, res) => {
    const presetId = req.params.id;
    const presetPath = path.join(__dirname, 'presets', `${presetId}.json`);
    
    try {
        if (!fs.existsSync(presetPath)) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        
        const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
        
        // Get pad number from body
        const padNumber = parseInt(req.body.pad);
        if (isNaN(padNumber) || padNumber < 0 || padNumber > 15) {
            return res.status(400).json({ error: 'Invalid pad number (must be 0-15)' });
        }
        
        let soundUrl;
        let soundName;
        
        if (req.file) {
            // File upload
            soundUrl = `/audio/uploads/${req.file.filename}`;
            soundName = path.basename(req.file.originalname, path.extname(req.file.originalname));
        } else if (req.body.url) {
            // URL-based
            soundUrl = req.body.url;
            soundName = req.body.name || `Sound ${padNumber}`;
        } else {
            return res.status(400).json({ error: 'Either file or url is required' });
        }
        
        // Check if pad already has a sound
        const existingIndex = preset.sounds.findIndex(s => s.pad === padNumber);
        const newSound = {
            pad: padNumber,
            url: soundUrl,
            name: soundName
        };
        
        if (existingIndex >= 0) {
            // Delete old uploaded file if exists
            const oldSound = preset.sounds[existingIndex];
            if (oldSound.url.startsWith('/audio/uploads/')) {
                const oldFilePath = path.join(__dirname, oldSound.url);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            }
            preset.sounds[existingIndex] = newSound;
        } else {
            preset.sounds.push(newSound);
        }
        
        preset.sounds.sort((a, b) => a.pad - b.pad);
        preset.updatedAt = new Date().toISOString();
        
        fs.writeFileSync(presetPath, JSON.stringify(preset, null, 2));
        res.json(preset);
    } catch (error) {
        console.error('Error adding sound:', error);
        res.status(500).json({ error: 'Failed to add sound: ' + error.message });
    }
});

// DELETE /api/presets/:id/sounds/:pad - Remove sound from preset
app.delete('/api/presets/:id/sounds/:pad', (req, res) => {
    const presetId = req.params.id;
    const padNumber = parseInt(req.params.pad);
    const presetPath = path.join(__dirname, 'presets', `${presetId}.json`);
    
    try {
        if (!fs.existsSync(presetPath)) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        
        if (isNaN(padNumber) || padNumber < 0 || padNumber > 15) {
            return res.status(400).json({ error: 'Invalid pad number' });
        }
        
        const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
        
        // Find sound for this pad
        const soundIndex = preset.sounds.findIndex(s => s.pad === padNumber);
        
        if (soundIndex < 0) {
            return res.status(404).json({ error: 'Sound not found for this pad' });
        }
        
        // Delete uploaded file if applicable
        const sound = preset.sounds[soundIndex];
        if (sound.url.startsWith('/audio/uploads/')) {
            const filePath = path.join(__dirname, sound.url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        
        // Remove from array
        preset.sounds.splice(soundIndex, 1);
        preset.updatedAt = new Date().toISOString();
        
        fs.writeFileSync(presetPath, JSON.stringify(preset, null, 2));
        res.json(preset);
    } catch (error) {
        console.error('Error removing sound:', error);
        res.status(500).json({ error: 'Failed to remove sound' });
    }
});

// ============ ERROR HANDLING ============

// Multer error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Too many files. Maximum is 16 files.' });
        }
        return res.status(400).json({ error: `Upload error: ${error.message}` });
    }
    
    if (error.message && error.message.includes('Invalid file type')) {
        return res.status(400).json({ error: error.message });
    }
    
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// ============ END API ROUTES ============

// Server start
app.listen(PORT, () => {
    console.log(`🎹 Sampler server running at http://localhost:${PORT}`);
});
