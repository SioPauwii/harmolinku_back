const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authenticateToken = require('../middleware/authenticateToken');

router.get('/search', authenticateToken, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const search = `%${q}%`;
  const [rows] = await db.execute(
    `
    SELECT 
      users.username,
      user_profiles.gender,
      user_profiles.birthday,
      user_profiles.user_id,
      mixtapes.id AS mixtape_id,
      mixtapes.name AS mixtape_name,
      mixtapes.bio AS mixtape_bio,
      mixtapes.photo_url,
      GROUP_CONCAT(mixtape_songs.song_name) AS song_names,
      GROUP_CONCAT(mixtape_songs.artist_name) AS artist_names,
      GROUP_CONCAT(mixtape_songs.preview_url) AS preview_urls,
      GROUP_CONCAT(mixtape_songs.artwork_url) AS artwork_urls
    FROM user_profiles
    INNER JOIN users ON user_profiles.user_id = users.id
    LEFT JOIN mixtapes ON user_profiles.user_id = mixtapes.user_id AND mixtapes.source = 'onboarding'
    LEFT JOIN mixtape_songs ON mixtapes.id = mixtape_songs.mixtape_id
    WHERE users.username LIKE ?
      OR mixtapes.name LIKE ?
      OR mixtape_songs.song_name LIKE ?
    GROUP BY users.id, mixtapes.id
    LIMIT 20
    `,
    [search, search, search]
  );

  // Format as needed for your frontend
  const results = rows.map(profile => ({
    type: 'user',
    username: profile.username,
    mixtape: {
      name: profile.mixtape_name,
      songs: profile.song_names ? profile.song_names.split(',') : [],
      photo_url: profile.photo_url,
    },
    user_id: profile.user_id,
  }));

  res.json(results);
});

module.exports = router;