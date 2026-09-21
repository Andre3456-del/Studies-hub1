const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getAuthUrl, getUserFromCode } = require('../auth/google');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/email');
// const User = require('../models/User'); // plug in your DB model here

const router = express.Router();

// --- Google OAuth ---
router.get('/auth/google', (req, res) => {
  res.redirect(getAuthUrl());
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    const googleUser = await getUserFromCode(req.query.code);
    // find or create user in your DB by googleUser.email
    // const user = await User.findOrCreate({ email: googleUser.email, ... });
    const token = jwt.sign({ email: googleUser.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Google authentication failed');
  }
});

// --- Email verification ---
router.post('/auth/send-verification', async (req, res) => {
  const { email } = req.body;
  const verifyToken = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1d' });
  await sendVerificationEmail(email, verifyToken);
  res.json({ message: 'Verification email sent' });
});

router.get('/auth/verify-email', async (req, res) => {
  try {
    const { email } = jwt.verify(req.query.token, process.env.JWT_SECRET);
    // await User.markVerified(email);
    res.send('Email verified successfully');
  } catch {
    res.status(400).send('Invalid or expired verification link');
  }
});

// --- Forgot password ---
router.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = await bcrypt.hash(resetToken, 10);
  // await User.saveResetToken(email, hashedToken, Date.now() + 3600000); // 1hr expiry
  await sendPasswordResetEmail(email, resetToken);
  res.json({ message: 'Password reset email sent' });
});

router.post('/auth/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;
  // const user = await User.findByEmail(email);
  // const valid = await bcrypt.compare(token, user.resetTokenHash);
  // if (!valid || Date.now() > user.resetTokenExpiry) return res.status(400).send('Invalid or expired token');
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  // await User.updatePassword(email, hashedPassword);
  res.json({ message: 'Password updated' });
});

module.exports = router;
