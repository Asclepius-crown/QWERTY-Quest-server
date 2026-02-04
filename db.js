const mongoose = require('mongoose');

// Cached connection for Serverless
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      serverSelectionTimeoutMS: 5000,
    };

    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/typemaster';
    
    cached.promise = mongoose.connect(mongoURI, opts).then((mongoose) => {
      console.log('MongoDB Connected');
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

module.exports = connectDB;