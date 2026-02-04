const mongoose = require('mongoose');

const mongoURI = 'mongodb://127.0.0.1:27017/typemaster';

console.log('Attempting to connect to:', mongoURI);

mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 })
  .then(() => {
    console.log('MongoDB Connected Successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('MongoDB Connection Error Details:');
    console.error(err);
    process.exit(1);
  });
