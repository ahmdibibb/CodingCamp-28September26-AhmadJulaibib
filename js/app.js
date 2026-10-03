// js/app.js — Expense Budget Visualizer
// Application logic — unidirectional data flow: Action → Mutate State → Persist → Render

'use strict';

// ============================================================
// DATA MODELS (shapes documented as JSDoc-style comments)
// ============================================================

/**
 * @typedef {Object} Transaction
 * @property {string}  id       - Unique identifier (crypto.randomUUID() or Date.now() fallback)
 * @property {string}  name     - Item name, 1–100 characters, as entered by the user
 * @property {number}  amount   - Numeric amount, rounded to 2 decimal places (e.g. 12.50)
 * @property {string}  category - One of: "Food" | "Transport" | "Fun"
 * @property {string}  date     - ISO 8601 date string "YYYY-MM-DD" (submission date)
 */

/**
 * @typedef {Object} MonthGroup
 * @property {string} key   - "YYYY-MM" string used for sorting (e.g. "2026-10")
 * @property {string} label - Human-readable label (e.g. "October 2026")
 * @property {number} total - Sum of all transaction amounts for that month
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean}  valid  - Whether all fields passed validation
 * @property {string[]} errors - Human-readable error messages, one per invalid field
 */

// ============================================================
// APPLICATION STATE
// ============================================================

/**
 * Single source of truth for all application state.
 * Every user action mutates this object, then triggers persist() and render.
 *
 * @type {{
 *   transactions:  Transaction[],
 *   balance:       number,
 *   sortCriterion: string|null,
 *   spendingLimit: number|null,
 *   view:          "list"|"summary",
 *   chartInstance: import("chart.js").Chart|null
 * }}
 */
const AppState = {
  transactions:  [],       // source of truth; mutated in memory, persisted after each change
  balance:       0,        // running sum of all transaction amounts
  sortCriterion: null,     // active sort key: "amount-asc" | "amount-desc" | "category-asc" | null
  spendingLimit: null,     // user-set threshold for highlight; null = no limit active
  view:          'list',   // "list" shows transaction list; "summary" shows monthly breakdown
  chartInstance: null,     // Chart.js Pie instance — reused across renders to avoid flicker
};

// ============================================================
// UTILITY — ID GENERATION  (Requirement 6.1)
// ============================================================

/**
 * Generates a unique transaction ID.
 * Prefers the cryptographically-random crypto.randomUUID() API;
 * falls back to Date.now().toString() in environments that don't support it.
 *
 * @returns {string} A unique ID string
 */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random suffix to reduce collision risk
  return Date.now().toString() + Math.random().toString(36).slice(2);
}

// ============================================================
// UTILITY — ERROR BANNER
// ============================================================

/**
 * Displays a message in the #app-error banner and auto-dismisses after 5 seconds.
 *
 * @param {string} message - The error message to display
 */
function showErrorBanner(message) {
  const banner = document.getElementById('app-error');
  if (!banner) return;

  banner.textContent = message;
  banner.removeAttribute('hidden');

  // Clear any existing auto-dismiss timer
  if (showErrorBanner._timerId) {
    clearTimeout(showErrorBanner._timerId);
  }
  showErrorBanner._timerId = setTimeout(() => {
    banner.setAttribute('hidden', '');
    banner.textContent = '';
    showErrorBanner._timerId = null;
  }, 5000);
}

// ============================================================
// PERSISTENCE  (Requirements 4.1 – 4.7)
// ============================================================

/** LocalStorage key constants */
const STORAGE_KEYS = {
  TRANSACTIONS: 'expense_transactions',
  BALANCE:      'expense_balance',
};

/** Required fields every Transaction entry must possess */
const TRANSACTION_REQUIRED_FIELDS = ['id', 'name', 'amount', 'category', 'date'];

/**
 * Persists the current AppState to localStorage.
 *
 * Serializes AppState.transactions → localStorage["expense_transactions"]
 * Serializes AppState.balance     → localStorage["expense_balance"]
 *
 * Returns true on success; false on QuotaExceededError or any other storage error.
 * (Requirement 4.1, 4.2, 4.3)
 *
 * @returns {boolean} true if persisted successfully, false otherwise
 */
