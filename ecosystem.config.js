module.exports = {
    apps: [
        {
            name: 'job-scraper-orchestrator',
            script: './orchestrator.js',
            instances: 1,
            autorestart: false, // Ensure it doesn't auto-restart immediately after finishing
            cron_restart: '0 5,17 * * *', // Runs at 5:00 AM and 5:00 PM
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            error_file: './logs/orchestrator-error.log',
            out_file: './logs/orchestrator-out.log',
            merge_logs: true
        }
    ]
};
