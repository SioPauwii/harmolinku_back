const express = require('express');
const router = express.Router();
const db = require('../config/db'); 
const crypto = require('crypto');
const nodemailer = require('nodemailer');

router.post('/', async (req, res) => {
  const { email } = req.body;

  try {
    const [user] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (user.length === 0) {
      return res.status(404).json({ message: 'Email not found.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; 

    await db.query('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?', [
      resetToken,
      resetTokenExpiry,
      email,
    ]);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'harmonilinkweb@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD, 
      },
    });    

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await transporter.sendMail({
      from: '"Test" <harmonilinkweb@gmail.com>',
      to: email,
      subject: 'HTML Test',
      html: '<h1 style="color: red;">This is a test</h1><p>If you see this in red, HTML works!</p>'
    });
    
    res.status(200).json({ message: 'Password reset link sent to your email.' });
  } catch (error) {
    console.error('Error in forgot-password:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;