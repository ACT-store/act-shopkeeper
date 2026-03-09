# Backend Integration Guide (a.c.t-services)

This guide explains how to set up the cloud backend for A.C.T POS using free database services.

## Option 1: Supabase (Recommended)

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign up
2. Create a new project
3. Note your project URL and anon key

### 2. Create Database Tables

Run this SQL in the Supabase SQL Editor:

```sql
-- Goods table
CREATE TABLE goods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  category TEXT,
  barcode TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Purchases table
CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  date TIMESTAMP NOT NULL,
  items JSONB NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('cash', 'credit')),
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'voided', 'refunded')),
  photo_url TEXT,
  refund JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  void_reason TEXT,
  voided_at TIMESTAMP
);

-- Debtors table
CREATE TABLE debtors (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  total_due DECIMAL(10,2) DEFAULT 0,
  total_paid DECIMAL(10,2) DEFAULT 0,
  balance DECIMAL(10,2) DEFAULT 0,
  purchase_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  last_purchase TIMESTAMP,
  last_payment TIMESTAMP
);

-- Inventory table
CREATE TABLE inventory (
  item_id TEXT PRIMARY KEY,
  stock_level INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW()
);

-- Sync queue table (for tracking syncs)
CREATE TABLE sync_queue (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  data_key TEXT NOT NULL,
  data JSONB NOT NULL,
  synced BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_purchases_date ON purchases(date DESC);
CREATE INDEX idx_purchases_customer ON purchases(customer_name);
CREATE INDEX idx_debtors_balance ON debtors(balance DESC);
```

### 3. Set Up Storage for Photos

1. In Supabase, go to Storage
2. Create a new bucket called "credit-photos"
3. Set bucket to public or authenticated based on your needs

### 4. Update Your App Configuration

In `src/services/dataService.js`, add:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Update syncToServer method
async syncToServer() {
  if (this.syncInProgress || !this.isOnline) return;
  
  this.syncInProgress = true;
  const queue = await localforage.getItem(DATA_KEYS.SYNC_QUEUE) || [];
  
  try {
    for (const item of queue) {
      const { key, value } = item;
      
      // Sync based on data type
      if (key === DATA_KEYS.GOODS) {
        await supabase.from('goods').upsert(value);
      } else if (key === DATA_KEYS.PURCHASES) {
        await supabase.from('purchases').upsert(value);
      } else if (key === DATA_KEYS.DEBTORS) {
        await supabase.from('debtors').upsert(value);
      } else if (key === DATA_KEYS.INVENTORY) {
        await supabase.from('inventory').upsert(value);
      }
    }
    
    await localforage.setItem(DATA_KEYS.SYNC_QUEUE, []);
    await localforage.setItem(DATA_KEYS.LAST_SYNC, new Date().toISOString());
    
    this.syncInProgress = false;
    return { success: true, synced: queue.length };
  } catch (error) {
    console.error('Sync failed:', error);
    this.syncInProgress = false;
    return { success: false, error: error.message };
  }
}

// Update photo upload
async savePhoto(photoData, purchaseId) {
  try {
    // Save locally first
    const photoKey = `photo_${purchaseId}`;
    await localforage.setItem(photoKey, photoData);
    
    // Upload to Supabase if online
    if (this.isOnline) {
      const fileName = `${purchaseId}_${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('credit-photos')
        .upload(fileName, photoData, {
          contentType: 'image/jpeg',
        });
      
      if (error) throw error;
      
      const { data: urlData } = supabase.storage
        .from('credit-photos')
        .getPublicUrl(fileName);
      
      return urlData.publicUrl;
    }
    
    return photoKey;
  } catch (error) {
    console.error('Error saving photo:', error);
    throw error;
  }
}
```

### 5. Environment Variables

Create `.env` file:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Option 2: Firebase

### 1. Create Firebase Project
1. Go to [firebase.google.com](https://firebase.google.com)
2. Create a new project
3. Enable Firestore Database
4. Enable Storage

### 2. Firebase Configuration

```javascript
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadString } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Sync to Firestore
async syncToServer() {
  const queue = await localforage.getItem(DATA_KEYS.SYNC_QUEUE) || [];
  
  for (const item of queue) {
    const { key, value } = item;
    
    if (Array.isArray(value)) {
      for (const record of value) {
        await setDoc(doc(db, key, record.id), record);
      }
    }
  }
  
  await localforage.setItem(DATA_KEYS.SYNC_QUEUE, []);
}
```

## Option 3: MongoDB Atlas

### 1. Create MongoDB Atlas Cluster
1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Set up database user and network access

### 2. Create API Endpoint

You'll need a simple backend (Node.js/Express):

```javascript
// server.js
const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

app.post('/api/sync', async (req, res) => {
  try {
    await client.connect();
    const db = client.db('a.c.t-pos');
    
    const { items } = req.body;
    
    for (const item of items) {
      const collection = db.collection(item.key);
      if (Array.isArray(item.value)) {
        await collection.bulkWrite(
          item.value.map(doc => ({
            replaceOne: {
              filter: { id: doc.id },
              replacement: doc,
              upsert: true
            }
          }))
        );
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

Deploy this to:
- Heroku (free tier)
- Vercel
- Railway
- Render

## Testing Your Backend

1. **Test Connection**
```javascript
// In browser console
await dataService.syncToServer();
```

2. **Verify Data**
- Check your database dashboard
- Ensure records are being created
- Test offline→online sync

3. **Test Photo Upload**
- Take a photo in a credit sale
- Check storage bucket
- Verify URL is saved in purchase record

## Security Considerations

1. **API Keys**: Never commit keys to Git
2. **Row Level Security**: Enable in Supabase/Firebase
3. **Rate Limiting**: Implement on backend
4. **Authentication**: Add user authentication for multi-device
5. **Validation**: Validate all data server-side

## Monitoring & Maintenance

1. **Monitor Database Size**
   - Free tiers have limits
   - Archive old data periodically

2. **Monitor Storage**
   - Compress photos before upload
   - Clean up unused photos

3. **Check Sync Status**
   - Monitor failed syncs
   - Set up error notifications

4. **Backup Data**
   - Enable automatic backups
   - Export data regularly

## Troubleshooting

### Sync Failures
- Check network connectivity
- Verify API credentials
- Check database quotas

### Photo Upload Issues
- Check storage bucket permissions
- Verify file size limits
- Test image compression

### Performance Issues
- Add database indexes
- Implement pagination
- Cache frequently accessed data

---

For questions about backend setup, refer to:
- [Supabase Docs](https://supabase.com/docs)
- [Firebase Docs](https://firebase.google.com/docs)
- [MongoDB Atlas Docs](https://docs.atlas.mongodb.com/)
