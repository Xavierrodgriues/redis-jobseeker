const { spawn } = require('child_process');
const path = require('path');


// 🔹 Configuration
const MAX_PARALLEL = 4; // Configurable concurrency default
const SCRAPER_SCRIPT = path.join(__dirname, 'scraper', 'scraper.js');

// 🔹 Shard Definitions (Copied from GitHub Actions Matrix)
const SHARDS = [
    {
        name: 'core-engineering',
        roles: [
            "Backend Engineer", "Frontend Engineer", "Full Stack Engineer", "Mobile Engineer",
            "Software Engineer", "Platform Engineer", "Systems Engineer", "Embedded Systems Engineer", "UI UX"
        ]
    },
    {
        name: 'cloud-devops',
        roles: [
            "Cloud Engineer", "Cloud Architect", "DevOps Engineer", "Site Reliability Engineer (SRE)",
            "Infrastructure Engineer", "Cloud Strategy Consultant", "Network Cloud Engineer"
        ]
    },
    {
        name: 'security-risk',
        roles: [
            "Security Engineer", "Cloud Security Engineer", "Application Security Engineer",
            "Network Security Engineer", "Cyber Security Analyst", "GRC / Compliance Engineer",
            "IT Auditor", "FedRAMP / ATO Engineer", "Technology Risk Manager"
        ]
    },
    {
        name: 'data-ai',
        roles: [
            "Data Engineer", "Data Scientist", "Analytics Engineer", "Business Intelligence Engineer",
            "Machine Learning Engineer", "AI Engineer", "Financial Analyst"
        ]
    },
    {
        name: 'qa-testing',
        roles: [
            "QA Engineer", "Automation Test Engineer", "Performance Test Engineer",
            "Security Test Engineer", "Test Lead / QA Lead"
        ]
    },
    {
        name: 'it-operations',
        roles: [
            "IT Infrastructure Engineer", "IT Operations Engineer", "Linux / Unix Administrator",
            "Monitoring / SIEM Engineer", "Observability Engineer", "Release / Configuration Manager",
            "Network Engineer"
        ]
    },
    {
        name: 'enterprise-apps',
        roles: [
            "SAP Analyst", "ERP Consultant", "CRM Consultant", "ServiceNow Developer / Admin",
            "IT Asset / ITOM Engineer", "Workday Analyst", "Salesforce Developer"
        ]
    },
    {
        name: 'architecture-leadership',
        roles: [
            "Enterprise Architect", "Solutions Architect", "IT Manager", "CTO / CIO",
            "Product Manager", "Technical Product Manager", "Project Manager", "Program Manager"
        ]
    },
    {
        name: 'emerging-tech',
        roles: [
            "Blockchain Engineer", "IoT Engineer", "Robotics Engineer", "AR / VR Engineer",
            "AML KYC", "Business Analyst"
        ]
    }
];

// 🔹 Helper Function to Run a Single Job
function runJob(shard) {
    return new Promise((resolve, reject) => {
        console.log(`[Orchestrator] Starting shard: ${shard.name}`);

        const env = {
            ...process.env,
            ROLES: JSON.stringify(shard.roles)
        };

        const child = spawn('node', [SCRAPER_SCRIPT], {
            env,
            stdio: 'inherit', // Pipe output directly to main process
            cwd: __dirname
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`[Orchestrator] ✔ Shard completed: ${shard.name}`);
                resolve({ shard: shard.name, status: 'success' });
            } else {
                console.error(`[Orchestrator] ❌ Shard failed: ${shard.name} with code ${code}`);
                // Rejecting here means Promise.allSettled will see it as "rejected", 
                // which helps us distinguish success vs failure in the summary.
                reject(new Error(`Shard ${shard.name} failed with code ${code}`));
            }
        });

        child.on('error', (err) => {
            console.error(`[Orchestrator] ❌ Failed to spawn shard: ${shard.name}`, err);
            reject(err);
        });
    });
}

// 🔹 Main Orchestration Runner
async function main() {
    console.log('--------------------------------------------------');
    console.log(`[Orchestrator] Starting Job Pipeline at ${new Date().toISOString()}`);
    console.log(`[Orchestrator] Total Shards: ${SHARDS.length} | Concurrency: ${MAX_PARALLEL}`);
    console.log('--------------------------------------------------');

    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(MAX_PARALLEL);

    // Map shards to promisfied limited tasks
    const tasks = SHARDS.map(shard =>
        limit(() => runJob(shard))
    );

    // Wait for all to finish (Settled means they finished, success or fail)
    const results = await Promise.allSettled(tasks);

    // 🔹 Summary Report
    console.log('\n--------------------------------------------------');
    console.log('[Orchestrator] Pipeline Finished. Summary:');

    let successCount = 0;
    let failCount = 0;

    results.forEach((result, index) => {
        const shardName = SHARDS[index].name;
        if (result.status === 'fulfilled') {
            console.log(`✔ [SUCCESS] ${shardName}`);
            successCount++;
        } else {
            console.error(`❌ [FAILED]  ${shardName} - ${result.reason.message}`);
            failCount++;
        }
    });

    console.log('--------------------------------------------------');
    console.log(`Total: ${SHARDS.length} | Success: ${successCount} | Failed: ${failCount}`);

    if (failCount > 0) {
        console.warn(`[Orchestrator] Completed with ${failCount} failures.`);
        // We exit with 0 to prevent PM2 from restarting the orchestrator in a crash loop if configured that way,
        // but typically for Cron mode, it doesn't matter much. 
        process.exit(0);
    } else {
        console.log('[Orchestrator] All jobs completed successfully.');
        process.exit(0);
    }
}

// Start
main().catch(err => {
    console.error('[Orchestrator] Critical System Error:', err);
    process.exit(1);
});
