import localforage from 'localforage';
import { auth, db } from './firebaseConfig';
import {
  checkLowStock,
  checkDailySalesMilestone,
  scheduleDebtReminders,
} from './notificationService';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  onAuthStateChanged 
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';

// Configure localforage
localforage.config({
  name: 'act-pos',
  storeName: 'pos_data',
});

// Data file keys
const DATA_KEYS = {
  GOODS: 'goods',
  SALES: 'sales',
  DEBTORS: 'debtors',
  CREDITORS: 'creditors',
  SUPPLIERS: 'suppliers',
  INVENTORY: 'inventory',
  CASH_ENTRIES: 'cash_entries',
  PURCHASES: 'purchases',
  EXPENSES: 'expenses',
  SYNC_QUEUE: 'sync_queue',
  DAILY_CASH: 'daily_cash',
  LAST_SYNC: 'last_sync',
  SETTINGS: 'app_settings',
  OPERATIONAL_ASSETS: 'operational_assets',
  ADVANCE_ORDERS: 'advance_orders',
  WITHDRAWALS: 'withdrawals',
  BANK_TRANSFERS: 'bank_transfers',
  MPAISA_TRANSFERS: 'mpaisa_transfers',
};

class DataService {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.currentUser = null;
    // Tracks whether we've done the initial Firebase pull for debtors this
    // session.  After the first pull we trust localforage as source of truth
    // so that writes made moments ago are never overwritten by a stale read.
    this._debtorsFetchedFromFirebase = false;
    this._creditorsFetchedFromFirebase = false;
    this._suppliersFetchedFromFirebase = false;
    this._goodsFetchedFromFirebase = false;
    this._salesFetchedFromFirebase = false;
    this._purchasesFetchedFromFirebase = false;
    this._cashEntriesFetched = false;
    this._dailyCashFetched = false;
    this._advanceOrdersFetched = false;
    this._expensesFetched = false;
    this._withdrawalsFetched = false;
    this._operationalAssetsFetched = false;
    this._debtorsUnsubscribe = null; // Firebase real-time listener handle
    this._goodsUnsubscribe = null;   // Firebase real-time listener handle for goods
    
    // ── Goods change subscribers ──────────────────────────────────────────
    // UI components register callbacks here so they re-render when the
    // Firebase real-time listener writes new goods data to localforage.
    this._goodsSubscribers = new Set();
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncToServer();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  // ── Goods change subscription API ───────────────────────────────────────
  // Components call onGoodsChange(callback) to be notified whenever the
  // Firebase real-time listener (or any local write) updates the goods list.
  // Returns an unsubscribe function.
  onGoodsChange(callback) {
    this._goodsSubscribers.add(callback);
    return () => this._goodsSubscribers.delete(callback);
  }

  // Notify all subscribers with the latest goods array
  _notifyGoodsSubscribers(goods) {
    for (const cb of this._goodsSubscribers) {
      try { cb(goods); } catch (e) { console.error('Goods subscriber error:', e); }
    }
  }

  // ── Start real-time Firebase listener for Debtors collection ─────────────
  // Called after login. Watches for:
  //   • New debtors added in Firebase → saved to localforage
  //   • Debtors deleted from Firebase → if balance=0 in forage, delete forage record too
  startDebtorsListener() {
    if (this._debtorsUnsubscribe) return; // already listening
    try {
      this._debtorsUnsubscribe = onSnapshot(
        collection(db, 'debtors'),
        async (snapshot) => {
          const localDebtors = await localforage.getItem(DATA_KEYS.DEBTORS) || [];
          const localMap = new Map(localDebtors.map(d => [d.id, d]));

          snapshot.docChanges().forEach((change) => {
            const fbId = change.doc.id;
            const fbData = { id: fbId, ...change.doc.data() };

            if (change.type === 'removed') {
              // Debtor was deleted from Firebase
              const local = localMap.get(fbId);
              if (local && (local.balance || local.totalDue || 0) <= 0) {
                // Balance is 0 (cleared) — safe to delete local record too
                localMap.delete(fbId);
              }
              // If balance > 0, we keep the local record (never lose debt data)
            } else if (change.type === 'added') {
              // New debtor from Firebase — add if not already in local
              if (!localMap.has(fbId)) {
                localMap.set(fbId, fbData);
              }
            } else if (change.type === 'modified') {
              // Remote update — merge carefully, prefer local if it's newer
              const local = localMap.get(fbId);
              const fbTime  = fbData.updatedAt?.seconds
                ? fbData.updatedAt.seconds * 1000
                : new Date(fbData.updatedAt || 0).getTime();
              const locTime = new Date(local?.updatedAt || 0).getTime();
              if (!local || fbTime > locTime) {
                localMap.set(fbId, { ...fbData, updatedAt: new Date(fbTime).toISOString() });
              }
            }
          });

          const merged = Array.from(localMap.values());
          await localforage.setItem(DATA_KEYS.DEBTORS, merged);
        },
        (error) => {
          console.error('Debtors Firebase listener error:', error);
        }
      );
    } catch (err) {
      console.error('Could not start debtors listener:', err);
    }
  }

  stopDebtorsListener() {
    if (this._debtorsUnsubscribe) {
      this._debtorsUnsubscribe();
      this._debtorsUnsubscribe = null;
    }
  }

  // ── Start real-time Firebase listener for Goods collection ───────────────
  // Watches for products added, edited or deleted from ANY device (e.g. the
  // A.C.T Inventory app) and merges changes into localforage immediately,
  // so the Shopkeeper app always shows up-to-date inventory without restart.
  startGoodsListener() {
    if (this._goodsUnsubscribe) return; // already listening
    try {
      this._goodsUnsubscribe = onSnapshot(
        collection(db, 'goods'),
        async (snapshot) => {
          // Skip if nothing actually changed (e.g. initial empty snapshot)
          if (snapshot.docChanges().length === 0) return;

          const localGoods = await localforage.getItem(DATA_KEYS.GOODS) || [];
          const localMap = new Map(localGoods.map(g => [String(g.id), g]));

          snapshot.docChanges().forEach((change) => {
            const fbId = String(change.doc.id);
            const rawData = change.doc.data();
            // Normalise Firestore Timestamps to ISO strings for local storage
            const fbData = { id: fbId, ...rawData };
            if (rawData.updatedAt?.seconds) {
              fbData.updatedAt = new Date(rawData.updatedAt.seconds * 1000).toISOString();
            }
            if (rawData.createdAt?.seconds) {
              fbData.createdAt = new Date(rawData.createdAt.seconds * 1000).toISOString();
            }

            if (change.type === 'removed') {
              localMap.delete(fbId);
            } else if (change.type === 'added') {
              // Always accept remote adds — overwrite only if local doesn't
              // exist OR if remote is newer (covers Admin-app edits).
              const local = localMap.get(fbId);
              if (!local) {
                localMap.set(fbId, fbData);
              } else {
                // If the remote version is newer, prefer it
                const fbTime  = new Date(fbData.updatedAt || fbData.createdAt || 0).getTime();
                const locTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
                if (fbTime > locTime) {
                  localMap.set(fbId, fbData);
                }
              }
            } else if (change.type === 'modified') {
              // Remote update from Admin app — always accept it
              localMap.set(fbId, fbData);
            }
          });

          const merged = Array.from(localMap.values());
          await localforage.setItem(DATA_KEYS.GOODS, merged);
          // ── Notify UI components about the update ──────────────────
          this._notifyGoodsSubscribers(merged);
        },
        (error) => {
          console.error('Goods Firebase listener error:', error);
        }
      );
    } catch (err) {
      console.error('Could not start goods listener:', err);
    }
  }

  stopGoodsListener() {
    if (this._goodsUnsubscribe) {
      this._goodsUnsubscribe();
      this._goodsUnsubscribe = null;
    }
  }

  // Authentication methods
  async login(email, password) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      this.currentUser = userCredential.user;
      // Reset so the next getDebtors() call pulls a fresh copy from Firebase
      this._debtorsFetchedFromFirebase = false;
      this._goodsFetchedFromFirebase = false;
      this._cashEntriesFetched = false;
      this._salesFetchedFromFirebase = false;
      this._purchasesFetchedFromFirebase = false;
      this._creditorsFetchedFromFirebase = false;
      this._suppliersFetchedFromFirebase = false;
      this._dailyCashFetched = false;
      this._expensesFetched = false;
      this._withdrawalsFetched = false;
      this._operationalAssetsFetched = false;
      
      // Update lastSeen for this user in Firestore
      if (userCredential.user) {
        const uid = userCredential.user.uid;
        try {
          const users = await localforage.getItem('act_users') || [];
          const userDoc = users.find(u => u.authUid === uid || u.id === uid);
          if (userDoc) {
            userDoc.lastSeen = new Date().toISOString();
            userDoc.isOnline = true;
            await localforage.setItem('act_users', users);
            if (this.isOnline) {
              await setDoc(doc(db, 'users', userDoc.id), { lastSeen: serverTimestamp(), isOnline: true }, { merge: true }).catch(() => {});
            }
          }
        } catch (_) {}
      }

      // Start real-time listeners for debtors and goods (handles remote changes)
      this.startDebtorsListener();
      this.startGoodsListener();
      
      // Store login state persistently
      await localforage.setItem('auth_user', {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        loggedInAt: new Date().toISOString()
      });
      
