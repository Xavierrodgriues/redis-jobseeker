@echo off
cd /d C:\Users\Lenovo\Desktop\redis-job\redis-parallel-scraper

echo ===== Starting job seed =====
node seed_jobs.js

echo ===== Waiting 10 seconds =====
timeout /t 10 > nul

echo ===== Starting scraper =====
node scrapper.js

echo ===== Job completed =====
