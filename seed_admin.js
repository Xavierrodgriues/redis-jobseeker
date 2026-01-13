const { MongoClient } = require('mongodb');

// Replace with your actual MONGO_URI from env or hardcoded for this one-off script if needed
// Assuming it's the same one used in server.js, unfortunately server.js doesn't export it easily without side effects.
// I will try to read from process.env if available, or use a default localhost one, or rely on user to provide it.
// For now, I'll assume standard localhost or provided via arg, but for safety I'll hardcode the one likely used or ask user.
// Given the context is "redis-job", and I see `connectToMongo` in `scraper/mongo.js`. 
// Let's use `scraper/mongo.js` to connect if possible.

const { connectToMongo, getDb } = require('./scraper/mongo');

async function seedAdmin() {
    const email = process.argv[2];
    if (!email) {
        console.error('Please provide an email address: node seed_admin.js <email>');
        process.exit(1);
    }

    try {
        await connectToMongo();
        const db = getDb();
        const admins = db.collection('admins');

        const existing = await admins.findOne({ email });
        if (existing) {
            console.log(`Admin ${email} already exists.`);
        } else {
            await admins.insertOne({
                email,
                createdAt: new Date(),
                createdBy: 'seed_script'
            });
            console.log(`Admin ${email} created successfully.`);
        }
        process.exit(0);
    } catch (error) {
        console.error('Error seeding admin:', error);
        process.exit(1);
    }
}

seedAdmin();
