const redis = require('ioredis');

const redisClient = redis.createClient({
    host: 'localhost',
    port: 6379
});

redisClient.on('connect', () => {
    console.log('Connected to Redis server');
});

redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});

async function seedData() {
    // Clear the queue first to prevent duplicates/buildup
    const qLength = await redisClient.llen('link-request-queue');
    if (qLength > 0) {
        console.log(`Clearing ${qLength} existing jobs from queue...`);
        await redisClient.del('link-request-queue');
    }

    // Add more roles here as needed
    const jobRoles = [
        'Software Engineer',
        'DevOps Engineer',
        'Data Scientist',
        'Network Analyst',
        'Product Manager'
    ];

    const experiences = ['Entry Level', 'Mid Level', 'Senior Level'];
    const location = 'United States';

    console.log('Seeding jobs to Redis queue...');

    for (const role of jobRoles) {
        for (const experience of experiences) {
            const jobData = {
                role,
                userId: 'seed-script-' + Date.now(),
                experience,
                location
            };

            await redisClient.lpush('link-request-queue', JSON.stringify(jobData));
            console.log(`Added request for: ${role} (${experience})`);
        }
    }

    console.log('Seed completed. The scraper will pick these up shortly.');

    // Do NOT exit immediately if running with a process manager that restarts on exit.
    // However, if it's a one-off script, we want it to exit.
    // The user issue "starts to scrap from 1 role again" suggests the SEED SCRIPT is running repeatedly.
    // If we simply wait here, a process manager might just wait too.
    // But if it's "pm2 start seed_jobs.js", it waits for exit then restarts.
    // So let's just log and disconnect but maybe NOT exit the process explicitly? 
    // Or just disconnect.

    await redisClient.quit();
    console.log('Redis connection closed. Script finished.');
    // process.exit(0); // Removing explicit exit to see if it helps, or implies "done" to CLI but "crash" to PM2? 
    // If we want to prevent restart loop, we can just hang:
    // setInterval(() => {}, 100000); 
    // But that blocks the terminal if run manually. 

    // Let's stick to the plan: disconnect but maybe leave the event loop open if needed, 
    // OR just rely on the queue clearing to at least reset state each time it runs.

    process.exit(0);
}

seedData();
