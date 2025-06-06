require('dotenv').config();
const nodemailer = require('nodemailer');
const port = process.env.PORT || 3000;

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const signupRoute = require('./routes/signup');
const loginRoute = require('./routes/login');
const profileRoutes = require('./routes/profile'); // Import profile route
const mixtapeRoute = require('./routes/mixtape');
const authRoute = require('./routes/auth'); // Import auth route
const resetPasswordRoute = require('./routes/reset-password'); // Import reset-password route
const discoverRoute = require('./routes/discover'); // Import discover route
const discardRoute = require('./routes/discard'); // Import discard route
const favoritesRoute = require('./routes/favorites'); // Import favorites route
const errorHandler = require('./middleware/errorHandler'); // Import error handler middleware
const https = require('https');
const fs = require('fs');
const path = require('path'); // Import path module
const app = express();
const createMixtapeRoutes = require('./routes/create-mixtape');
const uploadRouter = require('./routes/upload');
const feedRoute = require('./routes/feed'); // Import feed route
const searchRoutes = require('./routes/search');
const otpVerificationRoute = require('./routes/otp-verification'); // Add this line
console.log("GMAIL PASS:", process.env.GMAIL_APP_PASSWORD);
app.set('trust proxy', 1);

app.use(cors({
  origin: 'https://harmolinkuv3.vercel.app', // Replace with your frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Welcome to the Harmonilink API!');
});

// Use routes under /api
app.use('/api', signupRoute);
app.use('/api', loginRoute);
app.use('/api', profileRoutes);
app.use('/api', createMixtapeRoutes);
app.use('/api', mixtapeRoute);
app.use('/api/auth', authRoute);
app.use('/api/reset-password', resetPasswordRoute);
app.use('/api', discoverRoute);
app.use('/api', discardRoute);
app.use('/api', favoritesRoute);
app.use('/api', feedRoute);
app.use('/api', searchRoutes);
app.use('/api', otpVerificationRoute); // Add this line


// Serve uploads folder statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/upload', require('./routes/upload')); 

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

app.use(errorHandler);
