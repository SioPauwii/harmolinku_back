const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token)
    return res.status(401).json({ message: "Access token required." });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token." });
    req.user = user; // Attach user info to the request
    next();
  });
}

// Discover endpoint
router.get("/discover", authenticateToken, async (req, res) => {
  try {
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
      WHERE users.id != ? 
        AND users.id NOT IN (
          SELECT discarded_user_id 
          FROM discarded 
          WHERE user_id = ?
        )
        AND users.id NOT IN (
          SELECT favorited_user_id 
          FROM favorites 
          WHERE user_id = ?
        )
      GROUP BY users.id, mixtapes.id
      ORDER BY RAND()
      LIMIT 10
      `,
      [req.user.id, req.user.id, req.user.id]
    );

    // Example: Only fetch mixtapes with source 'onboarding'
    const [mixtapes] = await db.execute(
      "SELECT * FROM mixtapes WHERE is_public = 1"
    );

    // Structure the response
    const profileWithDetails = rows.map((profile) => {
      const age = profile.birthday
        ? Math.floor(
            (new Date() - new Date(profile.birthday)) /
              (365.25 * 24 * 60 * 60 * 1000)
          )
        : null;

      const songs =
        profile.song_names && profile.artist_names
          ? profile.song_names.split(",").map((songName, index) => ({
              song_name: songName,
              artist_name: profile.artist_names.split(",")[index],
              preview_url: profile.preview_urls
                ? profile.preview_urls.split(",")[index]
                : null,
              artwork_url: profile.artwork_urls
                ? profile.artwork_urls.split(",")[index]
                : null,
            }))
          : [];

      const mixtapes = profile.mixtape_id
        ? [
            {
              mixtape_id: profile.mixtape_id,
              name: profile.mixtape_name,
              bio: profile.mixtape_bio,
              photo_url: profile.photo_url
                ? `${process.env.BASE_URL.replace(
                    /\/$/,
                    ""
                  )}/${profile.photo_url.replace(/^\/?/, "")}`
                : null,
              songs,
            },
          ]
        : [];

      return {
        username: profile.username,
        gender: profile.gender,
        profile_bio: profile.profile_bio,
        birthday: profile.birthday,
        age,
        user_id: profile.user_id,
        mixtapes,
      };
    });

    res.json(profileWithDetails);
  } catch (error) {
    console.error("Error fetching profiles and mixtapes:", error);
    res.status(500).json({ message: "Failed to fetch profiles and mixtapes." });
  }
});

module.exports = router;
