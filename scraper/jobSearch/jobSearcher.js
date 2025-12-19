const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const xlsx = require('xlsx');

puppeteer.use(StealthPlugin());

/**
 * Searches a specific job board with pagination
 * @param {Object} query - Query object with name, url, and extractor function
 * @param {string} processId - Process ID for logging
 * @param {Object} browser - Puppeteer browser instance
 * @param {number} minResults - Minimum number of results to fetch (default: 20)
 * @returns {Promise<Array>} Array of job links from this source
 */
async function searchJobBoard(query, processId, browser, minResults = 20) {
  const jobLinks = [];
  const maxPages = 3; // Reduced for performance
  let pageNum = 0;
  let page = null;

  try {
    page = await browser.newPage();
    // Optimize page loading
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Request interception to block non-essential resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    while (jobLinks.length < minResults && pageNum < maxPages) {
      try {
        const url = query.getUrl(pageNum);
        console.log(`[Process ${processId}] Searching ${query.name} (page ${pageNum + 1})`);

        // Navigate
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Wait for some potential dynamic content. 
        // 2s is generic, could be smarter but good enough for mvp
        await new Promise(r => setTimeout(r, 3000));

        const content = await page.content();
        const $ = cheerio.load(content);

        const pageLinks = query.extractor($, query.name);

        if (pageLinks.length === 0) {
          console.log(`[Process ${processId}] No more results found on ${query.name} page ${pageNum + 1}`);
          // Check for error pages
          const title = $('title').text();
          if (title.includes('403') || title.includes('Forbidden') || title.includes('Access Denied') || title.includes('Security')) {
            console.log(`[Process ${processId}] ${query.name} Access Denied`);
          }
          break;
        }

        jobLinks.push(...pageLinks);
        console.log(`[Process ${processId}] Found ${pageLinks.length} jobs on ${query.name} page ${pageNum + 1}. Total: ${jobLinks.length}`);

        if (jobLinks.length < minResults) {
          pageNum++;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`[Process ${processId}] Error on ${query.name} page ${pageNum + 1}:`, error.message);
        break;
      }
    }

    return jobLinks;

  } catch (error) {
    console.error(`[Process ${processId}] Error searching ${query.name}:`, error.message);
    return jobLinks;
  } finally {
    if (page) {
      try { await page.close(); } catch (e) { }
    }
  }
}

/**
 * Searches for job links online based on job criteria from multiple platforms
 * @param {Object} jobData - Job search parameters
 * @param {string} processId - Process ID for file naming
 * @returns {Promise<Object>} Object with channel-wise job links and statistics
 */
async function searchJobLinks(jobData, processId) {
  // Always force United States logic from previous step
  jobData.location = "United States";

  const { role, location, experience } = jobData;
  const allJobLinks = {};
  const channelStats = {};
  let browser = null;

  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const jobBoards = [
      {
        name: 'LinkedIn',
        getUrl: (page) => {
          const start = page * 25;
          return `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&start=${start}&f_TPR=r86400`;
        },
        extractor: ($, source) => {
          const links = [];
          $('a.base-card__full-link, a.job-card-list__title').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.linkedin.com${href}`,
                title: $(elem).text().trim(),
                channel: source,
                source: source,
                scrapedAt: new Date().toISOString()
              });
            }
          });
          return links;
        }
      },
      // Removed Naukri (low relevance for pure US-only requests and problematic with bots)
      {
        name: 'Indeed',
        getUrl: (page) => {
          const start = page * 10;
          return `https://www.indeed.com/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&fromage=1&start=${start}`;
        },
        extractor: ($, source) => {
          const links = [];
          // Updated selectors for Indeed
          $('a[id^="job_"], a.jcs-JobTitle').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.indeed.com${href}`,
                title: $(elem).find('span').text().trim() || $(elem).text().trim(),
                channel: source,
                source: source,
                scrapedAt: new Date().toISOString()
              });
            }
          });
          return links;
        }
      },
      {
        name: 'Glassdoor',
        getUrl: (page) => {
          // Keep page=1 for subsequent pages if logic differs, but glassdoor typically uses page param
          // Note: Glassdoor often redirects login. Puppeteer can sometimes see listing anyway.
          return `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(role)}&locT=C&locId=1&locKeyword=${encodeURIComponent(location)}&fromAge=1`;
        },
        extractor: ($, source) => {
          const links = [];
          $('a.jobLink, a[data-test="job-link"]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.glassdoor.com${href}`,
                title: $(elem).text().trim(),
                channel: source,
                source: source,
                scrapedAt: new Date().toISOString()
              });
            }
          });
          return links;
        }
      },
      {
        name: 'SimplyHired',
        getUrl: (page) => {
          const pageNum = page + 1;
          return `https://www.simplyhired.com/search?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&fdb=1&curr_page=${pageNum}`;
        },
        extractor: ($, source) => {
          const links = [];
          $('a.chakra-button, a.SerpJob-link').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href && (href.includes('/job/') || href.includes('rc/clk'))) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.simplyhired.com${href}`,
                title: $(elem).text().trim(),
                channel: source,
                source: source,
                scrapedAt: new Date().toISOString()
              });
            }
          });
          return links;
        }
      }
    ];

    for (const board of jobBoards) {
      try {
        const boardResults = await searchJobBoard(board, processId, browser, 20);
        if (boardResults.length > 0) {
          allJobLinks[board.name] = boardResults;
          channelStats[board.name] = boardResults.length;
        }
        // Small delay
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[Process ${processId}] Error searching ${board.name}:`, error.message);
        channelStats[board.name] = 0;
      }
    }

    // Combine results
    const allLinks = [];
    const seenUrls = new Set();

    for (const [channel, links] of Object.entries(allJobLinks)) {
      for (const link of links) {
        const normalizedUrl = link.url.split('?')[0].toLowerCase();
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          allLinks.push(link);
        }
      }
    }

    console.log(`[Process ${processId}] Job search completed:`);
    for (const [channel, count] of Object.entries(channelStats)) {
      console.log(`  ${channel}: ${count} jobs`);
    }
    console.log(`[Process ${processId}] Total unique jobs: ${allLinks.length}`);

    return {
      jobs: allLinks,
      channelStats: channelStats,
      totalJobs: allLinks.length
    };

  } catch (error) {
    console.error(`[Process ${processId}] Error in searchJobLinks:`, error.message);
    return { jobs: [], channelStats: {}, totalJobs: 0 };
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { }
    }
  }
}

