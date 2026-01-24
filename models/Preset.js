const mongoose = require('mongoose');

const SoundSchema = new mongoose.Schema({
    pad: {
        type: Number,
        required: true
    },
    url: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    }
});

const PresetSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    category: {
        type: String,
        default: 'Uncategorized'
    },
    description: {
        type: String
    },
    sounds: [SoundSchema],
    // User ownership - presets belong to a specific user
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Allow public presets (null user = shared/demo presets)
    },
    isPublic: {
        type: Boolean,
        default: false // Private by default
    }
}, {
    timestamps: true
});

// Compound index: id must be unique per user (or globally for public presets)
PresetSchema.index({ id: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Preset', PresetSchema);
