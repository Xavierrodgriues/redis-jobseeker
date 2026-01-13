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
connectToMongo().catch(console.error);

// Middleware
app.use(express.json());
const cors = require('cors');
app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));

// Search API
app.get('/api/v1/search', async (req, res) => {
  try {
    const { role, experience, sortBy, dateRange } = req.query;
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

    const jobs = await collection.find(query).sort(sortOptions).toArray();

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

const { Resend } = require('resend');

// Initialize Resend with provided API Key
const resend = new Resend('re_5tMCwum6_GF3CfuSzZR4kQoKfJzLTWQVU');

// Helper to send email using Resend
async function sendUtcEmail(email, otp) {
  try {
    // Note: 'from' address must be from a verified domain or onboarding@resend.dev
    // Using onboarding@resend.dev requires the recipient to be the account owner,
    // or the domain must be verified.
    // If the user has a custom domain verified, they should update 'from'.
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: [email],
      subject: 'Your Login OTP',
      html: `<p>Your One-Time Password (OTP) for login is: <strong>${otp}</strong>. It expires in 5 minutes.</p>`,
      reply_to: 'yatendrayuvii@gmail.com'
    });

    if (error) {
      console.error('Resend Email Error:', error);
      // Fallback logging for dev/testing if email fails
      console.log(`🔐 [DEV ONLY - Email Failed] OTP for ${email}: ${otp}`);
      return;
    }

    console.log(`📧 OTP sent to ${email}. ID: ${data ? data.id : 'unknown'}`);

    // FOR DEV/PROTOTYPE: Log OTP to console ensuring we can log in even without valid SMTP
    console.log(`🔐 [DEV ONLY] OTP for ${email}: ${otp}`);

  } catch (error) {
    console.error('Error sending email:', error);
    // In dev, we might still want to succeed if we are just logging
    console.log(`🔐 [DEV ONLY] OTP for ${email}: ${otp}`);
  }
}

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

app.post('/api/v1/admin/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = getDb();
    const admins = db.collection('admins');
    const otps = db.collection('otp_codes');

    const admin = await admins.findOne({ email });
    if (!admin) return res.status(403).json({ error: 'Access denied. not an admin.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await otps.updateOne(
      { email },
      { $set: { otp, expiresAt, createdAt: new Date() } },
      { upsert: true }
    );

    await sendUtcEmail(email, otp);
    res.json({ success: true, message: 'Admin OTP sent' });
  } catch (error) {
    console.error('Admin Send OTP error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/v1/admin/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const db = getDb();
    const otps = db.collection('otp_codes');
    const admins = db.collection('admins');

    const otpRecord = await otps.findOne({ email });
    if (!otpRecord || otpRecord.otp !== otp || new Date() > otpRecord.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const admin = await admins.findOne({ email });
    if (!admin) return res.status(403).json({ error: 'Not an admin' });

    await otps.deleteOne({ email });
    res.json({ success: true, admin: { email: admin.email, role: 'admin' } });
  } catch (error) {
    console.error('Admin Verify OTP error:', error);
    res.status(500).json({ error: 'Failed' });
  }
});

// Admin: Get All Users
app.get('/api/v1/admin/users', async (req, res) => {
  try {
    const db = getDb();
    const users = await db.collection('users').find({}).toArray();
    res.json({ users });
  } catch (error) {
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

// Admin: Update User Role
app.put('/api/v1/admin/users/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { role } = req.body;
    const db = getDb();
    await db.collection('users').updateOne({ email }, { $set: { role } });
    res.json({ success: true });
  } catch (error) {
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


app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


