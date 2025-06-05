const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db'); 
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token.' });
    req.user = user; 
    next();
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: 'Too many login attempts. Please try again later.',
});

router.post('/signup', [
  body('username').trim().isLength({ min: 3 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).escape(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Signup logic
  } catch (error) {
    next(error); 
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const [user] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (user.length === 0) {
      return res.status(404).json({ message: 'Email not found.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    // Save as DATETIME string for MySQL
    const resetTokenExpiry = new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' ');

    await db.query('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?', [
      resetToken,
      resetTokenExpiry,
      email,
    ]);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const userName = user[0].username || '';

    const html = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #f3e6f7 0%, #dbb4d7 100%); padding: 48px 0; min-height: 100vh;">
  <tr>
    <td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0" style="background: #fff; border-radius: 20px; box-shadow: 0 6px 32px rgba(198,151,189,0.18); border: 2px solid #c697bd; padding: 0;">
        <!-- Header Bar -->
        <tr>
          <td style="background: linear-gradient(90deg, #c697bd 0%, #dbb4d7 100%); border-radius: 20px 20px 0 0; padding: 32px 0 16px 0; text-align: center;">
            <h2 style="color: #fff; font-family: 'Fira Code', Arial, monospace; margin: 0; font-size: 2rem; letter-spacing: 1px;">Harmonilink</h2>
          </td>
        </tr>
        <!-- Main Content -->
        <tr>
          <td style="padding: 44px 40px 24px 40px; color: #322848; font-family: 'Fira Code', Arial, monospace; font-size: 17px;">
            <strong style="font-size: 1.35rem;">Reset Your Password</strong>
            <p style="margin: 24px 0 0 0; font-size: 1.1rem;">Hi${userName ? ' ' + userName : ' there'},</p>
            <p style="margin: 14px 0 26px 0;">We received a request to reset your Harmonilink account password.<br>
            Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="background: linear-gradient(90deg, #432775 0%, #dbb4d7 100%); color: #fff; text-decoration: none; padding: 18px 44px; border-radius: 12px; font-weight: bold; font-size: 19px; box-shadow: 0 2px 12px rgba(67,39,117,0.10); display: inline-block;">Reset Password</a>
            </div>
            <div style="background: #f8eafd; border-radius: 12px; padding: 16px 20px; font-size: 15px; color: #432775; margin: 28px 0 0 0; border: 1.5px solid #e0cbe6;">
              If the button above doesn't work, copy and paste this link into your browser:<br>
              <a href="${resetLink}" style="color: #1a73e8; word-break: break-all;">${resetLink}</a>
            </div>
            <p style="color: #666; font-size: 15px; margin: 28px 0 0 0;">
              This link will expire in <b>1 hour</b>. If you did not request a password reset, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <!-- Divider -->
        <tr>
          <td style="padding: 0 40px;">
            <hr style="border: none; border-top: 1.5px solid #dbb4d7; margin: 36px 0 0 0;" />
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background: #c697bd; color: #fff; font-family: 'Fira Code', Arial, monospace; font-size: 15px; text-align: center; border-radius: 0 0 20px 20px; padding: 22px 0 14px 0;">
            Need help? Contact <a href="mailto:support@harmonilink.com" style="color: #fff; text-decoration: underline;">harmonilinkweb@gmail.com</a><br>
            <span style="color: #f3e6f7;">© 2024 Harmonilink. All rights reserved.</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset Your Harmonilink Password',
      html,
    });

    res.status(200).json({ message: 'Password reset link sent to your email.' });
  } catch (error) {
    console.error('Error in forgot password:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  try {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const [user] = await db.query(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?',
      [token, now]
    );

    if (user.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired token.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?', [
      hashedPassword,
      user[0].id,
    ]);

    res.status(200).json({ message: 'Password reset successful.' });
  } catch (error) {
    console.error('Error in reset password:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/complete-onboarding', async (req, res) => {
  const { user_id } = req.body;

  try {
    await db.query('UPDATE users SET onboarding_completed = TRUE WHERE id = ?', [user_id]);
    res.status(200).json({ message: 'Onboarding completed.' });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Fetch current user profile
router.get('/current-user', authenticateToken, async (req, res) => {
  try {
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user || user.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json(user[0]);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Failed to fetch user profile.' });
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    // Login logic
  } catch (error) {
    next(error);
  }
});

module.exports = router;