global.File = class File {};
const { connectToMongo } = require('./mongo');
const { searchAndSaveJobLinks } = require('./jobSearch/jobSearcher');

async function runScraper() {
  await connectToMongo();
  console.log('Connected to MongoDB');

  // 🔹 DEFAULT roles (used only if ROLES env is not provided)
  const DEFAULT_ROLES = [
    "Backend Engineer",
    "Frontend Engineer",
    "Full Stack Engineer",
    "Mobile Engineer",
    "Software Engineer",
    "Cloud Engineer",
    "Cloud Architect",
    "DevOps Engineer",
    "Site Reliability Engineer (SRE)",
    "Platform Engineer",
    "Infrastructure Engineer",
    "Security Engineer",
    "Data Engineer",
    "Data Scientist",
    "Machine Learning Engineer",
    "AI Engineer",
    "Product Manager",
    "Project Manager"
  ];

  // 🔹 MATRIX roles from GitHub Actions
  const roles = process.env.ROLES
    ? JSON.parse(process.env.ROLES)
    : DEFAULT_ROLES;

  const experiences = ['Entry Level', 'Mid Level', 'Senior Level'];
  const location = 'United States';
  const processId = process.pid.toString();

  console.log('▶ Starting scrape batch');
  console.log(`▶ Roles in this shard: ${roles.join(', ')}`);

  for (const role of roles) {
    for (const experience of experiences) {
      const jobData = { role, experience, location };

      console.log(`▶ Role: ${role} | Experience: ${experience}`);

      try {
        await searchAndSaveJobLinks(jobData, processId);
        console.log(`✔ Finished: ${role} | ${experience}`);
      } catch (err) {
        console.error(`❌ Failed: ${role} | ${experience} - ${err.message}`);
      }

      // rate-limit safety
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('Scraping completed. Exiting.');
  process.exit(0);
}

runScraper().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
