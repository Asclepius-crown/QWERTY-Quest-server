const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.cookies.token;
  console.log('Auth middleware: token present:', !!token);
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    console.log('Decoded user:', decoded.user);
    req.user = decoded.user;
    next();
  } catch (err) {
    console.log('JWT verify error:', err);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};