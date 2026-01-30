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
            // Remove _id if present
            delete data._id;
            // Upsert by id (replace if exists, insert if not)
            await Preset.findOneAndUpdate(
                { id: data.id },
                {
                    ...data,
                    createdAt: data.createdAt || new Date(),
                    updatedAt: new Date()
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log(`Imported: ${data.id}`);
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
