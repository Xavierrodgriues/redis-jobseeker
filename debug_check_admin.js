const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

async function checkAdmin() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const dbName = process.env.MONGODB_DB || 'jobs_db';
    console.log('Connecting to', uri, dbName);

    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        const admins = db.collection('admins');

        const email = 'yuviiconsultancy@gmail.com';
        const admin = await admins.findOne({ email });

        if (admin) {
            console.log('✅ Admin found:', admin);
        } else {
            console.log('❌ Admin NOT found:', email);
            console.log('Existing admins:', await admins.find({}).toArray());
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
checkAdmin();
