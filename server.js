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






// Roles defined in .github/workflows/scraper-cron.yml
const SUPPORTED_ROLES = [
  "Backend Engineer", "Frontend Engineer", "Full Stack Engineer", "Mobile Engineer", "Software Engineer",
  "Platform Engineer", "Systems Engineer", "Embedded Systems Engineer", "UI UX",
  "Cloud Engineer", "Cloud Architect", "DevOps Engineer", "Site Reliability Engineer (SRE)", "Infrastructure Engineer",
  "Cloud Strategy Consultant", "Network Cloud Engineer",
  "Security Engineer", "Cloud Security Engineer", "Application Security Engineer", "Network Security Engineer",
  "Cyber Security Analyst", "GRC / Compliance Engineer", "FedRAMP / ATO Engineer", "Technology Risk Manager",
  "Data Engineer", "Data Scientist", "Analytics Engineer", "Business Intelligence Engineer", "Machine Learning Engineer",
  "AI Engineer", "Financial Analyst",
  "QA Engineer", "Automation Test Engineer", "Performance Test Engineer", "Security Test Engineer", "Test Lead / QA Lead",
  "IT Infrastructure Engineer", "IT Operations Engineer", "Linux / Unix Administrator", "Monitoring / SIEM Engineer",
  "Observability Engineer", "Release / Configuration Manager", "Network Engineer",
  "SAP Analyst", "ERP Consultant", "CRM Consultant", "ServiceNow Developer / Admin", "IT Asset / ITOM Engineer",
  "Workday Analyst", "Salesforce Developer",
  "Enterprise Architect", "Solutions Architect", "IT Manager", "CTO / CIO", "Product Manager", "Technical Product Manager",
  "Project Manager", "Program Manager",
  "Blockchain Engineer", "IoT Engineer", "Robotics Engineer", "AR / VR Engineer", "AML KYC", "Business Analyst"
];

app.get('/api/v1/suggestions', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 1) {
      return res.json({ suggestions: [] });
    }

    const lowerQuery = query.toLowerCase();

    // Filter supported roles
    const matches = SUPPORTED_ROLES.filter(role =>
      role.toLowerCase().includes(lowerQuery)
    );

    // Sort: exact startsWith matches first, then others
    matches.sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(lowerQuery);
      const bStarts = b.toLowerCase().startsWith(lowerQuery);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });

    res.json({ suggestions: matches.slice(0, 10) }); // Limit to top 10
  } catch (error) {
    console.error('Suggestion error:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
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


