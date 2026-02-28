// Automation Engine — central task queue processor
// Replaces scattered setInterval calls with a unified task-based system.
// The engine polls for due tasks, executes them, handles retries, and
// schedules recurring tasks.

import { randomUUID } from 'crypto';
import type { AutomationTask, AutomationTaskType } from '@/types';
import * as db from './db-server';
import { getExecutor } from './task-executors';
import { eventBus } from './event-bus';

// ─── Configuration ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;    // check for due tasks every 15s
const MAX_CONCURRENT = 3;           // max tasks executing at once
const BATCH_SIZE = 10;              // tasks fetched per poll cycle

// Recurring task definitions: type → interval in ms
const RECURRING_TASKS: { type: AutomationTaskType; intervalMs: number; priority: AutomationTask['priority'] }[] = [
  { type: 'SEND_EMAIL',              intervalMs: 60_000,     priority: 'high' },
  { type: 'FOLLOWUP_STEP',           intervalMs: 300_000,    priority: 'normal' },
  { type: 'CHECK_IMAP',              intervalMs: 300_000,    priority: 'normal' },
  { type: 'WARMUP_INCREMENT',        intervalMs: 3_600_000,  priority: 'low' },
  { type: 'SMTP_RESET',              intervalMs: 3_600_000,  priority: 'low' },
  { type: 'SEND_REVIEW_REQUEST',     intervalMs: 900_000,    priority: 'normal' },
  { type: 'SEND_RETENTION_REMINDER', intervalMs: 1_800_000,  priority: 'low' },
];

// ─── State ───────────────────────────────────────────────────────────────────

let running = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let activeCount = 0;
let lastPollAt = '';
let tasksProcessedLast24h = 0;
let last24hResetDate = '';

// ─── Public API ──────────────────────────────────────────────────────────────

/** Start the automation engine — called once from instrumentation */
export async function startEngine(): Promise<void> {
  if (running) return;
  running = true;
  console.log('[AutomationEngine] Starting...');

  // Seed recurring tasks on first boot
  await seedRecurringTasks();

  // Start polling
  pollTimer = setInterval(pollAndExecute, POLL_INTERVAL_MS);
  // Initial poll after short delay
  setTimeout(pollAndExecute, 3_000);
}

/** Stop the engine gracefully */
export function stopEngine(): void {
  running = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  console.log('[AutomationEngine] Stopped');
}

/** Queue a one-off task for execution */
export async function enqueueTask(
  type: AutomationTaskType,
  payload: Record<string, unknown> = {},
  options: { accountId?: string; priority?: AutomationTask['priority']; scheduledAt?: string } = {},
): Promise<string> {
  const id = randomUUID();
  const task: AutomationTask = {
    id,
    type,
    accountId: options.accountId,
    scheduledAt: options.scheduledAt || new Date().toISOString(),
    payload,
    priority: options.priority || 'normal',
    retryCount: 0,
    maxRetries: 3,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await db.addAutomationTask(task);
  return id;
}

/** Get engine status for system health checks */
export function getEngineStatus(): { running: boolean; lastPollAt: string; tasksProcessedLast24h: number; activeCount: number } {
  return { running, lastPollAt, tasksProcessedLast24h, activeCount };
}

// ─── Core Loop ───────────────────────────────────────────────────────────────

async function pollAndExecute(): Promise<void> {
  if (!running) return;

  // Reset 24h counter at midnight
  const today = new Date().toISOString().split('T')[0];
  if (last24hResetDate !== today) {
    tasksProcessedLast24h = 0;
    last24hResetDate = today;
  }

  lastPollAt = new Date().toISOString();

  try {
    const slotsAvailable = MAX_CONCURRENT - activeCount;
    if (slotsAvailable <= 0) return;

    const dueTasks = await db.getDueTasks(Math.min(slotsAvailable, BATCH_SIZE));
    if (dueTasks.length === 0) return;

    for (const task of dueTasks) {
      executeTask(task); // fire-and-forget, concurrency tracked via activeCount
    }
  } catch (err) {
    console.error('[AutomationEngine] Poll error:', err);
  }
}

async function executeTask(task: AutomationTask): Promise<void> {
  activeCount++;

  try {
    // Mark as processing
    task.status = 'processing';
    task.lastAttemptAt = new Date().toISOString();
    await db.updateAutomationTask(task);

    const executor = getExecutor(task.type);
    if (!executor) {
      throw new Error(`No executor registered for task type: ${task.type}`);
    }

    await executor(task);

    // Mark as completed
    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    await db.updateAutomationTask(task);

    tasksProcessedLast24h++;

    // Schedule next occurrence if this is a recurring task
    await scheduleNextOccurrence(task);

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    task.retryCount += 1;
    task.errorLog = [...(task.errorLog || []), `[${new Date().toISOString()}] ${errorMsg}`];

    if (task.retryCount >= task.maxRetries) {
      task.status = 'dead_letter';
      eventBus.emit({ type: 'task.failed', data: { taskId: task.id, taskType: task.type, error: errorMsg } });
      console.error(`[AutomationEngine] Task ${task.id} (${task.type}) moved to dead letter after ${task.retryCount} retries`);
    } else {
      // Exponential backoff: 30s, 60s, 120s...
      const backoffMs = 30_000 * Math.pow(2, task.retryCount - 1);
      task.status = 'pending';
      task.scheduledAt = new Date(Date.now() + backoffMs).toISOString();
      console.warn(`[AutomationEngine] Task ${task.id} (${task.type}) retry ${task.retryCount}/${task.maxRetries} in ${backoffMs / 1000}s`);
    }

    await db.updateAutomationTask(task);
  } finally {
    activeCount--;
  }
}

// ─── Recurring Task Management ───────────────────────────────────────────────

async function seedRecurringTasks(): Promise<void> {
  const pendingTasks = await db.getAutomationTasksByStatus('pending');
  const processingTasks = await db.getAutomationTasksByStatus('processing');
  const existingTypes = new Set([
    ...pendingTasks.map((t) => t.type),
    ...processingTasks.map((t) => t.type),
  ]);

  const now = new Date();

  for (const def of RECURRING_TASKS) {
    if (existingTypes.has(def.type)) continue;

    await db.addAutomationTask({
      id: randomUUID(),
      type: def.type,
      scheduledAt: new Date(now.getTime() + 5_000).toISOString(), // start 5s from now
      payload: { recurring: true, intervalMs: def.intervalMs },
      priority: def.priority,
      retryCount: 0,
      maxRetries: 3,
      status: 'pending',
      createdAt: now.toISOString(),
    });

    console.log(`[AutomationEngine] Seeded recurring task: ${def.type}`);
  }
}

async function scheduleNextOccurrence(completedTask: AutomationTask): Promise<void> {
  if (!completedTask.payload.recurring) return;

  const intervalMs = (completedTask.payload.intervalMs as number) || 60_000;
  const nextRun = new Date(Date.now() + intervalMs).toISOString();

  await db.addAutomationTask({
    id: randomUUID(),
    type: completedTask.type,
    accountId: completedTask.accountId,
    scheduledAt: nextRun,
    payload: completedTask.payload,
    priority: completedTask.priority,
    retryCount: 0,
    maxRetries: 3,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
}
