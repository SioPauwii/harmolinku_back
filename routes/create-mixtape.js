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

// Create a new mixtape
router.post("/create-mixtape", authenticateToken, async (req, res) => {
  const { name, description, photoUrl, songs } = req.body;

  if (!name || !songs || !Array.isArray(songs) || songs.length === 0) {
    return res
      .status(400)
      .json({ message: "Mixtape name and at least one song are required." });
  }

  try {
    const [result] = await db.execute(
      "INSERT INTO mixtapes (user_id, name, bio, photo_url, source) VALUES (?, ?, ?, ?, ?)",
      [req.user.id, name, description, photoUrl, "sidebar"]
    );
    const mixtapeId = result.insertId;

    // Insert all songs, no limit
    for (const song of songs) {
      await db.execute(
        "INSERT INTO mixtape_songs (mixtape_id, song_name, artist_name, preview_url, artwork_url) VALUES (?, ?, ?, ?, ?)",
        [mixtapeId, song.name, song.artist, song.preview_url, song.artwork_url]
      );
    }

    res.status(201).json({ message: "Mixtape created successfully." });
  } catch (error) {
    console.error("Error creating mixtape:", error);
    res.status(500).json({ message: "Failed to create mixtape." });
  }
});

// Fetch all mixtapes for the logged-in user
router.get("/mixtapes", authenticateToken, async (req, res) => {
  try {
    // Fetch all mixtapes for the user
    const [mixtapes] = await db.execute(
      `
      SELECT 
        m.id AS mixtape_id,
        m.name,
        m.bio,
        m.photo_url,
        m.source,  
        m.artwork_url AS artwork_url       
      FROM mixtapes m
      WHERE m.user_id = ?
      ORDER BY m.id DESC
      `,
      [req.user.id]
    );

    // For each mixtape, fetch its songs
    const mixtapeIds = mixtapes.map((m) => m.mixtape_id);
    let songsByMixtape = {};
    if (mixtapeIds.length > 0) {
      const [songs] = await db.execute(
        `
        SELECT 
          mixtape_id,
          song_name,
          artist_name,
          preview_url,
          artwork_url AS artwork_url
        FROM mixtape_songs
        WHERE mixtape_id IN (${mixtapeIds.map(() => "?").join(",")})
        ORDER BY id ASC
        `,
        mixtapeIds
      );
      // Group songs by mixtape_id
      songsByMixtape = songs.reduce((acc, song) => {
        if (!acc[song.mixtape_id]) acc[song.mixtape_id] = [];
        acc[song.mixtape_id].push({
          name: song.song_name,
          artist: song.artist_name,
          preview_url: song.preview_url,
          url: song.preview_url,
          artwork_url: song.artwork_url, // <-- this must be present!
        });
        return acc;
      }, {});
    }

    // Format mixtapes with their songs
    const formattedMixtapes = mixtapes.map((mixtape) => ({
      id: mixtape.mixtape_id,
      name: mixtape.name,
      description: mixtape.bio,
      cover: mixtape.photo_url,
      source: mixtape.source, // <--- ADD THIS LINE
      artwork_url: mixtape.artwork_url, // <--- ADD THIS LINE
      songs: songsByMixtape[mixtape.mixtape_id] || [],
    }));

    res.status(200).json(formattedMixtapes);
  } catch (error) {
    console.error("Error fetching mixtapes:", error);
    res.status(500).json({ message: "Failed to fetch mixtapes." });
  }
});

// Update a mixtape
router.put("/mixtapes/:id", authenticateToken, async (req, res) => {
  const mixtapeId = req.params.id;
  const { name, description, photoUrl, songs } = req.body;

  if (!name || !songs || !Array.isArray(songs) || songs.length === 0) {
    return res
      .status(400)
      .json({ message: "Mixtape name and at least one song are required." });
  }

  try {
    // First get the current mixtape data
    const [currentMixtapes] = await db.execute(
      "SELECT photo_url FROM mixtapes WHERE id = ? AND user_id = ?",
      [mixtapeId, req.user.id]
    );

    if (currentMixtapes.length === 0) {
      return res.status(404).json({ message: "Mixtape not found." });
    }

    const currentMixtape = currentMixtapes[0];

    // Handle photo URL logic
    let finalPhotoUrl = currentMixtape.photo_url; // Default to current photo
    
    // Update photo URL if a new one is provided
    if (photoUrl) {
      finalPhotoUrl = photoUrl;
    }

    // Update mixtape info
    await db.execute(
      "UPDATE mixtapes SET name = ?, bio = ?, photo_url = ? WHERE id = ? AND user_id = ?",
      [name, description, finalPhotoUrl, mixtapeId, req.user.id]
    );

    // Remove old songs
    await db.execute("DELETE FROM mixtape_songs WHERE mixtape_id = ?", [
      mixtapeId,
    ]);

    // Insert new songs
    for (const song of songs) {
      await db.execute(
        "INSERT INTO mixtape_songs (mixtape_id, song_name, artist_name, preview_url, artwork_url) VALUES (?, ?, ?, ?, ?)",
        [
          mixtapeId,
          song.name,
          song.artist,
          song.preview_url || null,
          song.artwork_url || null,
        ]
      );
    }

    res.json({ 
      message: "Mixtape updated successfully.",
      photoUrl: finalPhotoUrl // Send back the final photo URL
    });
  } catch (error) {
    console.error("Error updating mixtape:", error);
    res.status(500).json({ message: "Failed to update mixtape." });
  }
});

// Delete a mixtape by ID
router.delete("/mixtapes/:id", authenticateToken, async (req, res) => {
  const mixtapeId = req.params.id;

  try {
    // First, delete the related songs
    await db.execute("DELETE FROM mixtape_songs WHERE mixtape_id = ?", [
      mixtapeId,
    ]);

    // Then, delete the mixtape
    const [result] = await db.execute(
      "DELETE FROM mixtapes WHERE id = ? AND user_id = ?",
      [mixtapeId, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Mixtape not found or not owned by user." });
    }

    res.status(200).json({ message: "Mixtape deleted successfully." });
  } catch (error) {
    console.error("Error deleting mixtape:", error);
    res.status(500).json({ message: "Failed to delete mixtape." });
  }
});

module.exports = router;
