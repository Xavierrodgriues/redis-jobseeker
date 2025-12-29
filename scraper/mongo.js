const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { MongoClient } = require('mongodb');

// Environment variables with defaults
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || 'jobs_db';

let client;
let db;

/**
 * Connects to MongoDB and initializes the database and collections.
 * Ensures indexes are created.
 */
async function connectToMongo() {
  if (db) return db;

  try {
    client = new MongoClient(uri); // No deprecated options needed for v4+
    await client.connect();
    console.log('Connected to MongoDB');

    db = client.db(dbName);

    // Create unique index on apply_url to prevent duplicates
    const collection = db.collection('job_links');
    await collection.createIndex({ apply_url: 1 }, { unique: true });

    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Gets the database instance. Throws if not connected.
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call connectToMongo first.');
  }
  return db;
}

/**
 * Closes the MongoDB connection.
 */
async function closeMongo() {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
    client = null;
    db = null;
  }
}

module.exports = {
  connectToMongo,
  getDb,
  closeMongo
};