function persist() {
  try {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(AppState.transactions));
    localStorage.setItem(STORAGE_KEYS.BALANCE, JSON.stringify(AppState.balance));
    return true;
  } catch (err) {
    // QuotaExceededError is the most common failure; catch all to be safe
    console.error('[persist] localStorage write failed:', err);
    return false;
  }
}

/**
 * Loads persisted state from localStorage on application startup.
 *
 * Behaviour:
 * - Absent / null / empty key         → returns { transactions: [], balance: 0 }
 * - JSON.parse failure (SyntaxError)  → clears key, shows error banner, returns empty state
 * - Valid JSON but malformed entries  → discards entries missing required fields, keeps rest
 * (Requirements 4.4, 4.5, 4.6, 4.7)
 *
 * @returns {{ transactions: Transaction[], balance: number }}
 */
function loadFromStorage() {
  const emptyState = { transactions: [], balance: 0 };

  // --- Read raw value ---
  const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);

  // Absent, null, or empty string → no stored data, start fresh (Req 4.5)
  if (raw === null || raw.trim() === '') {
    return emptyState;
  }

  // --- Deserialize ---
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Corrupted / unparseable JSON (Req 4.7)
    console.warn('[loadFromStorage] Corrupted data in localStorage; clearing key.', err);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    showErrorBanner('Saved data could not be loaded and has been cleared. Starting fresh.');
    return emptyState;
  }

  // --- Structural validation: must be an array ---
  if (!Array.isArray(parsed)) {
    console.warn('[loadFromStorage] Stored value is not an array; discarding.');
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    showErrorBanner('Saved data could not be loaded and has been cleared. Starting fresh.');
    return emptyState;
  }

  // --- Field-level validation: discard malformed entries (Req 4.7) ---
  const validTransactions = parsed.filter((entry) => {
    const hasAllFields = TRANSACTION_REQUIRED_FIELDS.every(
      (field) => Object.prototype.hasOwnProperty.call(entry, field) && entry[field] !== undefined && entry[field] !== null
    );
    if (!hasAllFields) {
      console.warn('[loadFromStorage] Discarding malformed transaction entry:', entry);
    }
    return hasAllFields;
  });

  // --- Compute balance from valid transactions (Req 4.4) ---
  const balance = validTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  return { transactions: validTransactions, balance };
}

// ============================================================
// VALIDATION  (Requirements 1.3, 1.4)
// ============================================================

/** Valid category values */
const VALID_CATEGORIES = ['Food', 'Transport', 'Fun'];

/**
 * Validates the three transaction form fields.
 *
 * Rules:
 * - name:     non-empty string, at most 100 characters
 * - amount:   numeric, within [0.01, 999999.99]
 * - category: one of VALID_CATEGORIES
 *
 * All failing fields are reported — the function never short-circuits after the
 * first error so that the UI can display every applicable message at once.
 *
 * @param {string} name
 * @param {string|number} amount
 * @param {string} category
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateInput(name, amount, category) {
  const errors = [];

  // --- Name validation ---
  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (trimmedName.length === 0) {
    errors.push('Item name is required.');
  } else if (trimmedName.length > 100) {
    errors.push('Item name must be 100 characters or fewer.');
  }

  // --- Amount validation ---
  const numericAmount = parseFloat(amount);
  if (amount === '' || amount === null || amount === undefined || isNaN(numericAmount)) {
    errors.push('Amount must be a valid number.');
  } else if (numericAmount < 0.01 || numericAmount > 999999.99) {
    errors.push('Amount must be between 0.01 and 999,999.99.');
  }

  // --- Category validation ---
  if (!VALID_CATEGORIES.includes(category)) {
    errors.push('Please select a valid category (Food, Transport, or Fun).');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================
// TRANSACTION MUTATION  (Requirements 1.5, 1.6, 6.1)
// ============================================================

/**
 * Creates a new Transaction from validated form values, prepends it to
 * AppState.transactions, persists, and re-renders the UI.
 *
 * The amount is rounded to exactly 2 decimal places via:
 *   parseFloat(parseFloat(amount).toFixed(2))
 *
 * The date is captured as today's local calendar date in "YYYY-MM-DD" format.
 *
 * @param {string} name
 * @param {string|number} amount
 * @param {string} category
 */
