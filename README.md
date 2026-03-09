# A.C.T Services Shopkeeper - Cash Register & Sales Management App

A modern, offline-first Point of Sale (POS) system built with React, Capacitor, and Electron. Designed for small shops to manage sales, track credit customers, and monitor inventory.

## ✨ Latest Updates

- ✅ App logo now displays in header (top-right corner)
- ✅ Logo properly sized and responsive across devices  
- ✅ Sales Record table includes Item column
- ✅ Table columns auto-sized with proper spacing
- ✅ Header layout: App name (left) + Logo (right)
- ✅ Clean folder structure (no nested duplicates)

## Features

### 🛒 Cash Register
- Quick product selection from catalogue
- Support for both cash and credit sales
- Photo capture of Credit Sales Book entries
- Offline-first with automatic sync
- Real-time basket management

### 📊 Sales Record
- View all sales transactions with Item details
- Filter by date, customer, payment type, and status
- Edit sales within 24 hours
- Void or refund transactions
- Detailed item breakdown for each sale
- **Table columns**: Date, Time, Item, Qty, Price, Total

### 💳 Debtors Management
- Track credit customers and outstanding balances
- Record partial or full payments
- View credit sales history per customer
- Generate and share credit note cards
- Automatic balance calculations

### 📦 Inventory (Read-Only)
- View current stock levels
- Track low stock and out-of-stock items
- Filter and search products
- Stock level summaries

## Technology Stack

- **Frontend**: React 18 with modern hooks
- **Mobile**: Capacitor 5 (iOS & Android)
- **Desktop**: Electron 28 (Windows, macOS, Linux)
- **Build Tool**: Vite 5
- **Storage**: LocalForage (IndexedDB)
- **Routing**: React Router 6
- **Styling**: Custom CSS with CSS variables

## Installation

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## App Header Layout

```
┌────────────────────────────────────────────┐
│  A.C.T Services Shopkeeper       [LOGO]  │
└────────────────────────────────────────────┘
```

**Logo sizes**: 
- Desktop: 40px height, max 120px width
- Mobile: 32px height, max 90px width

---

**Built with ❤️ for A.C.T Services Shop**


---

## ⚠️ Important Developer Notes

### DO NOT add a "Buy on Credit" / Add Credit modal to the Checkout screen
The owner (Simiona Bobai / MereSimi Studios Ltd) has explicitly requested that **no "Add Credit" or "Buy on Credit" modal** be added to the Checkout/Sales Register screen. This is a deliberate business decision. Do not add, re-add, or suggest adding this feature regardless of how the code is refactored in the future.
