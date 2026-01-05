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
  const maxPages = 2; // Reduced pages per board since we have 44 boards!
  let pageNum = 0;
  let page = null;

  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

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

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Reduced sleep for speed
        await new Promise(r => setTimeout(r, 500));

        const content = await page.content();
        const $ = cheerio.load(content);

        const pageLinks = query.extractor($, query.name);

        if (pageLinks.length === 0) {
          console.log(`[Process ${processId}] No results on ${query.name} page ${pageNum + 1}`);
          break;
        }

        jobLinks.push(...pageLinks);
        console.log(`[Process ${processId}] Found ${pageLinks.length} on ${query.name}`);

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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const jobBoards = [
      // 1. FlexJobs
      {
        name: 'FlexJobs',
        getUrl: (page) => `https://www.flexjobs.com/search?search=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&page=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('li.job a.job-link, a.job-title').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.flexjobs.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 2. Remote.co
      {
        name: 'Remote.co',
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
        getUrl: (page) => `https://wellfound.com/jobs?q=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          // Specific selectors are tricky due to React/dynamic, try generic 'a' in list
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
      // 14. Outsourcely
      /*
      // 14. Outsourcely - DNS Broken
      {
        name: 'Outsourcely',
        getUrl: (page) => `https://www.outsourcely.com/remote-jobs/${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-title').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.outsourcely.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 15. RemoteEurope - SSL Error
      {
        name: 'RemoteEurope',
        getUrl: (page) => `https://remote-europe.com/search?search=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-title').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://remote-europe.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      */
      // 16. Crossover
      {
        name: 'Crossover',
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
      // 17. YC Work at a Startup
      {
        name: 'YCStartup',
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
      // 18. PowerToFly
      {
        name: 'PowerToFly',
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
      // 19. Authentic Jobs
      {
        name: 'AuthenticJobs',
        getUrl: (page) => `https://authenticjobs.com/?s=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.project-title').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 20. RemoteHub
      {
        name: 'RemoteHub',
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
      // 21. Indeed
      {
        name: 'Indeed',
        getUrl: (page) => `https://www.indeed.com/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&fromage=4&start=${page * 10}`,
        extractor: ($, source) => {
          const links = [];
          $('a[id^="job_"], a.jcs-JobTitle').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.indeed.com${href}`, title: $(elem).find('span').text().trim() || $(elem).text().trim(), source });
          });
          return links;
        }
      },
      // 22. Monster
      {
        name: 'Monster',
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
      // 23. Glassdoor
      {
        name: 'Glassdoor',
        getUrl: (page) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(role)}&locT=C&locId=1&locKeyword=${encodeURIComponent(location)}&fromAge=4`,
        extractor: ($, source) => {
          const links = [];
          $('a.jobLink, a[data-test="job-link"]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.glassdoor.com${href}`, title: $(elem).text().trim(), source });
          });
          return links;
        }
      },
      // 24. LinkedIn
      {
        name: 'LinkedIn',
        getUrl: (page) => `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&f_TPR=r345600&start=${page * 25}`, // approx 4 days
        extractor: ($, source) => {
          const links = [];
          $('a.base-card__full-link').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 25. ZipRecruiter
      {
        name: 'ZipRecruiter',
        getUrl: (page) => `https://www.ziprecruiter.com/candidate/search?search=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&days=4&page=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job_link').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.ziprecruiter.com${href}`, title: $(elem).text().trim(), source });
          });
          return links;
        }
      },
      // 26. CareerBuilder
      {
        name: 'CareerBuilder',
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
      // 27. FlexJobs Corp (Duplicate of 1, skipping or reuse) - Adding as separate entry if desired or alias
      {
        name: 'FlexJobsCorp',
        getUrl: (page) => `https://www.flexjobs.com/search?search=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&page=${page + 1}`,
        extractor: ($, source) => { return []; } // Skip to avoid dupes
      },
      // 28. TheLadders
      {
        name: 'TheLadders',
        getUrl: (page) => `https://www.theladders.com/jobs/search-results?keywords=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-card-title').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.theladders.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 29. Snagajob
      {
        name: 'Snagajob',
        getUrl: (page) => `https://www.snagajob.com/search?q=${encodeURIComponent(role)}&w=${encodeURIComponent(location)}`,
        extractor: ($, source) => {
          const links = [];
          $('a[class*="job-card"]').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.snagajob.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 30. Craigslist
      {
        name: 'Craigslist',
        getUrl: (page) => `https://www.craigslist.org/search/jjj?query=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.result-title').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 31. Dice
      {
        name: 'Dice',
        getUrl: (page) => `https://www.dice.com/jobs?q=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&filters.postedDate=4&p=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('a.card-title-link').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.dice.com${href}`, title: $(elem).text().trim(), source });
          });
          return links;
        }
      },
      // 32. Careerjet
      {
        name: 'CareerJet',
        getUrl: (page) => `https://www.careerjet.com/search/jobs?s=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&sort=date&p=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-link').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.careerjet.com${href}`, title: $(elem).find('h2').text().trim(), source });
          });
          return links;
        }
      },
      // 33. USAJobs
      {
        name: 'USAJobs',
        getUrl: (page) => `https://www.usajobs.gov/Search/Results?k=${encodeURIComponent(role)}&p=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('a.usajobs-search-result--core__title').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.usajobs.gov${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 34. Upwork
      {
        name: 'Upwork',
        getUrl: (page) => `https://www.upwork.com/nx/jobs/search/?q=${encodeURIComponent(role)}&page=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('section a').each((i, el) => {
            const href = $(el).attr('href');
            if (href && href.includes('/jobs/')) links.push({ url: href.startsWith('http') ? href : `https://www.upwork.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 35. Freelancer
      {
        name: 'Freelancer',
        getUrl: (page) => `https://www.freelancer.com/jobs/?keyword=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.JobSearchCard-primary-heading-link').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.freelancer.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 36. Getwork
      {
        name: 'Getwork',
        getUrl: (page) => `https://getwork.com/search/results?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-title').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://getwork.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 37. Hubstaff Talent (Duplicate of 13)
      {
        name: 'HubstaffTalent2',
        getUrl: (page) => `https://talent.hubstaff.com/search/jobs?search=${encodeURIComponent(role)}`,
        extractor: ($, source) => { return []; }
      },
      // 38. Nexxt
      {
        name: 'Nexxt',
        getUrl: (page) => `https://www.nexxt.com/jobs/search?k=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-title').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 39. Dribbble
      {
        name: 'Dribbble',
        getUrl: (page) => `https://dribbble.com/jobs?keyword=${encodeURIComponent(role)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.job-list-item-link').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://dribbble.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 40. Google For Jobs - Hard to scrape, but let's try a search
      {
        name: 'GoogleJobs',
        getUrl: (page) => `https://www.google.com/search?q=${encodeURIComponent(role)}+jobs+near+${encodeURIComponent(location)}`,
        extractor: ($, source) => {
          // Google uses complex DOM, usually generic extractor or ignore
          return [];
        }
      },
      // 41. SimplyHired
      {
        name: 'SimplyHired',
        getUrl: (page) => `https://www.simplyhired.com/search?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}&fdb=4&curr_page=${page + 1}`,
        extractor: ($, source) => {
          const links = [];
          $('a.SerpJob-link').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.simplyhired.com${href}`, title: $(elem).text().trim(), source });
          });
          return links;
        }
      },
      // 42. PostJobFree
      {
        name: 'PostJobFree',
        getUrl: (page) => `https://www.postjobfree.com/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}`,
        extractor: ($, source) => {
          const links = [];
          $('a.titleLink').each((i, el) => {
            const href = $(el).attr('href');
            if (href) links.push({ url: href.startsWith('http') ? href : `https://www.postjobfree.com${href}`, title: $(el).text().trim(), source });
          });
          return links;
        }
      },
      // 43. Wellfound (Duplicate of AngelList)
      {
        name: 'Wellfound',
        getUrl: (page) => `https://wellfound.com/jobs?q=${encodeURIComponent(role)}`,
        extractor: ($, source) => { return []; }
      },
      // 44. AngelList (Duplicate)
      {
        name: 'AngelList2',
        getUrl: (page) => `https://wellfound.com/jobs`,
        extractor: ($, source) => { return []; }
      }
    ];

    const MAX_CONCURRENT = 5; // Reduced to 5 for stability
    for (let i = 0; i < jobBoards.length; i += MAX_CONCURRENT) {
      const chunk = jobBoards.slice(i, i + MAX_CONCURRENT);
      await Promise.all(chunk.map(async (board) => {
        try {
          // Reduce results per board to avoid overwhelming
          const boardResults = await searchJobBoard(board, processId, browser, 10);
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
    }

    const allLinks = [];
    const seenUrls = new Set();

    // Helper to check title relevance
    function isJobRelevant(title, role) {
      if (!title || !role) return false;
      const stopWords = ['and', 'or', 'the', 'in', 'at', 'for', 'a', 'an', 'of', 'inc', 'corp', 'llc', 'company'];

      const cleanStr = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));

      const roleWords = cleanStr(role);
      const titleWords = cleanStr(title);

      // If role has "engineer", checks if title has any role word. 
      // For "DevOps Engineer", matches "DevOps" OR "Engineer".
      // Strictness: Must match at least one significant word.
      return roleWords.some(rw => titleWords.includes(rw));
    }

    for (const [channel, links] of Object.entries(allJobLinks)) {
      for (const link of links) {
        const normalizedUrl = link.url.split('?')[0].toLowerCase();

        // Filter out duplicates check removed - allowing duplicates from different sources if unique per source
        // if (!seenUrls.has(normalizedUrl)) {
        if (isJobRelevant(link.title, role)) {
          // seenUrls.add(normalizedUrl);
          allLinks.push(link);
        } else {
          if (processId % 5 === 0) console.log(`[Process ${processId}] Skipped irrelevant job from ${channel}: "${link.title}" (Role: ${role})`);
        }
        // }
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

    const ops = jobs.map(job => {
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
