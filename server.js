const dns = require("node:dns/promises");
dns.setServers(["1.1.1.1"]);
const express = require('express'); // Force restart
const bcrypt = require('bcryptjs');

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
// Connect to MongoDB
connectToMongo().then(() => {
  // Start server only after DB is connected
  app.listen(PORT, async () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB', err);
  process.exit(1);
});

// Middleware
app.use(express.json());
const cors = require('cors');
app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));

// Search API (with pagination)
app.get('/api/v1/search', async (req, res) => {
  try {
    const { role, experience, sortBy, dateRange, page = 1, limit = 12 } = req.query;
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

    if (dateRange && dateRange !== 'all') {
      const now = new Date();
      let pastDate = new Date();

      if (dateRange === '24h') {
        pastDate.setDate(now.getDate() - 1);
      } else if (dateRange === '7d') {
        pastDate.setDate(now.getDate() - 7);
      } else if (dateRange === '30d') {
        pastDate.setDate(now.getDate() - 30);
      }

      query.scrapedAt = { $gte: pastDate };
    }

    let sortOptions = { scrapedAt: -1 }; // Default: Latest first
    if (sortBy === 'oldest') {
      sortOptions = { scrapedAt: 1 };
    }

    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination
    const totalJobs = await collection.countDocuments(query);
    const totalPages = Math.ceil(totalJobs / limitNum);

    // Fetch paginated jobs
    const jobs = await collection.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .toArray();

    res.json({
      jobs,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalJobs,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
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
  "Cyber Security Analyst", "GRC / Compliance Engineer", "IT Auditor", "FedRAMP / ATO Engineer", "Technology Risk Manager",
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


// --- AUTHENTICATION ENDPOINTS ---

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

// Helper: Ensure admin exists and handle TOTP logic


// Helper to send email using Resend


// PUBLIC REGISTRATION REMOVED - ONLY ADMIN CAN CREATE USERS
// app.post('/api/v1/register', async (req, res) => {
//   try {
//     const { email, role } = req.body;
//     if (!email || !role) {
//       return res.status(400).json({ error: 'Email and role are required' });
//     }
//
//     const db = getDb();
//     const users = db.collection('users');
//
//     // Check if user exists
//     const existingUser = await users.findOne({ email });
//     if (existingUser) {
//       return res.status(400).json({ error: 'Email already registered' });
//     }
//
//     const newUser = {
//       email,
//       role,
//       createdAt: new Date()
//     };
//
//     await users.insertOne(newUser);
//
//     res.status(201).json({ success: true, message: 'User registered successfully', user: { email, role } });
//   } catch (error) {
//     console.error('Register error:', error);
//     res.status(500).json({ error: 'Registration failed' });
//   }
// });

// --- USER AUTHENTICATION (PASSWORD BASED) ---

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();
    const users = db.collection('users');

    const user = await users.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user uses password auth (some old users might not have password)
    if (!user.password) {
      return res.status(400).json({ error: 'Please contact admin to set your password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({ success: true, user: { email: user.email, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- ADMIN ROUTES ---

// 1. Init Auth: Check if admin exists & TOTP status
app.post('/api/v1/admin/auth-init', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = getDb();
    const admins = db.collection('admins');

    // Check if admin exists
    const admin = await admins.findOne({ email });
    if (!admin) {
      // Security: Don't reveal if admin exists, but for this internal tool we might return 403
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Return status
    res.json({
      success: true,
      totpEnabled: !!admin.totpEnabled
    });

  } catch (error) {
    console.error('Auth Init Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Setup TOTP: Generate Secret & QR Code
app.post('/api/v1/admin/totp-setup', async (req, res) => {
  try {
    const { email } = req.body;
    const db = getDb();
    const admins = db.collection('admins');

    const admin = await admins.findOne({ email });
    if (!admin) return res.status(403).json({ error: 'Access denied.' });

    if (admin.totpEnabled) {
      return res.status(400).json({ error: 'TOTP already enabled.' });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `RedisJobScraper (${email})`
    });

    // Generate QR Code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Store secret TEMPORARILY or permanently? 
    // Best practice: Store secret but mark as disabled until verified.
    // We update the admin doc with the secret but keep totpEnabled: false
    await admins.updateOne(
      { email },
      { $set: { tempSecret: secret.base32 } }
    );

    res.json({
      success: true,
      qrCode: qrCodeUrl,
      secret: secret.base32 // Optional: validation if needed manually
    });

  } catch (error) {
    console.error('TOTP Setup Error:', error);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// 3. Verify TOTP (Enable or Login)
app.post('/api/v1/admin/totp-verify', async (req, res) => {
  try {
    const { email, token } = req.body; // token = 6 digit OTP
    const db = getDb();
    const admins = db.collection('admins');

    const admin = await admins.findOne({ email });
    if (!admin) return res.status(403).json({ error: 'Access denied.' });

    // Determine which secret to use
    // If totpEnabled is FALSE, we verify against `tempSecret` and then enable it.
    // If totpEnabled is TRUE, we verify against `totpSecret`.

    let secret = '';
    let isSetupPhase = false;

    if (!admin.totpEnabled) {
      if (!admin.tempSecret) return res.status(400).json({ error: 'Setup not initialized.' });
      secret = admin.tempSecret;
      isSetupPhase = true;
    } else {
      secret = admin.totpSecret;
    }

    // Verify
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 1 // Allow 30s drift
    });

    if (verified) {
      if (isSetupPhase) {
        // Enable TOTP permanently
        await admins.updateOne(
          { email },
          {
            $set: { totpEnabled: true, totpSecret: secret },
            $unset: { tempSecret: "" }
          }
        );
      }

      // Return Admin Session Data
      res.json({
        success: true,
        admin: { email: admin.email, role: 'admin' },
        message: isSetupPhase ? 'TOTP Enabled Successfully' : 'Login Successful'
      });
    } else {
      res.status(400).json({ error: 'Invalid OTP' });
    }

  } catch (error) {
    console.error('TOTP Verify Error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Admin: Get All Users (with pagination)
app.get('/api/v1/admin/users', async (req, res) => {
  try {
    const db = getDb();
    const collection = db.collection('users');

    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total count
    const totalUsers = await collection.countDocuments({});
    const totalPages = Math.ceil(totalUsers / limit);

    // Fetch paginated users
    const users = await collection.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin: Create User
app.post('/api/v1/admin/users', async (req, res) => {
  try {
    const { email, role, password } = req.body;
    if (!email || !role || !password) return res.status(400).json({ error: 'Missing fields' });

    const db = getDb();
    const users = db.collection('users');

    const existing = await users.findOne({ email });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await users.insertOne({ email, role, password: hashedPassword, createdAt: new Date() });
    res.json({ success: true, message: 'User created' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Admin: Update User Role or Password
app.put('/api/v1/admin/users/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { role, password } = req.body;
    const db = getDb();

    const updateFields = {};
    if (role) updateFields.role = role;
    if (password) {
      updateFields.password = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await db.collection('users').updateOne({ email }, { $set: updateFields });
    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Admin: Delete User
app.delete('/api/v1/admin/users/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const db = getDb();
    await db.collection('users').deleteOne({ email });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Delete failed' });
  }
});



