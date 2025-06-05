const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access token required.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token.' });
    req.user = user; 
    next();
  });
}

// Create Poll Endpoint
router.post('/feed', authenticateToken, async (req, res) => {
  const { question, options, pollLengthSeconds } = req.body;

  if (!question || !options || options.length < 2) {
    return res.status(400).json({ message: 'Poll question and at least two options are required.' });
  }
  if (!pollLengthSeconds || pollLengthSeconds <= 0) {
    return res.status(400).json({ message: 'Poll length must be greater than 0.' });
  }

  try {
    const [pollResult] = await db.execute(
      'INSERT INTO polls (user_id, question, poll_length_seconds) VALUES (?, ?, ?)',
      [req.user.id, question, pollLengthSeconds]
    );
    const pollId = pollResult.insertId;
    const optionPromises = options.map(option =>
      db.execute('INSERT INTO poll_options (poll_id, option_text) VALUES (?, ?)', [pollId, option])
    );
    await Promise.all(optionPromises);

    res.status(201).json({ message: 'Poll created successfully.', pollId });
  } catch (error) {
    console.error('Error creating poll:', error);
    res.status(500).json({ message: 'Failed to create poll.' });
  }
});

// Fetch all polls with options and vote counts
router.get('/feed', authenticateToken, async (req, res) => {
  try {
    const [favoriteRows] = await db.execute(
      'SELECT favorited_user_id FROM favorites WHERE user_id = ?',
      [req.user.id]
    );
    const favoriteUserIds = favoriteRows.map(row => row.favorited_user_id);

    if (favoriteUserIds.length === 0) {
      favoriteUserIds.push(req.user.id); 
    } else if (!favoriteUserIds.includes(req.user.id)) {
      favoriteUserIds.push(req.user.id); 
    }

    const placeholders = favoriteUserIds.map(() => '?').join(',');
    const [polls] = await db.execute(
      `SELECT polls.id AS poll_id, polls.question, polls.user_id, polls.created_at, polls.poll_length_seconds, users.username, 
              user_profiles.gender, user_profiles.birthday, user_profiles.profile_image
       FROM polls
       JOIN users ON polls.user_id = users.id
       LEFT JOIN user_profiles ON users.id = user_profiles.user_id
       WHERE polls.user_id IN (${placeholders})
       ORDER BY polls.id DESC`,
      favoriteUserIds
    );

    let pollOptions = [];
    if (polls.length > 0) {
      const pollIds = polls.map(p => p.poll_id);
      const placeholders = pollIds.map(() => '?').join(',');
      const [options] = await db.query(
        `SELECT poll_options.id, poll_options.poll_id, poll_options.option_text,
                COUNT(poll_votes.id) AS votes
         FROM poll_options
         LEFT JOIN poll_votes ON poll_options.id = poll_votes.option_id
         WHERE poll_options.poll_id IN (${placeholders})
         GROUP BY poll_options.id`,
        pollIds
      );
      pollOptions = options;
    }

    let userVotes = [];
    if (polls.length > 0) {
      const pollIds = polls.map(p => p.poll_id);
      const placeholders = pollIds.map(() => '?').join(',');
      const [votes] = await db.query(
        `SELECT poll_id, option_id FROM poll_votes WHERE poll_id IN (${placeholders}) AND user_id = ?`,
        [...pollIds, req.user.id]
      );
      userVotes = votes;
    }

    const result = polls.map(poll => {
      const userVote = userVotes.find(v => v.poll_id === poll.poll_id);
      return {
        id: poll.poll_id,
        question: poll.question,
        created_at: poll.created_at,
        poll_length_seconds: poll.poll_length_seconds,
        user: {
          id: poll.user_id,
          name: poll.username,
          gender: poll.gender,
          birthday: poll.birthday,
          profile_image: poll.profile_image,
        },
        user_vote_option_id: userVote ? userVote.option_id : null,
        options: (pollOptions || [])
          .filter(opt => opt.poll_id === poll.poll_id)
          .map(opt => ({
            id: opt.id,
            text: opt.option_text,
            votes: Number(opt.votes)
          }))
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching polls:', error);
    res.status(500).json({ message: 'Failed to fetch polls.' });
  }
});

// Vote on a poll option
router.post('/feed/vote', authenticateToken, async (req, res) => {
  const { pollId, optionId } = req.body;
  if (!pollId || !optionId) {
    return res.status(400).json({ message: 'Poll ID and Option ID are required.' });
  }
  try {
    // Check if user already voted
    const [existing] = await db.execute(
      'SELECT id FROM poll_votes WHERE poll_id = ? AND user_id = ?',
      [pollId, req.user.id]
    );
    if (existing.length > 0) {
      // Update the vote
      await db.execute(
        'UPDATE poll_votes SET option_id = ? WHERE poll_id = ? AND user_id = ?',
        [optionId, pollId, req.user.id]
      );
    } else {
      // Insert new vote
      await db.execute(
        'INSERT INTO poll_votes (poll_id, option_id, user_id, voted_at) VALUES (?, ?, ?, NOW())',
        [pollId, optionId, req.user.id]
      );
    }

    // Count today's votes for this user
    const [votesToday] = await db.execute(
      'SELECT COUNT(*) as cnt FROM poll_votes WHERE user_id = ? AND DATE(voted_at) = CURDATE()',
      [req.user.id]
    );

    return res.status(200).json({ message: 'Vote recorded.' });
  } catch (error) {
    console.error('Error voting:', error);
    res.status(500).json({ message: 'Failed to record vote.' });
  }
});

// Delete a poll (only by creator)
router.delete('/feed/:id', authenticateToken, async (req, res) => {
  const pollId = req.params.id;
  try {
    // Ensure the poll belongs to the user
    const [polls] = await db.execute(
      'SELECT * FROM polls WHERE id = ? AND user_id = ?',
      [pollId, req.user.id]
    );
    if (polls.length === 0) {
      return res.status(403).json({ message: 'You can only delete your own polls.' });
    }
    // Delete poll votes, options, then the poll itself
    await db.execute('DELETE FROM poll_votes WHERE poll_id = ?', [pollId]);
    await db.execute('DELETE FROM poll_options WHERE poll_id = ?', [pollId]);
    await db.execute('DELETE FROM polls WHERE id = ?', [pollId]);
    res.json({ message: 'Poll deleted.' });
  } catch (error) {
    console.error('Error deleting poll:', error);
    res.status(500).json({ message: 'Failed to delete poll.' });
  }
});

module.exports = router;

