/**
 * activityLogger.js — ACT Shopkeeper
 *
 * Logs user actions to localforage immediately (works offline).
 * When online, pushes logs to Firebase 'activity_logs' collection.
 * When offline, queues them in 'activity_log_queue' and flushes on reconnect.
 *
 * Log entry shape:
 * {
 *   id:        string   — unique ID
 *   timestamp: ISO      — when the action happened
 *   app:       string   — 'shopkeeper'
 *   username:  string   — display name of the user
 *   userId:    string   — Firebase UID
 *   action:    string   — short action label e.g. 'SALE', 'STOCK_MOVE'
 *   details:   string   — human-readable description
 *   synced:    boolean  — whether it has been pushed to Firebase
 * }
 */

import localforage from 'localforage';
import { auth, db } from './firebaseConfig';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const FORAGE_KEY   = 'activity_logs';
const QUEUE_KEY    = 'activity_log_queue';
const MAX_LOCAL    = 500; // keep last 500 entries locally

const logStore = localforage.createInstance({
  name: 'act-shopkeeper-logs',
  storeName: 'logs',
});

// Generate a simple unique ID
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Get current user identity from localStorage (set at login)
function getCurrentUser() {
  return {
    username: localStorage.getItem('user_username') || 'Unknown',
    userId:   auth.currentUser?.uid || 'unknown',
  };
}

/**
 * Log an action.
 * @param {string} action  - Short label: 'SALE', 'STOCK_MOVE', 'LOGIN', 'LOGOUT', etc.
 * @param {string} details - Human-readable description of what happened.
 */
export async function logAction(action, details) {
  try {
    const { username, userId } = getCurrentUser();
    const entry = {
      id:        genId(),
      timestamp: new Date().toISOString(),
      app:       'shopkeeper',
      username,
      userId,
      action,
      details,
      synced:    false,
    };

    // Always save to localforage immediately
    const existing = await logStore.getItem(FORAGE_KEY) || [];
    const updated = [entry, ...existing].slice(0, MAX_LOCAL);
    await logStore.setItem(FORAGE_KEY, updated);

    // Push to Firebase or queue for later
    if (auth.currentUser && navigator.onLine) {
      try {
        await setDoc(doc(db, 'activity_logs', entry.id), {
          ...entry,
          synced: true,
          serverTimestamp: serverTimestamp(),
        });
        entry.synced = true;
        // Update the local entry to mark as synced
        updated[0] = entry;
        await logStore.setItem(FORAGE_KEY, updated);
      } catch {
        await _queueLog(entry);
      }
    } else {
      await _queueLog(entry);
    }
  } catch (err) {
    // Never let logging crash the app
    console.warn('activityLogger error:', err);
  }
}

async function _queueLog(entry) {
  const queue = await logStore.getItem(QUEUE_KEY) || [];
  queue.push(entry);
  await logStore.setItem(QUEUE_KEY, queue);
}

/**
 * Flush queued offline logs to Firebase.
 * Called by dataService.syncToServer() when device comes back online.
 */
export async function flushLogQueue() {
  try {
    if (!auth.currentUser || !navigator.onLine) return;
    const queue = await logStore.getItem(QUEUE_KEY) || [];
    if (queue.length === 0) return;

    const failed = [];
    for (const entry of queue) {
      try {
        await setDoc(doc(db, 'activity_logs', entry.id), {
          ...entry,
          synced: true,
          serverTimestamp: serverTimestamp(),
        });
        // Mark synced in local log
        const local = await logStore.getItem(FORAGE_KEY) || [];
        const idx = local.findIndex(l => l.id === entry.id);
        if (idx !== -1) { local[idx].synced = true; await logStore.setItem(FORAGE_KEY, local); }
      } catch {
        failed.push(entry);
      }
    }
    await logStore.setItem(QUEUE_KEY, failed);
  } catch (err) {
    console.warn('flushLogQueue error:', err);
  }
}

/**
 * Get locally stored logs (for debug or offline display).
 */
export async function getLocalLogs() {
  return await logStore.getItem(FORAGE_KEY) || [];
}