      return { success: true, user: userCredential.user };
    } catch (error) {
      console.error('Login error:', error);
      let errorMessage = 'Login failed. Please try again.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      }
      
      return { success: false, error: errorMessage };
    }
  }

  async logout() {
    try {
      this.stopDebtorsListener();
      this.stopGoodsListener();
      // Mark user offline before signing out
      try {
        const u = auth.currentUser;
        if (u && this.isOnline) {
          const users = await localforage.getItem('act_users') || [];
          const userDoc = users.find(ud => ud.authUid === u.uid || ud.id === u.uid);
          if (userDoc) {
            await setDoc(doc(db, 'users', userDoc.id), { isOnline: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
          }
        }
      } catch (_) {}
      await signOut(auth);
      this.currentUser = null;
      // Clear persistent login state
      await localforage.removeItem('auth_user');
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: error.message };
    }
  }

  getCurrentUser() {
    return this.currentUser || auth.currentUser;
  }

  // Check if user has persistent login
  async checkPersistedLogin() {
    try {
      // Firebase Auth automatically restores sessions with browserLocalPersistence
      // We just need to wait for Firebase to restore the auth state
      return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          unsubscribe(); // Stop listening after first check
          if (user) {
            this.currentUser = user;
            // Also store in localforage for backup
            localforage.setItem('auth_user', {
              uid: user.uid,
              email: user.email,
              loggedInAt: new Date().toISOString()
            }).catch(err => console.error('Error storing auth state:', err));
            // Start real-time listeners for debtors and goods
            this.startDebtorsListener();
            this.startGoodsListener();
            resolve(user);
          } else {
            // Check if we have backup auth state
            localforage.getItem('auth_user').then(authUser => {
              if (authUser) {
                console.log('User was logged in but Firebase session expired');
                // Clear the backup since Firebase session is gone
                localforage.removeItem('auth_user');
              }
              resolve(null);
            }).catch(() => resolve(null));
          }
        });
      });
    } catch (error) {
      console.error('Error checking persisted login:', error);
      return null;
    }
  }

  async sendPasswordReset(email) {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error) {
      console.error('Password reset error:', error);
      let errorMessage = 'Failed to send password reset email.';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      }
      
      return { success: false, error: errorMessage };
    }
  }

  // Generate unique ID
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get current server time (or local time if offline)
  async getServerTime() {
    // Use local device time — Firebase serverTimestamp() handles authoritative
    // timestamps for stored values.  The external API (worldtimeapi.org) was
    // unreliable and slow in Solomon Islands, blocking void/refund operations.
    return new Date();
  }

  // Generic CRUD operations
  async get(key) {
    try {
      const data = await localforage.getItem(key);
      return data || (key === DATA_KEYS.GOODS || key === DATA_KEYS.SALES || 
                      key === DATA_KEYS.DEBTORS || key === DATA_KEYS.CREDITORS ||
                      key === DATA_KEYS.SUPPLIERS || key === DATA_KEYS.INVENTORY ? [] : null);
    } catch (error) {
      console.error(`Error getting ${key}:`, error);
      return key === DATA_KEYS.GOODS || key === DATA_KEYS.SALES || 
             key === DATA_KEYS.DEBTORS || key === DATA_KEYS.CREDITORS ||
             key === DATA_KEYS.SUPPLIERS || key === DATA_KEYS.INVENTORY ? [] : null;
    }
  }

  async set(key, value) {
    try {
      await localforage.setItem(key, value);
      // Add to sync queue if not already syncing
      await this.addToSyncQueue({ key, value, timestamp: Date.now() });
      return true;
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      return false;
    }
  }

  // Goods operations
  async getGoods() {
    try {
      // Pull from Firebase only on the FIRST call of the session.
      if (this.isOnline && auth.currentUser && !this._goodsFetchedFromFirebase) {
        this._goodsFetchedFromFirebase = true;
        const goodsSnapshot = await getDocs(collection(db, 'goods'));
        const firebaseGoods = goodsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Add any local-only items (added offline) that Firebase doesnt have by ID.
        const localGoods = await localforage.getItem(DATA_KEYS.GOODS) || [];
        const firebaseIds = new Set(firebaseGoods.map(g => String(g.id)));
        const localOnlyGoods = localGoods.filter(g => !firebaseIds.has(String(g.id)));
        const rawMerged = [...firebaseGoods, ...localOnlyGoods];

        // Deduplicate by name+size (case-insensitive, trimmed) keeping the first occurrence.
        // This cleans up any existing duplicates already in Firebase or local storage.
        const seenKeys = new Set();
        const merged = rawMerged.filter(g => {
          const key = ((g.name || '').toLowerCase().trim() + '|' + (g.size || '').toLowerCase().trim());
          if (!key || seenKeys.has(key)) return false;
          seenKeys.add(key);
          return true;
        });

        await localforage.setItem(DATA_KEYS.GOODS, merged);
        return merged;
      }
    } catch (error) {
      console.error('Error fetching goods from Firebase:', error);
    }
    // Offline or already fetched this session — use local cache
    return await this.get(DATA_KEYS.GOODS);
  }

  async setGoods(goods) {
    // Save locally first
    await localforage.setItem(DATA_KEYS.GOODS, goods);
    
    // Sync to Firebase if online
    const user = auth.currentUser || await new Promise(resolve => {
      const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
    });
    if (this.isOnline && user) {
      try {
        await this._batchWrite('goods', goods, g => g.id.toString());
      } catch (error) {
        console.error('Error syncing goods to Firebase:', error);
      }
    }
    return true;
  }

  // ── Helper: chunked Firestore batch write (max 450 ops per batch) ──────
  async _batchWrite(collectionName, items, idFn, extraFields = {}) {
    const CHUNK = 450;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      chunk.forEach(item => {
        const ref = doc(db, collectionName, idFn(item));
        batch.set(ref, { ...item, updatedAt: serverTimestamp(), ...extraFields }, { merge: true });
      });
      await batch.commit();
    }
  }

  async addGood(good) {
    const goods = await this.getGoods();
    const newGood = {
      id: good.id || this.generateId(),
      name: good.name,
      brand: good.brand || '',
      size: good.size || '',
      price: parseFloat(good.price),
      category: good.category || 'General',
      barcode: good.barcode || null,
      barcodeImage: good.barcodeImage || null,
      stock_quantity: good.stock_quantity || 0,
      createdAt: new Date().toISOString(),
    };
    // Guard: never push if this ID OR same name+size already exists
    const nameKey = (newGood.name || '').toLowerCase().trim();
    const sizeKey = (newGood.size || '').toLowerCase().trim();
    const isDuplicate = goods.some(g =>
      String(g.id) === String(newGood.id) ||
      (nameKey && (g.name || '').toLowerCase().trim() === nameKey &&
       (g.size || '').toLowerCase().trim() === sizeKey)
    );
    if (isDuplicate) return newGood;
    goods.push(newGood);
    // setGoods handles both local save AND Firebase batch sync
    await this.setGoods(goods);
    return newGood;
  }

  async updateGood(id, updates) {
    const goods = await this.getGoods();
    const index = goods.findIndex(g => g.id === id);
    if (index !== -1) {
      goods[index] = { ...goods[index], ...updates };
      // setGoods handles both local save AND Firebase batch sync
      await this.setGoods(goods);
      return goods[index];
    }
    return null;
  }

  // Purchases operations
  async getSales() {
    try {
      // Only pull from Firebase on the FIRST call of the session.
      // After that, localforage is the source of truth — this prevents a
      // stale Firebase read from overwriting a write that just happened
      // (e.g. addSale with a manual backdated date).
      if (this.isOnline && auth.currentUser && !this._salesFetchedFromFirebase) {
        this._salesFetchedFromFirebase = true;
        const salesSnapshot = await getDocs(collection(db, 'sales'));
        const firebaseSales = salesSnapshot.docs.map(doc => {
          const data = doc.data();
          // Convert Firestore Timestamps to ISO strings.
          // For date: prefer the stored ISO string (which preserves the manual
          // date for backdated entries). Only fall back to Timestamp if no
          // ISO string is present.
          const dateVal = typeof data.date === 'string'
            ? data.date
            : (data.date?.toDate?.()?.toISOString?.() || null);
          return {
            id: doc.id,
            ...data,
            date: dateVal,
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
          };
        });

        // Merge: keep the local version if it's newer (covers the case where
        // a sale was just saved locally but Firebase still has stale data).
        const localSales = await localforage.getItem(DATA_KEYS.SALES) || [];
        const localMap = new Map(localSales.map(s => [s.id, s]));
        const merged = firebaseSales.map(fbSale => {
          const local = localMap.get(fbSale.id);
          if (!local) return fbSale;
          // If local has a more recent createdAt, keep local
          const fbTime  = new Date(fbSale.createdAt || 0).getTime();
          const locTime = new Date(local.createdAt || 0).getTime();
          return locTime >= fbTime ? local : fbSale;
        });
        // Add any sales that exist only locally (created offline)
        for (const local of localSales) {
          if (!merged.find(s => s.id === local.id)) merged.push(local);
        }

        await localforage.setItem(DATA_KEYS.SALES, merged);
        return merged;
      }
    } catch (error) {
      console.error('Error fetching sales from Firebase:', error);
    }

    // All subsequent calls within the same session use localforage
    return await this.get(DATA_KEYS.SALES);
  }

  async setSales(sales) {
    // Save locally first
    await localforage.setItem(DATA_KEYS.SALES, sales);
    return true;
  }

  async addSale(sale) {
    const sales = await this.getSales();
    const serverTime = new Date();

    // Use manual date if provided (forgotten entry), otherwise now
    const saleDate = sale.date ? new Date(sale.date) : serverTime;

    const newSale = {
      id: sale.id || this.generateId(),
      date: saleDate.toISOString(),
      timestamp: saleDate.toISOString(), // For SalesJournal compatibility
      items: sale.items,
      total: parseFloat(sale.total),
      total_amount: parseFloat(sale.total),
      paymentType: sale.paymentType,
      payment_type: sale.paymentType,
      customerName: sale.customerName || '',
      customer_name: sale.customerName || '',
      customerPhone: sale.customerPhone || '',
      debtorId: sale.debtorId || null,           // ← ID of the registered debtor
      status: sale.status || 'active',
      photoUrl: sale.photoUrl || null,
      refund: sale.refund || null,
      repaymentDate: sale.repaymentDate || '',
      isDebt: sale.isDebt || false,
      createdAt: serverTime.toISOString(),
      ...(sale.isUnrecorded ? { isUnrecorded: true } : {}),
    };
    
    sales.push(newSale);
    await this.setSales(sales);

    // ── Auto-deduct stock for each item sold ─────────────────────────────
    try {
      const goods = await localforage.getItem(DATA_KEYS.GOODS) || [];
      let stockChanged = false;
      newSale.items.forEach(soldItem => {
        const good = goods.find(g => String(g.id) === String(soldItem.id));
        if (good && typeof good.stock_quantity === 'number') {
          const qty = soldItem.quantity || soldItem.qty || 0;
          good.stock_quantity = Math.max(0, good.stock_quantity - qty);
          stockChanged = true;
        }
      });
      if (stockChanged) {
        await localforage.setItem(DATA_KEYS.GOODS, goods);
        // Sync reduced stock to Firebase
        if (this.isOnline && auth.currentUser) {
          await this._batchWrite('goods', goods, g => g.id.toString())
            .catch(e => console.error('Stock sync error:', e));
        }
      }
    } catch (stockErr) {
      console.error('Error deducting stock after sale:', stockErr);
    }

    // ── Notification: check for low stock after deduction ─────────────────
    localforage.getItem('goods').then(g => checkLowStock(g || [])).catch(() => {});

    // ── Auto-record cash sales in the Cash Journal ────────────────────────
    if (newSale.paymentType === 'cash') {
      await this.addCashEntry({
        type: 'in',
        amount: newSale.total,
        note: 'CASH Sale',
        date: saleDate.toISOString(),
        source: 'sale',
        saleId: newSale.id,
        ...(sale.isUnrecorded ? { isUnrecorded: true } : {}),
      });
    }

    // Sync to Firebase 'sales' collection
    if (this.isOnline && auth.currentUser) {
      try {
        await setDoc(doc(db, 'sales', newSale.id), {
          ...newSale,
          // Keep the manually entered date (saleDate) — do NOT overwrite with
          // serverTimestamp() as that would corrupt forgotten/backdated entries.
          // Only createdAt uses server time so we know when it was recorded.
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        console.error('Error adding sale to Firebase:', error);
        // Queue for later sync
        await this.addToSyncQueue({ type: 'sale', data: newSale });
      }
    } else {
      // Queue for sync when online
      await this.addToSyncQueue({ type: 'sale', data: newSale });
    }
    
    // Update debtor record if this is a credit sale.
    // Check debtorId first — customerName alone is not reliable if the field
    // was left empty or came through blank from the modal.
    if (newSale.paymentType === 'credit' && (newSale.debtorId || newSale.customerName)) {
      await this.updateDebtor(newSale);
      // ── Notification: refresh debt reminders with the new repayment date ──
      scheduleDebtReminders().catch(() => {});
    }

    // ── Notification: check if daily total crossed a $500 milestone ───────
    checkDailySalesMilestone().catch(() => {});

    return newSale;
  }

  async updateSale(id, updates) {
    const sales = await this.getSales();
    const index = sales.findIndex(s => s.id === id);
    
    if (index !== -1) {
      const sale = sales[index];

      // Check if within 24 hours
      const createdDate = new Date(sale.createdAt);
      const now = new Date();
      const hoursDiff = (now - createdDate) / (1000 * 60 * 60);
      
      if (hoursDiff > 2 && !updates.allowAfter24Hours) {
        throw new Error('Cannot edit sale after 2 hours');
      }
      
      sales[index] = { ...sale, ...updates };
      await this.setSales(sales);

      // Safely adjust debtor balance if credit sale total changed
      if (sales[index].paymentType === 'credit') {
        const oldTotal = parseFloat(sale.total || sale.total_amount || 0);
        const newTotal = parseFloat(sales[index].total || sales[index].total_amount || 0);
        const diff = newTotal - oldTotal;
        if (diff !== 0) {
          const debtorId = sale.debtorId;
          if (debtorId) {
            const debtors = await localforage.getItem(DATA_KEYS.DEBTORS) || [];
            const debtor = debtors.find(d => d.id === debtorId);
            if (debtor) {
              debtor.totalDue = (debtor.totalDue || 0) + diff;
              debtor.balance = Math.max(0, (debtor.totalDue || 0) - (debtor.totalPaid || 0));
              debtor.updatedAt = new Date().toISOString();
              await localforage.setItem(DATA_KEYS.DEBTORS, debtors);
            }
          }
        }
      }

      return sales[index];
    }
    return null;
  }

  async deleteSale(id) {
    const sales = await this.getSales();
    const index = sales.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Sale not found');
    const sale = sales[index];
    const hoursDiff = (new Date() - new Date(sale.createdAt || sale.date || 0)) / (1000 * 60 * 60);
    if (hoursDiff > 2) throw new Error('Cannot delete sale after 2 hours');
    sales.splice(index, 1);
    await this.setSales(sales);
    if (this.isOnline && auth.currentUser) {
      try { await deleteDoc(doc(db, 'sales', id)); } catch (err) { console.error('Firebase delete sale error:', err); }
    }
    // Reverse debtor charge if credit sale
    if (sale.paymentType === 'credit') {
      await this._reverseDebtorCharge(sale);
    }
    // Restore stock for deleted items
    await this._restoreStock(sale.items);
  }

  async deleteCashEntry(id) {
    const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
    const index = entries.findIndex(e => e.id === id);
    if (index === -1) throw new Error('Cash entry not found');
    const entry = entries[index];
    const hoursDiff = (new Date() - new Date(entry.date || entry.createdAt || 0)) / (1000 * 60 * 60);
    if (hoursDiff > 2) throw new Error('Cannot delete cash entry after 2 hours');
    entries.splice(index, 1);
    await localforage.setItem(DATA_KEYS.CASH_ENTRIES, entries);
    if (this.isOnline && auth.currentUser) {
      try { await deleteDoc(doc(db, 'cash_entries', id)); } catch (err) { console.error('Firebase delete cash entry error:', err); }
    }
  }

  async deletePurchase(id) {
    const purchases = await localforage.getItem(DATA_KEYS.PURCHASES) || [];
    const index = purchases.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Purchase not found');
    const purchase = purchases[index];
    const hoursDiff = (new Date() - new Date(purchase.createdAt || purchase.date || 0)) / (1000 * 60 * 60);
    if (hoursDiff > 2) throw new Error('Cannot delete purchase after 2 hours');
    purchases.splice(index, 1);
    await localforage.setItem(DATA_KEYS.PURCHASES, purchases);
    if (this.isOnline && auth.currentUser) {
      try { await deleteDoc(doc(db, 'purchases', id)); } catch (err) { console.error('Firebase delete purchase error:', err); }
    }
    // If it was a cash purchase, delete the linked cash_entry
    if ((purchase.paymentType || purchase.payment_type || 'cash') === 'cash') {
      await this._deletePurchaseCashEntry(id);
    }
  }

  // ── Helper: find cash_entry linked to a purchase ─────────────────────────
  async _findPurchaseCashEntry(purchaseId) {
    const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
    return entries.find(e => e.source === 'purchase' && e.purchaseId === purchaseId) || null;
  }

  // ── Helper: delete linked cash_entry for a purchase ──────────────────────
  async _deletePurchaseCashEntry(purchaseId) {
    const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
    const entry = entries.find(e => e.source === 'purchase' && e.purchaseId === purchaseId);
    if (!entry) return;
    const filtered = entries.filter(e => e.id !== entry.id);
    await localforage.setItem(DATA_KEYS.CASH_ENTRIES, filtered);
    if (this.isOnline && auth.currentUser) {
      try { await deleteDoc(doc(db, 'cash_entries', entry.id)); } catch (err) { console.error('Firebase delete purchase cash entry error:', err); }
    }
  }

  // ── Helper: safely reverse a debtor charge for a credit sale ──────────────
  async _reverseDebtorCharge(sale) {
    try {
      const debtorId = sale.debtorId;
      const saleTotal = parseFloat(sale.total || sale.total_amount || 0);
      if (!debtorId || saleTotal <= 0) return;

      const debtors = await localforage.getItem(DATA_KEYS.DEBTORS) || [];
      const debtor = debtors.find(d => d.id === debtorId);
      if (!debtor) return;

      debtor.totalDue = Math.max(0, (debtor.totalDue || 0) - saleTotal);
      debtor.balance = Math.max(0, debtor.totalDue - (debtor.totalPaid || 0));
      // Remove the saleId from the debtor's tracked sales
      if (debtor.saleIds) {
        debtor.saleIds = debtor.saleIds.filter(sid => sid !== sale.id);
      }
      if (debtor.purchaseIds) {
        debtor.purchaseIds = debtor.purchaseIds.filter(pid => pid !== sale.id);
      }
      // Clear repayment date if balance is zero
      if (debtor.balance <= 0) {
        debtor.balance = 0;
        debtor.repaymentDate = '';
      }
      debtor.updatedAt = new Date().toISOString();
      await localforage.setItem(DATA_KEYS.DEBTORS, debtors);

      // Sync to Firebase
      if (this.isOnline && auth.currentUser) {
        await setDoc(doc(db, 'debtors', debtorId.toString()), {
          ...debtor, updatedAt: serverTimestamp(),
        }, { merge: true }).catch(() => {});
      }
    } catch (err) {
      console.error('Error reversing debtor charge:', err);
    }
  }

  // ── Helper: restore stock for sale items (void / delete / refund) ─────────
  async _restoreStock(items) {
    try {
      if (!items || items.length === 0) return;
      const goods = await localforage.getItem(DATA_KEYS.GOODS) || [];
      let changed = false;

      for (const item of items) {
        const qty = parseFloat(item.quantity || item.qty || 0);
        if (qty <= 0) continue;
        // Match by id first, then by name
        const good = goods.find(g => g.id === item.id) ||
                     goods.find(g => (g.name || '').toLowerCase() === (item.name || '').toLowerCase());
        if (good && typeof good.stock_quantity === 'number') {
          good.stock_quantity += qty;
          changed = true;
        }
      }

      if (changed) {
        await localforage.setItem(DATA_KEYS.GOODS, goods);
        this._notifyGoodsSubscribers(goods);
      }
    } catch (err) {
      console.error('Error restoring stock:', err);
    }
  }

  async voidSale(id, reason) {
    const sales = await this.getSales();
    const original = sales.find(s => s.id === id);
    const now = (await this.getServerTime()).toISOString();
    const result = await this.updateSale(id, {
      status: 'voided',
      voidReason: reason,
      voidedAt: now,
      allowAfter24Hours: true,
    });
    // Reverse the original cash IN if it was a cash sale
    if (original && original.paymentType === 'cash') {
      await this.addCashEntry({
        type: 'out',
        amount: parseFloat(original.total) || 0,
        note: `Void — Sale #${id.slice(-6)} reversed. Reason: ${reason}`,
        date: now,
        source: 'void_sale',
        saleId: id,
        business_date: now.slice(0, 10),
      });
    }
    // Reverse the debtor charge if it was a credit sale
    if (original && original.paymentType === 'credit') {
      await this._reverseDebtorCharge(original);
    }
    // Restore stock for voided items
    if (original) {
      await this._restoreStock(original.items);
    }
    return result;
  }

  async refundSale(id, amount, reason) {
    const sales = await this.getSales();
    const original = sales.find(s => s.id === id);
    const now = (await this.getServerTime()).toISOString();
    const sale = await this.updateSale(id, {
      status: 'refunded',
      refund: {
        amount: parseFloat(amount),
        reason: reason,
        date: now,
      },
      allowAfter24Hours: true,
    });
    // Record cash OUT for the refund amount (cash sales only)
    if (original && original.paymentType === 'cash') {
      await this.addCashEntry({
        type: 'out',
        amount: parseFloat(amount) || 0,
        note: `Refund — Sale #${id.slice(-6)}. Reason: ${reason}`,
        date: now,
        source: 'refund_sale',
        saleId: id,
        business_date: now.slice(0, 10),
      });
    }
    // Reverse the debtor charge if credit sale
    if (original && original.paymentType === 'credit') {
      await this._reverseDebtorCharge(original);
    }
    // Restore stock for refunded items
    if (original) {
      await this._restoreStock(original.items);
    }
    return sale;
  }

  // Debtors operations
  async getDebtors() {
    try {
      // Only pull from Firebase on the FIRST call of the session.
      // After that, localforage is the source of truth — this prevents a
      // stale Firebase read from overwriting a write that just happened
      // (e.g. updateDebtor called right before loadDebtors in the UI).
      if (this.isOnline && auth.currentUser && !this._debtorsFetchedFromFirebase) {
        this._debtorsFetchedFromFirebase = true;
        const debtorsSnapshot = await getDocs(collection(db, 'debtors'));
        const firebaseDebtors = debtorsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
          lastPurchase: doc.data().lastPurchase?.toDate?.() || doc.data().lastPurchase,
          lastPayment: doc.data().lastPayment?.toDate?.() || doc.data().lastPayment
        }));

        // Get existing local data
        const localDebtors = await localforage.getItem(DATA_KEYS.DEBTORS) || [];

        // Merge: for each debtor, take whichever version has the more recent
        // updatedAt timestamp. This way locally-saved debt entries (balance,
        // saleIds, etc.) are never silently overwritten by a stale Firebase read.
        const merged = [...firebaseDebtors];
        for (const local of localDebtors) {
          const fbIdx = merged.findIndex(d => d.id === local.id);
          if (fbIdx === -1) {
            // Exists only locally (e.g. created offline) — keep it
            merged.push(local);
          } else {
            // Both exist: keep whichever is newer by updatedAt
            const fbTime  = new Date(merged[fbIdx].updatedAt || 0).getTime();
            const locTime = new Date(local.updatedAt || 0).getTime();
            if (locTime > fbTime) {
              // Local is newer (e.g. credit sale just recorded) — prefer local
              merged[fbIdx] = local;
            }
          }
        }

        await localforage.setItem(DATA_KEYS.DEBTORS, merged);
        return merged;
      }
    } catch (error) {
      console.error('Error fetching debtors from Firebase:', error);
    }

    // All subsequent calls within the same session use local storage,
    // which always has the latest writes from updateDebtor / setDebtors.
    return await this.get(DATA_KEYS.DEBTORS);
  }

  // Call this to force a fresh pull from Firebase (e.g. after login sync).
  resetDebtorsFetchFlag() {
    this._debtorsFetchedFromFirebase = false;
    this._creditorsFetchedFromFirebase = false;
    this._suppliersFetchedFromFirebase = false;
    this._goodsFetchedFromFirebase = false;
    this._salesFetchedFromFirebase = false;
    this._purchasesFetchedFromFirebase = false;
    this._dailyCashFetched = false;
    this._expensesFetched = false;
    this._withdrawalsFetched = false;
    this._operationalAssetsFetched = false;
  }

  async setDebtors(debtors) {
    // Save locally first — full data including any receipt photos
    await localforage.setItem(DATA_KEYS.DEBTORS, debtors);
    
    // Sync to Firebase if online (chunked, strip photos)
    const user = auth.currentUser || await new Promise(resolve => {
      const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
    });
    if (this.isOnline && user) {
      try {
        const stripped = debtors.map(d => {
          const depositsForFirestore = (d.deposits || []).map(dep => {
            const { photo: _photo, ...rest } = dep; // eslint-disable-line no-unused-vars
            return rest;
          });
          return { ...d, deposits: depositsForFirestore };
        });
        await this._batchWrite('debtors', stripped, d => d.id.toString());
      } catch (error) {
        console.error('Error syncing debtors to Firebase:', error);
      }
    }
    return true;
  }

  async updateDebtor(saleData) {
    // Always read from localforage directly (not getDebtors which may re-fetch
    // from Firebase and overwrite a write that just happened moments ago)
    const debtors = await localforage.getItem(DATA_KEYS.DEBTORS) || [];

    // Match by debtorId first (exact, set by SalesRegister when a registered
    // debtor is selected from the dropdown).  Fall back to name match only if
    // debtorId is absent (legacy / manual entries).
    let existingDebtor = saleData.debtorId
      ? debtors.find(d => d.id === saleData.debtorId)
      : debtors.find(d =>
          d.customerName?.toLowerCase() === saleData.customerName?.toLowerCase() ||
          d.name?.toLowerCase()         === saleData.customerName?.toLowerCase()
        );

    if (existingDebtor) {
      // Accumulate the debt on the debtor record
      existingDebtor.totalDue  = (existingDebtor.totalDue  || 0) + saleData.total;
      existingDebtor.totalPaid = existingDebtor.totalPaid  || 0;
      existingDebtor.balance   = existingDebtor.totalDue - existingDebtor.totalPaid;

      // Track the sale ID so Debt History tab can display it
      existingDebtor.saleIds     = existingDebtor.saleIds || [];
      existingDebtor.purchaseIds = existingDebtor.purchaseIds || [];
      if (!existingDebtor.saleIds.includes(saleData.id))     existingDebtor.saleIds.push(saleData.id);
      if (!existingDebtor.purchaseIds.includes(saleData.id)) existingDebtor.purchaseIds.push(saleData.id);

      existingDebtor.lastSale      = saleData.date;
      existingDebtor.lastPurchase  = saleData.date;
      existingDebtor.updatedAt     = new Date().toISOString();

      // Store the most recent repayment date so the Debtors card can show it
      if (saleData.repaymentDate) {
        existingDebtor.repaymentDate = saleData.repaymentDate;
      }

      // ── Save to localforage FIRST so the data survives a restart ──────────
      await localforage.setItem(DATA_KEYS.DEBTORS, debtors);

      // ── Then push to Firebase ──────────────────────────────────────────────
      if (this.isOnline && auth.currentUser) {
        try {
          const { deposits: _deposits, ...debtorForFirestore } = existingDebtor;
          // Strip base64 photos from deposits before sending to Firestore
          const depositsForFirestore = (existingDebtor.deposits || []).map(dep => {
            const { photo: _photo, ...rest } = dep;
            return rest;
          });
          await setDoc(doc(db, 'debtors', existingDebtor.id.toString()), {
            ...debtorForFirestore,
            deposits: depositsForFirestore,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (error) {
          console.error('Error syncing debtor to Firebase after credit sale:', error);
          // Queue for retry — debtor data is already safe in localforage
          await this.addToSyncQueue({ type: 'debtor', data: existingDebtor });
        }
      } else {
        // Offline — queue for sync when connectivity returns
        await this.addToSyncQueue({ type: 'debtor', data: existingDebtor });
      }
    } else {
      // No matching registered debtor — log a warning.  We deliberately do NOT
      // create a ghost debtor here; the UI enforces selection of a registered
      // debtor before saving a credit sale, so this path should not be reached
      // in normal operation.
      console.warn(
        '[updateDebtor] No debtor found for sale:', saleData.id,
        '| debtorId:', saleData.debtorId,
        '| customerName:', saleData.customerName
      );
    }
  }

  // ── Helper: find a linked cash_entry for a debt repayment ───────────────
  // Matches by source='debt_payment' + debtorId (+ saleId if provided).
  async _findLinkedDebtCashEntry(debtorId, saleId = null) {
    const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
    return entries.find(e =>
      e.source === 'debt_payment' &&
      e.debtorId === debtorId &&
      (saleId ? e.saleId === saleId : true)
    ) || null;
  }

  // ── Helper: create a cash_entry linked to a debt repayment ──────────────
  async createCashEntryForLinkedSource({ debtorId, saleId = null, amount, note, date }) {
    return this.addCashEntry({
      type: 'in',
      source: 'debt_payment',
      amount,
      note: note || 'Debt payment',
      date,
      business_date: (date || '').slice(0, 10),
      debtorId,
      ...(saleId ? { saleId } : {}),
    });
  }

  // ── Helper: update a linked cash_entry for a debt repayment ─────────────
  async updateCashEntryForLinkedSource({ debtorId, saleId = null, newAmount }) {
    const entry = await this._findLinkedDebtCashEntry(debtorId, saleId);
    if (!entry) return null;
    const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
    const idx = entries.findIndex(e => e.id === entry.id);
    if (idx === -1) return null;
    entries[idx] = { ...entries[idx], amount: newAmount, updatedAt: new Date().toISOString() };
    await localforage.setItem(DATA_KEYS.CASH_ENTRIES, entries);
    if (this.isOnline && auth.currentUser) {
      try {
        await setDoc(doc(db, 'cash_entries', entry.id), { ...entries[idx], updatedAt: serverTimestamp() }, { merge: true });
      } catch (err) { await this.addToSyncQueue({ type: 'cash_entry', data: entries[idx] }); }
    } else {
      await this.addToSyncQueue({ type: 'cash_entry', data: entries[idx] });
    }
    return entries[idx];
  }

  // ── Helper: delete a linked cash_entry for a debt repayment ─────────────
  async deleteCashEntryForLinkedSource({ debtorId, saleId = null }) {
    const entry = await this._findLinkedDebtCashEntry(debtorId, saleId);
    if (!entry) return;
    const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
    const filtered = entries.filter(e => e.id !== entry.id);
    await localforage.setItem(DATA_KEYS.CASH_ENTRIES, filtered);
    if (this.isOnline && auth.currentUser) {
      try { await deleteDoc(doc(db, 'cash_entries', entry.id)); } catch (err) { console.error('Firebase delete linked cash entry error:', err); }
    }
  }

  // ── Add a repayment record for a debtor ──────────────────────────────────
  // paymentMethod: 'cash' | 'bank' | etc.
  // If cash → auto-creates linked cash_entry with source='debt_payment'
  async addRepayment(debtorId, { amount, paymentMethod, note = '', date, saleId = null, photo = null, receiptNumber = '' }) {
    const debtors = await localforage.getItem(DATA_KEYS.DEBTORS) || [];
    const debtor = debtors.find(d => d.id === debtorId);
    if (!debtor) return null;

    const paymentAmount = parseFloat(amount);
    const now = new Date().toISOString();
    const paymentDate = date || now;

    // Build repayment record
    const repayment = {
      id: this.generateId(),
      debtorId,
      ...(saleId ? { saleId } : {}),
      amount: paymentAmount,
      paymentMethod: paymentMethod || 'cash',
      note: note || '',
      date: paymentDate,
      createdAt: now,
      updatedAt: now,
      ...(photo ? { photo } : {}),
      ...(receiptNumber ? { receiptNumber } : {}),
    };

    // Update debtor outstanding balance
    debtor.totalPaid = (debtor.totalPaid || 0) + paymentAmount;
    debtor.balance = Math.max(0, (debtor.totalDue || 0) - debtor.totalPaid);
    debtor.lastPayment = now;
    debtor.updatedAt = now;
    if (debtor.balance <= 0) {
      debtor.balance = 0;
      debtor.repaymentDate = '';
    }

    // Store repayment in debtor.deposits for backward-compat with existing UI
    const depositEntry = {
      id: repayment.id,
      type: 'deposit',
      amount: paymentAmount,
      paymentMethod: repayment.paymentMethod,
      note: repayment.note,
      date: paymentDate,
      createdAt: now,
      ...(saleId ? { saleId } : {}),
      ...(photo ? { photo } : {}),
      ...(receiptNumber ? { receiptNumber } : {}),
    };
    debtor.deposits = debtor.deposits || [];
    debtor.deposits.push(depositEntry);

    // Save to localforage first
    await localforage.setItem(DATA_KEYS.DEBTORS, debtors);

    // If cash → auto-create linked cash_entry
    let cashEntry = null;
    if (repayment.paymentMethod === 'cash') {
      const debtorName = debtor.name || debtor.customerName || 'Unknown';
      const gender = debtor.gender || '';
      const prefix = gender === 'Male' ? 'Mr.' : gender === 'Female' ? 'Ms.' : '';
      const displayName = prefix ? `${prefix} ${debtorName}` : debtorName;
      cashEntry = await this.createCashEntryForLinkedSource({
        debtorId,
        saleId,
        amount: paymentAmount,
        note: `${displayName} pays debt`,
        date: paymentDate,
      });
    }

    // Sync debtor to Firebase
    if (this.isOnline && auth.currentUser) {
      try {
        const depositsForFirestore = (debtor.deposits || []).map(dep => {
          const { photo: _p, ...rest } = dep;
          return rest;
        });
        await setDoc(doc(db, 'debtors', debtorId.toString()), {
          ...debtor,
          deposits: depositsForFirestore,
          lastPayment: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (error) {
        console.error('Error syncing repayment to Firebase:', error);
        await this.addToSyncQueue({ type: 'debtor', data: debtor });
      }
    } else {
      await this.addToSyncQueue({ type: 'debtor', data: debtor });
    }

    return { repayment: depositEntry, cashEntry, debtor };
  }

  // ── Edit a repayment record ──────────────────────────────────────────────
  // Handles: amount change, cash→non-cash, non-cash→cash transitions
  async updateRepayment(debtorId, repaymentId, { amount, paymentMethod, note, saleId = null }) {
    const debtors = await localforage.getItem(DATA_KEYS.DEBTORS) || [];
    const debtor = debtors.find(d => d.id === debtorId);
    if (!debtor) throw new Error('Debtor not found');

    const dep = (debtor.deposits || []).find(d => d.id === repaymentId);
    if (!dep) throw new Error('Repayment not found');

    const oldAmount = parseFloat(dep.amount) || 0;
    const newAmount = parseFloat(amount);
    const oldMethod = dep.paymentMethod || 'cash';
    const newMethod = paymentMethod || oldMethod;
    const diff = newAmount - oldAmount;

    // Update deposit record
    dep.amount = newAmount;
    dep.paymentMethod = newMethod;
    if (note !== undefined) dep.note = note;
    dep.updatedAt = new Date().toISOString();

    // Adjust debtor balance
    debtor.totalPaid = (debtor.totalPaid || 0) + diff;
    debtor.balance = Math.max(0, (debtor.totalDue || 0) - debtor.totalPaid);
    if (debtor.balance <= 0) { debtor.balance = 0; debtor.repaymentDate = ''; }
    debtor.updatedAt = new Date().toISOString();

    await localforage.setItem(DATA_KEYS.DEBTORS, debtors);

    // Handle linked cash_entry transitions
    const wasCash = oldMethod === 'cash';
    const isCash  = newMethod === 'cash';

    if (wasCash && isCash) {
      // A) Amount changed, method stayed cash → update linked entry
      await this.updateCashEntryForLinkedSource({ debtorId, saleId: dep.saleId || saleId, newAmount });
    } else if (wasCash && !isCash) {
      // B) cash → non-cash → delete linked entry
      await this.deleteCashEntryForLinkedSource({ debtorId, saleId: dep.saleId || saleId });
    } else if (!wasCash && isCash) {
      // C) non-cash → cash → create linked entry
      const debtorName = debtor.name || debtor.customerName || 'Unknown';
      const gender = debtor.gender || '';
      const prefix = gender === 'Male' ? 'Mr.' : gender === 'Female' ? 'Ms.' : '';
      const displayName = prefix ? `${prefix} ${debtorName}` : debtorName;
      await this.createCashEntryForLinkedSource({
        debtorId,
        saleId: dep.saleId || saleId,
        amount: newAmount,
        note: `Debt payment — ${displayName}${dep.note ? ': ' + dep.note : ''}`,
        date: dep.date,
      });
    }

    // Sync to Firebase
    if (this.isOnline && auth.currentUser) {
      try {
        const depositsForFirestore = (debtor.deposits || []).map(d => {
          const { photo: _p, ...rest } = d;
          return rest;
        });
        await setDoc(doc(db, 'debtors', debtorId.toString()), {
          ...debtor,
          deposits: depositsForFirestore,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (error) {
        await this.addToSyncQueue({ type: 'debtor', data: debtor });
      }
    } else {
      await this.addToSyncQueue({ type: 'debtor', data: debtor });
    }

    return { debtor, deposit: dep };
  }

  // ── Delete a repayment record ────────────────────────────────────────────
  // Restores outstanding balance and deletes linked cash_entry if cash.
  async deleteRepayment(debtorId, repaymentId) {
    const debtors = await localforage.getItem(DATA_KEYS.DEBTORS) || [];
    const debtor = debtors.find(d => d.id === debtorId);
    if (!debtor) throw new Error('Debtor not found');

    const depIdx = (debtor.deposits || []).findIndex(d => d.id === repaymentId);
    if (depIdx === -1) throw new Error('Repayment not found');

    const dep = debtor.deposits[depIdx];
    const wasAmount = parseFloat(dep.amount) || 0;
    const wasCash = (dep.paymentMethod || 'cash') === 'cash';

    // Remove deposit and restore balance
    debtor.deposits.splice(depIdx, 1);
    debtor.totalPaid = Math.max(0, (debtor.totalPaid || 0) - wasAmount);
    debtor.balance = Math.max(0, (debtor.totalDue || 0) - debtor.totalPaid);
    debtor.updatedAt = new Date().toISOString();

    await localforage.setItem(DATA_KEYS.DEBTORS, debtors);

    // Delete linked cash_entry if payment was cash
    if (wasCash) {
      await this.deleteCashEntryForLinkedSource({ debtorId, saleId: dep.saleId || null });
    }

    // Sync to Firebase
    if (this.isOnline && auth.currentUser) {
      try {
        const depositsForFirestore = (debtor.deposits || []).map(d => {
          const { photo: _p, ...rest } = d;
          return rest;
        });
        await setDoc(doc(db, 'debtors', debtorId.toString()), {
          ...debtor,
          deposits: depositsForFirestore,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (error) {
        await this.addToSyncQueue({ type: 'debtor', data: debtor });
      }
    } else {
      await this.addToSyncQueue({ type: 'debtor', data: debtor });
    }

    return debtor;
  }

  // ── Legacy recordPayment — now delegates to addRepayment (cash) ──────────
  async recordPayment(debtorId, amount, purchaseIds = [], photo = null, receiptNumber = '') {
    const result = await this.addRepayment(debtorId, {
      amount,
      paymentMethod: 'cash',
      note: '',
      date: new Date().toISOString(),
      saleId: null,
      photo,
      receiptNumber,
    });
    // Mark specific sales as paid if provided (legacy behaviour)
    if (result && purchaseIds.length > 0) {
      const sales = await localforage.getItem(DATA_KEYS.SALES) || [];
      purchaseIds.forEach(pid => {
        const sale = sales.find(s => s.id === pid);
        if (sale) { sale.paid = true; sale.paidDate = new Date().toISOString(); }
      });
      await localforage.setItem(DATA_KEYS.SALES, sales);
    }
    return result?.debtor || null;
  }

  async recalculateDebtors() {
    const sales = await this.getSales();
    const creditSales = sales.filter(
      s => s.paymentType === 'credit' && s.status === 'active'
    );
    
    const debtorsMap = new Map();
    
    creditSales.forEach(sale => {
      const key = sale.customerPhone || sale.customerName;
      if (!debtorsMap.has(key)) {
        debtorsMap.set(key, {
          id: this.generateId(),
          customerName: sale.customerName,
          customerPhone: sale.customerPhone,
          totalDue: 0,
          totalPaid: 0,
          balance: 0,
          saleIds: [],
          createdAt: sale.date,
          lastSale: sale.date,
        });
      }

      const debtor = debtorsMap.get(key);
      debtor.totalDue += sale.total;
      debtor.saleIds.push(sale.id);
      if (new Date(sale.date) > new Date(debtor.lastSale)) {
        debtor.lastSale = sale.date;
      }
    });
    
    const debtors = Array.from(debtorsMap.values());
    
    // Preserve payment records from existing debtors
    const existingDebtors = await this.getDebtors();
    debtors.forEach(debtor => {
      const existing = existingDebtors.find(
        d => d.customerPhone === debtor.customerPhone ||
             d.customerName === debtor.customerName
      );
      if (existing) {
        debtor.totalPaid = existing.totalPaid;
        debtor.lastPayment = existing.lastPayment;
      }
      debtor.balance = debtor.totalDue - debtor.totalPaid;
    });
    
    await this.setDebtors(debtors);
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Creditors operations (people/companies we owe money to)
  // ──────────────────────────────────────────────────────────────────────────
  async getCreditors() {
    try {
      if (this.isOnline && auth.currentUser && !this._creditorsFetchedFromFirebase) {
        this._creditorsFetchedFromFirebase = true;
        const creditorsSnapshot = await getDocs(collection(db, 'creditors'));
        const firebaseCreditors = creditorsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
          lastPurchase: doc.data().lastPurchase?.toDate?.() || doc.data().lastPurchase,
          lastPayment: doc.data().lastPayment?.toDate?.() || doc.data().lastPayment
        }));

        const localCreditors = await localforage.getItem(DATA_KEYS.CREDITORS) || [];
        const merged = [...firebaseCreditors];
        for (const local of localCreditors) {
          const fbIdx = merged.findIndex(c => c.id === local.id);
          if (fbIdx === -1) {
            merged.push(local);
          } else {
            const fbTime  = new Date(merged[fbIdx].updatedAt || 0).getTime();
            const locTime = new Date(local.updatedAt || 0).getTime();
            if (locTime > fbTime) {
              merged[fbIdx] = local;
            }
          }
        }

        await localforage.setItem(DATA_KEYS.CREDITORS, merged);
        return merged;
      }
    } catch (error) {
      console.error('Error fetching creditors from Firebase:', error);
    }
    return await this.get(DATA_KEYS.CREDITORS);
  }

  async setCreditors(creditors) {
    await localforage.setItem(DATA_KEYS.CREDITORS, creditors);
    const user = auth.currentUser || await new Promise(resolve => {
      const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
    });
    if (this.isOnline && user) {
      try {
        const stripped = creditors.map(c => {
          const depositsForFirestore = (c.deposits || []).map(dep => {
            const { photo: _photo, ...rest } = dep;
            return rest;
          });
          return { ...c, deposits: depositsForFirestore };
        });
        await this._batchWrite('creditors', stripped, c => c.id.toString());
      } catch (error) {
        console.error('Error syncing creditors to Firebase:', error);
      }
    }
    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Suppliers operations (for managing supplier contacts/details)
  // ──────────────────────────────────────────────────────────────────────────
  async getSuppliers() {
    try {
      if (this.isOnline && auth.currentUser && !this._suppliersFetchedFromFirebase) {
        this._suppliersFetchedFromFirebase = true;
        const suppliersSnapshot = await getDocs(collection(db, 'suppliers'));
        const firebaseSuppliers = suppliersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
          lastPurchase: doc.data().lastPurchase?.toDate?.() || doc.data().lastPurchase,
          lastPayment: doc.data().lastPayment?.toDate?.() || doc.data().lastPayment
        }));

        const localSuppliers = await localforage.getItem(DATA_KEYS.SUPPLIERS) || [];
        const merged = [...firebaseSuppliers];
        for (const local of localSuppliers) {
          const fbIdx = merged.findIndex(s => s.id === local.id);
          if (fbIdx === -1) {
            merged.push(local);
          } else {
            const fbTime  = new Date(merged[fbIdx].updatedAt || 0).getTime();
            const locTime = new Date(local.updatedAt || 0).getTime();
            if (locTime > fbTime) {
              merged[fbIdx] = local;
            }
          }
        }

        await localforage.setItem(DATA_KEYS.SUPPLIERS, merged);
        return merged;
      }
    } catch (error) {
      console.error('Error fetching suppliers from Firebase:', error);
    }
    return await this.get(DATA_KEYS.SUPPLIERS);
  }

  async setSuppliers(suppliers) {
    await localforage.setItem(DATA_KEYS.SUPPLIERS, suppliers);
    const user = auth.currentUser || await new Promise(resolve => {
      const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
    });
    if (this.isOnline && user) {
      try {
        const stripped = suppliers.map(s => {
          const depositsForFirestore = (s.deposits || []).map(dep => {
            const { photo: _photo, ...rest } = dep;
            return rest;
          });
          return { ...s, deposits: depositsForFirestore };
        });
        await this._batchWrite('suppliers', stripped, s => s.id.toString());
      } catch (error) {
        console.error('Error syncing suppliers to Firebase:', error);
      }
    }
    return true;
  }


  // Inventory operations
  async getInventory() {
    try {
      // Try to get from Firebase first if online
      if (this.isOnline && auth.currentUser) {
        const inventorySnapshot = await getDocs(collection(db, 'inventory'));
        const firebaseInventory = inventorySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          lastUpdated: doc.data().lastUpdated?.toDate?.() || doc.data().lastUpdated
        }));
        
        // Save to local storage
        await localforage.setItem(DATA_KEYS.INVENTORY, firebaseInventory);
        return firebaseInventory;
      }
    } catch (error) {
      console.error('Error fetching inventory from Firebase:', error);
    }
    
    // Fallback to local storage
    return await this.get(DATA_KEYS.INVENTORY);
  }

  async setInventory(inventory) {
    // Save locally first
    await localforage.setItem(DATA_KEYS.INVENTORY, inventory);
    
    // Sync to Firebase if online (chunked)
    const user = auth.currentUser || await new Promise(resolve => {
      const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
    });
    if (this.isOnline && user) {
      try {
        await this._batchWrite('inventory', inventory, i => i.itemId.toString());
      } catch (error) {
        console.error('Error syncing inventory to Firebase:', error);
      }
    }
    return true;
  }

  async updateInventoryItem(itemId, stockLevel) {
    const inventory = await this.getInventory();
    const existing = inventory.find(i => i.itemId === itemId);
    
    if (existing) {
      existing.stockLevel = parseInt(stockLevel);
      existing.lastUpdated = new Date().toISOString();
    } else {
      inventory.push({
        itemId: itemId,
        stockLevel: parseInt(stockLevel),
        lastUpdated: new Date().toISOString(),
      });
    }
    
    await this.setInventory(inventory);
    
    // Sync individual item to Firebase if online
    if (this.isOnline && auth.currentUser) {
      try {
        await setDoc(doc(db, 'inventory', itemId.toString()), {
          itemId: itemId,
          stockLevel: parseInt(stockLevel),
          lastUpdated: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.error('Error syncing inventory item to Firebase:', error);
      }
    }
  }

  // Sync queue operations
  async addToSyncQueue(item) {
    const queue = await localforage.getItem(DATA_KEYS.SYNC_QUEUE) || [];
    queue.push(item);
    await localforage.setItem(DATA_KEYS.SYNC_QUEUE, queue);
    
    // Trigger sync if online
    if (this.isOnline && !this.syncInProgress) {
      this.syncToServer();
    }
  }

  async syncToServer() {
    if (this.syncInProgress || !this.isOnline || !auth.currentUser) return;

    this.syncInProgress = true;
    const queue = await localforage.getItem(DATA_KEYS.SYNC_QUEUE) || [];

    if (queue.length === 0) {
      this.syncInProgress = false;
      return { success: true, synced: 0 };
    }

    console.log('Syncing queued items to Firebase:', queue.length);
    const failed = [];
    let synced = 0;

    for (const item of queue) {
      try {
        // Queue items added by addSale have { type: 'sale', data: newSale }
        if (item.type === 'sale' && item.data) {
          await setDoc(doc(db, 'sales', item.data.id), {
            ...item.data,
            createdAt: serverTimestamp(),
            // NOTE: Do NOT overwrite date with serverTimestamp() — this preserves
            // the original sale date for backdated / unrecorded entries.
          }, { merge: true });
          synced++;
        }
        // Queue items added by updateDebtor have { type: 'debtor', data: debtor }
        if (item.type === 'debtor' && item.data) {
          const { deposits: _d, ...debtorForFirestore } = item.data;
          const depositsForFirestore = (item.data.deposits || []).map(dep => {
            const { photo: _p, ...rest } = dep;
            return rest;
          });
          await setDoc(doc(db, 'debtors', item.data.id.toString()), {
            ...debtorForFirestore,
            deposits: depositsForFirestore,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          synced++;
        }
        // Queue items for daily_cash docs
        if (item.type === 'daily_cash' && item.data?.id) {
          const { opened_at_server: _oas, closed_at_server: _cas, last_calculated_at_server: _lcas, ...dcRest } = item.data;
          await setDoc(doc(db, 'daily_cash', item.data.id), {
            ...dcRest, updatedAt: serverTimestamp(),
          }, { merge: true });
          synced++;
        }
        // Queue items added by addCashEntry have { type: 'cash_entry', data: entry }
        if (item.type === 'cash_entry' && item.data) {
          await setDoc(doc(db, 'cash_entries', item.data.id), {
            ...item.data,
            createdAt: serverTimestamp(),
          }, { merge: true });
          synced++;
        }
        // Queue items added by addPurchase have { type: 'purchase', data: purchase }
        if (item.type === 'purchase' && item.data) {
          await setDoc(doc(db, 'purchases', item.data.id), {
            ...item.data,
            createdAt: serverTimestamp(),
          }, { merge: true });
          synced++;
        }
        // Queue items added by recordCreditorPayment have { type: 'creditor', data: creditor }
        if (item.type === 'creditor' && item.data) {
          const depositsForFirestore = (item.data.deposits || []).map(dep => {
            const { photo: _p, ...rest } = dep;
            return rest;
          });
          await setDoc(doc(db, 'creditors', item.data.id.toString()), {
            ...item.data,
            deposits: depositsForFirestore,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          synced++;
        }
        // Queue items added by addGood offline have { type: 'good', data: newGood }
        if (item.type === 'good' && item.data) {
          await setDoc(doc(db, 'goods', item.data.id.toString()), {
            ...item.data,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          synced++;
        }
        // Queue items added by addWithdrawal have { type: 'withdrawal', data: entry }
        if (item.type === 'withdrawal' && item.data) {
          await setDoc(doc(db, 'withdrawals', item.data.id), {
            ...item.data,
            createdAt: serverTimestamp(),
          }, { merge: true });
          synced++;
        }
        // Queue items added by addExpense have { type: 'expense', data: expense }
        if (item.type === 'expense' && item.data) {
          await setDoc(doc(db, 'expenses', item.data.id), {
            ...item.data,
            createdAt: serverTimestamp(),
          }, { merge: true });
          synced++;
        }
        // Queue items added by the generic set() path have { key, value }
        // These are bulk array writes — skip (they sync via dedicated methods)
      } catch (error) {
        console.error('Failed to sync queued item:', item, error);
        failed.push(item); // keep failed items for next attempt
      }
    }

    // Persist only items that failed so they retry on next sync
    await localforage.setItem(DATA_KEYS.SYNC_QUEUE, failed);
    if (failed.length === 0) {
      await localforage.setItem(DATA_KEYS.LAST_SYNC, new Date().toISOString());
    }

    this.syncInProgress = false;
    return { success: failed.length === 0, synced, failed: failed.length };
  }

  async getLastSyncTime() {
    return await localforage.getItem(DATA_KEYS.LAST_SYNC);
  }

  // Photo operations
  async savePhoto(photoData, saleId) {
    try {
      // Save photo to local storage
      const photoKey = `photo_${saleId}`;
      await localforage.setItem(photoKey, photoData);

      // TODO: Upload to a.c.t-services when online
      if (this.isOnline) {
        // Simulate upload
        console.log('Uploading photo for sale:', saleId);
        // const formData = new FormData();
        // formData.append('photo', photoData);
        // formData.append('purchaseId', purchaseId);
        // await fetch('https://a.c.t-services.example.com/upload', {
        //   method: 'POST',
        //   body: formData,
        // });
      }
      
      return photoKey;
    } catch (error) {
      console.error('Error saving photo:', error);
      throw error;
    }
  }

  async getPhoto(photoKey) {
    return await localforage.getItem(photoKey);
  }

  // Initialize sample data (for testing)
  async initializeSampleData() {
    const goods = await this.getGoods();
    if (goods.length === 0) {
      await this.setGoods([
        { id: '1', name: 'Rice (1kg)', price: 50, category: 'Grains', stock_quantity: 100 },
        { id: '2', name: 'Sugar (1kg)', price: 80, category: 'Groceries', stock_quantity: 50 },
        { id: '3', name: 'Cooking Oil (1L)', price: 120, category: 'Cooking', stock_quantity: 30 },
        { id: '4', name: 'Bread', price: 30, category: 'Bakery', stock_quantity: 20 },
        { id: '5', name: 'Milk (1L)', price: 60, category: 'Dairy', stock_quantity: 40 },
        { id: '6', name: 'Eggs (12pcs)', price: 90, category: 'Dairy', stock_quantity: 25 },
        { id: '7', name: 'Soap', price: 25, category: 'Personal Care', stock_quantity: 60 },
        { id: '8', name: 'Toothpaste', price: 45, category: 'Personal Care', stock_quantity: 35 },
      ]);
    }
  }

  // Sync all data from Firebase to local storage
  async syncFromFirebase() {
    if (!this.isOnline || !auth.currentUser) {
      console.log('Cannot sync: offline or not authenticated');
      return { success: false, error: 'Offline or not authenticated' };
    }

    try {
      console.log('🔄 Starting Firebase sync...');
      
      // Helper: convert Firestore Timestamp to ISO string
      const tsToISO = (val) => {
        if (!val) return val;
        if (typeof val === 'string') return val;
        if (val.toDate) return val.toDate().toISOString();
        return val;
      };
      
      // Sync goods
      const goodsSnapshot = await getDocs(collection(db, 'goods'));
      const goods = goodsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      await localforage.setItem(DATA_KEYS.GOODS, goods);
      console.log(`✅ Synced ${goods.length} goods`);
      
      // Sync sales
      const salesSnapshot = await getDocs(collection(db, 'sales'));
      const sales = salesSnapshot.docs.map(d => ({
        id: d.id, ...d.data(),
        date: tsToISO(d.data().date),
        createdAt: tsToISO(d.data().createdAt),
      }));
      await localforage.setItem(DATA_KEYS.SALES, sales);
      console.log(`✅ Synced ${sales.length} sales`);
      
      // Sync debtors
      const debtorsSnapshot = await getDocs(collection(db, 'debtors'));
      const debtors = debtorsSnapshot.docs.map(d => ({
        id: d.id, ...d.data(),
        createdAt: tsToISO(d.data().createdAt),
        lastPurchase: tsToISO(d.data().lastPurchase),
        lastPayment: tsToISO(d.data().lastPayment),
      }));
      await localforage.setItem(DATA_KEYS.DEBTORS, debtors);
      console.log(`✅ Synced ${debtors.length} debtors`);

      // Sync creditors
      const creditorsSnapshot = await getDocs(collection(db, 'creditors'));
      const creditors = creditorsSnapshot.docs.map(d => ({
        id: d.id, ...d.data(),
        createdAt: tsToISO(d.data().createdAt),
        lastPurchase: tsToISO(d.data().lastPurchase),
        lastPayment: tsToISO(d.data().lastPayment),
      }));
      await localforage.setItem(DATA_KEYS.CREDITORS, creditors);
      console.log(`✅ Synced ${creditors.length} creditors`);

      // Sync suppliers
      const suppliersSnapshot = await getDocs(collection(db, 'suppliers'));
      const suppliers = suppliersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      await localforage.setItem(DATA_KEYS.SUPPLIERS, suppliers);
      console.log(`✅ Synced ${suppliers.length} suppliers`);

      // Sync purchases
      const purchasesSnapshot = await getDocs(collection(db, 'purchases'));
      const purchases = purchasesSnapshot.docs.map(d => ({
        id: d.id, ...d.data(),
        date: tsToISO(d.data().date),
        createdAt: tsToISO(d.data().createdAt),
      }));
      await localforage.setItem(DATA_KEYS.PURCHASES, purchases);
      console.log(`✅ Synced ${purchases.length} purchases`);

      // Sync cash entries
      const cashSnapshot = await getDocs(collection(db, 'cash_entries'));
      const cashEntries = cashSnapshot.docs.map(d => ({
        id: d.id, ...d.data(),
        date: tsToISO(d.data().date),
        createdAt: tsToISO(d.data().createdAt),
      }));
      await localforage.setItem(DATA_KEYS.CASH_ENTRIES, cashEntries);
      console.log(`✅ Synced ${cashEntries.length} cash entries`);
      
      return { 
        success: true, 
        synced: {
          goods: goods.length, sales: sales.length, debtors: debtors.length,
          creditors: creditors.length, suppliers: suppliers.length,
          purchases: purchases.length, cashEntries: cashEntries.length,
        }
      };
    } catch (error) {
      console.error('❌ Firebase sync error:', error);
      return { success: false, error: error.message };
    }
  }

  // Call this to force a fresh goods pull from Firebase (e.g. after login).
  resetGoodsFetchFlag() {
    this._goodsFetchedFromFirebase = false;
  }

  // ── Cash Journal entries ──────────────────────────────────────────────────
  async getCashEntries() {
    try {
      // On first call of session, try to pull from Firebase
      if (this.isOnline && auth.currentUser && !this._cashEntriesFetched) {
        this._cashEntriesFetched = true;
        try {
          const snap = await getDocs(collection(db, 'cash_entries'));
          const fbEntries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          const local = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
          // Merge: keep local entries not in Firebase (created offline)
          const fbIds = new Set(fbEntries.map(e => e.id));
          const localOnly = local.filter(e => !fbIds.has(e.id));
          const merged = [...fbEntries, ...localOnly]
            .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
          await localforage.setItem(DATA_KEYS.CASH_ENTRIES, merged);
          return merged;
        } catch (err) {
          console.error('Error fetching cash entries from Firebase:', err);
        }
      }
      return await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
    } catch (error) {
      console.error('Error getting cash entries:', error);
      return [];
    }
  }

  async addCashEntry(entry) {
    try {
      const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
      const _user = auth.currentUser;
      const _entryDate = entry.date || new Date().toISOString();
      const _bd = entry.business_date || _entryDate.slice(0, 10);
      const newEntry = {
        id: this.generateId(),
        type: entry.type,         // 'in' | 'out'
        amount: parseFloat(entry.amount),
        note: entry.note || '',
        date: _entryDate,
        source: entry.source || 'manual',
        business_date: _bd,
        created_by_uid:  entry.created_by_uid  || _user?.uid  || null,
        created_by_name: entry.created_by_name || _user?.email || null,
        createdAt: new Date().toISOString(),
        ...(entry.saleId      ? { saleId:      entry.saleId      } : {}),
        ...(entry.debtorId    ? { debtorId:    entry.debtorId    } : {}),
        ...(entry.purchaseId  ? { purchaseId:  entry.purchaseId  } : {}),
        ...(entry.creditorId  ? { creditorId:  entry.creditorId  } : {}),
        ...(entry.invoiceRef  ? { invoiceRef:  entry.invoiceRef  } : {}),
        ...(entry.isUnrecorded ? { isUnrecorded: true }           : {}),
      };
      entries.push(newEntry);
      // Save to localforage first
      await localforage.setItem(DATA_KEYS.CASH_ENTRIES, entries);

      // Sync to Firebase cash_entries collection
      if (this.isOnline && auth.currentUser) {
        try {
          await setDoc(doc(db, 'cash_entries', newEntry.id), {
            ...newEntry,
            createdAt: serverTimestamp(),
          }, { merge: true });
        } catch (err) {
          console.error('Error syncing cash entry to Firebase:', err);
          await this.addToSyncQueue({ type: 'cash_entry', data: newEntry });
        }
      } else {
        await this.addToSyncQueue({ type: 'cash_entry', data: newEntry });
      }

      return newEntry;
    } catch (error) {
      console.error('Error adding cash entry:', error);
      throw error;
    }
  }

  async updateCashEntry(id, updates) {
    const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
    const index = entries.findIndex(e => e.id === id);
    if (index === -1) throw new Error('Cash entry not found');
    const entry = entries[index];
    const createdAt = new Date(entry.createdAt || entry.date || 0);
    const hoursDiff = (new Date() - createdAt) / (1000 * 60 * 60);
    if (hoursDiff > 2) throw new Error('Cannot edit cash entry after 2 hours');
    entries[index] = { ...entry, ...updates, updatedAt: new Date().toISOString() };
    await localforage.setItem(DATA_KEYS.CASH_ENTRIES, entries);
    if (this.isOnline && auth.currentUser) {
      try {
        await setDoc(doc(db, 'cash_entries', id), { ...entries[index], updatedAt: serverTimestamp() }, { merge: true });
      } catch (err) { await this.addToSyncQueue({ type: 'cash_entry', data: entries[index] }); }
    } else {
      await this.addToSyncQueue({ type: 'cash_entry', data: entries[index] });
    }
    return entries[index];
  }

  async updatePurchase(id, updates) {
    const purchases = await localforage.getItem(DATA_KEYS.PURCHASES) || [];
    const index = purchases.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Purchase not found');
    const purchase = purchases[index];
    const createdAt = new Date(purchase.createdAt || purchase.date || 0);
    const hoursDiff = (new Date() - createdAt) / (1000 * 60 * 60);
    if (hoursDiff > 2) throw new Error('Cannot edit purchase after 2 hours');

    const oldPaymentType = purchase.paymentType || purchase.payment_type || 'cash';
    const newPaymentType = updates.paymentType || updates.payment_type || oldPaymentType;
    const oldTotal = parseFloat(purchase.total || 0);
    const newTotal = parseFloat(updates.total !== undefined ? updates.total : oldTotal);

    purchases[index] = { ...purchase, ...updates, updatedAt: new Date().toISOString() };
    await localforage.setItem(DATA_KEYS.PURCHASES, purchases);
    if (this.isOnline && auth.currentUser) {
      try {
        await setDoc(doc(db, 'purchases', id), { ...purchases[index], updatedAt: serverTimestamp() }, { merge: true });
      } catch (err) { await this.addToSyncQueue({ type: 'purchase', data: purchases[index] }); }
    } else {
      await this.addToSyncQueue({ type: 'purchase', data: purchases[index] });
    }

    // ── Handle linked cash_entry transitions ──────────────────────────────
    const wasCash = oldPaymentType === 'cash';
    const isCash  = newPaymentType === 'cash';

    if (wasCash && isCash && newTotal !== oldTotal) {
      // A) Remained cash, amount changed → update linked entry
      const cashEntry = await this._findPurchaseCashEntry(id);
      if (cashEntry) {
        const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
        const ei = entries.findIndex(e => e.id === cashEntry.id);
        if (ei !== -1) {
          entries[ei] = { ...entries[ei], amount: newTotal, updatedAt: new Date().toISOString() };
          await localforage.setItem(DATA_KEYS.CASH_ENTRIES, entries);
          if (this.isOnline && auth.currentUser) {
            try { await setDoc(doc(db, 'cash_entries', cashEntry.id), { ...entries[ei], updatedAt: serverTimestamp() }, { merge: true }); }
            catch (err) { await this.addToSyncQueue({ type: 'cash_entry', data: entries[ei] }); }
          } else { await this.addToSyncQueue({ type: 'cash_entry', data: entries[ei] }); }
        }
      }
    } else if (wasCash && !isCash) {
      // B) cash → non-cash: delete linked cash_entry
      await this._deletePurchaseCashEntry(id);
    } else if (!wasCash && isCash) {
      // C) non-cash → cash: create linked cash_entry
      const updated = purchases[index];
      await this.addCashEntry({
        type: 'out',
        amount: newTotal,
        note: `Paid to ${updated.supplierName || 'Supplier'} to purchase cargo`,
        date: updated.date,
        source: 'purchase',
        purchaseId: id,
        invoiceRef: updated.invoiceRef || '',
        isUnrecorded: true,
        business_date: (updated.date || '').slice(0, 10),
      });
    }

    return purchases[index];
  }

  // ── Purchases ─────────────────────────────────────────────────────────────
  async getPurchases() {
    try {
      if (this.isOnline && auth.currentUser && !this._purchasesFetchedFromFirebase) {
        this._purchasesFetchedFromFirebase = true;
        const snap = await getDocs(collection(db, 'purchases'));
        const fbPurchases = snap.docs.map(d => {
          const data = d.data();
          const dateVal = typeof data.date === 'string'
            ? data.date
            : (data.date?.toDate?.()?.toISOString?.() || null);
          return { id: d.id, ...data, date: dateVal,
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt };
        });
        const local = await localforage.getItem(DATA_KEYS.PURCHASES) || [];
        const localMap = new Map(local.map(p => [p.id, p]));
        const merged = fbPurchases.map(fb => {
          const loc = localMap.get(fb.id);
          if (!loc) return fb;
          return new Date(loc.createdAt||0) >= new Date(fb.createdAt||0) ? loc : fb;
        });
        for (const loc of local) {
          if (!merged.find(p => p.id === loc.id)) merged.push(loc);
        }
        await localforage.setItem(DATA_KEYS.PURCHASES, merged);
        return merged;
      }
    } catch (err) { console.error('Error fetching purchases:', err); }
    return await localforage.getItem(DATA_KEYS.PURCHASES) || [];
  }

  async addPurchase(purchase) {
    try {
      const purchases = await localforage.getItem(DATA_KEYS.PURCHASES) || [];
      const paymentType = purchase.paymentType || 'cash'; // 'cash' | 'credit'
      const newPurchase = {
        id: this.generateId(),
        supplierName: purchase.supplierName || '',
        supplierId: purchase.supplierId || null,
        creditorId: purchase.creditorId || null,
        dueDate: purchase.dueDate || null,
        date: purchase.date || new Date().toISOString(),
        items: purchase.items || [],
        total: parseFloat(purchase.total) || 0,
        notes: purchase.notes || '',
        invoiceRef: purchase.invoiceRef || '',
        receiptPhoto: purchase.receiptPhoto || null,
        paymentType,
        payment_type: paymentType,
        paymentMethod: purchase.paymentMethod || 'cash_shop', // cash_shop | owner_custody | owner_personal
        createdAt: new Date().toISOString(),
      };
      purchases.push(newPurchase);
      await localforage.setItem(DATA_KEYS.PURCHASES, purchases);

      // ── Cash / credit branching with paymentMethod (fund source) awareness ─────
      // paymentType: 'cash' | 'credit'  (supplier payment terms)
      // paymentMethod: 'cash_shop' | 'owner_custody' | 'owner_personal' (where money came from)
      const pm = newPurchase.paymentMethod || 'cash_shop';
      if (paymentType === 'cash') {
        if (pm === 'cash_shop') {
          // Case 1: Deduct from shop cash register
          await this.addCashEntry({
            type: 'out',
            amount: newPurchase.total,
            note: `Purchase - ${newPurchase.supplierName || 'Supplier'}`,
            date: newPurchase.date,
            source: 'purchase',
            purchaseId: newPurchase.id,
            invoiceRef: newPurchase.invoiceRef || '',
            isUnrecorded: true,
          });
        } else if (pm === 'owner_custody') {
          // Case 2: Owner used already-withdrawn money — record withdrawal adjustment
          await this.addWithdrawal({
            type: 'used_for_purchase',
            amount: newPurchase.total,
            description: `Purchase using withdrawn funds - ${newPurchase.supplierName || 'Supplier'}`,
            source: 'purchase',
            relatedId: newPurchase.id,
            purchaseId: newPurchase.id,
            date: newPurchase.date,
          });
        } else if (pm === 'owner_personal') {
          // Case 3: Owner paid personally — shop owes owner; add to creditors
          const OWNER_ID = 'owner_personal_funds';
          const creditors = await localforage.getItem(DATA_KEYS.CREDITORS) || [];
          let ownerCreditor = creditors.find(c => c.id === OWNER_ID);
          if (!ownerCreditor) {
            const users = await localforage.getItem(DATA_KEYS.USERS) || [];
            const ownerUser = users.find(u => ['shop owner','owner'].includes((u.role||'').toLowerCase().trim()));
            const ownerName = ownerUser?.fullName || ownerUser?.name || 'Owner';
            ownerCreditor = {
              id: OWNER_ID,
              name: ownerName, customerName: ownerName,
              phone: ownerUser?.phone || '', customerPhone: ownerUser?.phone || '',
              whatsapp: '', email: '', address: '', gender: ownerUser?.gender || '',
              totalDue: 0, totalPaid: 0, balance: 0,
              deposits: [], purchaseIds: [],
              source: 'owner_purchase',
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            creditors.push(ownerCreditor);
            await localforage.setItem(DATA_KEYS.CREDITORS, creditors);
            if (this.isOnline && auth.currentUser) {
              await setDoc(doc(db, 'creditors', OWNER_ID), {
                ...ownerCreditor, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
              }, { merge: true }).catch(e => console.error('Owner creditor sync error:', e));
            }
          }
          await this.addCreditorDebt(OWNER_ID, newPurchase.total, newPurchase.id, null);
        }
      } else {
        // Credit purchase — create or update Creditor card, then record the debt
        if (newPurchase.creditorId) {
          // Ensure the creditor card exists (create if missing)
          const creditors = await localforage.getItem(DATA_KEYS.CREDITORS) || [];
          const suppliers = await localforage.getItem(DATA_KEYS.SUPPLIERS) || [];
          const supplier = suppliers.find(s => s.id === newPurchase.supplierId);
          const stubName = newPurchase.supplierName || (supplier && (supplier.name || supplier.customerName)) || 'Unknown';

          // Check by ID first, then by name to avoid duplicates
          let existingCreditor = creditors.find(c => c.id === newPurchase.creditorId) ||
                                 creditors.find(c => (c.name || c.customerName || '').toLowerCase() === stubName.toLowerCase());

          if (existingCreditor) {
            // Use the existing creditor's ID for the debt
            newPurchase.creditorId = existingCreditor.id;
          } else {
            const newCreditor = {
              id: newPurchase.creditorId,
              name: stubName,
              customerName: stubName,
              // Copy contact info from the supplier so notify works
              phone: supplier?.phone || supplier?.customerPhone || '',
              customerPhone: supplier?.phone || supplier?.customerPhone || '',
              whatsapp: supplier?.whatsapp || '',
              email: supplier?.email || '',
              address: supplier?.address || '',
              gender: supplier?.gender || '',
              repaymentDate: newPurchase.dueDate || '',
              totalDue: 0,
              totalPaid: 0,
              balance: 0,
              deposits: [],
              purchaseIds: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            creditors.push(newCreditor);
            await localforage.setItem(DATA_KEYS.CREDITORS, creditors);
            if (this.isOnline && auth.currentUser) {
              await setDoc(doc(db, 'creditors', newCreditor.id.toString()), {
                ...newCreditor, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
              }, { merge: true }).catch(e => console.error('Creditor stub sync error:', e));
            }
          }
          await this.addCreditorDebt(newPurchase.creditorId, newPurchase.total, newPurchase.id, newPurchase.dueDate);
        }
      }

      // ── Auto-increase stock for purchased items ───────────────────────
      try {
        const goods = await localforage.getItem(DATA_KEYS.GOODS) || [];
        let stockChanged = false;
        newPurchase.items.forEach(purchasedItem => {
          // Match by item ID if set, otherwise by description name
          const good = purchasedItem.goodId
            ? goods.find(g => String(g.id) === String(purchasedItem.goodId))
            : goods.find(g => (g.name||'').toLowerCase().trim() === (purchasedItem.description||'').toLowerCase().trim());
          if (good) {
            // stockToAdd = qty × packUnit (cartons × units per carton)
            // Falls back to just qty if packUnit wasn't set
            const stockToAdd = typeof purchasedItem.stockToAdd === 'number'
              ? purchasedItem.stockToAdd
              : (parseFloat(purchasedItem.qty) || 0) * (parseFloat(purchasedItem.packUnit) || 1);
            if (stockToAdd > 0) {
              good.stock_quantity = (parseFloat(good.stock_quantity) || 0) + stockToAdd;
              stockChanged = true;
            }
          }
        });
        if (stockChanged) {
          await localforage.setItem(DATA_KEYS.GOODS, goods);
          if (this.isOnline && auth.currentUser) {
            await this._batchWrite('goods', goods, g => g.id.toString())
              .catch(e => console.error('Purchase stock sync error:', e));
          }
        }
      } catch (stockErr) {
        console.error('Error updating stock after purchase:', stockErr);
      }

      // Sync to Firebase purchases collection
      if (this.isOnline && auth.currentUser) {
        try {
          await setDoc(doc(db, 'purchases', newPurchase.id), {
            ...newPurchase,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          console.error('Error syncing purchase to Firebase:', err);
          await this.addToSyncQueue({ type: 'purchase', data: newPurchase });
        }
      } else {
        await this.addToSyncQueue({ type: 'purchase', data: newPurchase });
      }
      return newPurchase;
    } catch (err) {
      console.error('Error adding purchase:', err);
      throw err;
    }
  }

  // ── Add debt to a creditor when a credit purchase is made ──────────────────
  async addCreditorDebt(creditorId, amount, purchaseId, dueDate = null) {
    try {
      const creditors = await localforage.getItem(DATA_KEYS.CREDITORS) || [];
      const creditor = creditors.find(c => c.id === creditorId);
      if (!creditor) return;

      creditor.totalDue   = (creditor.totalDue   || 0) + parseFloat(amount);
      creditor.balance    = creditor.totalDue - (creditor.totalPaid || 0);
      creditor.purchaseIds = creditor.purchaseIds || [];
      if (!creditor.purchaseIds.includes(purchaseId)) creditor.purchaseIds.push(purchaseId);
      // Store or update repayment date if provided
      if (dueDate) creditor.repaymentDate = dueDate;
      creditor.lastPurchase = new Date().toISOString();
      creditor.updatedAt    = creditor.lastPurchase;

      await localforage.setItem(DATA_KEYS.CREDITORS, creditors);

      if (this.isOnline && auth.currentUser) {
        await setDoc(doc(db, 'creditors', creditorId.toString()), {
          ...creditor,
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch(e => console.error('Creditor debt sync error:', e));
      }
    } catch (err) {
      console.error('Error adding creditor debt:', err);
    }
  }

  // ── Record a payment MADE to a creditor (Cash OUT) ────────────────────────
  async recordCreditorPayment(creditorId, amount, photo = null, receiptNumber = '') {
    try {
      const creditors = await localforage.getItem(DATA_KEYS.CREDITORS) || [];
      const creditor = creditors.find(c => c.id === creditorId);
      if (!creditor) return null;

      const paymentAmount = parseFloat(amount);
      creditor.totalPaid  = (creditor.totalPaid || 0) + paymentAmount;
      creditor.balance    = (creditor.totalDue || 0) - creditor.totalPaid;
      if (creditor.balance <= 0) { creditor.balance = 0; creditor.repaymentDate = ''; }
      creditor.lastPayment = new Date().toISOString();
      creditor.updatedAt   = creditor.lastPayment;

      const depositEntry = {
        id: this.generateId(), type: 'deposit',
        amount: paymentAmount, date: creditor.lastPayment,
        createdAt: creditor.lastPayment,
        ...(photo ? { photo } : {}),
        ...(receiptNumber ? { receiptNumber } : {}),
      };
      creditor.deposits = creditor.deposits || [];
      creditor.deposits.push(depositEntry);

      await localforage.setItem(DATA_KEYS.CREDITORS, creditors);

      // ── Cash OUT — we paid the creditor ───────────────────────────────
      const creditorName = creditor.name || creditor.customerName || 'Creditor';
      const gender = creditor.gender || '';
      const prefix = gender === 'Male' ? 'Mr.' : gender === 'Female' ? 'Ms.' : '';
      const displayName = prefix ? `${prefix} ${creditorName}` : creditorName;
      await this.addCashEntry({
        type: 'out',
        amount: paymentAmount,
        note: `Paid ${displayName} to repay debt`,
        date: creditor.lastPayment,
        source: 'creditor_payment',
        creditorId,
      });

      if (this.isOnline && auth.currentUser) {
        const depositsForFirestore = (creditor.deposits || []).map(dep => {
          const { photo: _p, ...rest } = dep; return rest;
        });
        await setDoc(doc(db, 'creditors', creditorId.toString()), {
          ...creditor, deposits: depositsForFirestore,
          lastPayment: serverTimestamp(), updatedAt: serverTimestamp(),
        }, { merge: true }).catch(e => {
          console.error('Creditor payment sync error:', e);
          this.addToSyncQueue({ type: 'creditor', data: creditor });
        });
      } else {
        await this.addToSyncQueue({ type: 'creditor', data: creditor });
      }

      return creditor;
    } catch (err) {
      console.error('Error recording creditor payment:', err);
      throw err;
    }
  }

  // ── Record a payment MADE to a supplier (Cash OUT) ─────────────────────────
  async recordSupplierPayment(supplierId, amount, photo = null, receiptNumber = '') {
    try {
      const suppliers = await localforage.getItem(DATA_KEYS.SUPPLIERS) || [];
      const supplier = suppliers.find(s => s.id === supplierId);
      if (!supplier) return null;

      const paymentAmount = parseFloat(amount);
      supplier.totalPaid  = (supplier.totalPaid || 0) + paymentAmount;
      supplier.balance    = (supplier.totalDue || 0) - supplier.totalPaid;
      if (supplier.balance <= 0) { supplier.balance = 0; }
      supplier.lastPayment = new Date().toISOString();
      supplier.updatedAt   = supplier.lastPayment;

      const depositEntry = {
        id: this.generateId(), type: 'deposit',
        amount: paymentAmount, date: supplier.lastPayment,
        createdAt: supplier.lastPayment,
        ...(photo ? { photo } : {}),
        ...(receiptNumber ? { receiptNumber } : {}),
      };
      supplier.deposits = supplier.deposits || [];
      supplier.deposits.push(depositEntry);

      await localforage.setItem(DATA_KEYS.SUPPLIERS, suppliers);

      // ── Cash OUT — we paid the supplier ───────────────────────────────
      const supplierName = supplier.name || supplier.customerName || 'Supplier';
      await this.addCashEntry({
        type: 'out',
        amount: paymentAmount,
        note: `Paid to ${supplierName}`,
        date: supplier.lastPayment,
        source: 'supplier_payment',
      });

      // Sync to Firebase
      if (this.isOnline && auth.currentUser) {
        const depositsForFirestore = (supplier.deposits || []).map(dep => {
          const { photo: _p, ...rest } = dep; return rest;
        });
        await setDoc(doc(db, 'suppliers', supplierId.toString()), {
          ...supplier, deposits: depositsForFirestore,
          lastPayment: serverTimestamp(), updatedAt: serverTimestamp(),
        }, { merge: true }).catch(e => {
          console.error('Supplier payment sync error:', e);
        });
      }

      return supplier;
    } catch (err) {
      console.error('Error recording supplier payment:', err);
      throw err;
    }
  }

  // ── App Settings (stored in localforage for persistence across app restarts) ──
  async getSettings() {
    try {
      const saved = await localforage.getItem(DATA_KEYS.SETTINGS);
      // Defaults
      return {
        lang: 'en',
        darkMode: false,
        currency: '$',
        notifDebtReminder: true,
        notifLowStock: true,
        notifDailySales: true,
        openingBalance: null,  // one-time starting cash on hand
        ...(saved || {}),
      };
    } catch (err) {
      console.error('Error getting settings:', err);
      return { lang: 'en', darkMode: false, currency: '$', notifDebtReminder: true, notifLowStock: true, notifDailySales: true, openingBalance: null };
    }
  }

  // ── Get currency symbol synchronously from localStorage ──────────────────
  getCurrencySymbol() {
    return localStorage.getItem('ks_currency') || '$';
  }

  // ── Set the one-time opening balance ─────────────────────────────────────
  async setOpeningBalance(amount) {
    const settings = await this.getSettings();
    if (settings.openingBalance !== null && settings.openingBalance !== undefined) {
      return false; // already set
    }
    const parsedAmount = parseFloat(amount) || 0;
    await this.saveSettings({ ...settings, openingBalance: parsedAmount });
    if (parsedAmount > 0) {
      await this.addCashEntry({
        type: 'in',
        amount: parsedAmount,
        note: 'Opening Balance (starting cash on hand)',
        date: new Date().toISOString(),
        source: 'opening_balance',
      });
    }
    return true;
  }

  async saveSettings(settings) {
    try {
      await localforage.setItem(DATA_KEYS.SETTINGS, settings);
      // Mirror to localStorage for synchronous reads (dark mode, currency symbol)
      Object.entries(settings).forEach(([k, v]) => {
        localStorage.setItem(`ks_${k}`, String(v));
      });
      return true;
    } catch (err) {
      console.error('Error saving settings:', err);
      return false;
    }
  }

  // Push all local data to Firebase
  async pushToFirebase() {
    if (!this.isOnline || !auth.currentUser) {
      console.log('Cannot push: offline or not authenticated');
      return { success: false, error: 'Offline or not authenticated' };
    }

    try {
      console.log('⬆️ Pushing local data to Firebase...');
      const idStr = item => item.id.toString();
      
      // Push goods
      const goods = await localforage.getItem(DATA_KEYS.GOODS) || [];
      await this._batchWrite('goods', goods, idStr);
      console.log(`✅ Pushed ${goods.length} goods`);
      
      // Push sales
      const sales = await localforage.getItem(DATA_KEYS.SALES) || [];
      await this._batchWrite('sales', sales, idStr);
      console.log(`✅ Pushed ${sales.length} sales`);
      
      // Push debtors
      const debtors = await localforage.getItem(DATA_KEYS.DEBTORS) || [];
      await this._batchWrite('debtors', debtors, idStr);
      console.log(`✅ Pushed ${debtors.length} debtors`);

      // Push creditors
      const creditors = await localforage.getItem(DATA_KEYS.CREDITORS) || [];
      await this._batchWrite('creditors', creditors, idStr);
      console.log(`✅ Pushed ${creditors.length} creditors`);

      // Push suppliers
      const suppliers = await localforage.getItem(DATA_KEYS.SUPPLIERS) || [];
      await this._batchWrite('suppliers', suppliers, idStr);
      console.log(`✅ Pushed ${suppliers.length} suppliers`);

      // Push purchases
      const purchases = await localforage.getItem(DATA_KEYS.PURCHASES) || [];
      await this._batchWrite('purchases', purchases, idStr);
      console.log(`✅ Pushed ${purchases.length} purchases`);

      // Push cash entries
      const cashEntries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
      await this._batchWrite('cash_entries', cashEntries, idStr);
      console.log(`✅ Pushed ${cashEntries.length} cash entries`);
      
      return { 
        success: true, 
        pushed: {
          goods: goods.length, sales: sales.length, debtors: debtors.length,
          creditors: creditors.length, suppliers: suppliers.length,
          purchases: purchases.length, cashEntries: cashEntries.length,
        }
      };
    } catch (error) {
      console.error('❌ Firebase push error:', error);
      return { success: false, error: error.message };
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // DAILY CASH RECONCILIATION
  // ════════════════════════════════════════════════════════════════════

  todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  userName() {
    const u = auth.currentUser;
    if (!u) return 'Unknown';
    if (u.displayName) return u.displayName;
    if (u.email) return u.email.split('@')[0];
    return u.uid.slice(0, 8);
  }

  // ── Returns the shop/business name from the users collection ─────────────
  // Looks for a user with role 'Shop Owner' and returns their shopName field,
  // or falls back to localStorage, then to a generic label.
  async getShopName() {
    try {
      const cached = localStorage.getItem('ks_shop_name');
      // Always try to refresh from Firebase if online
      if (this.isOnline && auth.currentUser) {
        const users = await localforage.getItem('act_users') || [];
        const owner = users.find(u => (u.role || '').toLowerCase() === 'shop owner');
        if (owner && (owner.shopName || owner.businessName || owner.storeName)) {
          const name = owner.shopName || owner.businessName || owner.storeName;
          localStorage.setItem('ks_shop_name', name);
          return name;
        }
      }
      if (cached) return cached;
    } catch (err) {
      console.error('getShopName error:', err);
    }
    return localStorage.getItem('ks_shop_name') || 'Shop';
  }

  async getDailyCashRecords() {
    try {
      if (this.isOnline && auth.currentUser) {
        const snap = await getDocs(collection(db, 'daily_cash'));
        const fbDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const local  = await localforage.getItem(DATA_KEYS.DAILY_CASH) || [];
        const localMap = new Map(local.map(r => [r.id, r]));
        for (const fb of fbDocs) {
          const loc = localMap.get(fb.id);
          if (!loc) { localMap.set(fb.id, fb); continue; }
          const fbT  = new Date(fb.updatedAt  || fb.opened_at_client || 0).getTime();
          const locT = new Date(loc.updatedAt || loc.opened_at_client || 0).getTime();
          if (fbT > locT) localMap.set(fb.id, fb);
        }
        const merged = Array.from(localMap.values());
        await localforage.setItem(DATA_KEYS.DAILY_CASH, merged);
        return merged;
      }
    } catch (e) {
      console.error('getDailyCashRecords Firebase error:', e);
    }
    return await localforage.getItem(DATA_KEYS.DAILY_CASH) || [];
  }

  async getDailyCashByDate(business_date) {
    const all = await this.getDailyCashRecords();
    return all.find(r => r.business_date === business_date) || null;
  }

  async _saveDailyCashDoc(docData) {
    const all = await localforage.getItem(DATA_KEYS.DAILY_CASH) || [];
    const idx = all.findIndex(r => r.id === docData.id);
    if (idx >= 0) all[idx] = docData; else all.push(docData);
    await localforage.setItem(DATA_KEYS.DAILY_CASH, all);

    if (this.isOnline && auth.currentUser) {
      try {
        const { opened_at_server: _oas, closed_at_server: _cas, last_calculated_at_server: _lcas, ...rest } = docData;
        await setDoc(doc(db, 'daily_cash', docData.id), {
          ...rest,
          opened_at_server:          docData.status === 'open'   ? serverTimestamp() : (docData.opened_at_server || null),
          closed_at_server:          docData.status === 'closed' ? serverTimestamp() : null,
          last_calculated_at_server: serverTimestamp(),
          updatedAt:                 serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        console.error('daily_cash Firestore sync error:', err);
        await this.addToSyncQueue({ type: 'daily_cash', data: docData });
      }
    } else {
      await this.addToSyncQueue({ type: 'daily_cash', data: docData });
    }
    return docData;
  }

  async openDay({ opening_float }) {
    const user  = auth.currentUser;
    const today = this.todayStr();
    const now   = new Date().toISOString();
    const float = parseFloat(opening_float) || 0;

    const summary = await this.calculateExpectedCash(today);

    const docData = {
      id:               today,
      business_date:    today,
      status:           'open',
      locked:           false,
      opening_float:    float,
      counted_cash:     null,
      expected_cash:    float + summary.sum_in - summary.sum_out,
      difference:       0,
      notes:            '',
      opened_by_uid:    user?.uid  || null,
      opened_by_name:   this.userName(),
      opened_at_client: now,
      closed_by_uid:    null,
      closed_by_name:   null,
      closed_at_client: null,
      last_calculated_at_client: now,
      updatedAt:        now,
    };

    await this._saveDailyCashDoc(docData);
    await localforage.setItem('current_business_date', today);

    // Record the opening float in the Cash Record table
    if (float > 0) {
      const openerName = this.userName();
      await this.addCashEntry({
        type: 'in',
        amount: float,
        note: `Shop OPENED by ${openerName} with float`,
        date: now,
        source: 'opening_float',
        business_date: today,
      });
      // Float returned from withdrawals balance back into shop
      await this.addWithdrawal({
        type: 'in',
        amount: float,
        description: `Float returned to shop — opened by ${openerName}`,
        source: 'open_float',
        date: now,
        business_date: today,
        relatedId: today,
      });
    }

    return docData;
  }

  async closeDay({ counted_cash, notes }) {
    const user    = auth.currentUser;
    const today   = this.todayStr();
    const now     = new Date().toISOString();
    const counted = parseFloat(counted_cash) || 0;

    const summary  = await this.calculateExpectedCash(today);
    const existing = await this.getDailyCashByDate(today);
    const float    = existing?.opening_float || 0;
    const expected = float + summary.sum_in - summary.sum_out;
    const diff     = counted - expected;

    const docData = {
      ...(existing || {}),
      id:               today,
      business_date:    today,
      status:           'closed',
      locked:           true,
      opening_float:    float,
      counted_cash:     counted,
      expected_cash:    expected,
      difference:       diff,
      notes:            notes || '',
      opened_by_uid:    existing?.opened_by_uid  || null,
      opened_by_name:   existing?.opened_by_name || null,
      opened_at_client: existing?.opened_at_client || now,
      closed_by_uid:    user?.uid  || null,
      closed_by_name:   this.userName(),
      closed_at_client: now,
      last_calculated_at_client: now,
      updatedAt:        now,
    };

    await this._saveDailyCashDoc(docData);

    // Full counted cash is taken out of the shop at end of day
    if (counted > 0) {
      const closerName = this.userName();
      await this.addWithdrawal({
        type: 'out',
        amount: counted,
        description: `Shop closed by ${closerName} — cash taken out`,
        source: 'close_day',
        date: now,
        business_date: today,
        relatedId: today,
      });
    }

    return docData;
  }

  // ── Re-open a closed day (admin override) ─────────────────────────────────
  async reopenDay(business_date, reopenFloatAmount) {
    const user    = auth.currentUser;
    const today   = business_date || this.todayStr();
    const now     = new Date().toISOString();
    const existing = await this.getDailyCashByDate(today);
    if (!existing) throw new Error('No record found for this date.');

    // Archive the completed close session before clearing it
    const closeSessions = Array.isArray(existing.close_sessions) ? [...existing.close_sessions] : [];
    if (existing.counted_cash !== null && existing.counted_cash !== undefined) {
      closeSessions.push({
        reopen_float:     reopenFloatAmount !== undefined ? reopenFloatAmount : existing.counted_cash,
        expected_cash:    existing.expected_cash,
        counted_cash:     existing.counted_cash,
        difference:       existing.difference,
        notes:            existing.notes || '',
        closed_by_uid:    existing.closed_by_uid  || null,
        closed_by_name:   existing.closed_by_name || null,
        closed_at:        existing.closed_at_client || null,
        reopened_by_uid:  user?.uid  || null,
        reopened_by_name: this.userName(),
        reopened_at:      now,
      });
    }

    const docData = {
      ...existing,
      status:           'open',
      locked:           false,
      opening_float:    reopenFloatAmount !== undefined ? reopenFloatAmount : (existing.counted_cash ?? existing.opening_float ?? 0),
      counted_cash:     null,
      difference:       0,
      notes:            '',
      closed_by_uid:    null,
      closed_by_name:   null,
      closed_at_client: null,
      reopened_by_uid:  user?.uid  || null,
      reopened_by_name: this.userName(),
      reopened_at:      now,
      close_sessions:   closeSessions,
      updatedAt:        now,
    };

    await this._saveDailyCashDoc(docData);

    // Record the re-opening float in the Cash Record table
    const reopenFloat = reopenFloatAmount !== undefined ? reopenFloatAmount : (existing.counted_cash ?? existing.opening_float ?? 0);
    if (parseFloat(reopenFloat) > 0) {
      const reopenerName = this.userName();
      await this.addCashEntry({
        type: 'in',
        amount: parseFloat(reopenFloat),
        note: `Shop RE-OPENED by ${reopenerName} with float`,
        date: now,
        source: 'reopen_float',
        business_date: today,
      });
      // Float returned from withdrawals balance back into shop
      await this.addWithdrawal({
        type: 'in',
        amount: parseFloat(reopenFloat),
        description: `Float returned to shop — re-opened by ${reopenerName}`,
        source: 'open_float',
        date: now,
        business_date: today,
        relatedId: today,
      });
    }

    return docData;
  }

  // ── Record a checkout unlock event for audit trail ────────────────────────
  async recordUnlock(business_date) {
    const user = auth.currentUser;
    const today = business_date || this.todayStr();
    const now   = new Date().toISOString();
    const existing = await this.getDailyCashByDate(today);
    if (!existing) return; // no record to update — day not opened yet

    // Append to unlock_events array
    const unlockEvents = Array.isArray(existing.unlock_events) ? existing.unlock_events : [];
    unlockEvents.push({
      uid:  user?.uid  || null,
      name: this.userName(),
      at:   now,
    });

    const docData = {
      ...existing,
      unlock_events: unlockEvents,
      updatedAt: now,
    };

    await this._saveDailyCashDoc(docData);
    return docData;
  }

  async calculateExpectedCash(business_date) {
    const entries = await this.getCashEntriesByDate(business_date);
    let sum_in = 0, sum_out = 0;
    for (const e of entries) {
      if (e.source === 'open_day' || e.source === 'close_day') continue;
      // opening_float and reopen_float are already accounted for in the opening_float field
      if (e.source === 'opening_float' || e.source === 'reopen_float') continue;
      if (e.type === 'in')  sum_in  += parseFloat(e.amount) || 0;
      if (e.type === 'out') sum_out += parseFloat(e.amount) || 0;
    }
    const rec      = await this.getDailyCashByDate(business_date);
    const float    = rec?.opening_float || 0;
    const expected = float + sum_in - sum_out;
    return { opening_float: float, sum_in, sum_out, expected };
  }

  async getCashEntriesByDate(business_date) {
    const all = await this.getCashEntries();
    return all.filter(e => {
      if (e.business_date) return e.business_date === business_date;
      const d = e.date || e.createdAt;
      return d ? d.slice(0, 10) === business_date : false;
    });
  }

  // ── Operational Assets ────────────────────────────────────────────────────
  async getOperationalAssets() {
    try {
      if (this.isOnline && auth.currentUser && !this._operationalAssetsFetched) {
        this._operationalAssetsFetched = true;
        try {
          const snap = await getDocs(collection(db, 'operational_assets'));
          const fbAssets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          const local = await localforage.getItem(DATA_KEYS.OPERATIONAL_ASSETS) || [];
          const fbIds = new Set(fbAssets.map(a => a.id));
          const localOnly = local.filter(a => !fbIds.has(a.id));
          const merged = [...fbAssets, ...localOnly]
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          await localforage.setItem(DATA_KEYS.OPERATIONAL_ASSETS, merged);
          return merged;
        } catch (err) {
          console.error('Error fetching operational assets from Firebase:', err);
        }
      }
      return await localforage.getItem(DATA_KEYS.OPERATIONAL_ASSETS) || [];
    } catch (error) {
      console.error('Error getting operational assets:', error);
      return [];
    }
  }

  async addOperationalAsset(asset) {
    try {
      const assets = await localforage.getItem(DATA_KEYS.OPERATIONAL_ASSETS) || [];
      const newAsset = {
        id: this.generateId(),
        name: asset.name || '',
        qty: parseFloat(asset.qty) || 0,
        costPrice: parseFloat(asset.costPrice) || 0,
        subtotal: parseFloat(asset.subtotal) || 0,
        supplierName: asset.supplierName || '',
        supplierId: asset.supplierId || null,
        purchaseId: asset.purchaseId || null,
        invoiceRef: asset.invoiceRef || '',
        paymentType: asset.paymentType || 'cash',
        date: asset.date || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        source: asset.source || 'purchase',
      };
      assets.unshift(newAsset);
      await localforage.setItem(DATA_KEYS.OPERATIONAL_ASSETS, assets);

      if (this.isOnline && auth.currentUser) {
        try {
          await setDoc(doc(db, 'operational_assets', newAsset.id), {
            ...newAsset,
            createdAt: serverTimestamp(),
          }, { merge: true });
        } catch (err) {
          console.error('Error syncing operational asset to Firebase:', err);
          await this.addToSyncQueue({ type: 'operational_asset', data: newAsset });
        }
      } else {
        await this.addToSyncQueue({ type: 'operational_asset', data: newAsset });
      }

      // ── Credit purchase: link to creditor ──────────────────────────────
      if (newAsset.paymentType === 'credit' && newAsset.supplierId) {
        try {
          const creditors = await localforage.getItem(DATA_KEYS.CREDITORS) || [];
          const suppliers = await localforage.getItem(DATA_KEYS.SUPPLIERS) || [];
          const supplier = suppliers.find(s => s.id === newAsset.supplierId);
          const stubName = newAsset.supplierName || (supplier && (supplier.name || supplier.customerName)) || 'Unknown';
          let existing = creditors.find(c => c.id === newAsset.supplierId) ||
                         creditors.find(c => (c.name||c.customerName||'').toLowerCase() === stubName.toLowerCase());
          let creditorId;
          if (existing) {
            creditorId = existing.id;
          } else {
            const nc = {
              id: newAsset.supplierId, name: stubName, customerName: stubName,
              phone: supplier?.phone||'', customerPhone: supplier?.phone||'',
              whatsapp: supplier?.whatsapp||'', email: supplier?.email||'',
              address: supplier?.address||'', gender: supplier?.gender||'',
              repaymentDate: newAsset.dueDate||'',
              totalDue: 0, totalPaid: 0, balance: 0, deposits: [], purchaseIds: [],
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
            creditors.push(nc);
            await localforage.setItem(DATA_KEYS.CREDITORS, creditors);
            if (this.isOnline && auth.currentUser) {
              await setDoc(doc(db, 'creditors', nc.id.toString()),
                {...nc, createdAt: serverTimestamp(), updatedAt: serverTimestamp()},
                { merge: true }).catch(e => console.error('Creditor asset sync error:', e));
            }
            creditorId = nc.id;
          }
          await this.addCreditorDebt(creditorId, newAsset.subtotal || 0, newAsset.id, newAsset.dueDate || null);
        } catch (err) { console.error('Error linking asset to creditor:', err); }
      }

      return newAsset;
    } catch (error) {
      console.error('Error adding operational asset:', error);
      throw error;
    }
  }


  // ── Advance Orders ────────────────────────────────────────────────────────
  async getAdvanceOrders() {
    try {
      if (this.isOnline && auth.currentUser && !this._advanceOrdersFetched) {
        this._advanceOrdersFetched = true;
        try {
          const snap = await getDocs(collection(db, 'advance_orders'));
          const fbOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          const local = await localforage.getItem(DATA_KEYS.ADVANCE_ORDERS) || [];
          const fbIds = new Set(fbOrders.map(o => o.id));
          const localOnly = local.filter(o => !fbIds.has(o.id));
          const merged = [...fbOrders, ...localOnly]
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          await localforage.setItem(DATA_KEYS.ADVANCE_ORDERS, merged);
          return merged;
        } catch (err) {
          console.error('Error fetching advance orders from Firebase:', err);
        }
      }
      return await localforage.getItem(DATA_KEYS.ADVANCE_ORDERS) || [];
    } catch (error) {
      console.error('Error getting advance orders:', error);
      return [];
    }
  }

  async setAdvanceOrders(orders) {
    await localforage.setItem(DATA_KEYS.ADVANCE_ORDERS, orders);
  }

  async updateAdvanceOrder(id, updates) {
    try {
      const orders = await localforage.getItem(DATA_KEYS.ADVANCE_ORDERS) || [];
      const idx = orders.findIndex(o => o.id === id);
      if (idx === -1) throw new Error('Advance order not found');
      const now = new Date().toISOString();
      orders[idx] = { ...orders[idx], ...updates, updatedAt: now };
      await localforage.setItem(DATA_KEYS.ADVANCE_ORDERS, orders);
      if (this.isOnline && auth.currentUser) {
        try {
          await setDoc(doc(db, 'advance_orders', id), {
            ...orders[idx], updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (err) {
          console.error('Error syncing advance order update to Firebase:', err);
          await this.addToSyncQueue({ type: 'advance_order', data: orders[idx] });
        }
      } else {
        await this.addToSyncQueue({ type: 'advance_order', data: orders[idx] });
      }
      return orders[idx];
    } catch (error) {
      console.error('Error updating advance order:', error);
      throw error;
    }
  }

  async addAdvanceOrder(order) {
    try {
      const orders = await localforage.getItem(DATA_KEYS.ADVANCE_ORDERS) || [];
      const newOrder = {
        id: this.generateId(),
        ...order,
        balance: order.balance || 0,
        totalDue: order.totalDue || 0,
        totalPaid: order.totalPaid || 0,
        deposits: order.deposits || [],
        createdAt: new Date().toISOString(),
      };
      orders.unshift(newOrder);
      await localforage.setItem(DATA_KEYS.ADVANCE_ORDERS, orders);
      if (this.isOnline && auth.currentUser) {
        try {
          await setDoc(doc(db, 'advance_orders', newOrder.id), {
            ...newOrder, createdAt: serverTimestamp(),
          }, { merge: true });
        } catch (err) {
          console.error('Error syncing advance order to Firebase:', err);
          await this.addToSyncQueue({ type: 'advance_order', data: newOrder });
        }
      } else {
        await this.addToSyncQueue({ type: 'advance_order', data: newOrder });
      }
      return newOrder;
    } catch (error) {
      console.error('Error adding advance order:', error);
      throw error;
    }
  }

  // ── Users (A.C.T Staffs) — read from 'users' Firestore collection ─────────
  // Uses the same localforage key ('act_users') as the Admin app so that
  // changes made in Admin are available offline in Shopkeeper and vice versa.
  async getUsers() {
    try {
      if (this.isOnline && auth.currentUser) {
        const snap = await getDocs(collection(db, 'users'));
        const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        await localforage.setItem('act_users', users);
        return users;
      }
    } catch (err) {
      console.error('Error fetching users from Firebase:', err);
    }
    return await localforage.getItem('act_users') || [];
  }

  // ── Landlord — reads from the same 'act_users' forage key ────────────
  // Returns the landlord record (id === '__landlord__') if it exists.
  async getLandlord() {
    try {
      const users = await localforage.getItem('act_users') || [];
      return users.find(u => u.id === '__landlord__') || null;
    } catch (err) {
      console.error('Error fetching landlord from forage:', err);
      return null;
    }
  }

  // ════════════════════════════════════════════════════════════════════

  // ── Expenses ──────────────────────────────────────────────────────────────

  async getExpenses() {
    try {
      // On first call of the session, pull from Firebase to sync across devices
      if (this.isOnline && auth.currentUser && !this._expensesFetched) {
        this._expensesFetched = true;
        try {
          const snap = await getDocs(collection(db, 'expenses'));
          const fbExpenses = snap.docs.map(d => ({
            id: d.id, ...d.data(),
            date: typeof d.data().date === 'string' ? d.data().date : (d.data().date?.toDate?.()?.toISOString?.() || null),
            createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() || d.data().createdAt,
          }));
          const local = await localforage.getItem(DATA_KEYS.EXPENSES) || [];
          const fbIds = new Set(fbExpenses.map(e => e.id));
          const localOnly = local.filter(e => !fbIds.has(e.id));
          // Prefer Firebase version for shared entries, keep local-only for offline entries
          const merged = [...fbExpenses, ...localOnly]
            .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
          await localforage.setItem(DATA_KEYS.EXPENSES, merged);
          return merged;
        } catch (err) {
          console.error('Error fetching expenses from Firebase:', err);
        }
      }
      const data = await localforage.getItem(DATA_KEYS.EXPENSES);
      return data || [];
    } catch (err) {
      console.error('getExpenses error:', err);
      return [];
    }
  }

  async addExpense(expenseData) {
    try {
      const expenses = await localforage.getItem(DATA_KEYS.EXPENSES) || [];
      const now = new Date().toISOString();
      const expense = {
        id: this.generateId(),
        ...expenseData,
        createdAt: now,
        updatedAt: now,
      };
      expenses.push(expense);
      await localforage.setItem(DATA_KEYS.EXPENSES, expenses);

      // Sync to Firebase
      if (this.isOnline && auth.currentUser) {
        try {
          await setDoc(doc(db, 'expenses', expense.id), { ...expense, createdAt: serverTimestamp() }, { merge: true });
        } catch (err) {
          console.error('Firebase addExpense error:', err);
          await this.addToSyncQueue({ type: 'expense', data: expense });
        }
      } else {
        await this.addToSyncQueue({ type: 'expense', data: expense });
      }

      // If cash payment, auto-create a cash_entries OUT record
      // _skipCashEntry is set by Supplier Purchase flow — the assets modal already wrote the cash entry
      if ((expense.paymentMethod || 'cash') === 'cash' && !expense._skipCashEntry) {
        await this.addCashEntry({
          type: 'out',
          amount: expense.amount,
          source: 'expense',
          expenseId: expense.id,
          note: expense.note || expense.category,
          date: expense.date || now,
          business_date: (expense.date || now).slice(0, 10),
        });
      }

      // Owner drawings → also record as a withdrawal (money leaves shop to owner)
      const drawingCategories = ['Owner Drawings', 'Owner Withdrawal', 'Drawings'];
      if (drawingCategories.some(c => (expense.category || '').toLowerCase().includes(c.toLowerCase()))) {
        await this.addWithdrawal({
          type: 'out',
          amount: expense.amount,
          description: `Owner drawings — ${expense.note || expense.category}`,
          source: 'expense',
          date: expense.date || now,
          relatedId: expense.id,
        });
      }

      return expense;
    } catch (err) {
      console.error('addExpense error:', err);
      throw err;
    }
  }

  async updateExpense(expenseId, patch) {
    try {
      const expenses = await localforage.getItem(DATA_KEYS.EXPENSES) || [];
      const idx = expenses.findIndex(e => e.id === expenseId);
      if (idx === -1) throw new Error('Expense not found');
      const old = expenses[idx];
      const updated = { ...old, ...patch, updatedAt: new Date().toISOString() };
      expenses[idx] = updated;
      await localforage.setItem(DATA_KEYS.EXPENSES, expenses);

      // Sync to Firebase
      if (this.isOnline && auth.currentUser) {
        try {
          await setDoc(doc(db, 'expenses', expenseId), { ...updated, updatedAt: serverTimestamp() }, { merge: true });
        } catch (err) {
          console.error('Firebase updateExpense error:', err);
        }
      }

      // Handle cash_entries linkage
      const oldWasCash = (old.paymentMethod || 'cash') === 'cash';
      const newIsCash  = (updated.paymentMethod || 'cash') === 'cash';
      const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
      const linked = entries.find(e => e.source === 'expense' && e.expenseId === expenseId);

      if (oldWasCash && newIsCash && linked) {
        // Update the linked entry amount/note
        const ei = entries.findIndex(e => e.id === linked.id);
        entries[ei] = { ...linked, amount: updated.amount, note: updated.note || updated.category, updatedAt: new Date().toISOString() };
        await localforage.setItem(DATA_KEYS.CASH_ENTRIES, entries);
        if (this.isOnline && auth.currentUser) {
          try { await setDoc(doc(db, 'cash_entries', linked.id), entries[ei], { merge: true }); } catch (_) {}
        }
      } else if (!oldWasCash && newIsCash) {
        // Create new cash entry
        await this.addCashEntry({ type: 'out', amount: updated.amount, source: 'expense', expenseId, note: updated.note || updated.category, date: updated.date, business_date: (updated.date || '').slice(0, 10) });
      } else if (oldWasCash && !newIsCash && linked) {
        // Remove linked cash entry
        const remaining = entries.filter(e => !(e.source === 'expense' && e.expenseId === expenseId));
        await localforage.setItem(DATA_KEYS.CASH_ENTRIES, remaining);
        if (this.isOnline && auth.currentUser) {
          try { await deleteDoc(doc(db, 'cash_entries', linked.id)); } catch (_) {}
        }
      }

      return updated;
    } catch (err) {
      console.error('updateExpense error:', err);
      throw err;
    }
  }

  async deleteExpense(expenseId) {
    try {
      const expenses = await localforage.getItem(DATA_KEYS.EXPENSES) || [];
      const expense = expenses.find(e => e.id === expenseId);
      const remaining = expenses.filter(e => e.id !== expenseId);
      await localforage.setItem(DATA_KEYS.EXPENSES, remaining);

      if (this.isOnline && auth.currentUser) {
        try { await deleteDoc(doc(db, 'expenses', expenseId)); } catch (err) { console.error('Firebase deleteExpense error:', err); }
      }

      // Remove linked cash entry if it was a cash payment
      if (expense && (expense.paymentMethod || 'cash') === 'cash') {
        const entries = await localforage.getItem(DATA_KEYS.CASH_ENTRIES) || [];
        const linked = entries.find(e => e.source === 'expense' && e.expenseId === expenseId);
        if (linked) {
          const cleaned = entries.filter(e => !(e.source === 'expense' && e.expenseId === expenseId));
          await localforage.setItem(DATA_KEYS.CASH_ENTRIES, cleaned);
          if (this.isOnline && auth.currentUser) {
            try { await deleteDoc(doc(db, 'cash_entries', linked.id)); } catch (_) {}
          }
        }
      }
    } catch (err) {
      console.error('deleteExpense error:', err);
      throw err;
    }
  }

  // ════════════════════════════════════════════════════════════════════

  // ── Bank Transfers (debt payments via bank) ──────────────────────────
  async addBankTransfer(data) {
    try {
      const entries = await localforage.getItem(DATA_KEYS.BANK_TRANSFERS) || [];
      const now = new Date().toISOString();
      const entry = {
        id: this.generateId(),
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      entries.push(entry);
      await localforage.setItem(DATA_KEYS.BANK_TRANSFERS, entries);
      if (this.isOnline && auth.currentUser) {
        try {
          await setDoc(doc(db, 'bank_transfers', entry.id), { ...entry, createdAt: serverTimestamp() }, { merge: true });
        } catch (err) { console.error('addBankTransfer Firebase error:', err); }
      }
      return entry;
    } catch (err) { console.error('addBankTransfer error:', err); throw err; }
  }

  async getBankTransfers() {
    return await localforage.getItem(DATA_KEYS.BANK_TRANSFERS) || [];
  }

  // ── MPAiSA Transfers (debt payments via MPAiSA) ──────────────────────
  async addMpaisaTransfer(data) {
    try {
      const entries = await localforage.getItem(DATA_KEYS.MPAISA_TRANSFERS) || [];
      const now = new Date().toISOString();
      const entry = {
        id: this.generateId(),
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      entries.push(entry);
      await localforage.setItem(DATA_KEYS.MPAISA_TRANSFERS, entries);
      if (this.isOnline && auth.currentUser) {
        try {
          await setDoc(doc(db, 'mpaisa_transfers', entry.id), { ...entry, createdAt: serverTimestamp() }, { merge: true });
        } catch (err) { console.error('addMpaisaTransfer Firebase error:', err); }
      }
      return entry;
    } catch (err) { console.error('addMpaisaTransfer error:', err); throw err; }
  }

  async getMpaisaTransfers() {
    return await localforage.getItem(DATA_KEYS.MPAISA_TRANSFERS) || [];
  }

  // ── Withdrawals ───────────────────────────────────────────────────────
  // A withdrawal entry has: type ('out'=money leaves shop, 'in'=money returned),
  // amount, description, source, date, relatedId (sessionId, expenseId, etc.)
  async addWithdrawal(data) {
    try {
      const entries = await localforage.getItem(DATA_KEYS.WITHDRAWALS) || [];
      const now = new Date().toISOString();
      const entry = {
        id: this.generateId(),
        type: data.type,           // 'out' = taken from shop, 'in' = returned to shop
        amount: parseFloat(data.amount),
        description: data.description || '',
        source: data.source || 'manual', // 'close_day'|'open_float'|'expense'|'cash_in'|'manual'
        date: data.date || now,
        business_date: (data.date || now).slice(0, 10),
        relatedId: data.relatedId || null,
        createdAt: now,
        updatedAt: now,
      };
      entries.push(entry);
      await localforage.setItem(DATA_KEYS.WITHDRAWALS, entries);
      if (this.isOnline && auth.currentUser) {
        try {
          await setDoc(doc(db, 'withdrawals', entry.id), { ...entry, createdAt: serverTimestamp() }, { merge: true });
        } catch (err) {
          console.error('addWithdrawal Firebase error:', err);
          await this.addToSyncQueue({ type: 'withdrawal', data: entry });
        }
      } else {
        await this.addToSyncQueue({ type: 'withdrawal', data: entry });
      }
      return entry;
    } catch (err) { console.error('addWithdrawal error:', err); throw err; }
  }

  // ── Commission Goods ─────────────────────────────────────────────────────
  async getCommissionGoods() {
    try {
      if (this.isOnline && auth.currentUser) {
        const snap = await getDocs(collection(db, 'commission_goods'));
        const fbGoods = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        await localforage.setItem('commission_goods', fbGoods);
        return fbGoods;
      }
    } catch (e) { console.error('getCommissionGoods error:', e); }
    return await localforage.getItem('commission_goods') || [];
  }

  async addCommissionGood(good) {
    try {
      const id = this.generateId();
      const newGood = {
        id, name: good.name.trim(),
        sellingPrice: parseFloat(good.sellingPrice) || 0,
        commissionRate: parseFloat(good.commissionRate) || 0,
        stock: parseFloat(good.stock) || 0,
        ownerName: good.ownerName?.trim() || '',
        notes: good.notes?.trim() || '',
        commissionEarned: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const all = await localforage.getItem('commission_goods') || [];
      all.unshift(newGood);
      await localforage.setItem('commission_goods', all);
      if (this.isOnline && auth.currentUser) {
        await setDoc(doc(db, 'commission_goods', id), { ...newGood, createdAt: serverTimestamp() }, { merge: true }).catch(e => console.error('commission sync error:', e));
      }
      return newGood;
    } catch (e) { console.error('addCommissionGood error:', e); throw e; }
  }

  async updateCommissionGood(id, updates) {
    try {
      const all = await localforage.getItem('commission_goods') || [];
      const idx = all.findIndex(g => g.id === id);
      if (idx === -1) return;
      all[idx] = { ...all[idx], ...updates, sellingPrice: parseFloat(updates.sellingPrice)||0, commissionRate: parseFloat(updates.commissionRate)||0, stock: parseFloat(updates.stock)||0, updatedAt: new Date().toISOString() };
      await localforage.setItem('commission_goods', all);
      if (this.isOnline && auth.currentUser) {
        await setDoc(doc(db, 'commission_goods', id), { ...all[idx], updatedAt: serverTimestamp() }, { merge: true }).catch(e => console.error('commission update sync error:', e));
      }
    } catch (e) { console.error('updateCommissionGood error:', e); throw e; }
  }

  async deleteCommissionGood(id) {
    try {
      const all = await localforage.getItem('commission_goods') || [];
      const filtered = all.filter(g => g.id !== id);
      await localforage.setItem('commission_goods', filtered);
      if (this.isOnline && auth.currentUser) {
        await deleteDoc(doc(db, 'commission_goods', id)).catch(e => console.error('commission delete sync error:', e));
      }
    } catch (e) { console.error('deleteCommissionGood error:', e); throw e; }
  }

  async recordCommissionSale(goodId, qty) {
    try {
      const all = await localforage.getItem('commission_goods') || [];
      const idx = all.findIndex(g => g.id === goodId);
      if (idx === -1) return;
      const g = all[idx];
      const commission = (parseFloat(g.sellingPrice)||0) * (parseFloat(g.commissionRate)||0) / 100 * (parseFloat(qty)||1);
      all[idx].commissionEarned = (parseFloat(g.commissionEarned)||0) + commission;
      all[idx].updatedAt = new Date().toISOString();
      await localforage.setItem('commission_goods', all);
      if (this.isOnline && auth.currentUser) {
        await setDoc(doc(db, 'commission_goods', goodId), { commissionEarned: all[idx].commissionEarned, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
      }
    } catch (e) { console.error('recordCommissionSale error:', e); }
  }

  async getWithdrawals() {
    try {
      if (this.isOnline && auth.currentUser && !this._withdrawalsFetched) {
        this._withdrawalsFetched = true;
        const snap = await getDocs(collection(db, 'withdrawals'));
        const fbDocs = snap.docs.map(d => ({ id: d.id, ...d.data(),
          date: typeof d.data().date === 'string' ? d.data().date : (d.data().date?.toDate?.()?.toISOString?.() || null),
          createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() || d.data().createdAt,
        }));
        const local = await localforage.getItem(DATA_KEYS.WITHDRAWALS) || [];
        const localMap = new Map(local.map(r => [r.id, r]));
        for (const fb of fbDocs) {
          const loc = localMap.get(fb.id);
          if (!loc) { localMap.set(fb.id, fb); continue; }
          const fbT  = new Date(fb.updatedAt  || 0).getTime();
          const locT = new Date(loc.updatedAt || 0).getTime();
          if (fbT > locT) localMap.set(fb.id, fb);
        }
        const merged = Array.from(localMap.values());
        await localforage.setItem(DATA_KEYS.WITHDRAWALS, merged);
        return merged;
      }
    } catch (err) { console.error('getWithdrawals error:', err); }
    return await localforage.getItem(DATA_KEYS.WITHDRAWALS) || [];
  }

}

export default new DataService();
