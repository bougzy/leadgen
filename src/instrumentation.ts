export async function register() {
  // Only run on the Node.js server runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Run data migrations first (e.g., legacy SMTP → SmtpAccount)
    const { runMigrations } = await import('./lib/migration');
    await runMigrations();

    // Start background jobs (email processing, follow-ups, IMAP polling, etc.)
    const { startBackgroundJobs } = await import('./lib/background-jobs');
    startBackgroundJobs();
  }
}
