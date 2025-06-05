const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token.' });
    req.user = user; // Attach user info to the request
    next();
  });
}

// Discard a profile
router.post('/discard', authenticateToken, async (req, res) => {
  const { discarded_user_id } = req.body;

  if (!discarded_user_id) {
    return res.status(400).json({ message: 'Discarded user ID is required.' });
  }

  try {
    console.log('Discarding profile:', { user_id: req.user.id, discarded_user_id }); // Log request data
    await db.execute(
      'INSERT INTO discarded (user_id, discarded_user_id) VALUES (?, ?)',
      [req.user.id, discarded_user_id]
    );
    res.status(201).json({ message: 'Profile discarded.' });
  } catch (error) {
    console.error('Error discarding profile:', error); // Log the exact error
    res.status(500).json({ message: 'Failed to discard profile.' });
  }
});

module.exports = router;