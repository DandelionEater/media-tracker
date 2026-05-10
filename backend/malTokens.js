const mal = require('./mal');
const {
  getMalAccountByUserId,
  upsertMalAccount,
} = require('./db');

const REFRESH_SKEW_MS = 2 * 60 * 1000;

function getMalTokenExpiry(tokenData) {
  const expiresIn = Number(tokenData?.expires_in);
  return Number.isFinite(expiresIn) && expiresIn > 0
    ? Date.now() + expiresIn * 1000
    : null;
}

function isTokenFresh(account) {
  const expiresAt = Number(account?.token_expires_at);
  return !Number.isFinite(expiresAt) || expiresAt <= 0 || expiresAt - REFRESH_SKEW_MS > Date.now();
}

function isUnauthorizedMalError(error) {
  return Number(error?.status) === 401;
}

async function refreshMalAccount(account) {
  if (!account?.refresh_token) {
    throw new Error('MyAnimeList authorization expired. Relink MyAnimeList to continue.');
  }

  const tokenData = await mal.refreshAccessToken(account.refresh_token);

  upsertMalAccount({
    userId: account.user_id,
    malUserId: account.mal_user_id,
    malUsername: account.mal_username,
    originalMalUsername: account.original_mal_username,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || account.refresh_token,
    tokenExpiresAt: getMalTokenExpiry(tokenData),
  });

  return getMalAccountByUserId(account.user_id);
}

async function getFreshMalAccountByUserId(userId) {
  const account = getMalAccountByUserId(userId);

  if (!account?.access_token) {
    return account;
  }

  if (isTokenFresh(account)) {
    return account;
  }

  return await refreshMalAccount(account);
}

async function refreshMalAccountByUserId(userId) {
  const account = getMalAccountByUserId(userId);

  if (!account?.access_token) {
    return account;
  }

  return await refreshMalAccount(account);
}

async function withFreshMalAccount(userId, operation) {
  const account = await getFreshMalAccountByUserId(userId);

  try {
    return await operation(account);
  } catch (error) {
    if (!isUnauthorizedMalError(error)) {
      throw error;
    }

    const refreshedAccount = await refreshMalAccountByUserId(userId);
    return await operation(refreshedAccount);
  }
}

module.exports = {
  getFreshMalAccountByUserId,
  getMalTokenExpiry,
  isUnauthorizedMalError,
  refreshMalAccountByUserId,
  withFreshMalAccount,
};
