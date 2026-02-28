// Server-side background job processor
// Runs via Next.js instrumentation — NOT in the browser
// Delegates all task execution to the AutomationEngine + TaskExecutors.

import { registerEventSubscribers } from './event-subscribers';
import { eventBus } from './event-bus';
import { addEventLogEntry } from './db-server';
import { startEngine } from './automation-engine';

let started = false;

// ─── Public entry point ──────────────────────────────────────────────────────

export function startBackgroundJobs() {
  if (started) return;
  started = true;
  console.log('[BackgroundJobs] Starting server-side background processors...');

  // Register event bus log function and subscribers
  eventBus.setLogFunction(addEventLogEntry);
  registerEventSubscribers();

  // Start the automation engine — it manages all recurring tasks
  startEngine().catch((err) => {
    console.error('[BackgroundJobs] Failed to start automation engine:', err);
  });
}
