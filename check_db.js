const { MongoClient } = require('mongodb');

async function checkDb() {
    const uri = "mongodb://localhost:27017/job-portal"; // Assuming local, checking SEARCH API code for DB name? 
    // Wait, mongo.js has the connection string. I should check mongo.js first or just assume standard.
    // server.js imports mongo.js. 
    // Let's assume standard local for now or try to read mongo.js

    // I recall server.js saying: const { connectToMongo, getDb } = require('./scraper/mongo');
    // I'll assume default local for now.

    // Actually, I can just require the mongo file if I run this from the scraper dir.

    const { connectToMongo, getDb } = require('./scraper/mongo');

    try {
        await connectToMongo();
        const db = getDb();
        const collection = db.collection('job_links');

        const count = await collection.countDocuments();
        console.log(`Total jobs: ${count}`);

        // Group by source
        const sources = await collection.aggregate([
            { "$group": { "_id": "$source", "count": { "$sum": 1 } } }
        ]).toArray();
        console.log('Jobs by source:', sources);

        // Check for asterisks
        const asterisks = await collection.find({ title: { $regex: /\*\*\*/ } }).limit(5).toArray();
        console.log('Sample asterisk jobs:', asterisks);

        // Check recent jobs
        const recent = await collection.find().sort({ scrapedAt: -1 }).limit(5).toArray();
        console.log('Most recent jobs:', recent);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkDb();
