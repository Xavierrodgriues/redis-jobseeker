const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkAdmin() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGO_URI is missing');
        return;
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('test'); // Assuming 'test' or 'job-portal' - checking usage in mongo.js
        // Actually, let's just list the collections or check the default db
        // But `mongo.js` likely connects to a specific DB.
        // I will read mongo.js first to be sure of the DB name, but for now I'll guess 'test' or check the URI.

        // Let's use the same logic as `mongo.js` but standalone

        // Wait, better to look at mongo.js first to see db name
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
// checkAdmin();
