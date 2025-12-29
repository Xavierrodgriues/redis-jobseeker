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
    // Add more roles here as needed
    const jobRoles = [
        'Frontend Developer',
        'Backend Developer',
        'Full Stack Developer',
        'DevOps Engineer',
        'Data Scientist',
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

    // Give it a moment to flush ensure commands are sent
    setTimeout(async () => {
        await redisClient.quit();
        process.exit(0);
    }, 1000);
}

seedData();
