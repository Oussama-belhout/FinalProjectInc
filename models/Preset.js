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
        required: true,
        unique: true
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
    sounds: [SoundSchema]
}, {
    timestamps: true
});

module.exports = mongoose.model('Preset', PresetSchema);
