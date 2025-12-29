const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { getDb } = require('../mongo');

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
  const maxPages = 3;
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

  const { role, location } = jobData;
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
        name: 'ZipRecruiter',
        getUrl: (page) => {
          const pageNum = page + 1;
          return `https://www.ziprecruiter.com/candidate/search?search=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&page=${pageNum}`;
        },
        extractor: ($, source) => {
          const links = [];
          $('a.job_link, a.job_title').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.ziprecruiter.com${href}`,
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
        name: 'CareerBuilder',
        getUrl: (page) => {
          const pageNum = page + 1;
          return `https://www.careerbuilder.com/jobs?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&page_number=${pageNum}`;
        },
        extractor: ($, source) => {
          const links = [];
          $('a.data-results-content, a.job-listing-item, a[data-testid="job-card-title"]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.careerbuilder.com${href}`,
                title: $(elem).find('h3, .title').text().trim() || $(elem).text().trim(),
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
        name: 'Indeed',
        getUrl: (page) => {
          const start = page * 10;
          return `https://www.indeed.com/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&fromage=1&start=${start}`;
        },
        extractor: ($, source) => {
          const links = [];
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
      },
      {
        name: 'Monster',
        getUrl: (page) => {
          const pageNum = page + 1;
          return `https://www.monster.com/jobs/search?q=${encodeURIComponent(role)}&where=${encodeURIComponent(location)}&page=${pageNum}`;
        },
        extractor: ($, source) => {
          const links = [];
          $('a[data-testid="job-card-link"], a.job-card-style__JobCardLink-sc-1mbmxes-0').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.monster.com${href}`,
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
        name: 'Dice',
        getUrl: (page) => {
          const pageNum = page + 1;
          return `https://www.dice.com/jobs?q=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&p=${pageNum}`;
        },
        extractor: ($, source) => {
          const links = [];
          $('a.card-title-link').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.dice.com${href}`,
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
        name: 'Talent.com',
        getUrl: (page) => {
          const start = page * 10;
          return `https://www.talent.com/jobs?k=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}`;
        },
        extractor: ($, source) => {
          const links = [];
          $('a.link-job-wrap').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.talent.com${href}`,
                title: $(elem).find('h2').text().trim() || $(elem).text().trim(),
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
        name: 'CareerJet',
        getUrl: (page) => {
          const pageNum = page + 1;
          return `https://www.careerjet.com/search/jobs?s=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&p=${pageNum}`;
        },
        extractor: ($, source) => {
          const links = [];
          $('a.job-link').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.careerjet.com${href}`,
                title: $(elem).find('h2').text().trim() || $(elem).text().trim(),
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
 * Saves job links to MongoDB
 * @param {Array} jobs - Array of job objects
 * @param {string} processId - Process ID for logging
 * @param {Object} jobData - Original job search parameters (role, experience, etc.)
 */
async function saveJobsToMongo(jobs, processId, jobData) {
  if (!jobs || jobs.length === 0) return;

  try {
    const db = getDb();
    const collection = db.collection('job_links');

    let insertedCount = 0;

    // Process each job independently for upsert
    const ops = jobs.map(job => {
      const applyUrl = job.url; // Use original URL

      const doc = {
        title: job.title || "Unknown Title",
        company: "Unknown", // Current scraper doesn't extract company name robustly
        role: jobData.role || job.title,
        experience: jobData.experience || "all",
        country: "United States",
        apply_url: applyUrl,
        source: job.source,
        scrapedAt: new Date()
      };

      return {
        updateOne: {
          filter: { apply_url: applyUrl },
          update: { $set: doc },
          upsert: true
        }
      };
    });

    if (ops.length > 0) {
      const result = await collection.bulkWrite(ops);
      console.log(`[Process ${processId}] MongoDB Bulk Write: matched=${result.matchedCount}, modified=${result.modifiedCount}, upserted=${result.upsertedCount}`);
    }

  } catch (error) {
    console.error(`[Process ${processId}] Error saving to MongoDB:`, error.message);
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

    await saveJobsToMongo(searchResults.jobs, processId, jobData);

    console.log(`[Process ${processId}] Job search and save completed successfully`);
  } catch (error) {
    console.error(`[Process ${processId}] Error in searchAndSaveJobLinks:`, error.message);
  }
}

module.exports = {
  searchJobLinks,
  searchAndSaveJobLinks
};