function addTransaction(name, amount, category) {
  const today = new Date();
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');

  /** @type {Transaction} */
  const transaction = {
    id:       generateId(),
    name:     name,
    amount:   parseFloat(parseFloat(amount).toFixed(2)),
    category: category,
    date:     `${yyyy}-${mm}-${dd}`,
  };

  // Prepend so the newest entry is always at index 0 (reverse-chronological)
  AppState.transactions.unshift(transaction);

  // recalculateBalance() also calls persist() internally (Requirement 4.3)
  recalculateBalance();
  renderAll();
}

/**
 * Resets the transaction input form to its default empty state.
 * Clears #item-name, #amount, resets #category to the default option,
 * and empties the #form-errors container.
 */
function resetForm() {
  const nameField   = document.getElementById('item-name');
  const amountField = document.getElementById('amount');
  const categoryEl  = document.getElementById('category');
  const errorsEl    = document.getElementById('form-errors');

  if (nameField)   nameField.value = '';
  if (amountField) amountField.value = '';
  if (categoryEl)  categoryEl.selectedIndex = 0;
  if (errorsEl)    errorsEl.textContent = '';
}

// ============================================================
// DELETE TRANSACTION  (Requirement 2.6)
// ============================================================

/**
 * Removes the transaction identified by `id` from AppState.transactions,
 * persists the change, and re-renders the UI.
 *
 * On persist failure the in-memory list is restored to its pre-deletion state
 * and an error message is shown in the #app-error banner.
 *
 * @param {string} id - The unique ID of the transaction to remove
 */
function handleDeleteTransaction(id) {
  // Keep a copy so we can roll back if the storage write fails
  const backup = [...AppState.transactions];

  // Remove the target transaction
  AppState.transactions = AppState.transactions.filter((tx) => tx.id !== id);

  // Recalculate balance BEFORE persisting so stored balance reflects the deletion
  recalculateBalance();

  const success = persist();

  if (!success) {
    // Roll back the in-memory state AND the balance
    AppState.transactions = backup;
    recalculateBalance();
    showErrorBanner('Could not save changes. The transaction was not deleted.');
    return;
  }

  renderAll();
}

// ============================================================
// BALANCE CALCULATION AND RENDERING  (Requirements 3.1–3.4, 4.3)
// ============================================================

/**
 * Recalculates AppState.balance by summing all transaction amounts,
 * then persists the updated balance to localStorage["expense_balance"].
 *
 * Uses Array.prototype.reduce to accumulate the total; treats any
 * non-numeric amount as 0 to guard against corrupted data.
 *
 * (Requirements 3.2, 3.3, 3.4, 4.3)
 */
function recalculateBalance() {
  AppState.balance = AppState.transactions.reduce(
    (sum, tx) => sum + (Number(tx.amount) || 0),
    0
  );
  persist();
}

/**
 * Formats `balance` as "$X.XX" and writes it to the #balance-display element.
 *
 * @param {number} balance - The numeric balance value to display
 * (Requirements 3.1, 3.4)
 */
function renderBalance(balance) {
  const el = document.getElementById('balance-display');
  if (!el) return;
  el.textContent = 'Rp' + balance.toFixed(2);
}

// ============================================================
// TRANSACTION SORTING  (Requirements 7.1, 7.2, 7.3, 7.4)
// ============================================================

/**
 * Returns a new sorted copy of the transactions array according to the given criterion.
 * Never mutates the input array.
 *
 * Supported criteria:
 *   "amount-asc"   — ascending by amount
 *   "amount-desc"  — descending by amount
 *   "category-asc" — alphabetical by category (case-insensitive)
 *   null           — reverse-chronological insertion order (highest array index = most recent = first)
 *
 * Tiebreaker for all non-null criteria: reverse-chronological insertion order
 * (higher original array index = more recent = appears first in output).
 *
 * @param {Transaction[]} transactions - Source array (not mutated)
 * @param {string|null}   criterion    - One of "amount-asc", "amount-desc", "category-asc", or null
 * @returns {Transaction[]} A new sorted array
 */
