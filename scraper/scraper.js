global.File = class File { };
const { connectToMongo } = require('./mongo');
const { searchAndSaveJobLinks } = require('./jobSearch/jobSearcher');

async function runScraper() {
  await connectToMongo();
  console.log('Connected to MongoDB');

  const roles = [
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
    "Salesforce Developer",
    "Workday Analyst",
    "UI UX",
    "Cloud Security Engineer",
    "Application Security Engineer",
    "Network Security Engineer",
    "Network Cloud Engineer",
    "GRC / Compliance Engineer",
    "FedRAMP / ATO Engineer",
    "Data Engineer",
    "Data Scientist",
    "Financial Analyst",
    "Analytics Engineer",
    "Machine Learning Engineer",
    "AI Engineer",
    "Business Intelligence Engineer",
    "SAP Analyst",
    "Network Engineer",
    "Systems Engineer",
    "AML KYC",
    "Cyber Security Analyst",
    "Linux / Unix Administrator",
    "IT Infrastructure Engineer",
    "DevOps Engineer",
    "Observability Engineer",
    "Monitoring / SIEM Engineer",
    "IT Operations Engineer",
    "Release / Configuration Manager",
    "QA Engineer",
    "Automation Test Engineer",
    "Performance Test Engineer",
    "Security Test Engineer",
    "Test Lead / QA Lead",
    "Product Manager",
    "Technical Product Manager",
    "Project Manager",
    "Program Manager",
    "Scrum Master / Agile Coach",
    "Business Analyst",
    "Enterprise Architect",
    "Solutions Architect",
    "ERP Consultant",
    "CRM Consultant",
    "ServiceNow Developer / Admin",
    "IT Asset / ITOM Engineer",
    "Blockchain Engineer",
    "IoT Engineer",
    "Robotics Engineer",
    "AR / VR Engineer",
    "Embedded Systems Engineer",
    "IT Manager",
    "Cloud Strategy Consultant",
    "CTO / CIO",
    "Technology Risk Manager",
  ];

  const experiences = [
    'Entry Level',
    'Mid Level',
    'Senior Level'
  ];

  const location = 'United States';
  const processId = process.pid.toString();

  console.log('▶ Starting scrape batch');

  for (const role of roles) {
    for (const experience of experiences) {
      const jobData = {
        role,
        experience,
        location
      };

      console.log(`▶ Role: ${role} | Experience: ${experience}`);

      try {
        await searchAndSaveJobLinks(jobData, processId);
        console.log(`✔ Finished: ${role} | ${experience}`);
      } catch (err) {
        console.error(`❌ Failed: ${role} | ${experience} - ${err.message}`);
      }

      // small delay to avoid rate limits
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
