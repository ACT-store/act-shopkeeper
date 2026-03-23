import { useState } from "react";

// KPA item values — used to detect when to auto-fill supplier
const KPA_VALUES = new Set([
  "kpa_wharfage_dues",
  "kpa_port_cargo_handling",
  "kpa_lighterage",
  "kpa_delivery_charges",
  "kpa_collection_charges",
  "kpa_trailer_detention",
  "kpa_express_release",
  "kpa_storage_charges",
]);

const KPA_SUPPLIER = "Kiribati Ports Authority (KPA)";

const categories = [
  {
    group: "Purchases & Inventory",
    icon: "🛒",
    items: [
      { value: "purchase", label: "1. PURCHASE" },
      { value: "tt_purchase", label: "2. TT PURCHASE" },
      { value: "koil", label: "3. KOIL" },
    ],
  },
  {
    group: "Transport & Logistics",
    icon: "🚚",
    items: [
      { value: "freight", label: "4. FREIGHT" },
      { value: "handling", label: "5. Handling" },
      { value: "toll_fare", label: "6. Toll fare" },
      { value: "hire", label: "7. Hire" },
      { value: "transport_expense", label: "8. TRANSPORT EXPENSE" },
      { value: "fuel", label: "9. FUEL" },
      { value: "fare", label: "10. FARE" },
      { value: "charter", label: "11. CHARTER" },
    ],
  },
  {
    group: "Government & Regulatory",
    icon: "🏛️",
    items: [
      { value: "customs", label: "12. CUSTOMS" },
      { value: "licence", label: "13. LICENCE" },
      { value: "klta", label: "14. KLTA (Kiribati Land Transport Authority)" },
      { value: "kpf", label: "15. KPF" },
      { value: "tax", label: "16. TAX" },
    ],
    subGroups: [
      {
        group: "Kiribati Ports Authority",
        icon: "⚓",
        autoSupplier: KPA_SUPPLIER,
        items: [
          { value: "kpa_wharfage_dues", label: "17. Wharfage Dues" },
          { value: "kpa_port_cargo_handling", label: "18. Port Cargo Handling Services" },
          { value: "kpa_lighterage", label: "19. Lighterage" },
          { value: "kpa_delivery_charges", label: "20. Delivery Charges" },
          { value: "kpa_collection_charges", label: "21. Collection Charges" },
          { value: "kpa_trailer_detention", label: "22. Trailer Detention" },
          { value: "kpa_express_release", label: "23. Express Release" },
          { value: "kpa_storage_charges", label: "24. Storage Charges" },
        ],
      },
    ],
  },
  {
    group: "Utilities & Communications",
    icon: "📡",
    items: [
      { value: "vodafone", label: "25. Vodafone" },
      { value: "ocean_link", label: "26. Ocean Link" },
      { value: "pub", label: "27. PUB" },
    ],
  },
  {
    group: "Staff & Labour",
    icon: "👷",
    items: [
      { value: "wages", label: "28. WAGES" },
      { value: "contractors_payment", label: "29. Contractor's payment" },
      { value: "staff_salaries", label: "30. Staff Salaries" },
    ],
  },
  {
    group: "Professional & Administrative",
    icon: "📋",
    items: [
      { value: "sposh", label: "31. Sinita POS Hub (SPOSH)" },
      { value: "accounts", label: "32. ACCOUNTS" },
      { value: "stationery", label: "33. STATIONERY" },
      { value: "bank_charges", label: "34. BANK CHARGES" },
    ],
  },
  {
    group: "Property",
    icon: "🏠",
    items: [
      { value: "rent", label: "35. RENT" },
    ],
  },
  {
    group: "Construction",
    icon: "🏗️",
    items: [
      { value: "constructions", label: "36. Constructions" },
      { value: "local_charge", label: "37. Local Charge" },
    ],
  },
  {
    group: "Community & Social",
    icon: "🤝",
    items: [
      { value: "community_support", label: "38. Community Support" },
      { value: "donation", label: "39. Donation" },
    ],
  },
  {
    group: "Finance",
    icon: "💳",
    items: [
      { value: "loan_installment", label: "40. Loan Installment" },
    ],
  },
  {
    group: "Miscellaneous",
    icon: "📦",
    items: [
      { value: "others", label: "41. OTHERS" },
    ],
  },
];