function sortTransactions(transactions, criterion) {
  // null criterion → reverse-chronological copy (reverse of current array order,
  // since addTransaction() unshifts so index 0 is already the newest).
  // The array is already in newest-first order; just return a shallow copy.
  if (criterion === null || criterion === undefined) {
    return transactions.slice();
  }

  // Tag each entry with its original index so the tiebreaker is stable and efficient
  const indexed = transactions.map((tx, i) => ({ tx, i }));

  indexed.sort((a, b) => {
    let primary = 0;

    if (criterion === 'amount-asc') {
      primary = a.tx.amount - b.tx.amount;
    } else if (criterion === 'amount-desc') {
      primary = b.tx.amount - a.tx.amount;
    } else if (criterion === 'category-asc') {
      primary = a.tx.category.toLowerCase().localeCompare(b.tx.category.toLowerCase());
    }

    if (primary !== 0) return primary;

    // Tiebreaker: higher original index (more recently added) comes first
    return b.i - a.i;
  });

  return indexed.map((entry) => entry.tx);
}

// ============================================================
// TRANSACTION LIST RENDERING  (Requirements 2.1, 2.4, 2.5, 2.7, 2.8, 8.3, 8.6)
// ============================================================

/**
 * Fully re-renders the #transaction-list DOM element from the provided
 * transactions array.
 *
 * Behaviour:
 * - Empties the container on every call (full re-render strategy)
 * - If transactions.length === 0: renders an empty-state <p> message (Req 2.7)
 * - Otherwise: iterates the array in the order supplied (already reverse-chronological
 *   via unshift; sorted by sortTransactions() when a criterion is active) and builds
 *   a <div class="transaction-item"> per entry (Req 2.1, 2.8)
 * - Each card contains: item name, "$X.XX" amount, category badge, delete button (Req 2.1, 2.5)
 * - Applies .highlight when spending limit is active AND tx.amount strictly exceeds it (Req 8.3, 8.6)
 *
 * @param {Transaction[]} transactions - The array of transactions to render
 */
function renderTransactionList(transactions) {
  const listEl = document.getElementById('transaction-list');
  if (!listEl) return;

  // Clear the container (Req 2.4 — full re-render on every state change)
  listEl.innerHTML = '';

  // --- Empty state (Req 2.7) ---
  if (transactions.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-state';
    emptyMsg.textContent = 'No transactions to show.';
    listEl.appendChild(emptyMsg);
    return;
  }

  // --- Apply sort criterion (design: sorter section, Requirements 7.2, 7.3) ---
  const displayList = sortTransactions(transactions, AppState.sortCriterion);

  // --- Render each transaction card ---
  displayList.forEach((tx) => {
    // Outer card div
    const itemEl = document.createElement('div');
    itemEl.className = 'transaction-item';

    // Apply highlight when limit is active and amount strictly exceeds it (Req 8.3, 8.6)
    if (AppState.spendingLimit !== null && tx.amount > AppState.spendingLimit) {
      itemEl.classList.add('highlight');
    }

    // --- Info block (name + meta row) ---
    const infoEl = document.createElement('div');
    infoEl.className = 'transaction-info';

    // Item name
    const nameEl = document.createElement('div');
    nameEl.className = 'transaction-name';
    nameEl.textContent = tx.name;

    // Meta row: amount + category badge
    const metaEl = document.createElement('div');
    metaEl.className = 'transaction-meta';

    const amountEl = document.createElement('span');
    amountEl.className = 'transaction-amount';
    amountEl.textContent = 'Rp' + tx.amount.toFixed(2);  // Req 2.1 — two decimal places

    const badgeEl = document.createElement('span');
    badgeEl.className = 'category-badge';
    badgeEl.textContent = tx.category;

    metaEl.appendChild(amountEl);
    metaEl.appendChild(badgeEl);

    infoEl.appendChild(nameEl);
    infoEl.appendChild(metaEl);

    // --- Delete button (Req 2.5) ---
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-delete';
    deleteBtn.setAttribute('aria-label', 'Delete transaction: ' + tx.name);
    deleteBtn.textContent = '✕';
    // Wire to handleDeleteTransaction with the transaction's id (Req 2.6)
    deleteBtn.addEventListener('click', function () {
      handleDeleteTransaction(tx.id);
    });

    // Assemble the card
    itemEl.appendChild(infoEl);
    itemEl.appendChild(deleteBtn);

    listEl.appendChild(itemEl);
  });
}

// ============================================================
// PIE CHART  (Requirements 5.1 – 5.6)
// ============================================================

/**
 * Aggregates transaction amounts by category.
 * Only categories with a total > 0 are included in the result.
 *
 * @param {Transaction[]} transactions
 * @returns {{ [category: string]: number }}  e.g. { Food: 12.50, Transport: 8.00 }
 */
