global.File = class File {};
const { connectToMongo } = require('./mongo');
const { searchAndSaveJobLinks } = require('./jobSearch/jobSearcher');

async function runScraper() {
  await connectToMongo();
  console.log('Connected to MongoDB');

  const roles = [
    'Software Engineer',
    'DevOps Engineer',
    'Data Scientist',
    'Network Analyst',
    'Product Manager'
  ];

  const experiences = [
    'Entry Level',
    'Mid Level',
    'Senior Level'
  ];

  const location = 'United States';
  const processId = process.pid.toString();

  for (const role of roles) {
    for (const experience of experiences) {
      const jobData = {
        role,
        experience,
        location
      };

      console.log(`Scraping: ${role} | ${experience}`);

      try {
        await searchAndSaveJobLinks(jobData, processId);
      } catch (err) {
        console.error('Error scraping job:', err.message);
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
