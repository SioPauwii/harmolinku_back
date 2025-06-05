const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db'); 

router.post('/', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and password are required.' });
  }

  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [user] = await db.query(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?',
      [token, now]
    );

    if (user.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired token.' });
    }

    // Check if new password matches the old password
    const isSamePassword = await bcrypt.compare(password, user[0].password);
    if (isSamePassword) {
      return res.status(400).json({ 
        message: 'New password must be different from your current password.' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query('UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?', [
      hashedPassword,
      user[0].id,
    ]);

    res.status(200).json({ message: 'Password reset successful.' });
  } catch (error) {
    console.error('Error in reset-password:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;