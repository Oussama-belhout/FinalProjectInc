require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Preset = require('./models/Preset');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ============ DATABASE CONNECTION WITH FALLBACK ============
let useLocalFallback = false;
const PRESETS_DIR = path.join(__dirname, 'presets');

// Ensure presets directory exists
if (!fs.existsSync(PRESETS_DIR)) {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
}

// Local file-based preset operations (fallback)
const LocalPresetStore = {
    getAll: () => {
        const files = fs.readdirSync(PRESETS_DIR).filter(f => f.endsWith('.json'));
        return files.map(f => {
            const data = JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, f), 'utf-8'));
            return data;
        });
    },
    getById: (id) => {
        const filePath = path.join(PRESETS_DIR, `${id}.json`);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        return null;
    },
    save: (preset) => {
        const filePath = path.join(PRESETS_DIR, `${preset.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(preset, null, 2));
        return preset;
    },
    delete: (id) => {
        const filePath = path.join(PRESETS_DIR, `${id}.json`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    },
    getNextId: () => {
        const presets = LocalPresetStore.getAll();
        const existingIds = presets.map(p => {
            const match = p.id.match(/preset-(\d+)/);
            return match ? parseInt(match[1]) : 0;
        });
        const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
        return `preset-${maxId + 1}`;
    }
};

// Connect to MongoDB with fallback
mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => console.log('[OK] Connected to MongoDB Atlas'))
    .catch(err => {
        console.warn('[Warning] MongoDB connection failed, using local JSON files as fallback');
        console.warn('   Error:', err.message);
        useLocalFallback = true;
    });

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

// Serve Angular app for /manager routes
const angularDistPath = path.join(__dirname, 'preset-manager', 'dist', 'preset-manager', 'browser');

// Check if Angular dist exists
if (fs.existsSync(angularDistPath)) {
    console.log('[Angular] Serving preset-manager from:', angularDistPath);
    app.use('/manager', express.static(angularDistPath));
} else {
    console.warn('[Angular] WARNING: Angular dist not found at:', angularDistPath);
    console.warn('[Angular] Run "cd preset-manager && npm run build" to build the Angular app');
}

// ============ AUTHENTICATION HELPERS ============

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Verify JWT token middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
};

// Optional auth middleware (doesn't block if no token)
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.userId = decoded.id;
        } catch (error) {
            // Token invalid, but continue without auth
        }
    }
    next();
};

// ============ AUTHENTICATION ROUTES ============

// Register new user
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [{ email: email.toLowerCase() }, { username }] 
        });

        if (existingUser) {
            if (existingUser.email === email.toLowerCase()) {
                return res.status(400).json({ error: 'Email already registered.' });
            }
            return res.status(400).json({ error: 'Username already taken.' });
        }

        // Create new user
        const user = new User({ username, email, password });
        await user.save();

        // Generate token
        const token = generateToken(user._id);

        console.log(`[Auth] New user registered: ${username}`);

        res.status(201).json({
            message: 'Registration successful',
            token,
            user: user.toSafeObject()
        });
    } catch (error) {
        console.error('[Auth] Registration error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({ error: messages.join(', ') });
        }
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        // Find user by email (include password for comparison)
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Compare passwords
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user._id);

        console.log(`[Auth] User logged in: ${user.username}`);

        res.json({
            message: 'Login successful',
            token,
            user: user.toSafeObject()
        });
    } catch (error) {
        console.error('[Auth] Login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// Get current user (requires auth)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json({ user: user.toSafeObject() });
    } catch (error) {
        console.error('[Auth] Get user error:', error);
        res.status(500).json({ error: 'Failed to get user info.' });
    }
});

// Verify token validity
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found.', valid: false });
        }

        res.json({ valid: true, user: user.toSafeObject() });
    } catch (error) {
        res.status(500).json({ error: 'Verification failed.', valid: false });
    }
});

// Logout (client-side, but we can log it)
app.post('/api/auth/logout', authenticateToken, (req, res) => {
    console.log(`[Auth] User logged out: ${req.userId}`);
    res.json({ message: 'Logged out successfully' });
});

// ============ PAGE ROUTES ============

// Landing page - public, no auth required
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Angular app - handle /manager exactly (redirect to /manager/)
app.get('/manager', (req, res) => {
    res.redirect('/manager/');
});

// Angular app catch-all (for client-side routing)
app.get('/manager/*', (req, res) => {
    const indexPath = path.join(angularDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(503).send('Preset Manager is not available. The Angular app may not be built yet.');
    }
});

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

// POST /api/upload-audio - Upload a single audio file and return its URL
app.post('/api/upload-audio', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        // Build the URL to the uploaded file
        const fileUrl = `/audio/uploads/${req.file.filename}`;
        
        console.log(`[Upload] Audio file uploaded: ${req.file.originalname} -> ${fileUrl}`);
        
        res.json({
            success: true,
            url: fileUrl,
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload audio file' });
    }
});

// GET /api/presets - List all presets (user's own + public presets)
app.get('/api/presets', optionalAuth, async (req, res) => {
    try {
        let presets;
        if (useLocalFallback) {
            presets = LocalPresetStore.getAll();
        } else {
            // Build query: user's own presets OR public presets
            let query;
            if (req.userId) {
                // Logged in: show user's presets + public presets
                query = {
                    $or: [
                        { user: req.userId },
                        { isPublic: true },
                        { user: null } // Legacy/demo presets
                    ]
                };
            } else {
                // Not logged in: show only public presets
                query = {
                    $or: [
                        { isPublic: true },
                        { user: null }
                    ]
                };
            }
            presets = await Preset.find(query);
        }
        // Map to expected format
        const response = presets.map(p => ({
            id: p.id,
            name: p.name,
            category: p.category,
            description: p.description,
            soundCount: p.sounds ? p.sounds.length : 0,
            isOwner: req.userId ? (p.user && p.user.toString() === req.userId) : false,
            isPublic: p.isPublic || false
        }));
        res.json(response);
    } catch (error) {
        console.error('Error reading presets:', error);
        res.status(500).json({ error: 'Failed to load presets' });
    }
});

// GET /api/presets/:id - Get single preset by ID (must be owner or public)
app.get('/api/presets/:id', optionalAuth, async (req, res) => {
    try {
        let preset;
        if (useLocalFallback) {
            preset = LocalPresetStore.getById(req.params.id);
        } else {
            // First try to find user's own preset, then fall back to public/legacy
            if (req.userId) {
                // First look for user's own preset
                preset = await Preset.findOne({ id: req.params.id, user: req.userId });
                
                // If not found, look for public or legacy presets
                if (!preset) {
                    preset = await Preset.findOne({
                        id: req.params.id,
                        $or: [{ isPublic: true }, { user: null }]
                    });
                }
            } else {
                // Unauthenticated - only public or legacy presets
                preset = await Preset.findOne({
                    id: req.params.id,
                    $or: [{ isPublic: true }, { user: null }]
                });
            }
        }
        if (!preset) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        
        // Add ownership info to response
        const response = preset.toObject ? preset.toObject() : preset;
        response.isOwner = req.userId ? (preset.user && preset.user.toString() === req.userId) : false;
        
        res.json(response);
    } catch (error) {
        console.error('Error reading preset:', error);
        res.status(500).json({ error: 'Failed to load preset' });
    }
});

// POST /api/presets - Create new preset (supports both JSON and file uploads)
// Handle multipart with files
// POST /api/presets - Create new preset (supports both JSON and file uploads)
// Handle multipart with files
app.post('/api/presets', optionalAuth, upload.array('files', 16), async (req, res) => {
    try {
        // Parse preset data - could be in body or form field
        let presetData;
        if (req.body.preset) {
            // FormData with preset field (for file uploads)
            presetData = typeof req.body.preset === 'string'
                ? JSON.parse(req.body.preset)
                : req.body.preset;
        } else {
            // Direct JSON body
            presetData = req.body;
        }

        // Validate required fields
        if (!presetData.name) {
            return res.status(400).json({ error: 'Preset name is required' });
        }

        // Assign user ownership if logged in
        if (req.userId) {
            presetData.user = req.userId;
        }
        
        // Set public/private status (default private for logged in users)
        if (presetData.isPublic === undefined) {
            presetData.isPublic = !req.userId; // Public only if no user (legacy)
        }

        // Generate unique ID if not provided
        if (!presetData.id) {
            if (useLocalFallback) {
                presetData.id = LocalPresetStore.getNextId();
            } else {
                // Generate unique ID for this user
                const userFilter = req.userId ? { user: req.userId } : { user: null };
                const allPresets = await Preset.find(userFilter, 'id');
                const existingIds = allPresets.map(p => {
                    const match = p.id.match(/preset-(\d+)/);
                    return match ? parseInt(match[1]) : 0;
                });
                const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
                presetData.id = `preset-${maxId + 1}`;
            }
        }

        // Set defaults
        presetData.category = presetData.category || 'Custom';
        presetData.sounds = presetData.sounds || [];

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
                const existingIndex = presetData.sounds.findIndex(s => s.pad === padNumber);

                if (existingIndex >= 0) {
                    // Replace existing
                    presetData.sounds[existingIndex] = {
                        pad: padNumber,
                        url: soundUrl,
                        name: path.basename(file.originalname, path.extname(file.originalname))
                    };
                } else {
                    // Add new
                    presetData.sounds.push({
                        pad: padNumber,
                        url: soundUrl,
                        name: path.basename(file.originalname, path.extname(file.originalname))
                    });
                }
            });
        }

        // Sort sounds by pad number
        presetData.sounds.sort((a, b) => a.pad - b.pad);

        // Check if preset already exists for this user
        let existing;
        if (useLocalFallback) {
            existing = LocalPresetStore.getById(presetData.id);
        } else {
            // Check within user's presets only (or global if no user)
            const existQuery = req.userId 
                ? { id: presetData.id, user: req.userId }
                : { id: presetData.id, user: null };
            existing = await Preset.findOne(existQuery);
        }
        if (existing) {
            return res.status(409).json({ error: 'Preset ID already exists' });
        }

        let savedPreset;
        if (useLocalFallback) {
            presetData.createdAt = new Date().toISOString();
            presetData.updatedAt = new Date().toISOString();
            savedPreset = LocalPresetStore.save(presetData);
        } else {
            const newPreset = new Preset(presetData);
            savedPreset = await newPreset.save();
        }

        res.status(201).json(savedPreset);
    } catch (error) {
        console.error('Error creating preset:', error);
        res.status(500).json({ error: 'Failed to create preset: ' + error.message });
    }
});

// PUT /api/presets/:id - Update preset (supports both JSON and file uploads)
// Only owner can update their preset
app.put('/api/presets/:id', optionalAuth, upload.array('files', 16), async (req, res) => {
    const presetId = req.params.id;

    try {
        // Find existing preset belonging to the current user
        let preset;
        if (useLocalFallback) {
            preset = LocalPresetStore.getById(presetId);
        } else {
            const query = req.userId 
                ? { id: presetId, $or: [{ user: req.userId }, { user: null }] }
                : { id: presetId, user: null };
            preset = await Preset.findOne(query);
        }
        if (!preset) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        
        // Check ownership - only owner can update (unless it's a legacy preset with no owner)
        if (preset.user && (!req.userId || preset.user.toString() !== req.userId)) {
            return res.status(403).json({ error: 'You do not have permission to edit this preset' });
        }

        // Parse update data
        let updateData;
        if (req.body.preset) {
            updateData = typeof req.body.preset === 'string'
                ? JSON.parse(req.body.preset)
                : req.body.preset;
        } else {
            updateData = req.body;
        }

        // Update fields
        if (updateData.name) preset.name = updateData.name;
        if (updateData.category) preset.category = updateData.category;
        if (updateData.description !== undefined) preset.description = updateData.description;

        // Apply updateData properties to preset
        Object.keys(updateData).forEach(key => {
            if (key !== 'sounds' && key !== 'id' && key !== '_id') {
                preset[key] = updateData[key];
            }
        });

        // Handle sounds from updateData if present
        if (updateData.sounds) {
            preset.sounds = updateData.sounds;
        }

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

        let savedPreset;
        if (useLocalFallback) {
            preset.updatedAt = new Date().toISOString();
            savedPreset = LocalPresetStore.save(preset);
        } else {
            savedPreset = await preset.save();
        }
        res.json(savedPreset);
    } catch (error) {
        console.error('Error updating preset:', error);
        res.status(500).json({ error: 'Failed to update preset: ' + error.message });
    }
});

// DELETE /api/presets/:id - Delete preset (and associated uploaded files)
// Only owner can delete their preset
app.delete('/api/presets/:id', optionalAuth, async (req, res) => {
    const presetId = req.params.id;

    try {
        // Find preset belonging to the current user
        let preset;
        if (useLocalFallback) {
            preset = LocalPresetStore.getById(presetId);
        } else {
            const query = req.userId 
                ? { id: presetId, $or: [{ user: req.userId }, { user: null }] }
                : { id: presetId, user: null };
            preset = await Preset.findOne(query);
        }
        if (!preset) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        
        // Check ownership - only owner can delete (unless it's a legacy preset with no owner)
        if (preset.user && (!req.userId || preset.user.toString() !== req.userId)) {
            return res.status(403).json({ error: 'You do not have permission to delete this preset' });
        }

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

        // Delete preset
        if (useLocalFallback) {
            LocalPresetStore.delete(presetId);
        } else {
            await Preset.deleteOne({ id: presetId });
        }
        res.json({ message: 'Preset deleted successfully', id: presetId });
    } catch (error) {
        console.error('Error deleting preset:', error);
        res.status(500).json({ error: 'Failed to delete preset' });
    }
});

// POST /api/presets/:id/sounds - Add sound to existing preset (owner only)
app.post('/api/presets/:id/sounds', optionalAuth, upload.single('file'), async (req, res) => {
    const presetId = req.params.id;

    try {
        let preset;
        if (useLocalFallback) {
            preset = LocalPresetStore.getById(presetId);
        } else {
            // Find preset belonging to the current user (or legacy preset with no owner)
            const query = req.userId 
                ? { id: presetId, $or: [{ user: req.userId }, { user: null }] }
                : { id: presetId, user: null };
            preset = await Preset.findOne(query);
        }
        if (!preset) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        
        // Check ownership
        if (preset.user && (!req.userId || preset.user.toString() !== req.userId)) {
            return res.status(403).json({ error: 'You do not have permission to modify this preset' });
        }

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

        // Ensure sounds array exists
        if (!preset.sounds) preset.sounds = [];

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

        let savedPreset;
        if (useLocalFallback) {
            preset.updatedAt = new Date().toISOString();
            savedPreset = LocalPresetStore.save(preset);
        } else {
            savedPreset = await preset.save();
        }
        res.json(savedPreset);
    } catch (error) {
        console.error('Error adding sound:', error);
        res.status(500).json({ error: 'Failed to add sound: ' + error.message });
    }
});

// DELETE /api/presets/:id/sounds/:pad - Remove sound from preset (owner only)
app.delete('/api/presets/:id/sounds/:pad', optionalAuth, async (req, res) => {
    const presetId = req.params.id;
    const padNumber = parseInt(req.params.pad);

    try {
        let preset;
        if (useLocalFallback) {
            preset = LocalPresetStore.getById(presetId);
        } else {
            // Find preset belonging to the current user
            const query = req.userId 
                ? { id: presetId, $or: [{ user: req.userId }, { user: null }] }
                : { id: presetId, user: null };
            preset = await Preset.findOne(query);
        }
        if (!preset) {
            return res.status(404).json({ error: 'Preset not found' });
        }
        
        // Check ownership
        if (preset.user && (!req.userId || preset.user.toString() !== req.userId)) {
            return res.status(403).json({ error: 'You do not have permission to modify this preset' });
        }

        if (isNaN(padNumber) || padNumber < 0 || padNumber > 15) {
            return res.status(400).json({ error: 'Invalid pad number' });
        }

        // Ensure sounds array exists
        if (!preset.sounds) preset.sounds = [];

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

        let savedPreset;
        if (useLocalFallback) {
            preset.updatedAt = new Date().toISOString();
            savedPreset = LocalPresetStore.save(preset);
        } else {
            savedPreset = await preset.save();
        }
        res.json(savedPreset);
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
    console.log(`[Server] Sampler server running at http://localhost:${PORT}`);
});