// Flatten all items including sub-groups for lookup
const allItems = categories.flatMap((c) => [
  ...c.items,
  ...(c.subGroups?.flatMap((sg) => sg.items) ?? []),
]);

export default function AddExpenseModal() {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [supplierLocked, setSupplierLocked] = useState(false);
  const [knownSuppliers, setKnownSuppliers] = useState([KPA_SUPPLIER]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [otherExpense, setOtherExpense] = useState("");

  const selectedLabel = allItems.find((i) => i.value === selectedCategory)?.label;
  const isKPA = KPA_VALUES.has(selectedCategory);

  // Filter logic — includes subGroups
  const applySearch = (q) => {
    if (!q.trim()) return categories;
    return categories
      .map((cat) => {
        const matchedItems = cat.items.filter((i) =>
          i.label.toLowerCase().includes(q.toLowerCase())
        );
        const matchedSubGroups = (cat.subGroups ?? [])
          .map((sg) => ({
            ...sg,
            items: sg.items.filter((i) =>
              i.label.toLowerCase().includes(q.toLowerCase())
            ),
          }))
          .filter((sg) => sg.items.length > 0);
        return { ...cat, items: matchedItems, subGroups: matchedSubGroups };
      })
      .filter((cat) => cat.items.length > 0 || (cat.subGroups ?? []).length > 0);
  };

  const filtered = applySearch(search);

  const handleCategorySelect = (value, autoSupplierName) => {
    setSelectedCategory(value);
    if (value !== "others") setOtherExpense("");

    if (autoSupplierName) {
      // Auto-create supplier if not already known
      if (!knownSuppliers.includes(autoSupplierName)) {
        setKnownSuppliers((prev) => [...prev, autoSupplierName]);
      }
      setSupplier(autoSupplierName);
      setSupplierLocked(true);
    } else {
      // Only clear the lock if it was previously auto-set by KPA
      if (supplierLocked) {
        setSupplier("");
        setSupplierLocked(false);
      }
    }
    setIsDropdownOpen(false);
    setSearch("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const categoryDisplay =
      selectedCategory === "others" && otherExpense
        ? `OTHERS — ${otherExpense}`
        : selectedLabel;
    alert(
      `Expense submitted!\nCategory: ${categoryDisplay}\nPaid to: ${supplier || "—"}\nAmount: $${amount}`
    );
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f0f4f8" }}>
        <button
          onClick={() => setIsOpen(true)}
          style={{
            background: "#1a5c38", color: "#fff", border: "none",
            borderRadius: "12px", padding: "14px 28px", fontSize: "16px",
            fontFamily: "'Georgia', serif", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "8px",
            boxShadow: "0 4px 16px rgba(26,92,56,0.3)",
          }}
        >
          💸 Add Expense
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(10,20,15,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "16px",
        fontFamily: "'Georgia', serif",
      }}
      onClick={() => setIsDropdownOpen(false)}
    >
      <div
        style={{
          background: "#fff", borderRadius: "20px",
          width: "100%", maxWidth: "500px",
          maxHeight: "95vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          animation: "slideUp 0.25s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #1a5c38 0%, #2d8a58 100%)",
          padding: "24px 28px 20px", position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "22px", fontWeight: "bold", color: "#fff", letterSpacing: "-0.3px" }}>
                💸 Add Expense
              </div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", marginTop: "2px" }}>
                Cash Payments Journal — CPJ25
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: "rgba(255,255,255,0.15)", border: "none",
                borderRadius: "50%", width: "34px", height: "34px",
                color: "#fff", fontSize: "18px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >×</button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "24px 28px 28px" }}>

          {/* Date + Amount */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label style={labelStyle}>Date <span style={{ color: "#e05252" }}>*</span></label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Amount ($) <span style={{ color: "#e05252" }}>*</span></label>
              <input
                type="number" placeholder="0.00" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required min="0" step="0.01" style={inputStyle}
              />
            </div>
          </div>

          {/* Category Dropdown */}
          <div style={{ marginBottom: "16px", position: "relative" }}>
            <label style={labelStyle}>Select Category <span style={{ color: "#e05252" }}>*</span></label>
            <div
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={{
                ...inputStyle, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                userSelect: "none",
                color: selectedLabel ? "#1a1a1a" : "#9ca3af",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {isKPA && <span>⚓</span>}
                {selectedLabel || "Choose a category..."}
              </span>
              <span style={{ fontSize: "12px", color: "#6b7280", transition: "transform 0.2s", transform: isDropdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
            </div>

            {isDropdownOpen && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999,
                background: "#fff", border: "1.5px solid #e2e8f0",
                borderRadius: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
                marginTop: "4px", overflow: "hidden",
              }}>
                {/* Search */}
                <div style={{ padding: "10px 12px", borderBottom: "1px solid #f0f4f8" }}>
                  <input
                    type="text" placeholder="🔍 Search categories..."
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()} autoFocus
                    style={{
                      width: "100%", border: "1px solid #e2e8f0", borderRadius: "8px",
                      padding: "7px 10px", fontSize: "13px", fontFamily: "'Georgia', serif",
                      outline: "none", boxSizing: "border-box", background: "#f8fafc",
                    }}
                  />
                </div>

                {/* Options */}
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {filtered.map((cat) => (
                    <div key={cat.group}>
                      {/* Group header */}
                      <div style={groupHeaderStyle}>
                        <span>{cat.icon}</span> {cat.group}
                      </div>

                      {/* Group items */}
                      {cat.items.map((item) => (
                        <OptionRow
                          key={item.value}
                          item={item}
                          selected={selectedCategory === item.value}
                          onSelect={() => handleCategorySelect(item.value, null)}
                          indent={28}
                        />
                      ))}

                      {/* Sub-groups (e.g. Kiribati Ports Authority) */}
                      {(cat.subGroups ?? []).map((sg) => (
                        <div key={sg.group}>
                          <div style={{
                            ...groupHeaderStyle,
                            paddingLeft: "28px",
                            background: "#f0f7ff",
                            color: "#1d4ed8",
                            borderTop: "1px dashed #bfdbfe",
                            borderBottom: "1px dashed #bfdbfe",
                          }}>
                            <span>{sg.icon}</span> {sg.group}
                            <span style={{
                              marginLeft: "auto", fontSize: "10px",
                              background: "#dbeafe", color: "#1d4ed8",
                              borderRadius: "4px", padding: "1px 6px",
                              fontWeight: "normal", textTransform: "none",
                              letterSpacing: 0,
                            }}>
                              under Govt &amp; Regulatory
                            </span>
                          </div>
                          {sg.items.map((item) => (
                            <OptionRow
                              key={item.value}
                              item={item}
                              selected={selectedCategory === item.value}
                              onSelect={() => handleCategorySelect(item.value, sg.autoSupplier)}
                              indent={42}
                              accent="#1d4ed8"
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}

                  {filtered.length === 0 && (
                    <div style={{ padding: "20px", textAlign: "center", color: "#9ca3af", fontSize: "13px" }}>
                      No categories found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* "Others" specify field */}
          {selectedCategory === "others" && (
            <div style={{ marginBottom: "16px", animation: "slideDown 0.2s ease" }}>
              <label style={{ ...labelStyle, color: "#b45309" }}>
                Specify Expense <span style={{ color: "#e05252" }}>*</span>
              </label>
              <div style={{ position: "relative" }}>
                <span style={{
                  position: "absolute", left: "13px", top: "50%",
                  transform: "translateY(-50%)", fontSize: "15px", pointerEvents: "none",
                }}>✏️</span>
                <input
                  type="text"
                  placeholder="Describe the expense not listed above..."
                  value={otherExpense}
                  onChange={(e) => setOtherExpense(e.target.value)}
                  required autoFocus
                  style={{ ...inputStyle, paddingLeft: "38px", border: "1.5px solid #f59e0b", background: "#fffbeb", color: "#92400e" }}
                />
              </div>
              <div style={{ fontSize: "11.5px", color: "#b45309", marginTop: "5px", display: "flex", alignItems: "center", gap: "4px" }}>
                ⚠️ Please be specific — this will be recorded under <strong>OTHERS</strong>
              </div>
            </div>
          )}

          {/* Paid to */}
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>
              Paid To
              {isKPA && (
                <span style={{
                  marginLeft: "8px", fontSize: "10px", fontWeight: "normal",
                  background: "#dbeafe", color: "#1d4ed8",
                  borderRadius: "4px", padding: "2px 7px",
                  textTransform: "none", letterSpacing: 0,
                }}>
                  ⚓ Auto-filled from KPA
                </span>
              )}
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Enter supplier / payee name..."
                value={supplier}
                onChange={(e) => {
                  if (!supplierLocked) setSupplier(e.target.value);
                }}
                readOnly={supplierLocked}
                style={{
                  ...inputStyle,
                  paddingRight: supplierLocked ? "90px" : "14px",
                  background: supplierLocked ? "#eff6ff" : "#fafafa",
                  border: supplierLocked ? "1.5px solid #93c5fd" : "1.5px solid #e2e8f0",
                  color: supplierLocked ? "#1d4ed8" : "#1a1a1a",
                  cursor: supplierLocked ? "default" : "text",
                }}
              />
              {supplierLocked && (
                <button
                  type="button"
                  onClick={() => { setSupplier(""); setSupplierLocked(false); }}
                  title="Clear auto-fill"
                  style={{
                    position: "absolute", right: "10px", top: "50%",
                    transform: "translateY(-50%)",
                    background: "#bfdbfe", border: "none",
                    borderRadius: "6px", padding: "3px 8px",
                    fontSize: "11px", color: "#1d4ed8",
                    cursor: "pointer", fontFamily: "'Georgia', serif",
                  }}
                >
                  ✕ Clear
                </button>
              )}
            </div>
            {supplierLocked && (
              <div style={{ fontSize: "11.5px", color: "#2563eb", marginTop: "5px", display: "flex", alignItems: "center", gap: "4px" }}>
                ✅ Supplier <strong>{KPA_SUPPLIER}</strong> auto-created &amp; filled
              </div>
            )}
          </div>

          {/* Particulars */}
          <div style={{ marginBottom: "24px" }}>
            <label style={labelStyle}>Particulars / Description</label>
            <textarea
              placeholder="Add notes or details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical", lineHeight: "1.5" }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button" onClick={() => setIsOpen(false)}
              style={{
                flex: 1, padding: "13px", background: "#f1f5f9", border: "none",
                borderRadius: "10px", fontSize: "14px", fontFamily: "'Georgia', serif",
                color: "#64748b", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                flex: 2, padding: "13px",
                background: "linear-gradient(135deg, #1a5c38, #2d8a58)",
                border: "none", borderRadius: "10px",
                fontSize: "15px", fontFamily: "'Georgia', serif",
                color: "#fff", cursor: "pointer", fontWeight: "bold",
                boxShadow: "0 4px 14px rgba(26,92,56,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              }}
            >
              💸 Save Expense
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input[type="date"]::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
}

// Reusable option row
function OptionRow({ item, selected, onSelect, indent = 28, accent = "#1a5c38" }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: `9px 14px 9px ${indent}px`,
        fontSize: "13.5px", cursor: "pointer",
        color: selected ? accent : "#374151",
        background: selected ? (accent === "#1a5c38" ? "#f0faf4" : "#eff6ff") : hovered ? "#f8faf9" : "transparent",
        fontWeight: selected ? "600" : "normal",
        transition: "background 0.1s",
        display: "flex", alignItems: "center", gap: "6px",
      }}
    >
      {selected && <span style={{ fontSize: "10px", color: accent }}>✔</span>}
      {item.label}
    </div>
  );
}

const groupHeaderStyle = {
  padding: "8px 14px 4px",
  fontSize: "11px", fontWeight: "bold",
  color: "#1a5c38", textTransform: "uppercase",
  letterSpacing: "0.8px", background: "#f8faf9",
  display: "flex", alignItems: "center", gap: "6px",
  borderTop: "1px solid #f0f4f0",
};

const labelStyle = {
  display: "block", fontSize: "12px", fontWeight: "bold",
  color: "#374151", marginBottom: "6px",
  textTransform: "uppercase", letterSpacing: "0.5px",
};

const inputStyle = {
  width: "100%", border: "1.5px solid #e2e8f0",
  borderRadius: "10px", padding: "10px 14px",
  fontSize: "14px", fontFamily: "'Georgia', serif",
  outline: "none", boxSizing: "border-box",
  background: "#fafafa", color: "#1a1a1a",
  transition: "border-color 0.2s",
};
