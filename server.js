const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Create Redis client
// const redisClient = redis.createClient({
//   host: 'localhost',
//   port: 6379
// });

// Handle Redis connection events
// redisClient.on('connect', () => {
//   console.log('Connected to Redis server');
// });

// redisClient.on('error', (err) => {
//   console.error('Redis Client Error:', err);
// });

// Connect to Redis

const path = require('path');
const { connectToMongo, getDb } = require('./scraper/mongo');

// Connect to MongoDB
connectToMongo().catch(console.error);

// Middleware
app.use(express.json());
const cors = require('cors');
app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));

// Search API
app.get('/api/v1/search', async (req, res) => {
  try {
    const { role, experience } = req.query;
    const db = getDb();
    const collection = db.collection('job_links');

    const query = {};

    if (role) {
      // Case-insensitive regex search for role
      query.role = { $regex: role, $options: 'i' };
    }

    if (experience) {
      // For now, exact match or simple regex if needed. 
      // Current scraper might save "all" or specific string.
      // We'll broaden it to find partial matches if provided.
      query.experience = { $regex: experience.split(' ')[0], $options: 'i' };
    }

    const jobs = await collection.find(query).sort({ scrapedAt: -1 }).toArray();

    res.json({ jobs });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});



app.post('/api/v1/request-for-link', async (req, res) => {
  try {
    const { role, userId, experience, location } = req.body;
    // title = job role

    const jobData = {
      role,
      userId,
      experience,
      location
    };

    // Add jobData to Redis queue
    // await redisClient.lpush('link-request-queue', JSON.stringify(jobData));

    res.status(200).json({ message: 'Link requested successfully, will show you data on frontend in few minutes' });
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({ error: 'Failed to process request', message: error.message });
  }
});


app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


