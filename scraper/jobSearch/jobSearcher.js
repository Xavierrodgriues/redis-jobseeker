const cheerio = require('cheerio');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { getDb } = require('../mongo');
const fs = require('fs');

puppeteer.use(StealthPlugin());

/**
 * Helper to auto-scroll the page to trigger lazy loading
 */
async function autoScroll(page) {
  try {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  } catch (err) {
    // Ignore scrolling errors
  }
}

/**
 * Searches a specific job board with pagination
 * @param {Object} query - Query object with name, url, extractor, dynamic flag
 * @param {string} processId - Process ID for logging
 * @param {Object} browser - Puppeteer browser instance
 * @param {number} minResults - Minimum number of results to fetch (default: 20)
 * @returns {Promise<Array>} Array of job links from this source
 */
async function searchJobBoard(query, processId, browser, minResults = 20) {
  const jobLinks = [];
  const maxPages = 2; // Reduced pages per board since we have many boards
  let pageNum = 0;
  let page = null;

  try {
    page = await browser.newPage();
    // Randomize viewport slightly
    const width = 1366 + Math.floor(Math.random() * 100);
    const height = 768 + Math.floor(Math.random() * 100);
    await page.setViewport({ width, height });

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      // Only block heavy media, keep scripts/xhr for dynamic sites
      if (['image', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    while (jobLinks.length < minResults && pageNum < maxPages) {
      try {
        const url = query.getUrl(pageNum);
        console.log(`🌐 [${query.name}] Scraping started (page ${pageNum + 1})`);

        // Navigate with better wait conditions
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Check for bad status codes
        if (response && response.status() >= 400) {
          console.warn(`[Process ${processId}] Start ${query.name} returned status ${response.status()}`);
        }

        // Wait for network idle to ensure dynamic content loads
        try {
          await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 });
        } catch (e) {
          // fast pages might not wait long, ignore timeout
        }

        // Scroll to trigger lazy loading
        await autoScroll(page);

        if (query.dynamic) {
          await new Promise(r => setTimeout(r, 2000));
        }

        let pageLinks = [];

        if (query.dynamic) {
          // Dynamic mode: Execute extractor in browser context
          pageLinks = await page.evaluate(query.extractor, query.name);
        } else {
          // Static mode: Use Cheerio
          const content = await page.content();
          const $ = cheerio.load(content);
          pageLinks = query.extractor($, query.name);
        }

        const htmlContent = await page.content();
        console.log(`🔎 [${query.name}] Status: ${response ? response.status() : 'unknown'} | HTML size: ${htmlContent.length}`);

        if (!pageLinks || pageLinks.length === 0) {
          // Log debugging info for zero results
          const title = await page.title();
          const currentUrl = page.url();
          console.log(`[Process ${processId}] No results on ${query.name} page ${pageNum + 1}. Title: "${title}", URL: "${currentUrl}"`);

          // Check for potential captcha/login
          const lowerTitle = title.toLowerCase();
          const lowerContent = htmlContent.toLowerCase();

          if (lowerTitle.includes('captcha') || lowerTitle.includes('robot') || lowerTitle.includes('verify you are human') || lowerTitle.includes('access denied') ||
            lowerContent.includes('verify you are human') || lowerContent.includes('captcha')) {
            console.warn(`🚫 [${query.name}] Bot protection detected`);
          }

          // Dump HTML (Disabled by user request)
          // const dumpFileName = `debug-${query.name}.html`;
          // fs.writeFileSync(dumpFileName, htmlContent);
          // console.log(`📄 [${query.name}] HTML dumped to ${dumpFileName}`);

          break;
        }

        jobLinks.push(...pageLinks);
        console.log(`📦 [${query.name}] Jobs extracted: ${pageLinks.length}`);

        if (jobLinks.length < minResults) {
          pageNum++;
        } else {
          break;
        }
      } catch (error) {
        console.error(`[Process ${processId}] Error on ${query.name}:`, error.message);
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

async function searchJobLinks(jobData, processId) {
  jobData.location = "United States";
  const { role, location } = jobData;
  const allJobLinks = {};
  const channelStats = {};
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-features=IsolateOrigins,site-per-process']
    });

    const jobBoards = [
      // 1. FlexJobs
      {
        name: 'FlexJobs',
        dynamic: false,
        getUrl: (page) => `https://www.flexjobs.com/search?search=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&page=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('li.job, a.job-link, a.job-title').each((i, el) => {
            const href = $(el).attr('href') || $(el).find('a').attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.flexjobs.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 2. Remote.co
      {
        name: 'Remote.co',
        dynamic: false,
        getUrl: (page) => `https://remote.co/remote-jobs/search/?search_keywords=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.card').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://remote.co${href}`, title: $(el).find('span.font-weight-bold').text().trim(), source });
          });
          return links;
        }
      },
      // 3. We Work Remotely
      {
        name: 'WeWorkRemotely',
        dynamic: false,
        getUrl: (page) => `https://weworkremotely.com/remote-jobs/search?term=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('section.jobs li a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.startsWith('/remote-jobs/')) links.push({ url: `https://weworkremotely.com${href}`, title: $(el).find('.title').text().trim(), source });
          });
          return links;
        }
      },
      // 4. JustRemote
      {
        name: 'JustRemote',
        dynamic: false,
        getUrl: (page) => `https://justremote.co/remote-jobs?item=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-card').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://justremote.co${href}`, title: $(el).find('.job-title').text().trim(), source });
          });
          return links;
        }
      },
      // 5. Remote OK
      {
        name: 'RemoteOK',
        dynamic: false,
        getUrl: (page) => `https://remoteok.com/remote-${encodeURIComponent(role).replace(/%20/g, '-')}-jobs`,
        extractor: ($, source) => {
          const links = [];
          $('tr.job td.company a.preventLink').remove();
          $('tr.job').each((i, el) => {
            const href = $(el).attr('data-href') || $(el).find('a.preventLink').attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://remoteok.com${href}`, title: $(el).find('h2').text().trim(), source });
          });
          return links;
        }
      },
      // 6. Working Nomads
      {
        name: 'WorkingNomads',
        dynamic: false,
        getUrl: (page) => `https://www.workingnomads.com/jobs?q=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-list-item').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.workingnomads.com${href}`, title: $(el).find('h4').text().trim(), source });
          });
          return links;
        }
      },
      // 7. Remotive
      {
        name: 'Remotive',
        dynamic: false,
        getUrl: (page) => `https://remotive.com/remote-jobs/search?query=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-card-title').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://remotive.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 8. AngelList (Wellfound)
      {
        name: 'AngelList',
        dynamic: false,
        getUrl: (page) => `https://wellfound.com/jobs?q=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('div[data-test="JobListItem"] a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/jobs/')) links.push({ url: href.startsWith('http') ? href : `https://wellfound.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 9. Pangian
      {
        name: 'Pangian',
        dynamic: false,
        getUrl: (page) => `https://pangian.com/job-travel-remote/?search_keywords=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-url').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href, title: $(el).find('.job-title').text().trim(), source });
          });
          return links;
        }
      },
      // 10. Virtual Vocations
      {
        name: 'VirtualVocations',
        dynamic: false,
        getUrl: (page) => `https://www.virtualvocations.com/jobs/q-${encodeURIComponent(role)}/page/${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-link').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 11. SkipTheDrive
      {
        name: 'SkipTheDrive',
        dynamic: false,
        getUrl: (page) => `https://www.skipthedrive.com/page/${page + 1}/?s=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('h2.entry-title a').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 12. Jobspresso
      {
        name: 'Jobspresso',
        dynamic: false,
        getUrl: (page) => `https://jobspresso.co/?s=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job_listing-clickbox').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href, title: 'Jobspresso Job', source });
          });
          return links;
        }
      },
      // 13. Hubstaff Talent
      {
        name: 'HubstaffTalent',
        dynamic: false,
        getUrl: (page) => `https://talent.hubstaff.com/search/jobs?search=${encodeURIComponent(role)}&page=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-name').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://talent.hubstaff.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 14. Crossover
      {
        name: 'Crossover',
        dynamic: false,
        getUrl: (page) => `https://www.crossover.com/jobs?q=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.card').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.crossover.com${href}`, title: $(el).find('.card-title').text().trim(), source });
          });
          return links;
        }
      },
      // 15. YC Work at a Startup
      {
        name: 'YCStartup',
        dynamic: false,
        getUrl: (page) => `https://www.workatastartup.com/jobs?query=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-name').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.workatastartup.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 16. PowerToFly
      {
        name: 'PowerToFly',
        dynamic: false,
        getUrl: (page) => `https://powertofly.com/jobs/?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-card-link').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://powertofly.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 17. RemoteHub
      {
        name: 'RemoteHub',
        dynamic: false,
        getUrl: (page) => `https://www.remotehub.com/jobs/search?query=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a[href^="/jobs/"]').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.length > 6) links.push({ url: `https://www.remotehub.com${href}`, title: $(el).text().trim() || "RemoteHub Job", source });
          });
          return links;
        }
      },
      // 18. Indeed (Dynamic)
      {
        name: 'Indeed',
        dynamic: true,
        getUrl: (page) => `https://www.indeed.com/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&fromage=4&start=${page * 10}`,
        extractor: (source) => {
          const links = [];
          // Indeed changes selectors often, try multiple
          const output = document.querySelectorAll('a[id^="job_"], a.jcs-JobTitle');
          output.forEach(el => {
            const href = el.getAttribute('href');
            const title = el.innerText || el.textContent;
            if (href && title) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.indeed.com${href}`,
                title: title.trim(),
                source: source
              });
            }
          });
          return links;
        }
      },
      // 19. Monster (static/cheerio usually ok, but lets keep it static for now)
      {
        name: 'Monster',
        dynamic: false,
        getUrl: (page) => `https://www.monster.com/jobs/search?q=${encodeURIComponent(role)}&where=${encodeURIComponent(location)}&tm=4&page=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('a[data-testid="job-card-link"]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.monster.com${href}`, title: $(elem).text().trim(), source });
          });
          return links;
        }
      },
      // 20. Glassdoor (Dynamic)
      {
        name: 'Glassdoor',
        dynamic: true,
        getUrl: (page) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(role)}&locT=C&locId=1&locKeyword=${encodeURIComponent(location)}&fromAge=4`,
        extractor: (source) => {
          const links = [];
          const output = document.querySelectorAll('a.jobLink, a[data-test="job-link"]');
          output.forEach(el => {
            const href = el.getAttribute('href');
            let title = el.innerText || el.textContent;
            // Clean title if it contains rating numbers
            title = title.replace(/\d\.\d.*/, '').trim();

            if (href && title) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.glassdoor.com${href}`,
                title: title,
                source: source
              });
            }
          });
          return links;
        }
      },
      // 21. LinkedIn (Dynamic)
      {
        name: 'LinkedIn',
        dynamic: true,
        getUrl: (page) => `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&f_TPR=r345600&start=${page * 25}`,
        extractor: (source) => {
          const links = [];
          // base-card__full-link is common for "guest" search view
          const output = document.querySelectorAll('a.base-card__full-link, a.job-card-list__title');
          output.forEach(el => {
            const href = el.getAttribute('href');
            const title = el.innerText || el.textContent;
            if (href && title) {
              links.push({
                url: href.split('?')[0],
                title: title.trim(),
                source: source
              });
            }
          });
          return links;
        }
      },
      // 22. ZipRecruiter (Dynamic sometimes needed)
      {
        name: 'ZipRecruiter',
        dynamic: true,
        getUrl: (page) => `https://www.ziprecruiter.com/candidate/search?search=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&days=4&page=${page + 1}`,
        extractor: (source) => {
          const links = [];
          const output = document.querySelectorAll('a.job_link');
          output.forEach(el => {
            const href = el.getAttribute('href');
            const title = el.innerText || el.textContent;
            if (href && title) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.ziprecruiter.com${href}`,
                title: title.trim(),
                source: source
              });
            }
          });
          return links;
        }
      },
      // 23. CareerBuilder
      {
        name: 'CareerBuilder',
        dynamic: false,
        getUrl: (page) => `https://www.careerbuilder.com/jobs?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&posted=4&page_number=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('a.data-results-content').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.careerbuilder.com${href}`, title: $(elem).find('.title').text().trim(), source });
          });
          return links;
        }
      },
      // 24. Dice (Dynamic)
      {
        name: 'Dice',
        dynamic: true,
        getUrl: (page) => `https://www.dice.com/jobs?q=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&filters.postedDate=4&p=${page + 1}`,
        extractor: (source) => {
          const links = [];
          // Dice uses Shadow DOM sometimes, or complex React. selector might find nothing if not lucky.
          const output = document.querySelectorAll('a.card-title-link');
          output.forEach(el => {
            const href = el.getAttribute('href');
            const title = el.innerText || el.textContent;
            if (href && title) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.dice.com${href}`,
                title: title.trim(),
                source: source
              });
            }
          });
          return links;
        }
      },
      // 25. SimplyHired (Dynamic)
      {
        name: 'SimplyHired',
        dynamic: true,
        getUrl: (page) => `https://www.simplyhired.com/search?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&fdb=4&curr_page=${page + 1}`,
        extractor: (source) => {
          const links = [];
          const output = document.querySelectorAll('a.SerpJob-link, h3[data-testid="searchSerpJobTitle"] a');
          output.forEach(el => {
            const href = el.getAttribute('href');
            const title = el.innerText || el.textContent;
            if (href && title) {
              links.push({
                url: href.startsWith('http') ? href : `https://www.simplyhired.com${href}`,
                title: title.trim(),
                source: source
              });
            }
          });
          return links;
        }
      }
    ];

    const MAX_CONCURRENT = 3; // Reduced concurrency for safety

    // Chunk processing
    for (let i = 0; i < jobBoards.length; i += MAX_CONCURRENT) {
      const chunk = jobBoards.slice(i, i + MAX_CONCURRENT);
      console.log(`[Process ${processId}] Starting chunk ${i / MAX_CONCURRENT + 1} with ${chunk.length} boards`);

      await Promise.all(chunk.map(async (board) => {
        try {
          // Keep minResults low to avoid aggressive scraping
          const boardResults = await searchJobBoard(board, processId, browser, 15);
          if (boardResults.length > 0) {
            allJobLinks[board.name] = boardResults;
            channelStats[board.name] = boardResults.length;
          } else {
            channelStats[board.name] = 0;
          }
        } catch (error) {
          console.error(`[Process ${processId}] Error searching ${board.name}:`, error.message);
          channelStats[board.name] = 0;
        }
      }));

      // Small pause between chunks
      await new Promise(r => setTimeout(r, 1000));
    }

    const allLinks = [];

    // Helper to check title relevance
    function isJobRelevant(title, role) {
      if (!title || !role) return false;
      const stopWords = ['and', 'or', 'the', 'in', 'at', 'for', 'a', 'an', 'of', 'inc', 'corp', 'llc', 'company'];

      const cleanStr = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));

      const roleWords = cleanStr(role);
      const titleWords = cleanStr(title);

      // Relevance check: Title must contain at least one significant word from the role
      return roleWords.some(rw => titleWords.includes(rw));
    }

    for (const [channel, links] of Object.entries(allJobLinks)) {
      for (const link of links) {
        if (!link.title) continue;

        if (isJobRelevant(link.title, role)) {
          allLinks.push(link);
        } else {
          // Sampling log to avoid spam
          if (Math.random() < 0.05) {
            console.log(`[Process ${processId}] Skipped irrelevant job from ${channel}: "${link.title}"`);
          }
        }
      }
    }

    console.log(`[Process ${processId}] Job search completed:`);
    for (const [channel, count] of Object.entries(channelStats)) {
      if (count > 0) console.log(`  ${channel}: ${count} jobs`);
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

async function saveJobsToMongo(jobs, processId, jobData) {
  if (!jobs || jobs.length === 0) return;

  try {
    const db = getDb();
    const collection = db.collection('job_links');

    // Group jobs by source for granular logging
    const jobsBySource = {};
    for (const job of jobs) {
      const source = job.source || 'Unknown';
      if (!jobsBySource[source]) jobsBySource[source] = [];
      jobsBySource[source].push(job);
    }

    for (const [source, sourceJobs] of Object.entries(jobsBySource)) {
      console.log(`💾 [${source}] Attempting to save ${sourceJobs.length} jobs`);

      const ops = sourceJobs.map(job => {
        // Use URL as unique ID
        const applyUrl = job.url;
        const doc = {
          title: job.title || "Unknown Title",
          company: "Unknown",
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
        const saved = result.upsertedCount + result.modifiedCount; // Counting modified as saved/updated
        const duplicates = result.matchedCount - result.modifiedCount; // Matched but not modified implies pure duplicate (or just matched)

        // Actually, matchedCount includes both modified and not modified.
        // upsertedCount = inserted.
        // matchedCount = found existing.
        // So "Duplicates skipped" roughly equals matchedCount if we assume we aren't changing much.
        // But let's stick to the user's "Saved" vs "skipped".
        // New inserts = upsertedCount.
        // Updates = modifiedCount.
        // Skips (exact match) = matchedCount - modifiedCount.

        // Simple log:
        if (result.upsertedCount > 0) console.log(`✅ [${source}] Saved ${result.upsertedCount} new jobs`);
        if (result.matchedCount > 0) console.log(`⚠️ [${source}] Duplicate jobs skipped/updated: ${result.matchedCount}`);
      }
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
