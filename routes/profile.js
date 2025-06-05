const express = require('express');
const router = express.Router();
const db = require('../config/db'); 
const authenticateToken = require('../middleware/authenticateToken'); 
const axios = require('axios');

router.post('/pfcustom', async (req, res) => {
  const { user_id, birthday, gender, bio } = req.body;

  try {
    await db.query(
      'INSERT INTO user_profiles (user_id, birthday, gender, bio) VALUES (?, ?, ?, ?)',
      [user_id, birthday, gender, bio]
    );
    res.status(201).json({ status: 'success', message: 'Profile saved successfully!' });
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ status: 'error', message: 'Failed to save profile.' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  const user_id = req.user.id;

  try {
    const [profileRows] = await db.query(
      `SELECT 
          u.username AS name, 
          u.id AS user_id, 
          up.gender, 
          up.bio, 
          up.profile_image, 
          up.birthday,
          TIMESTAMPDIFF(YEAR, up.birthday, CURDATE()) AS age
        FROM users u
        JOIN user_profiles up ON u.id = up.user_id
        WHERE u.id = ?`,
      [user_id]
    );
    if (profileRows.length === 0) {
      return res.status(404).json({ message: 'Profile not found.' });
    }
    res.status(200).json({ profile: profileRows[0] });
  } catch (error) {
    console.error('Error fetching profile:', error);
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

// Update user profile (username, birthday, gender, bio, profile image)
router.put('/profile', authenticateToken, async (req, res) => {
  const user_id = req.user.id;
  const { name, gender, bio, profile_image } = req.body;

  try {
    // Update username in users table
    await db.query('UPDATE users SET username = ? WHERE id = ?', [name, user_id]);
    // Update profile info in user_profiles table (do NOT update birthday)
    await db.query(
      'UPDATE user_profiles SET gender = ?, bio = ?, profile_image = ? WHERE user_id = ?',
      [gender, bio, profile_image, user_id]
    );
    res.status(200).json({ message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

router.get('/mixtapes', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    // Fetch mixtapes for the user
    const [mixtapes] = await db.query(
      `SELECT id, name, bio AS description, photo_url AS cover, created_at
      FROM mixtapes
      WHERE user_id = ?
      ORDER BY id DESC`,
      [userId]
    );

    // Fetch songs for all mixtapes
    const mixtapeIds = mixtapes.map(m => m.id);
    let songs = [];
    if (mixtapeIds.length > 0) {
      const [songRows] = await db.query(
        `SELECT mixtape_id, song_name AS name, artist_name AS artist, preview_url, artwork_url
         FROM mixtape_songs
         WHERE mixtape_id IN (?)`,
        [mixtapeIds]
      );
      songs = songRows;
    }

    // Attach songs to mixtapes
    const mixtapesWithSongs = mixtapes.map(mix => ({
      ...mix,
      songs: songs.filter(song => song.mixtape_id === mix.id)
    }));

    res.json(mixtapesWithSongs);
  } catch (error) {
    console.error('Error fetching mixtapes:', error);
    res.status(500).json({ message: 'Failed to fetch mixtapes.' });
  }
});

router.post('/mixtapes', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { name, description, cover, songs } = req.body;

  console.log('Received mixtape:', req.body);

  if (!name || !Array.isArray(songs) || songs.length === 0) {
    return res.status(400).json({ message: 'Name and at least one song are required.' });
  }

  try {
    // Insert new mixtape
    const [result] = await db.query(
      `INSERT INTO mixtapes (user_id, name, bio, photo_url)
       VALUES (?, ?, ?, ?)`,
      [userId, name, description, cover]
    );
    const mixtapeId = result.insertId;

    // Insert songs into mixtape_songs table
    for (const song of songs) {
      if (!song.name || !song.artist) continue; // skip invalid
      await db.query(
        `INSERT INTO mixtape_songs (mixtape_id, song_name, artist_name, preview_url, artwork_url)
         VALUES (?, ?, ?, ?, ?)`,
        [
          mixtapeId,
          song.name,
          song.artist,
          song.preview_url || '',
          song.artwork_url || '',
        ]
      );
    }

    res.status(201).json({ message: 'Mixtape created successfully.', mixtapeId });
  } catch (error) {
    console.error('Error creating mixtape:', error);
    res.status(500).json({ message: 'Failed to create mixtape.' });
  }
});

router.put('/mixtapes/:id', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const mixtapeId = req.params.id;
  let { name, description, cover, songs } = req.body;

  try {
    if (!Array.isArray(songs)) {
      return res.status(400).json({ message: 'Songs must be an array.' });
    }

    // Fetch current photo_url if cover is missing or empty
    if (!cover) {
      const [[row]] = await db.query(
        `SELECT photo_url FROM mixtapes WHERE id = ? AND user_id = ?`,
        [mixtapeId, userId]
      );
      cover = row ? row.photo_url : null;
    }

    // Update mixtape details
    await db.query(
      `UPDATE mixtapes SET name = ?, bio = ?, photo_url = ? WHERE id = ? AND user_id = ?`,
      [
        name ?? null,
        description ?? null,
        cover ?? null,
        mixtapeId,
        userId
      ]
    );

    // Delete existing songs for the mixtape
    await db.query(`DELETE FROM mixtape_songs WHERE mixtape_id = ?`, [mixtapeId]);

    // Insert updated songs
    for (const song of songs) {
      // Use null for missing fields
      const songName = song.name ?? null;
      const artistName = song.artist ?? null;
      const previewUrl = song.preview_url ?? null;
      const artworkUrl = song.artwork_url ?? null;

      if (!songName || !artistName) {
        console.error('Invalid song:', song);
        continue; // Skip invalid songs
      }

      await db.query(
        `INSERT INTO mixtape_songs (mixtape_id, song_name, artist_name, preview_url, artwork_url)
         VALUES (?, ?, ?, ?, ?)`,
        [
          mixtapeId,
          songName,
          artistName,
          previewUrl,
          artworkUrl,
        ]
      );
    }

    res.status(200).json({ message: 'Mixtape updated successfully.' });
  } catch (error) {
    console.error('Error updating mixtape:', error);
    res.status(500).json({ message: 'Failed to update mixtape.', error: error.message });
  }
});

router.get('/itunes-search', async (req, res) => {
  const { term } = req.query;
  if (!term) return res.status(400).json({ message: 'Missing search term.' });
  try {
    const response = await axios.get('https://itunes.apple.com/search', {
      params: {
        term,
        media: 'music',
        limit: 10,
      },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: 'iTunes search failed.' });
  }
});

// Add this after your other routes
router.get('/polls', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    // Fetch polls created by the user
    const [polls] = await db.query(
      `SELECT id, question, created_at, poll_length_seconds FROM polls WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    // Fetch options for these polls
    const pollIds = polls.map(p => p.id);
    let options = [];
    if (pollIds.length > 0) {
      const [optionRows] = await db.query(
        `SELECT po.id, po.poll_id, po.option_text, 
                COUNT(pv.id) AS votes
         FROM poll_options po
         LEFT JOIN poll_votes pv ON po.id = pv.option_id
         WHERE po.poll_id IN (?)
         GROUP BY po.id`,
        [pollIds]
      );
      options = optionRows;
    }

    // Attach options to polls, format like feed.js
    const pollsWithOptions = polls.map(poll => ({
      ...poll,
      options: options
        .filter(opt => opt.poll_id === poll.id)
        .map(opt => ({
          id: opt.id,
          text: opt.option_text,
          votes: Number(opt.votes)
        }))
    }));

    res.json(pollsWithOptions);
  } catch (error) {
    console.error('Error fetching polls:', error);
    res.status(500).json({ message: 'Failed to fetch polls.' });
  }
});

// Add DELETE endpoint for polls
router.delete('/polls/:id', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const pollId = req.params.id;

  try {
    // First verify the poll belongs to the user
    const [pollRows] = await db.query(
      'SELECT id FROM polls WHERE id = ? AND user_id = ?',
      [pollId, userId]
    );

    if (pollRows.length === 0) {
      return res.status(404).json({ message: 'Poll not found or unauthorized.' });
    }

    // Start a transaction to ensure all related data is deleted
    await db.query('START TRANSACTION');

    try {
      // Delete votes first (due to foreign key constraints)
      await db.query(
        `DELETE FROM poll_votes WHERE option_id IN 
         (SELECT id FROM poll_options WHERE poll_id = ?)`,
        [pollId]
      );

      // Delete poll options
      await db.query('DELETE FROM poll_options WHERE poll_id = ?', [pollId]);

      // Finally delete the poll itself
      await db.query('DELETE FROM polls WHERE id = ?', [pollId]);

      // Commit the transaction
      await db.query('COMMIT');

      res.json({ message: 'Poll deleted successfully.' });
    } catch (error) {
      // If anything fails, roll back the transaction
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error deleting poll:', error);
    res.status(500).json({ message: 'Failed to delete poll.' });
  }
});
      
module.exports = router;
