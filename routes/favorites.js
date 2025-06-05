const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');


const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

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

// Add to favorites
router.post('/favorites', authenticateToken, async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: 'User ID is required.' });
  }

  try {
    await db.execute(
      'INSERT INTO favorites (user_id, favorited_user_id) VALUES (?, ?)',
      [req.user.id, user_id]
    );
    res.status(201).json({ message: 'Profile added to favorites.' });
  } catch (error) {
    console.error('Error adding to favorites:', error);
    res.status(500).json({ message: 'Failed to add to favorites.' });
  }
});

// Get all favorited users' profiles and their mixtapes
router.get('/favorites', authenticateToken, async (req, res) => {
  try {
    console.log('GET /favorites called by user:', req.user.id); 
    const [favRows] = await db.execute(
      'SELECT favorited_user_id FROM favorites WHERE user_id = ?',
      [req.user.id]
    );
    const favoritedIds = favRows.map(row => row.favorited_user_id);
    console.log('Favorited IDs:', favoritedIds); 
    if (favoritedIds.length === 0) return res.json([]);

    // Get user profiles
    const [profiles] = await db.query(
      `SELECT u.id, u.username AS name, up.gender, up.birthday, up.profile_image
       FROM users u
       JOIN user_profiles up ON u.id = up.user_id
       WHERE u.id IN (${favoritedIds.map(() => '?').join(',')})`,
      [...favoritedIds]
    );

    // Get mixtapes for all favorited users
    const [mixtapes] = await db.query(
      `SELECT m.id, m.user_id, m.name, m.bio AS description, m.photo_url AS image
       FROM mixtapes m
       WHERE m.user_id IN (${favoritedIds.map(() => '?').join(',')})`,
      favoritedIds
    );

    // Get songs for all mixtapes
    const mixtapeIds = mixtapes.map(m => m.id);
    let songs = [];
    if (mixtapeIds.length > 0) {
      const [songRows] = await db.query(
        `SELECT 
            mixtape_id, 
            song_name AS title, 
            artist_name AS artist, 
            artwork_url, 
            preview_url
         FROM mixtape_songs
         WHERE mixtape_id IN (${mixtapeIds.map(() => '?').join(',')})`,
        mixtapeIds
      );
      songs = songRows;
    }

    // Attach mixtapes and songs to profiles
    const mixtapesWithSongs = mixtapes.map(mix => ({
      ...mix,
      image: mix.image
        ? mix.image.startsWith('http')
          ? mix.image
          : `${BASE_URL}/${mix.image.replace(/^\/?/, '')}`
        : null,
      songs: songs.filter(song => song.mixtape_id === mix.id)
    }));

    const profilesWithMixtapes = profiles.map(profile => ({
      id: profile.id, // <-- Add this line
      name: profile.name,
      age: profile.birthday ? new Date().getFullYear() - new Date(profile.birthday).getFullYear() : null,
      gender: profile.gender,
      image: profile.profile_image
        ? profile.profile_image.startsWith('http')
          ? profile.profile_image
          : `${BASE_URL}/${profile.profile_image.replace(/^\/?/, '')}`
        : null,
      mixtapes: mixtapesWithSongs.filter(mix => mix.user_id === profile.id)
    }));

    res.json(profilesWithMixtapes);
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ message: 'Failed to fetch favorites.' });
  }
});

// Remove a user from favorites
router.delete('/favorites/:favoritedUserId', authenticateToken, async (req, res) => {
  try {
    const favoritedUserId = req.params.favoritedUserId;
    await db.execute(
      'DELETE FROM favorites WHERE user_id = ? AND favorited_user_id = ?',
      [req.user.id, favoritedUserId]
    );
    res.json({ message: 'Favorite removed.' });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ message: 'Failed to remove favorite.' });
  }
});

module.exports = router;