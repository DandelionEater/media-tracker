const crypto = require('crypto');

const JOB_TTL_MS = 10 * 60 * 1000;
const jobs = new Map();
const activeJobIdsByKey = new Map();

function cleanupJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(jobId);
      if (activeJobIdsByKey.get(job.key) === jobId) activeJobIdsByKey.delete(job.key);
    }
  }
}

function createMalJob({ userId, key, run }) {
  cleanupJobs();
  const normalizedUserId = Number(userId);
  const normalizedKey = `${normalizedUserId}:${String(key)}`;
  const existingId = activeJobIdsByKey.get(normalizedKey);
  const existing = existingId ? jobs.get(existingId) : null;
  if (existing && (existing.status === 'pending' || existing.status === 'running')) {
    return existing;
  }

  const job = {
    id: crypto.randomBytes(16).toString('hex'),
    key: normalizedKey,
    userId: normalizedUserId,
    status: 'pending',
    cancelled: false,
    progress: { stage: 'queued', current: 0, total: null, label: 'Queued...' },
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  activeJobIdsByKey.set(normalizedKey, job.id);

  const context = {
    isCancelled: () => job.cancelled,
    throwIfCancelled() {
      if (!job.cancelled) return;
      const error = new Error('MyAnimeList operation cancelled.');
      error.code = 'MAL_JOB_CANCELLED';
      throw error;
    },
    report(progress) {
      if (job.cancelled) return;
      job.progress = { ...job.progress, ...progress };
      job.updatedAt = Date.now();
    },
  };

  setImmediate(async () => {
    job.status = 'running';
    job.updatedAt = Date.now();
    try {
      job.result = await run(context);
      context.throwIfCancelled();
      job.status = 'complete';
    } catch (error) {
      if (job.cancelled || error?.code === 'MAL_JOB_CANCELLED') {
        job.status = 'cancelled';
      } else {
        job.status = 'failed';
        job.error = error?.message || 'MyAnimeList operation failed.';
      }
    } finally {
      job.updatedAt = Date.now();
      if (activeJobIdsByKey.get(normalizedKey) === job.id) {
        activeJobIdsByKey.delete(normalizedKey);
      }
    }
  });

  return job;
}

function getMalJob(jobId, userId) {
  cleanupJobs();
  const job = jobs.get(String(jobId || ''));
  return job && Number(job.userId) === Number(userId) ? job : null;
}

function cancelMalJob(jobId, userId) {
  const job = getMalJob(jobId, userId);
  if (!job) return false;
  if (job.status === 'pending' || job.status === 'running') {
    job.cancelled = true;
    job.status = 'cancelling';
    job.progress = { ...job.progress, label: 'Cancelling...' };
    job.updatedAt = Date.now();
  }
  return true;
}

function serializeMalJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    result: job.status === 'complete' ? job.result : null,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

module.exports = {
  createMalJob,
  getMalJob,
  cancelMalJob,
  serializeMalJob,
};
