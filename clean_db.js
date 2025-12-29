const { connectToMongo, getDb } = require('./scraper/mongo');

async function cleanDb() {
    try {
        await connectToMongo();
        const db = getDb();
        const collection = db.collection('job_links');

        // Delete LinkedIn jobs
        const linkedInResult = await collection.deleteMany({ source: 'LinkedIn' });
        console.log(`Deleted ${linkedInResult.deletedCount} LinkedIn jobs.`);

        // Delete asterisk jobs (just in case)
        const asteriskResult = await collection.deleteMany({ title: { $regex: /\*\*\*/ } });
        console.log(`Deleted ${asteriskResult.deletedCount} asterisk jobs.`);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

cleanDb();
