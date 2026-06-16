const argon2 = require('argon2');
const crypto = require('crypto');
const {
  createUser,
  getUserByNormalizedUsername,
  getSafeUserById,
  updateLastLogin,
  updateTutorialDismissed,
  getAppSetting,
  setAppSetting,
  deleteAppSetting,
} = require('./db');

const SESSION_USER_ID_KEY = 'session.currentUserId';

function loadPersistedUserId() {
  const value = getAppSetting(SESSION_USER_ID_KEY);
  const userId = Number(value);

  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  const user = getSafeUserById(userId);

  if (!user) {
    deleteAppSetting(SESSION_USER_ID_KEY);
    return null;
  }

  return userId;
}

let currentUserId = loadPersistedUserId();

const failedLoginAttempts = new Map();

const MAX_ATTEMPTS = 5;
const BLOCK_TIME_MS = 60 * 1000;

function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase();
}

function sanitizeUsername(username) {
  return String(username || '').trim();
}

function validateUsername(username) {
  const cleaned = sanitizeUsername(username);

  if (cleaned.length < 3) {
    return 'Username must be at least 3 characters long.';
  }

  if (cleaned.length > 20) {
    return 'Username must be 20 characters or less.';
  }

  if (!/^[a-zA-Z0-9_]+$/.test(cleaned)) {
    return 'Username may only contain letters, numbers, and underscores.';
  }

  return null;
}

function validatePassword(password) {
  const value = String(password || '');

  if (value.length < 8) {
    return 'Password must be at least 8 characters long.';
  }

  if (value.length > 128) {
    return 'Password is too long.';
  }

  return null;
}

function getRateLimitEntry(usernameNormalized) {
  const now = Date.now();
  const entry = failedLoginAttempts.get(usernameNormalized);

  if (!entry) {
    return { count: 0, blockedUntil: 0 };
  }

  if (entry.blockedUntil && now > entry.blockedUntil) {
    failedLoginAttempts.delete(usernameNormalized);
    return { count: 0, blockedUntil: 0 };
  }

  return entry;
}

function recordFailedAttempt(usernameNormalized) {
  const now = Date.now();
  const entry = getRateLimitEntry(usernameNormalized);
  const nextCount = entry.count + 1;

  if (nextCount >= MAX_ATTEMPTS) {
    failedLoginAttempts.set(usernameNormalized, {
      count: nextCount,
      blockedUntil: now + BLOCK_TIME_MS,
    });
    return;
  }

  failedLoginAttempts.set(usernameNormalized, {
    count: nextCount,
    blockedUntil: 0,
  });
}

function clearFailedAttempts(usernameNormalized) {
  failedLoginAttempts.delete(usernameNormalized);
}

function persistCurrentUserId(userId) {
  if (process.env.NODE_ENV === 'production' && !process.versions.electron) {
    return;
  }

  setAppSetting(SESSION_USER_ID_KEY, userId);
}

function clearPersistedUserId() {
  if (process.env.NODE_ENV === 'production' && !process.versions.electron) {
    return;
  }

  deleteAppSetting(SESSION_USER_ID_KEY);
}

function getCurrentSession() {
  if (!currentUserId) {
    return { authenticated: false, user: null };
  }

  const user = getSafeUserById(currentUserId);

  if (!user) {
    currentUserId = null;
    clearPersistedUserId();
    return { authenticated: false, user: null };
  }

  return {
    authenticated: true,
    user,
  };
}

async function registerUser(username, password) {
  const usernameError = validateUsername(username);
  if (usernameError) {
    return { ok: false, message: usernameError };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { ok: false, message: passwordError };
  }

  const cleanedUsername = sanitizeUsername(username);
  const usernameNormalized = normalizeUsername(username);

  const existingUser = getUserByNormalizedUsername(usernameNormalized);
  if (existingUser) {
    return { ok: false, message: 'Username is already taken.' };
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  const userId = createUser({
    username: cleanedUsername,
    usernameNormalized,
    passwordHash,
  });

  currentUserId = Number(userId);
  persistCurrentUserId(currentUserId);
  updateLastLogin(currentUserId);

  return {
    ok: true,
    message: 'Account created successfully.',
    user: getSafeUserById(currentUserId),
  };
}

async function createLinkedUser(username) {
  const usernameError = validateUsername(username);
  if (usernameError) {
    return { ok: false, message: usernameError };
  }

  const cleanedUsername = sanitizeUsername(username);
  const usernameNormalized = normalizeUsername(username);

  const existingUser = getUserByNormalizedUsername(usernameNormalized);
  if (existingUser) {
    return { ok: false, message: 'Username is already taken.' };
  }

  const passwordHash = await argon2.hash(crypto.randomBytes(48).toString('hex'), {
    type: argon2.argon2id,
  });

  const userId = createUser({
    username: cleanedUsername,
    usernameNormalized,
    passwordHash,
  });

  return {
    ok: true,
    user: getSafeUserById(Number(userId)),
  };
}

function loginUserById(userId) {
  const user = getSafeUserById(userId);

  if (!user) {
    return { ok: false, message: 'User not found.' };
  }

  currentUserId = user.id;
  persistCurrentUserId(currentUserId);
  updateLastLogin(currentUserId);

  return {
    ok: true,
    message: 'Logged in successfully.',
    user: getSafeUserById(currentUserId),
  };
}

async function loginUser(username, password) {
  const usernameNormalized = normalizeUsername(username);

  const rateLimitEntry = getRateLimitEntry(usernameNormalized);
  if (rateLimitEntry.blockedUntil && Date.now() < rateLimitEntry.blockedUntil) {
    const secondsLeft = Math.ceil((rateLimitEntry.blockedUntil - Date.now()) / 1000);

    return {
      ok: false,
      message: `Too many failed attempts. Try again in ${secondsLeft}s.`,
    };
  }

  const user = getUserByNormalizedUsername(usernameNormalized);

  if (!user) {
    recordFailedAttempt(usernameNormalized);
    return { ok: false, message: 'Invalid username or password.' };
  }

  const validPassword = await argon2.verify(user.password_hash, String(password || ''));

  if (!validPassword) {
    recordFailedAttempt(usernameNormalized);
    return { ok: false, message: 'Invalid username or password.' };
  }

  clearFailedAttempts(usernameNormalized);

  currentUserId = user.id;
  persistCurrentUserId(currentUserId);
  updateLastLogin(currentUserId);

  return {
    ok: true,
    message: 'Logged in successfully.',
    user: getSafeUserById(currentUserId),
  };
}

function logoutUser() {
  currentUserId = null;
  clearPersistedUserId();
  return { ok: true, message: 'Logged out successfully.' };
}

function setTutorialDismissedForCurrentUser(dismissed) {
  if (!currentUserId) {
    return { ok: false, message: 'You must be logged in.', user: null };
  }

  const user = getSafeUserById(currentUserId);

  if (!user) {
    currentUserId = null;
    clearPersistedUserId();
    return { ok: false, message: 'User not found.', user: null };
  }

  updateTutorialDismissed(currentUserId, dismissed);

  return {
    ok: true,
    message: 'Tutorial preference updated.',
    user: getSafeUserById(currentUserId),
  };
}

module.exports = {
  registerUser,
  loginUser,
  createLinkedUser,
  loginUserById,
  logoutUser,
  getCurrentSession,
  setTutorialDismissedForCurrentUser,
  normalizeUsername,
  validateUsername,
};
