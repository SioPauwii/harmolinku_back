const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authenticateToken = require('../middleware/authenticateToken');

// Helper function to validate non-empty strings
const isInvalidString = (str) => typeof str !== 'string' || !str.trim();

router.post('/pfmixtape', async (req, res) => {
  const { user_id, name, bio, photo_url, songs } = req.body;

  if (
    typeof user_id !== 'number' ||
    isInvalidString(name) ||
    isInvalidString(bio) ||
    isInvalidString(photo_url) ||
    !Array.isArray(songs) ||
    songs.length < 3
  ) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid data. All fields are required, and at least 3 valid songs must be provided.',
    });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      'INSERT INTO mixtapes (user_id, name, bio, photo_url, source) VALUES (?, ?, ?, ?, ?)',
      [user_id, name.trim(), bio.trim(), photo_url.trim(), 'onboarding']
    );

    const mixtape_id = result.insertId;

    for (const song of songs) {
      if (isInvalidString(song.name) || isInvalidString(song.artist)) {
        throw new Error('Each song must have a valid name and artist.');
      }

      console.log('Saving song:', song);

      await connection.query(
        'INSERT INTO mixtape_songs (mixtape_id, song_name, artist_name, preview_url, artwork_url) VALUES (?, ?, ?, ?, ?)',
        [
          mixtape_id,
          song.name.trim(),
          song.artist.trim(),
          song.previewUrl || null,
          song.artwork || null,
        ]
      );
    }

    await connection.commit();
    res.status(201).json({ status: 'success', message: 'Mixtape created successfully!' });
  } catch (error) {
    await connection.rollback();
    console.error('Error saving mixtape:', error.message, error.stack);
    res.status(500).json({ status: 'error', message: 'Failed to save mixtape.' });
  } finally {
    connection.release();
  }
});

router.post('/mixtapes', authenticateToken, async (req, res) => {
  const { user_id, name, bio, photo_url, songs } = req.body;

  if (
    typeof user_id !== 'number' ||
    isInvalidString(name) ||
    isInvalidString(bio) ||
    isInvalidString(photo_url) ||
    !Array.isArray(songs) ||
    songs.length < 3
  ) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid data. All fields are required, and at least 3 valid songs must be provided.',
    });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      'INSERT INTO mixtapes (user_id, name, bio, photo_url, source) VALUES (?, ?, ?, ?, ?)',
      [user_id, name.trim(), bio.trim(), photo_url.trim(), 'onboarding']
    );

    const mixtape_id = result.insertId;

    for (const song of songs) {
      if (isInvalidString(song.name) || isInvalidString(song.artist)) {
        throw new Error('Each song must have a valid name and artist.');
      }

      console.log('Saving song:', song);

      await connection.query(
        'INSERT INTO mixtape_songs (mixtape_id, song_name, artist_name, preview_url, artwork_url) VALUES (?, ?, ?, ?, ?)',
        [
          mixtape_id,
          song.name.trim(),
          song.artist.trim(),
          song.previewUrl || null,
          song.artwork || null,
        ]
      );
    }

    await connection.commit();
    res.status(201).json({ status: 'success', message: 'Mixtape created successfully!' });
  } catch (error) {
    await connection.rollback();
    console.error('Error saving mixtape:', error.message, error.stack);
    res.status(500).json({ status: 'error', message: 'Failed to save mixtape.' });
  } finally {
    connection.release();
  }
});

module.exports = router;
