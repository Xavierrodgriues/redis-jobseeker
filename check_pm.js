const { connectToMongo, getDb } = require('./scraper/mongo');

async function checkProductManager() {
    try {
        await connectToMongo();
        const db = getDb();
        const collection = db.collection('job_links');

        // Regex for Product Manager in 'role' or 'title'
        const count = await collection.countDocuments({
            $or: [
                { role: { $regex: /Product Manager/i } },
                { title: { $regex: /Product Manager/i } }
            ]
        });

        console.log(`Total Product Manager jobs found: ${count}`);

        if (count > 0) {
            const sample = await collection.findOne({ role: { $regex: /Product Manager/i } });
            console.log('Sample job:', sample);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkProductManager();
