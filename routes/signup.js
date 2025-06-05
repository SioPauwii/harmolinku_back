const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db'); 
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

router.post('/signup', [
  body('username').trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).escape(),
], async (req, res) => {
  const { username, email, password, recaptchaResponse } = req.body;

  // Verify reCAPTCHA
  const secretKey = '6LeSaTIrAAAAALLD-cSjuLjZqKZnfifJl_RedkF6';
  const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaResponse}`;

  try {
    const { data } = await axios.post(verificationUrl);
    if (!data.success) {
      return res.status(400).json({ message: 'reCAPTCHA verification failed.' });
    }

    // Check if username or email already exists
    const [existingUser] = await db.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUser.length > 0) {
      return res.status(422).json({
        message: 'Username or email is already taken.',
        errors: {
          username: existingUser.some(user => user.username === username) ? 'Username is already taken.' : null,
          email: existingUser.some(user => user.email === email) ? 'Email is already registered.' : null,
        },
      });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store user with unverified status and OTP
    await db.query(
      'INSERT INTO users (username, email, password, email_verified, otp_code, otp_expiry) VALUES (?, ?, ?, ?, ?, ?)',
      [username, email, hashedPassword, false, otp, otpExpiry]
    );

    // Send OTP email - FIX: Change createTransporter to createTransport
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const html = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: linear-gradient(135deg, #f3e6f7 0%, #dbb4d7 100%); padding: 48px 0; min-height: 100vh;">
  <tr>
    <td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0" style="background: #fff; border-radius: 20px; box-shadow: 0 6px 32px rgba(198,151,189,0.18); border: 2px solid #c697bd; padding: 0;">
        <tr>
          <td style="background: linear-gradient(90deg, #c697bd 0%, #dbb4d7 100%); border-radius: 20px 20px 0 0; padding: 32px 0 16px 0; text-align: center;">
            <h2 style="color: #fff; font-family: 'Fira Code', Arial, monospace; margin: 0; font-size: 2rem; letter-spacing: 1px;">Harmonilink</h2>
          </td>
        </tr>
        <tr>
          <td style="padding: 44px 40px 24px 40px; color: #322848; font-family: 'Fira Code', Arial, monospace; font-size: 17px; text-align: center;">
            <strong style="font-size: 1.35rem;">Verify Your Email</strong>
            <p style="margin: 24px 0 0 0; font-size: 1.1rem;">Hi ${username},</p>
            <p style="margin: 14px 0 26px 0;">Welcome to Harmonilink! Please use the verification code below to complete your registration:</p>
            <div style="background: linear-gradient(90deg, #432775 0%, #dbb4d7 100%); color: #fff; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; border-radius: 12px; margin: 32px 0; text-align: center; font-family: 'Courier New', monospace;">
              ${otp}
            </div>
            <div style="background: #f8eafd; border-radius: 12px; padding: 16px 20px; font-size: 15px; color: #432775; margin: 28px 0 0 0; border: 1.5px solid #e0cbe6;">
              This verification code will expire in <b>10 minutes</b>. If you did not create an account, you can safely ignore this email.
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px;">
            <hr style="border: none; border-top: 1.5px solid #dbb4d7; margin: 36px 0 0 0;" />
          </td>
        </tr>
        <tr>
          <td style="background: #c697bd; color: #fff; font-family: 'Fira Code', Arial, monospace; font-size: 15px; text-align: center; border-radius: 0 0 20px 20px; padding: 22px 0 14px 0;">
            Need help? Contact <a href="mailto:harmonilinkweb@gmail.com" style="color: #fff; text-decoration: underline;">harmonilinkweb@gmail.com</a><br>
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
      subject: 'Verify Your Harmonilink Account - Email Verification Code',
      html,
    });

    res.status(201).json({ 
      message: 'Account created successfully! Please check your email for the verification code.',
      email: email 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'An error occurred during signup.' });
  }
});

module.exports = router;