function aggregateByCategory(transactions) {
  const totals = {};

  transactions.forEach((tx) => {
    if (!totals[tx.category]) {
      totals[tx.category] = 0;
    }
    totals[tx.category] += Number(tx.amount) || 0;
  });

  // Keep only categories with a positive total (Req 5.2 — one segment per category
  // with at least one transaction)
  const result = {};
  Object.keys(totals).forEach((cat) => {
    if (totals[cat] > 0) {
      result[cat] = totals[cat];
    }
  });

  return result;
}

/**
 * Renders (or updates) the spending pie chart inside #spending-chart.
 *
 * Three rendering modes:
 *  1. Chart.js unavailable  → show fallback text (Req 5.1)
 *  2. No transactions       → destroy existing instance, show #chart-placeholder (Req 5.6)
 *  3. Has transactions      → create or update Chart.js Pie instance (Req 5.2–5.5)
 *
 * @param {Transaction[]} transactions
 */
function renderChart(transactions) {
  const canvas      = document.getElementById('spending-chart');
  const placeholder = document.getElementById('chart-placeholder');

  // --- Mode 1: Chart.js CDN failed to load (Req 5.1) ---
  if (typeof Chart === 'undefined') {
    if (canvas) {
      canvas.style.display = 'none';
    }
    if (placeholder) {
      placeholder.textContent = 'Chart unavailable — Chart.js failed to load';
      placeholder.classList.add('visible');
    }
    return;
  }

  // --- Mode 2: No transactions — destroy instance, show placeholder (Req 5.6) ---
  if (transactions.length === 0) {
    if (AppState.chartInstance) {
      AppState.chartInstance.destroy();
      AppState.chartInstance = null;
    }
    if (canvas)      canvas.style.display = 'none';
    if (placeholder) {
      placeholder.textContent = 'No data available';
      placeholder.classList.add('visible');
    }
    return;
  }

  // --- Mode 3: Build / update chart (Req 5.2, 5.3, 5.4, 5.5) ---
  const aggregated = aggregateByCategory(transactions);
  const labels     = Object.keys(aggregated);
  const data       = labels.map((cat) => aggregated[cat]);

  // Colour palette — one colour per category slot (order matches VALID_CATEGORIES)
  const CATEGORY_COLORS = {
    Food:      'rgba(255, 99, 132, 0.8)',
    Transport: 'rgba(54, 162, 235, 0.8)',
    Fun:       'rgba(255, 205, 86, 0.8)',
  };
  const backgroundColors = labels.map(
    (cat) => CATEGORY_COLORS[cat] || 'rgba(153, 102, 255, 0.8)'
  );

  // Show canvas; hide placeholder
  if (canvas)      canvas.style.display = 'block';
  if (placeholder) placeholder.classList.remove('visible');

  if (AppState.chartInstance) {
    // Reuse existing instance — update data in-place to avoid flicker (Req 5.4, 5.5)
    AppState.chartInstance.data.labels                        = labels;
    AppState.chartInstance.data.datasets[0].data              = data;
    AppState.chartInstance.data.datasets[0].backgroundColor   = backgroundColors;
    AppState.chartInstance.update();
  } else {
    // Lazy-initialize on first render (Req 5.3)
    AppState.chartInstance = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: backgroundColors,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 14 } },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const value = context.parsed;
                return ' Rp' + value.toFixed(2);
              },
            },
          },
        },
      },
    });
  }
}

// ============================================================
// MONTHLY SUMMARY  (Requirements 6.1, 6.3, 6.6)
// ============================================================

/**
 * Groups an array of transactions by calendar month (YYYY-MM) and returns
 * an array of MonthGroup objects sorted most-recent-first.
 *
 * For each unique YYYY-MM key found in the transactions:
 * - key:   the "YYYY-MM" string (used for sorting)
 * - label: human-readable "Month YYYY" (e.g. "October 2026")
 * - total: sum of all transaction amounts in that month, rounded to 2 decimal places
 *
 * @param {Transaction[]} transactions
 * @returns {MonthGroup[]}
 */
