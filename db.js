const mongoose = require('mongoose');
const path = require('path');

// Cached connection for Serverless
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null, mongod: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = connect().catch((err) => {
      // Allow a retry on the next request instead of caching the failure
      cached.promise = null;
      cached.conn = null;
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

async function connect() {
  const opts = { serverSelectionTimeoutMS: 5000 };
  const mongoURI = process.env.MONGO_URI;

  if (mongoURI) {
    const connection = await mongoose.connect(mongoURI, opts);
    console.log('MongoDB Connected');
    return connection;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('MONGO_URI is not set');
  }

  // Local development: real mongod on disk so data survives restarts
  const { MongoMemoryServer } = require('mongodb-memory-server');
  // Keep dev DB files outside the project folder
  const dbPath = path.join(require('os').homedir(), '.qwerty-quest', 'mongo-data');
  require('fs').mkdirSync(dbPath, { recursive: true });
  cached.mongod = await MongoMemoryServer.create({ instance: { dbPath } });
  const connection = await mongoose.connect(cached.mongod.getUri(), opts);
  console.log(`MongoDB Connected (local dev data: ${dbPath})`);
  return connection;
}

module.exports = connectDB;
