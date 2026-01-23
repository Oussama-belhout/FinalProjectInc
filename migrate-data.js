require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Preset = require('./models/Preset');

const presetsDir = path.join(__dirname, 'presets');

async function migrateData() {
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.');

        // Read local JSON files
        const files = fs.readdirSync(presetsDir).filter(f => f.endsWith('.json'));
        console.log(`Found ${files.length} preset files.`);

        let count = 0;
        for (const file of files) {
            const filePath = path.join(presetsDir, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            // Check if preset already exists
            const existing = await Preset.findOne({ id: data.id });
            if (existing) {
                console.log(`Skipping existing preset: ${data.id}`);
                continue;
            }

            // Create new preset
            const preset = new Preset({
                id: data.id,
                name: data.name,
                category: data.category,
                description: data.description,
                sounds: data.sounds,
                createdAt: data.createdAt || new Date(),
                updatedAt: data.updatedAt || new Date()
            });

            await preset.save();
            console.log(`Migrated preset: ${data.id} (${data.name})`);
            count++;
        }

        console.log(`Migration complete. ${count} presets imported.`);
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

migrateData();
