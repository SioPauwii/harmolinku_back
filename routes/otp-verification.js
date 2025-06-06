const express = require('express');
const router = express.Router();
const db = require('../config/db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required.' });
  }

  try {
    const [user] = await db.query(
      'SELECT * FROM users WHERE email = ? AND otp_code = ? AND otp_expiry > NOW()',
      [email, otp]
    );

    if (user.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    // Update user as verified and clear OTP
    await db.query(
      'UPDATE users SET email_verified = true, otp_code = NULL, otp_expiry = NULL WHERE email = ?',
      [email]
    );

    res.status(200).json({ message: 'Email verified successfully!' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    const [user] = await db.query(
      'SELECT * FROM users WHERE email = ? AND email_verified = false',
      [email]
    );

    if (user.length === 0) {
      return res.status(404).json({ message: 'User not found or already verified.' });
    }

    // Generate new OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Update OTP in database
    await db.query(
      'UPDATE users SET otp_code = ?, otp_expiry = ? WHERE email = ?',
      [otp, otpExpiry, email]
    );

    // Send new OTP email - FIX: Change createTransporter to createTransport
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
            <strong style="font-size: 1.35rem;">New Verification Code</strong>
            <p style="margin: 24px 0 0 0; font-size: 1.1rem;">Hi ${user[0].username},</p>
            <p style="margin: 14px 0 26px 0;">Here's your new verification code:</p>
            <div style="background: linear-gradient(90deg, #432775 0%, #dbb4d7 100%); color: #fff; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; border-radius: 12px; margin: 32px 0; text-align: center; font-family: 'Courier New', monospace;">
              ${otp}
            </div>
            <div style="background: #f8eafd; border-radius: 12px; padding: 16px 20px; font-size: 15px; color: #432775; margin: 28px 0 0 0; border: 1.5px solid #e0cbe6;">
              This verification code will expire in <b>10 minutes</b>.
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
      subject: 'New Verification Code - Harmonilink',
      html,
    });

    res.status(200).json({ message: 'New verification code sent successfully!' });
  } catch (error) {
    console.error('Error resending OTP:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;