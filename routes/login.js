const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many login attempts. Please try again later.',
});

router.post('/login', loginLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').escape(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, rememberMe } = req.body;

  if (!email || !password) {
    return res.status(422).json({ message: 'Email and password are required.' });
  }

  try {
    const [user] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (user.length === 0) {
      return res.status(404).json({ message: 'User not registered.' });
    }

    const foundUser = user[0];

    // CHECK EMAIL VERIFICATION STATUS - NEW SECURITY CHECK
    if (!foundUser.email_verified) {
      return res.status(403).json({ 
        message: 'Please verify your email before logging in.',
        requiresVerification: true,
        email: email
      });
    }

    const isPasswordValid = await bcrypt.compare(password, foundUser.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const tokenExpiry = rememberMe ? '30d' : '1h';
    const maxAgeMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;

    const token = jwt.sign({ id: foundUser.id }, process.env.JWT_SECRET, { expiresIn: tokenExpiry });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Only secure in production
      sameSite: 'Strict',
      maxAge: maxAgeMs,
    });

    res.status(200).json({
      message: 'Login successful',
      token,
      user_id: foundUser.id,
      onboarding_completed: foundUser.onboarding_completed
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;