/**
 * Appends job links to an Excel file named with process_id
 * @param {Object} searchResults - Object containing jobs array, channelStats, and totalJobs
 * @param {string} processId - Process ID for file naming
 * @param {Object} jobData - Original job search data (optional for this context but kept for signature)
 * @returns {Promise<void>}
 */
async function appendJobLinksToExcel(searchResults, processId, jobData) {
  const fileName = `${processId}_jobs.xlsx`;
  const outputDir = path.join(__dirname, '..', 'output');
  const filePath = path.join(outputDir, fileName);

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let existingJobs = [];

  if (fs.existsSync(filePath)) {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      existingJobs = xlsx.utils.sheet_to_json(worksheet);
    } catch (error) {
      console.error(`[Process ${processId}] Error reading existing Excel file:`, error.message);
    }
  }

  const existingUrls = new Set(existingJobs.map(job => {
    return job.url ? job.url.split('?')[0].toLowerCase() : '';
  }));

  const newJobs = searchResults.jobs.filter(link => {
    const normalizedUrl = link.url ? link.url.split('?')[0].toLowerCase() : '';
    return !existingUrls.has(normalizedUrl);
  });

  if (newJobs.length === 0) {
    console.log(`[Process ${processId}] No new unique jobs to append.`);
    return;
  }

  // Combine and write
  const allJobs = [...existingJobs, ...newJobs];

  // Create new workbook
  const newWorkbook = xlsx.utils.book_new();
  const newWorksheet = xlsx.utils.json_to_sheet(allJobs);
  xlsx.utils.book_append_sheet(newWorkbook, newWorksheet, "Jobs");

  try {
    xlsx.writeFile(newWorkbook, filePath);
    console.log(`[Process ${processId}] Appended ${newJobs.length} new job links to ${fileName}. Total: ${allJobs.length}`);
  } catch (error) {
    console.error(`[Process ${processId}] Error writing to Excel file:`, error.message);
  }
}

async function searchAndSaveJobLinks(jobData, processId) {
  try {
    jobData.location = "United States";
    console.log(`[Process ${processId}] Starting job search for:`, jobData);

    const searchResults = await searchJobLinks(jobData, processId);

    if (searchResults.jobs.length === 0) {
      console.log(`[Process ${processId}] No job links found`);
      return;
    }

    await appendJobLinksToExcel(searchResults, processId, jobData);

    console.log(`[Process ${processId}] Job search completed successfully`);
  } catch (error) {
    console.error(`[Process ${processId}] Error in searchAndSaveJobLinks:`, error.message);
  }
}

module.exports = {
  searchJobLinks,
  appendJobLinksToFile: appendJobLinksToExcel, // Maintaining alias for compatibility if needed, though implementing new logic
  appendJobLinksToExcel,
  searchAndSaveJobLinks
};
