/**
 * notificationService.js
 * Centralized notification logic for all 4 notification types.
 *
 * ID ranges (avoid collisions):
 *   6001–6009  Daily sales milestones
 *   7001–7099  Low stock alerts
 *   8001–8099  Debt repayment reminders
 *   9001–9099  Creditor payment reminders
 */
import localforage from 'localforage';

const SETTINGS_KEY = 'app_settings';

// ── Shared helper ─────────────────────────────────────────────────────────
async function getPlugin() {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return null;
    return LocalNotifications;
  } catch {
    return null;
  }
}

async function getSettings() {
  try {
    return (await localforage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function currencyFmt(n) {
  return '$' + Number(n).toFixed(2);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DEBT REPAYMENT REMINDER  (IDs 8001–8099)
//    Scheduled notifications that fire at 8:00 AM the day BEFORE each
//    debtor's repayment date.  Re-scheduled whenever:
//      • The toggle is turned ON in Settings
//      • A new credit sale is recorded (new repayment date added)
// ═══════════════════════════════════════════════════════════════════════════

export async function scheduleDebtReminders() {
  try {
    const LN = await getPlugin();
    if (!LN) return;

    // Always clear old ones first
    await cancelDebtReminders(LN);

    const debtors = (await localforage.getItem('debtors')) || [];
    const now = new Date();
    const notifications = [];
    let notifId = 8001;

    for (const debtor of debtors) {
      const balance = debtor.balance ?? ((debtor.totalDue || 0) - (debtor.totalPaid || 0));
      if (balance <= 0) continue;
      if (!debtor.repaymentDate) continue;

      // Parse date — repaymentDate may be "YYYY-MM-DD" or full ISO
      const repayDate = new Date(
        debtor.repaymentDate.length === 10
          ? debtor.repaymentDate + 'T00:00:00'
          : debtor.repaymentDate
      );
      if (isNaN(repayDate.getTime())) continue;

      // Fire at 8:00 AM the day before repayment
      const fireAt = new Date(repayDate);
      fireAt.setDate(fireAt.getDate() - 1);
      fireAt.setHours(8, 0, 0, 0);

      if (fireAt <= now) continue; // already past

      const name = debtor.name || debtor.customerName || 'Debtor';

      notifications.push({
        id: notifId++,
        title: '📋 Debt Repayment Due Tomorrow',
        body: `${name} owes ${currencyFmt(balance)} — repayment due ${repayDate.toLocaleDateString()}. Follow up today.`,
        schedule: { at: fireAt },
        sound: 'default',
        channelId: 'debt_reminders',
      });

      if (notifId > 8099) break;
    }

    if (notifications.length) {
      await LN.schedule({ notifications });
    }
  } catch (e) {
    console.error('Debt reminder scheduling error:', e);
  }
}

export async function cancelDebtReminders(pluginInstance) {
  try {
    const LN = pluginInstance || (await getPlugin());
    if (!LN) return;
    const pending = await LN.getPending();
    const ids = (pending.notifications || []).filter(n => n.id >= 8001 && n.id <= 8099);
    if (ids.length) await LN.cancel({ notifications: ids });
  } catch (e) {
    console.error('Cancel debt reminders error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LOW STOCK ALERT  (IDs 7001–7099)
//    Fires an instant notification when a product's stock drops to ≤ 5.
//    Called from dataService.addSale() after stock deduction.
//    Uses localStorage to avoid repeat alerts for the same item on the same day.
// ═══════════════════════════════════════════════════════════════════════════

export async function checkLowStock(goodsArray) {
  try {
    const settings = await getSettings();
    if (!settings.notifLowStock) return;

    const LN = await getPlugin();
    if (!LN) return;

    // Which items have we already alerted about today?
    const today = new Date().toISOString().slice(0, 10);
    const storageKey = `ks_lowstock_notified_${today}`;
    const alreadyNotified = new Set(
      JSON.parse(localStorage.getItem(storageKey) || '[]')
    );

    const lowItems = (goodsArray || []).filter(g => {
      const stock = parseFloat(g.stock_quantity) || 0;
      return stock > 0 && stock <= 5 && !alreadyNotified.has(String(g.id));
    });

    if (lowItems.length === 0) return;

    const notifications = [];
    let notifId = 7001 + (alreadyNotified.size % 90);

    for (const item of lowItems.slice(0, 10)) {
      const stock = Math.round(parseFloat(item.stock_quantity));
      notifications.push({
        id: notifId++,
        title: '⚠️ Low Stock Alert',
        body: `${item.name} has only ${stock} unit${stock !== 1 ? 's' : ''} left in stock. Consider reordering.`,
        schedule: { at: new Date(Date.now() + 1000) }, // 1 second from now
        sound: 'default',
        channelId: 'low_stock',
      });
      alreadyNotified.add(String(item.id));
    }

    if (notifications.length) {
      await LN.schedule({ notifications });
      localStorage.setItem(storageKey, JSON.stringify([...alreadyNotified]));
    }
  } catch (e) {
    console.error('Low stock check error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. DAILY SALES MILESTONE  (IDs 6001–6009)
//    Fires when the day's total sales crosses a $500 increment.
//    Called from dataService.addSale() after each sale.
//    Uses localStorage to track the last milestone reached today.
// ═══════════════════════════════════════════════════════════════════════════

export async function checkDailySalesMilestone() {
  try {
    const settings = await getSettings();
    if (!settings.notifDailySales) return;

    const LN = await getPlugin();
    if (!LN) return;

    const today = new Date().toISOString().slice(0, 10);

    // Sum today's active sales
    const sales = (await localforage.getItem('sales')) || [];
    const todayTotal = sales
      .filter(s => {
        const d = s.date || s.createdAt;
        return d && d.slice(0, 10) === today && s.status !== 'voided';
      })
      .reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

    // What was the last milestone we notified?
    const milestoneKey = `ks_sales_milestone_${today}`;
    const lastMilestone = parseInt(localStorage.getItem(milestoneKey) || '0', 10);
    const currentMilestone = Math.floor(todayTotal / 500) * 500;

    if (currentMilestone > lastMilestone && currentMilestone > 0) {
      await LN.schedule({
        notifications: [{
          id: 6001 + ((currentMilestone / 500) % 9),
          title: '🎉 Sales Milestone!',
          body: `Daily sales just passed ${currencyFmt(currentMilestone)}! Total so far: ${currencyFmt(todayTotal)}.`,
          schedule: { at: new Date(Date.now() + 1000) },
          sound: 'default',
          channelId: 'sales_milestones',
        }],
      });
      localStorage.setItem(milestoneKey, String(currentMilestone));
    }
  } catch (e) {
    console.error('Daily sales milestone check error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CREDITOR PAYMENT REMINDER  (IDs 9001–9099)
//    Fires at 08:30, 12:00 and 16:30 daily if there are outstanding
//    amounts owed to creditors.
//    (Previously lived inline in Settings.jsx — moved here for consistency.)
// ═══════════════════════════════════════════════════════════════════════════

export async function scheduleCreditorReminders() {
  try {
    const creditors = (await localforage.getItem('creditors')) || [];
    const owing = creditors.filter(c => (c.balance || 0) > 0);
    if (owing.length === 0) return;

    const LN = await getPlugin();
    if (!LN) return;

    // Clear previous creditor reminders
    await cancelCreditorReminders(LN);

    const now = new Date();
    const fireHours = [8.5, 12, 16.5]; // 08:30, 12:00, 16:30
    const notifications = [];
    let notifId = 9001;

    for (const creditor of owing.slice(0, 10)) {
      const name = creditor.name || creditor.customerName || 'Creditor';
      const balance = creditor.balance || creditor.totalDue || 0;
      const purchaseDate = creditor.lastPurchase ? new Date(creditor.lastPurchase) : null;
      let dateLabel = '';
      if (purchaseDate && !isNaN(purchaseDate.getTime())) {
        const diffDays = Math.floor((now - purchaseDate) / 86400000);
        dateLabel = diffDays <= 1 ? 'yesterday' : `on ${purchaseDate.toLocaleDateString()}`;
      }

      const body = `Kadaele Services still owes ${name} the amount of ${currencyFmt(balance)} for purchasing cargoes on credit${dateLabel ? ' ' + dateLabel : ''}.`;

      for (const h of fireHours) {
        const fireAt = new Date(now);
        const hrs = Math.floor(h);
        const mins = (h - hrs) * 60;
        fireAt.setHours(hrs, mins, 0, 0);
        if (fireAt <= now) fireAt.setDate(fireAt.getDate() + 1);

        notifications.push({
          id: notifId++,
          title: '💳 Creditor Payment Reminder',
          body,
          schedule: { at: fireAt, repeats: true, every: 'day' },
          sound: 'default',
          channelId: 'creditor_reminders',
        });
      }
    }

    if (notifications.length) {
      await LN.schedule({ notifications });
    }
  } catch (e) {
    console.error('Creditor reminder scheduling error:', e);
  }
}

export async function cancelCreditorReminders(pluginInstance) {
  try {
    const LN = pluginInstance || (await getPlugin());
    if (!LN) return;
    const pending = await LN.getPending();
    const ids = (pending.notifications || []).filter(n => n.id >= 9001 && n.id <= 9099);
    if (ids.length) await LN.cancel({ notifications: ids });
  } catch (e) {
    console.error('Cancel creditor reminders error:', e);
  }
}
