// Event Bus — in-process pub/sub with persistent event log
// Replaces scattered event handling with a centralized event system.

import type { SystemEventType, EventLogEntry, LifecycleStage } from '@/types';
import { randomUUID } from 'crypto';

export interface SystemEvent {
  type: SystemEventType;
  accountId?: string;
  data: Record<string, unknown>;
}

type EventHandler = (event: SystemEvent) => void | Promise<void>;

class EventBus {
  private listeners = new Map<string, EventHandler[]>();
  private logFn: ((entry: EventLogEntry) => Promise<void>) | null = null;

  /** Register a persistent log function (called from db layer after init) */
  setLogFunction(fn: (entry: EventLogEntry) => Promise<void>): void {
    this.logFn = fn;
  }

  /** Subscribe to an event type */
  on(eventType: SystemEventType, handler: EventHandler): void {
    const handlers = this.listeners.get(eventType) || [];
    handlers.push(handler);
    this.listeners.set(eventType, handlers);
  }

  /** Subscribe to all events */
  onAny(handler: EventHandler): void {
    this.on('*' as SystemEventType, handler);
  }

  /** Emit an event — fires handlers and persists to log */
  emit(event: SystemEvent): void {
    // Fire specific handlers
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`[EventBus] Handler error for ${event.type}:`, err);
          });
        }
      } catch (err) {
        console.error(`[EventBus] Handler error for ${event.type}:`, err);
      }
    }

    // Fire wildcard handlers
    const wildcardHandlers = this.listeners.get('*' as SystemEventType) || [];
    for (const handler of wildcardHandlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`[EventBus] Wildcard handler error:`, err);
          });
        }
      } catch (err) {
        console.error(`[EventBus] Wildcard handler error:`, err);
      }
    }

    // Persist to event log (fire-and-forget)
    if (this.logFn) {
      const entry: EventLogEntry = {
        id: randomUUID(),
        type: event.type,
        accountId: event.accountId,
        data: event.data,
        timestamp: new Date().toISOString(),
      };
      this.logFn(entry).catch((err) => {
        console.error('[EventBus] Failed to persist event:', err);
      });
    }
  }

  /** Remove all listeners (for testing) */
  clear(): void {
    this.listeners.clear();
  }
}

// Singleton
export const eventBus = new EventBus();

// Helper emit functions for common events
export function emitEmailSent(accountId: string, emailId: string, to: string): void {
  eventBus.emit({ type: 'email.sent', accountId, data: { emailId, to } });
}

export function emitEmailOpened(accountId: string, emailId: string): void {
  eventBus.emit({ type: 'email.opened', accountId, data: { emailId } });
}

export function emitEmailClicked(accountId: string, emailId: string): void {
  eventBus.emit({ type: 'email.clicked', accountId, data: { emailId } });
}

export function emitEmailReplied(accountId: string, emailId: string, replyCategory: string): void {
  eventBus.emit({ type: 'email.replied', accountId, data: { emailId, replyCategory } });
}

export function emitEmailBounced(accountId: string, emailId: string, error: string): void {
  eventBus.emit({ type: 'email.bounced', accountId, data: { emailId, error } });
}

export function emitLifecycleChanged(accountId: string, from: LifecycleStage, to: LifecycleStage): void {
  eventBus.emit({ type: 'lifecycle.changed', accountId, data: { from, to } });
}

export function emitPipelineStageChanged(accountId: string, from: string, to: string): void {
  eventBus.emit({ type: 'pipeline.stage.changed', accountId, data: { from, to } });
}

export function emitReviewReceived(accountId: string, reviewId: string, rating: number): void {
  eventBus.emit({ type: 'review.received', accountId, data: { reviewId, rating } });
}

export function emitTaskCompleted(taskId: string, taskType: string): void {
  eventBus.emit({ type: 'task.completed', data: { taskId, taskType } });
}

export function emitTaskFailed(taskId: string, taskType: string, error: string): void {
  eventBus.emit({ type: 'task.failed', data: { taskId, taskType, error } });
}
