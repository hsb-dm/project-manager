/* The heavy part of a backup, on a thread of its own (server/backup.js: createInBackground, verifyManyInBackground),
   so the server goes on answering while a database is copied, sealed and hashed. It sees the same folders as the
   thread that started it, whatever this thread's copy of the environment says. */
const { parentPort, workerData } = require("worker_threads");
const job = workerData || {};
if (job.dataDir) process.env.COS_DATA_DIR = job.dataDir;
if (job.backupDir) process.env.COS_BACKUP_DIR = job.backupDir;
const backups = require("./backup");
/* a backup pruned away while it was being read is simply gone, as it would be had it been read a moment later */
const verify = n => { try { return backups.verifyStored(n); } catch (e) { return backups.verifyStored(n); } };
try {
  const result = job.task === "verify" ? job.names.map(verify) : backups.runJob(job);
  parentPort.postMessage({ ok: true, result });
} catch (e) {
  parentPort.postMessage({ ok: false, error: e && e.message ? e.message : String(e) });
}
