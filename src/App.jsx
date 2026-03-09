import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HelpCircle, Menu, X, LogOut } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import Checkout from './screens/Checkout';
import SalesRecord from './screens/SalesRecord';
import CashRecord from './screens/CashRecord';
import PurchaseRecord from './screens/PurchaseRecord';
import ExpensesRecord from './screens/ExpensesRecord';
import Withdrawals from './screens/Withdrawals';
import Debtors from './screens/Debtors';
import AdvanceOrders from './screens/AdvanceOrders';
import Creditors from './screens/Creditors';
import Inventory from './screens/Inventory';
import Settings from './screens/Settings';
import CashReconciliation from './screens/CashReconciliation';
import Login from './components/Login';
import dataService from './services/dataService';
import { db } from './services/firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';
import './App.css';

// ── Error Boundary — catches render crashes and shows a readable message ──────
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('App error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', padding: '24px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white', textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Something went wrong</h2>
          <p style={{ margin: '0 0 20px', opacity: 0.85, fontSize: '14px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 28px', borderRadius: '10px', border: 'none',
              background: 'white', color: '#667eea', fontWeight: 700,
              fontSize: '15px', cursor: 'pointer'
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Apply dark/light mode immediately on load (before React renders) ──────────
(function applyInitialTheme() {
  const dark = localStorage.getItem('ks_darkMode') === 'true';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();

// Cash Reconciliation page index (used for navigation from closed modal)
// NOTE: Withdrawals is inserted at index 4 (after Expenses), so indices shift by 1
const CASH_RECON_INDEX = 11;
const SETTINGS_INDEX   = 12;

const PAGES = [
  { 
    name: 'CHECKOUT',   
    component: Checkout,
    helpContent: `
      <h3>Checkout</h3>
      <p>This is your point-of-sale screen where you record every customer sale.</p>

      <h4>How It Works</h4>
      <p>Search for a product at the bottom, tap it, enter how many to sell, then tap <strong>Add to Cart</strong>. When done, choose <strong>Pay with Cash</strong> or <strong>Buy on Credit</strong>.</p>

      <h4>Examples</h4>
      <p>&#x1f6d2; <em>A customer wants 3 bags of rice and 2 tins of tuna:</em> Search "rice", add 3 to cart. Search "tuna", add 2. Tap "Pay with Cash" &rarr; confirm &rarr; done. A Cash IN entry is created automatically.</p>
      <p>&#x1f6d2; <em>A regular customer wants to buy on credit:</em> Add items to cart &rarr; tap "Buy on Credit" &rarr; select the debtor from the list &rarr; set the repayment due date &rarr; confirm.</p>

      <h4>Key Features</h4>
      <p>&#x1f4f7; <strong>Barcode Scanner</strong> &mdash; tap the barcode icon to scan a product barcode with your camera. If it matches a product in Inventory, it's added instantly.</p>
      <p>&#x1f4b0; <strong>Change Calculator</strong> &mdash; when paying cash, enter what the customer gives you and the app shows how much change to return.</p>
      <p>&#x26a0;&#xfe0f; <strong>Overdue Debtors</strong> &mdash; if a debtor's repayment date has passed, credit sales are blocked until they pay.</p>
      <p>&#x1f4e6; <strong>Stock Check</strong> &mdash; if a product is out of stock (0 units), you cannot add it to the cart.</p>
    `
  },
  { 
    name: 'SALES RECORD',     
    component: SalesRecord,
    helpContent: `
      <h3>Sales Record</h3>
      <p>This page shows every sale you have made. Use it to check what was sold, when, and for how much.</p>

      <h4>How It Works</h4>
      <p>All sales from Checkout appear here automatically. Use the <strong>Filter</strong> button to narrow results by payment type (Cash / Credit) or date (Today, a specific date, or a date range).</p>

      <h4>Examples</h4>
      <p>&#x1f4cb; <em>You want to see today's cash sales only:</em> Tap Filter &rarr; set Type to "Cash Only" &rarr; Date to "Today" &rarr; Apply.</p>
      <p>&#x1f4cb; <em>You want to check last week's total sales:</em> Tap Filter &rarr; set Date to "Date Range" &rarr; pick Monday to Friday &rarr; Apply. The Grand Total box shows the combined amount.</p>

      <h4>Editing Sales</h4>
      <p>Within 30 minutes of recording a sale, a pencil &#x270f;&#xfe0f; icon appears. Tap it to correct the product name, quantity, or price. After 30 minutes the sale is locked.</p>

      <h4>What the Columns Mean</h4>
      <p><strong>Date/Time</strong> &mdash; when the sale happened. <strong>QTY</strong> &mdash; total items sold. <strong>Products</strong> &mdash; what was sold. <strong>Total</strong> &mdash; amount charged. <strong>Pay/Type</strong> &mdash; CASH or CREDIT badge.</p>
    `
  },
  { 
    name: 'CASH AT SHOP',      
    component: CashRecord,
    helpContent: `
      <h3>Cash at Shop</h3>
      <p>This page tracks every dollar that comes in or goes out of your business cash box.</p>

      <h4>How It Works</h4>
      <p>Tap <strong>+ Add Cash In</strong> to record money coming into the cash box. Select who the money is from, pick the reason, enter the amount, and save.</p>

      <h4>Cash IN Examples</h4>
      <p>&#x1f4b5; <em>Riti gives you $500 for float (change money):</em> Add Cash In &rarr; select "Riti" &rarr; Being For "Float (change money)" &rarr; Amount $500 &rarr; Save. Description shows: "From Riti for float (change money)."</p>
      <p>&#x1f4b5; <em>Kamwatie gives you $2,000 to purchase stock:</em> Add Cash In &rarr; select "Kamwatie" &rarr; Being For "Purchases (money to buy stock)" &rarr; Amount $2,000 &rarr; Save.</p>

      <h4>Automatic Entries</h4>
      <p>You don't need to manually add these &mdash; they happen on their own: cash sales from Checkout (Cash IN), and debtor repayments (Cash IN).</p>

      <h4>Filtering</h4>
      <p>Use Filter to view Cash In only, Cash Out only, or by date range. The summary boxes show Total Records and Net Balance.</p>
    `
  },
  {
    name: 'EXPENSES RECORD',
    component: ExpensesRecord,
    helpContent: `
      <h3>Expenses Record</h3>
      <p>This page tracks all money going out of your shop that is <strong>not</strong> for buying stock — things like rent, wages, utilities, transport, and other operating costs.</p>

      <h4>How It Works</h4>
      <p>Tap <strong>+ Add Expense</strong> &rarr; choose a category &rarr; enter the amount and payment method &rarr; add an optional note &rarr; Save. Cash expenses automatically create a Cash OUT entry in Cash Record.</p>

      <h4>Categories</h4>
      <p>Quick filters include <strong>Utilities</strong> and <strong>Wages</strong>. Tap <strong>More&hellip;</strong> to browse all categories including Rent, Transport, Loan Repayment, Owner Withdrawals, and more.</p>

      <h4>Cash vs Non-Cash</h4>
      <p>The summary cards show <strong>Cash Spent</strong> (paid from the cash drawer) and <strong>Non-Cash</strong> (bank transfer, mobile money, check) separately so you can reconcile easily.</p>
    `
  },
  {
    name: 'WITHDRAWALS',
    component: Withdrawals,
    helpContent: `
      <h3>Withdrawals</h3>
      <p>This page tracks all money taken out of the shop and held outside — with the owner, in a safe, or awaiting banking. It also records when money is returned to the shop (as float or for purchases).</p>

      <h4>How It Works</h4>
      <p>You do not add entries here manually. Records are created automatically when: the shop is <strong>closed</strong> at end of day (full counted cash taken out), the shop is <strong>opened</strong> with a float (money returned to shop), or <strong>Owner Drawings</strong> are recorded in Expenses.</p>

      <h4>Reading the Balance</h4>
      <p>The <strong>Balance Outside Shop</strong> card shows the total money currently held outside the shop. It goes <strong>up</strong> when cash is taken out and <strong>down</strong> when money is returned as float or for business use.</p>

      <h4>OUT vs IN</h4>
      <p><strong>OUT</strong> &mdash; money leaves the shop (end-of-day close, owner drawings). <strong>IN</strong> &mdash; money returns to the shop (opening float, re-open float).</p>
    `
  },
  { 
    name: 'PURCHASE RECORD',  
    component: PurchaseRecord,
    helpContent: `
      <h3>Purchase Record</h3>
      <p>This page records every purchase you make from suppliers to restock your shop.</p>

      <h4>How It Works</h4>
      <p>Tap <strong>+ Add Purchase</strong> &rarr; search and select a supplier &rarr; add items with QTY, description, pack size, and cost price &rarr; enter the invoice reference number &rarr; choose Cash Paid or Buy on Credit &rarr; Save.</p>

      <h4>Examples</h4>
      <p>&#x1f6cd;&#xfe0f; <em>You buy 5 cartons of rice (24 packs each) at $120 per carton from Kamwatie, paying cash:</em> Select "Kamwatie" &rarr; Cash Paid &rarr; add row: QTY=5, Description="Rice", PackSize=24&times;1kg, Cost=$120 &rarr; Ref="INV-001" &rarr; Save. Stock increases by 120 units (5&times;24). A Cash OUT of $600 is created automatically.</p>
      <p>&#x1f6cd;&#xfe0f; <em>You buy on credit from Tikanboi:</em> Same steps but choose "Buy on Credit" &rarr; set due date. No cash leaves, but the amount is added to Tikanboi's creditor balance.</p>

      <h4>Key Features</h4>
      <p>&#x1f4f8; <strong>Receipt Photo</strong> &mdash; take a photo of the supplier's invoice as proof of purchase.</p>
      <p>&#x26a0;&#xfe0f; <strong>Cash Balance Check</strong> &mdash; if the total exceeds your current cash balance, the app warns you and suggests using credit instead.</p>
      <p>&#x1f4e6; <strong>Auto Stock Update</strong> &mdash; stock levels in Inventory increase automatically based on QTY &times; Pack Unit.</p>
    `
  },
  { 
    name: 'ADVANCED ORDERS',
    component: AdvanceOrders,
    helpContent: `
      <h3>Advanced Orders</h3>
      <p>Advanced Orders are customer orders that are paid for in advance before the goods are delivered or collected. Each entry here represents a customer who has given you money upfront for products they have ordered.</p>

      <h4>How It Works</h4>
      <p>New advance order customers are created from the <strong>Cash Record</strong> section &mdash; tap <strong>+ Add Entry</strong> &rarr; Cash IN &rarr; select &ldquo;Others&rdquo; as the source &rarr; choose <strong>Create New Customer Advanced Order</strong>. This records the cash received and adds the customer to this list at the same time.</p>

      <h4>Viewing an Order</h4>
      <p>Tap any customer card to open their profile. The <strong>Details</strong> tab shows their contact information and the <strong>Debt History</strong> tab shows a full ledger of what was ordered, the advance paid, and any remaining balance.</p>

      <h4>Examples</h4>
      <p>&#x1f6d2; <em>A customer places an advance order for $150 of groceries and pays upfront:</em> Record the payment in Cash Record &rarr; Cash IN &rarr; Others &rarr; Create New Customer Advanced Order &rarr; fill in their details and items ordered. The customer then appears here.</p>
      <p>&#x1f6d2; <em>You want to check which advance orders are still outstanding:</em> Browse the list here. Each card shows the customer name and remaining balance owed.</p>

      <h4>Sort &amp; Search</h4>
      <p>Use the search bar to find a customer by name. Use the sort button (&uarr;&darr;) to order by balance, due date, or most recently modified.</p>
    `
  },
  { 
    name: 'DEBTORS',          
    component: Debtors,
    helpContent: `
      <h3>Debtors</h3>
      <p>Debtors are customers who owe your business money because they bought on credit.</p>

      <h4>How It Works</h4>
      <p>When a customer buys on credit in Checkout, they become a debtor here automatically. Each debtor's card shows their total owed, total paid, and remaining balance.</p>

      <h4>Examples</h4>
      <p>&#x1f464; <em>John bought $200 of goods on credit last week. Today he pays back $100:</em> Open John's profile &rarr; Debt History tab &rarr; tap Deposit &rarr; enter $100 &rarr; optionally take a photo of the receipt &rarr; Save. His balance drops from $200 to $100. A Cash IN entry is created automatically.</p>
      <p>&#x1f464; <em>You want to check who owes you the most:</em> Tap the sort button (&uarr;&darr;) &rarr; choose "Balance: High to Low". The debtor with the highest unpaid amount appears first.</p>

      <h4>Debtor Profile Tabs</h4>
      <p><strong>Details</strong> &mdash; name, phone, email, address. Tap &#x270f;&#xfe0f; to edit. <strong>Debt History</strong> &mdash; every credit sale and every deposit (repayment), with dates and running balance.</p>

      <h4>Overdue Warning</h4>
      <p>If a debtor's repayment date has passed and they still owe money, they are flagged as overdue. You cannot sell to them on credit again until they clear their balance.</p>
    `
  },
  { 
    name: 'SUPPLIERS & CREDITORS',          
    component: Creditors,
    helpContent: `
      <h3>Suppliers &amp; Creditors</h3>
      <p>Suppliers are the businesses or people you buy your shop stock from. Creditors are suppliers or people your business owes money to because you bought on credit.</p>

      <h4>Adding Suppliers</h4>
      <p>Tap <strong>+ Supplier</strong> to register a new supplier with their name and contact details. Once added, they appear in the Purchase Record dropdown.</p>

      <h4>How Creditors Work</h4>
      <p>When you make a credit purchase in Purchase Record, the supplier becomes a creditor here automatically. Each creditor card shows total owed, total paid, and remaining balance.</p>

      <h4>Payment Reminders</h4>
      <p>Turn on Creditor Payment Reminders in Settings to receive alarm notifications at 8:30 AM, 12:00 PM, and 4:30 PM when you have outstanding creditor balances.</p>
    `
  },
  { 
    name: 'INVENTORY',        
    component: Inventory,
    helpContent: `
      <h3>Inventory</h3>
      <p>This page shows every product in your shop and how many units you have in stock right now.</p>

      <h4>How It Works</h4>
      <p>All products are listed alphabetically. Use the search box to find a product by name. Stock levels update automatically from sales and purchases.</p>

      <h4>Examples</h4>
      <p>&#x1f4e6; <em>You want to check if you need to reorder rice:</em> Search "Rice" &rarr; check the Quantity column. If it shows &#x1f7e1; Low Stock (1&ndash;5 units) or &#x1f534; Out of Stock (0 units), it's time to reorder.</p>
      <p>&#x1f4e6; <em>You want to see all products and their prices:</em> Just scroll through the table. Each row shows the product name, selling price, category, quantity, stock status, and barcode.</p>

      <h4>Stock Status Colours</h4>
      <p>&#x1f7e2; <strong>In Stock</strong> &mdash; more than 5 units. &#x1f7e1; <strong>Low Stock</strong> &mdash; 1 to 5 units remaining. &#x1f534; <strong>Out of Stock</strong> &mdash; 0 units, cannot be sold.</p>

      <h4>How Stock Changes</h4>
      <p>Stock goes <strong>down</strong> when you sell in Checkout. Stock goes <strong>up</strong> when you save a purchase in Purchase Record. To add new products or manually adjust stock, go to Settings.</p>
    `
  },
  {
    name: 'CASH RECONCILIATION',
    component: CashReconciliation,
    helpContent: `
      <h3>Cash Reconciliation</h3>
      <p>This page controls opening and closing the shop each business day. It ensures the physical cash in your drawer always matches what the system expects.</p>

      <h4>Opening the Day</h4>
      <p>At the start of trading, enter your <strong>Opening Float</strong> (the cash already in the drawer as change money) and tap <strong>Open Day</strong>. The app begins tracking all cash in and out from this point.</p>

      <h4>Live Cash Summary</h4>
      <p>While the day is open, the <strong>Live Cash Summary</strong> card shows: your opening float, total cash received today, total cash paid out today, and the <strong>Expected Cash</strong> that should currently be in the drawer.</p>

      <h4>Closing the Day</h4>
      <p>At the end of trading, physically count the cash in your drawer, enter the amount in <strong>Counted Cash</strong>, and tap <strong>Close Day</strong>. The app immediately shows whether you are <strong>&#x2705; Balanced</strong>, <strong>&#x26a0;&#xfe0f; Short</strong>, or <strong>&#x26a0;&#xfe0f; Surplus</strong>.</p>
      <p>If there is a discrepancy, a notes field appears and an explanation is <strong>required</strong> before the day can be closed.</p>

      <h4>Multiple Sessions</h4>
      <p>If you need to continue trading after closing (e.g. you forgot to record a sale), tap <strong>&#x1f513; Re-Open Shop</strong>. Each stretch of trading is saved as a separate session. The Records tab shows a full breakdown of every session, including who opened and closed each one, and the reconciliation note for each.</p>

      <h4>Reconciliation Notes</h4>
      <p>Each closed session shows a summary note: <em>&ldquo;Balanced&rdquo;</em>, <em>&ldquo;There was a shortage by $X and [name] says &lsquo;[reason]&rsquo;&rdquo;</em>, or a surplus equivalent. This creates a permanent, readable audit trail.</p>

      <h4>Business Day Cutoff</h4>
      <p>If your shop trades past midnight, set a <strong>Business Day Cutoff</strong> time in Settings &rarr; Cash Reconciliation. Sessions opened before the cutoff hour are automatically assigned to the previous business day, so overnight trading is correctly grouped.</p>

      <h4>Auto-Close</h4>
      <p>If a session is still open when the business day ends (cutoff passes), it is automatically closed and flagged as <strong>Unreconciled</strong>. You will see a warning banner on that record in the Records tab.</p>

      <h4>Records Tab</h4>
      <p>View all past daily records. Tap any record to see the full breakdown: every session, who opened and closed each one, float, expected cash, counted cash, the reconciliation note, and any checkout unlocks.</p>
    `
  },
  { 
    name: 'SETTINGS',         
    component: Settings,
    helpContent: `
      <h3>Settings</h3>
      <p>Manage your products, app appearance, notifications, and record forgotten transactions.</p>

      <h4>Appearance</h4>
      <p>Toggle between <strong>Dark Mode</strong> and <strong>Light Mode</strong>. Your choice is saved automatically.</p>

      <h4>Notifications</h4>
      <p>&#x1f4e6; <strong>Low Stock Alert</strong> &mdash; get notified when any product drops to 5 units or fewer so you can reorder in time.</p>
      <p>&#x1f4b3; <strong>Creditor Payment Reminder</strong> &mdash; alarm reminders at 8:30 AM, 12:00 PM, and 4:30 PM when you owe money to creditors.</p>

      <h4>Forgotten Entries</h4>
      <p>Use these when you forgot to record something on the day it happened:</p>
      <p>&#x1f6d2; <em>Example: You made a $50 cash sale yesterday but forgot to record it:</em> Tap "Record Forgotten Sale" &rarr; select the product and quantity &rarr; set yesterday's date &rarr; choose Cash &rarr; Save. It appears in Sales Record with the correct date.</p>
      <p>&#x1f4b5; <em>Example: You paid $100 for electricity 3 days ago:</em> Tap "Record Forgotten Cash Entry" &rarr; Cash OUT &rarr; amount $100 &rarr; set the date &rarr; Save.</p>

      <h4>Manage Inventory</h4>
      <p>Add new products (name, price, category, barcode), edit existing ones, update stock manually, or delete products no longer sold. Products added here are immediately available in Checkout.</p>
    `
  },
];

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);

  // ── Store open/close state ────────────────────────────────────────────────
  const [storeIsOpen, setStoreIsOpen] = useState(null);
  const [storeStatusLoading, setStoreStatusLoading] = useState(true);
  const [showClosedModal, setShowClosedModal] = useState(false);
  const [closedModalMessage, setClosedModalMessage] = useState('');
  const storeListenerRef = useRef(null); // Firebase real-time listener for daily_cash

  // ── Apply shop status from a daily_cash record (or absence of one) ────────
  const applyShopStatus = useCallback((rec) => {
    setStoreStatusLoading(false);
    if (!rec) {
      setStoreIsOpen(false);
      setClosedModalMessage('The shop has not been opened today. Please open the day in Cash Reconciliation before using the app.');
      setShowClosedModal(true);
    } else if (rec.status === 'closed') {
      setStoreIsOpen(false);
      setClosedModalMessage('The shop is currently closed. Please re-open the day in Cash Reconciliation to continue.');
      setShowClosedModal(true);
    } else {
      setStoreIsOpen(true);
      setStoreStatusLoading(false);
      setShowClosedModal(false);
    }
  }, []);

  // ── Subscribe to today's daily_cash doc in Firebase for real-time sync ────
  // This ensures that when ANY device closes/re-opens the shop, all other
  // devices immediately reflect the correct status — no refresh needed.
  const startStoreListener = useCallback(() => {
    if (storeListenerRef.current) return; // already listening
    const todayKey = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    try {
      storeListenerRef.current = onSnapshot(
        doc(db, 'daily_cash', todayKey),
        (snap) => {
          if (snap.exists()) {
            applyShopStatus({ id: snap.id, ...snap.data() });
          } else {
            applyShopStatus(null);
          }
        },
        (err) => {
          console.error('Store status listener error:', err);
          // On listener error, fall back to a one-time local read
          checkStoreStatus();
        }
      );
    } catch (err) {
      console.error('Could not start store listener:', err);
      checkStoreStatus();
    }
  }, [applyShopStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopStoreListener = useCallback(() => {
    if (storeListenerRef.current) {
      storeListenerRef.current();
      storeListenerRef.current = null;
    }
  }, []);

  // ── One-time async check (offline fallback / first load) ─────────────────
  const checkStoreStatus = useCallback(async () => {
    try {
      const todayStr = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      })();
      const allRecs = await dataService.getDailyCashRecords();
      const todayRec = (allRecs || []).find(r => r.business_date === todayStr);
      applyShopStatus(todayRec || null);
    } catch (e) {
      console.error('Error checking store status:', e);
      setStoreIsOpen(true);
      setStoreStatusLoading(false);
    }
  }, [applyShopStatus]);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await dataService.checkPersistedLogin();
      if (user) {
        setCurrentUser(user);
        setUserEmail(user.email);
    fetchUserFullName(user.email);
      }
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    if (currentUser) {
      // Immediate local check for fast feedback
      checkStoreStatus();
      // Real-time Firebase listener keeps status in sync across all devices
      startStoreListener();
    } else {
      stopStoreListener();
    }
    return () => { stopStoreListener(); };
  }, [currentUser, checkStoreStatus, startStoreListener, stopStoreListener]);

  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── Hardware back button ────────────────────────────────────────────────
  useEffect(() => {
    let listener;
    const setup = async () => {
      try {
        listener = await CapApp.addListener('backButton', ({ canGoBack }) => {
          const overlay = document.querySelector('.d-overlay, .sr-modal-overlay, .pr-modal-overlay, .st-modal-overlay, .modal-overlay');
          if (overlay) return;
          const confirmed = window.confirm('Close Kadaele Shopkeeper?');
          if (confirmed) CapApp.exitApp();
        });
      } catch (_) { /* not native */ }
    };
    setup();
    return () => { listener?.remove?.(); };
  }, []);

  const fetchUserFullName = async (email) => {
    try {
      const users = await dataService.getUsers();
      const match = users.find(u => u.username === email.split('@')[0]);
      if (match && match.fullName) setUserName(match.fullName);
      else setUserName(email.split('@')[0]);
    } catch { setUserName(email.split('@')[0]); }
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setUserEmail(user.email);
    fetchUserFullName(user.email);
  };

  const handleLogout = async () => {
    await dataService.logout();
    setCurrentUser(null);
    setUserEmail('');
    window.location.reload();
  };

  const navigateToPage = (index) => {
    setCurrentPageIndex(index);
    setShowMenuModal(false);
  };

  // Called by CashReconciliation when store opens/closes
  const handleStoreStatusChange = (isOpen) => {
    setStoreIsOpen(isOpen);
    if (!isOpen) {
      setClosedModalMessage('The shop is currently closed. Only Cash Reconciliation is accessible. Re-open the day there to continue using the app.');
      setShowClosedModal(true);
    } else {
      setShowClosedModal(false);
    }
  };

  // Closed modal OK → navigate to Cash Reconciliation + scroll to open button
  const handleClosedModalOk = () => {
    setShowClosedModal(false);
    setCurrentPageIndex(CASH_RECON_INDEX);
    setTimeout(() => {
      const btn = document.querySelector('.cr-btn-open, .cr-btn-reopen');
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.5)';
        setTimeout(() => { btn.style.boxShadow = ''; }, 2000);
      }
    }, 400);
  };

  // Page navigation — lock all pages except Cash Reconciliation & Settings when shop is closed
  const handlePageNavigation = (index) => {
    if (index === CASH_RECON_INDEX || index === SETTINGS_INDEX) {
      navigateToPage(index);
      return;
    }
    if (!storeIsOpen) {
      setClosedModalMessage('The shop must be open before you can use this page. Please open the day in Cash Reconciliation first.');
      setShowClosedModal(true);
      return;
    }
    navigateToPage(index);
  };

  if (isCheckingAuth) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{ color: 'white', fontSize: '18px' }}>Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  const CurrentPageComponent = PAGES[currentPageIndex].component;
  const currentHelpContent = PAGES[currentPageIndex].helpContent;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <img src="/kadaele-logo.png" alt="Kadaele Logo" className="header-logo" />
          <div className="header-text">
            <h1 className="header-title">Shopkeeper</h1>
            <span className="header-user">{userName || userEmail.split('@')[0]}</span>
          </div>
        </div>
        <div className="header-right">
          <span className="online-indicator">
            <span className={`online-dot${isOnline ? '' : ' offline-dot'}`}></span>
            {isOnline ? 'Online' : 'Offline'}
          </span>
          <button onClick={handleLogout} className="logout-btn" title="Logout">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <div className="page-navigation">
        <button
          onClick={() => {
            if (!storeIsOpen) {
              setShowClosedModal(true);
            } else {
              setShowHelpModal(true);
            }
          }}
          className="nav-icon-btn"
          aria-label="Help"
        >
          <HelpCircle size={24} />
        </button>
        <h2 className="page-title">{PAGES[currentPageIndex].name}</h2>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <button
            onClick={() => {
              if (!storeIsOpen) {
                setShowClosedModal(true);
              } else {
                setShowMenuModal(true);
              }
            }}
            className="nav-icon-btn"
            aria-label="Menu"
          >
            <Menu size={24} />
          </button>
        </div>
      </div>

      <main className="app-main">
        <CurrentPageComponent

          storeIsOpen={!!storeIsOpen}
          onStoreStatusChange={handleStoreStatusChange}
          onNavigate={handlePageNavigation}
        />
      </main>

      {/* ── Shop Closed Modal ── */}
      {!storeStatusLoading && showClosedModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'
        }}>
          <div style={{
            background:'var(--surface, #fff)', color:'var(--text-primary, #1a1a1a)',
            borderRadius:'16px', padding:'28px 24px', maxWidth:'360px', width:'100%',
            textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize:'48px', marginBottom:'12px' }}>&#x1f512;</div>
            <h3 style={{ margin:'0 0 12px', fontSize:'18px', fontWeight:700 }}>Shop is Closed</h3>
            <p style={{ margin:'0 0 20px', fontSize:'14px', lineHeight:'1.6', color:'var(--text-secondary, #666)' }}>
              {closedModalMessage}
            </p>
            <button
              onClick={handleClosedModalOk}
              style={{
                width:'100%', padding:'12px', fontSize:'15px', fontWeight:700,
                background:'linear-gradient(135deg, #667eea, #764ba2)', color:'#fff',
                border:'none', borderRadius:'10px', cursor:'pointer',
              }}
            >
              OK &mdash; Go to Cash Reconciliation
            </button>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className="modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Help</h2>
              <button className="modal-close-btn" onClick={() => setShowHelpModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body help-content" dangerouslySetInnerHTML={{ __html: currentHelpContent }} />
          </div>
        </div>
      )}

      {showMenuModal && (
        <div className="modal-overlay" onClick={() => setShowMenuModal(false)}>
          <div className="menu-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Navigate</h2>
              <button className="modal-close-btn" onClick={() => setShowMenuModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <div className="menu-list">
                {PAGES.map((page, index) => (
                  <button
                    key={index}
                    className={`menu-item${currentPageIndex === index ? ' active' : ''}${!storeIsOpen && index !== CASH_RECON_INDEX && index !== SETTINGS_INDEX ? ' menu-item-locked' : ''}`}
                    onClick={() => handlePageNavigation(index)}
                  >
                    {!storeIsOpen && index !== CASH_RECON_INDEX && index !== SETTINGS_INDEX ? '&#x1f512; ' : ''}{page.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