function groupByMonth(transactions) {
  /** @type {{ [key: string]: MonthGroup }} */
  const groupMap = {};

  transactions.forEach((tx) => {
    // tx.date is "YYYY-MM-DD" — extract the "YYYY-MM" portion
    const key = tx.date.slice(0, 7); // e.g. "2026-10"

    if (!groupMap[key]) {
      // Build the human-readable label from the key parts
      const [yearStr, monthStr] = key.split('-');
      const year  = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1; // 0-indexed for Date constructor

      // Use a fixed UTC date to avoid timezone-driven month shifts
      const label = new Date(Date.UTC(year, month, 1))
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

      groupMap[key] = { key, label, total: 0 };
    }

    groupMap[key].total += Number(tx.amount) || 0;
  });

  // Round totals to 2 decimal places and sort most-recent-first
  return Object.values(groupMap)
    .map((group) => ({ ...group, total: parseFloat(group.total.toFixed(2)) }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

/**
 * Renders the monthly summary into #monthly-summary-content.
 *
 * Calls groupByMonth() then renders each group as a row with label + formatted total.
 * If the result is empty, shows "No spending data to summarize". (Req 6.6)
 *
 * @param {Transaction[]} transactions
 */
function renderMonthlySummary(transactions) {
  const container = document.getElementById('monthly-summary-content');
  if (!container) return;

  container.innerHTML = '';

  const groups = groupByMonth(transactions);

  if (groups.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'empty-state';
    emptyMsg.textContent = 'No spending data to summarize';
    container.appendChild(emptyMsg);
    return;
  }

  groups.forEach((group) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'monthly-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'monthly-label';
    labelEl.textContent = group.label;

    const totalEl = document.createElement('span');
    totalEl.className = 'monthly-total';
    totalEl.textContent = 'Rp' + group.total.toFixed(2);

    rowEl.appendChild(labelEl);
    rowEl.appendChild(totalEl);
    container.appendChild(rowEl);
  });
}

// ============================================================
// RENDER ALL  (orchestrates full UI re-render)
// ============================================================

/**
 * Re-renders all dynamic UI regions: balance display, active view, and chart.
 *
 * When AppState.view === "list"    → shows #list-section (transaction list),
 *                                    hides #monthly-summary
 * When AppState.view === "summary" → hides #list-section (transaction list),
 *                                    shows #monthly-summary and renders it
 *
 * (Requirements 6.2, 6.4, 6.5)
 */
function renderAll() {
  renderBalance(AppState.balance);

  const listSection    = document.querySelector('.list-section');
  const summarySection = document.getElementById('monthly-summary');
  const toggleBtn      = document.getElementById('btn-toggle-view');

  if (AppState.view === 'summary') {
    // Show monthly summary, hide transaction list
    if (listSection)    listSection.setAttribute('hidden', '');
    if (summarySection) summarySection.removeAttribute('hidden');
    if (toggleBtn)      toggleBtn.textContent = 'Switch to Transaction List';
    renderMonthlySummary(AppState.transactions);
  } else {
    // Show transaction list, hide monthly summary
    if (listSection)    listSection.removeAttribute('hidden');
    if (summarySection) summarySection.setAttribute('hidden', '');
    if (toggleBtn)      toggleBtn.textContent = 'Switch to Monthly Summary';
    renderTransactionList(AppState.transactions);
  }

  renderChart(AppState.transactions);
}

// ============================================================
// FORM SUBMISSION HANDLER  (Requirements 1.1–1.6, 2.3, 2.4, 3.4, 5.3)
// ============================================================

/**
 * Handles the #input-form submit event.
 *
 * 1. Prevents the default browser form submission.
 * 2. Reads the current values from #item-name, #amount, and #category.
 * 3. Calls validateInput(); on failure, renders each error message into
 *    #form-errors (one <p> per message) and returns early.
 * 4. On success, calls addTransaction() (which persists and re-renders),
 *    then calls resetForm() to clear the inputs and error container.
 *
 * @param {Event} event - The submit event fired by #input-form
 */
function handleAddTransaction(event) {
  event.preventDefault();

  // Read form values
  const nameField   = document.getElementById('item-name');
  const amountField = document.getElementById('amount');
  const categoryEl  = document.getElementById('category');
  const errorsEl    = document.getElementById('form-errors');

  const name     = nameField   ? nameField.value   : '';
  const amount   = amountField ? amountField.value : '';
  const category = categoryEl  ? categoryEl.value  : '';

  // Validate
  const result = validateInput(name, amount, category);

  if (!result.valid) {
    // Render inline error messages (Requirements 1.4)
    if (errorsEl) {
      errorsEl.innerHTML = '';
      result.errors.forEach((msg) => {
        const p = document.createElement('p');
        p.className = 'error-message';
        p.textContent = msg;
        errorsEl.appendChild(p);
      });
    }
    return;
  }

  // Validation passed — add transaction and reset the form (Requirements 1.5, 1.6)
  addTransaction(name, amount, category);
  resetForm();
}

// ============================================================
// SPENDING LIMIT  (Requirements 8.1, 8.2, 8.5)
// ============================================================

/**
 * Validates a candidate spending limit value.
 *
 * Rules:
 * - Must be numeric (not NaN after parseFloat)
 * - Must be strictly greater than 0
 * - Must not exceed 999,999,999.99
 *
 * @param {string|number} value - Raw value from the spending limit input
 * @returns {{ valid: true } | { valid: false, error: string }}
 */
function validateSpendingLimit(value) {
  const parsed = parseFloat(value);

  if (value === '' || value === null || value === undefined || isNaN(parsed)) {
    return { valid: false, error: 'Please enter a number between 0.01 and 999,999,999.99.' };
  }

  if (parsed <= 0) {
    return { valid: false, error: 'Spending limit must be a number between 0.01 and 999,999,999.99.' };
  }

  if (parsed > 999999999.99) {
    return { valid: false, error: 'Spending limit must be a number between 0.01 and 999,999,999.99.' };
  }

  return { valid: true };
}

/**
 * Handles the "Set Limit" button click.
 *
 * 1. Reads and validates the value from #spending-limit-input via validateSpendingLimit().
 * 2. On failure: displays the error message in #spending-limit-error;
 *    AppState.spendingLimit is left unchanged.
 * 3. On success: clears #spending-limit-error, sets AppState.spendingLimit to the
 *    parsed float, and calls renderTransactionList() to re-apply highlights.
 *    (Requirement 8.5 — re-evaluation within 500ms of change being confirmed)
 *
 * @param {string|number} value - Raw value from the spending limit input field
 */
function handleSetSpendingLimit(value) {
  const errorEl = document.getElementById('spending-limit-error');
  const result  = validateSpendingLimit(value);

  if (!result.valid) {
    if (errorEl) {
      errorEl.textContent = result.error;
    }
    return;
  }

  // Clear any previous error
  if (errorEl) {
    errorEl.textContent = '';
  }

  // Persist the new limit and re-render so highlights update immediately
  AppState.spendingLimit = parseFloat(value);
  renderTransactionList(AppState.transactions);
}

// ============================================================
// APPLICATION INITIALIZATION  (Requirements 2.3, 3.4, 4.4, 4.5, 5.3)
// ============================================================

/**
 * Initialises the application on page load.
 *
 * 1. Calls loadFromStorage() to retrieve any previously persisted state.
 * 2. Sets AppState.transactions and AppState.balance from the loaded data.
 * 3. Calls renderAll() to paint the initial UI (balance, transaction list, chart).
 */
function init() {
  const { transactions, balance } = loadFromStorage();

  AppState.transactions = transactions;
  AppState.balance      = balance;

  renderAll();
}

// ============================================================
// BOOTSTRAP
// ============================================================

// Attach submit handler to the transaction input form
document.getElementById('input-form').addEventListener('submit', handleAddTransaction);

// Attach change handler to the sort criterion select (Requirements 7.1, 7.2)
const sortCriterionEl = document.getElementById('sort-criterion');
if (sortCriterionEl) {
  sortCriterionEl.addEventListener('change', function () {
    // Empty string maps back to null (default/no-sort state per Req 7.1)
    AppState.sortCriterion = this.value !== '' ? this.value : null;
    renderTransactionList(AppState.transactions);
  });
}

// Attach click handler to the view toggle button (Requirement 6.2)
const toggleViewBtn = document.getElementById('btn-toggle-view');
if (toggleViewBtn) {
  toggleViewBtn.addEventListener('click', function () {
    AppState.view = AppState.view === 'list' ? 'summary' : 'list';
    renderAll();
  });
}

// Attach click handler to the "Set Limit" button (Requirements 8.1, 8.2, 8.5)
const setLimitBtn = document.getElementById('btn-set-limit');
if (setLimitBtn) {
  setLimitBtn.addEventListener('click', function () {
    const input = document.getElementById('spending-limit-input');
    handleSetSpendingLimit(input ? input.value : '');
  });
}

// Kick off the application
init();
