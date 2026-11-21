require('dotenv').config();
const mongoose = require('mongoose');

const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
  console.error('MONGO_URI is not set. Add it to .env before running this test.');
  process.exit(1);
}

mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('MongoDB Connected Successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('MongoDB Connection Error:', err);
    process.exit(1);
  });
