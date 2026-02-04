const app = require('../app');
const connectDB = require('../db');

module.exports = async (req, res) => {
  await connectDB();
  app(req, res);
};