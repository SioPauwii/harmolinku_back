require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

transporter.sendMail({
  from: `"Test" <${process.env.EMAIL_USER}>`,
  to: process.env.EMAIL_USER,
  subject: 'Test Email',
  text: 'This is a test email.',
}, (err, info) => {
  if (err) {
    console.error('Send error:', err);
  } else {
    console.log('Sent:', info.response);
  }
});