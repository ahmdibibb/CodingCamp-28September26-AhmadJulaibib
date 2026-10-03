# Design Document: expense-budget-visualizer

## Overview

The expense-budget-visualizer is a mobile-first single-page web application (SPA) for tracking daily spending. It is intentionally constrained to plain HTML, CSS, and Vanilla JavaScript — no build tools, no frameworks, no bundlers. Chart.js is loaded via CDN for the pie chart visualization.

The application runs entirely in the browser. All state lives in memory during a session and is persisted to `localStorage` after every mutation. There is no backend or network call beyond the initial CDN load of Chart.js.

**Key design goals:**
- Zero-dependency (except Chart.js via CDN)
- Mobile-first responsive layout (320px–1440px)
- Sub-100ms UI updates for list and chart
- Defensive data handling: corrupted or missing localStorage is gracefully recovered
- Three opt-in feature flags (monthly summary, sorting, spending limit) that can be toggled without breaking the core flow

---

## Architecture

The application follows a **unidirectional data flow** pattern suited to a no-framework SPA:

```
User Action
    │
    ▼
Event Handler (app.js)
    │
    ▼
State Mutation (in-memory array)
    │
    ├──► Persist (localStorage)
    │
    └──► Render (DOM + Chart.js)
```

All state is held in a single module-level object (`AppState`). Every user action goes through an event handler that mutates `AppState`, persists to localStorage, then triggers a full re-render of the affected UI regions. Re-renders are cheap because they work on small DOM sub-trees (transaction list, balance display, chart data update).

### File Structure

```
index.html          — Single HTML shell; loads CSS and JS
css/
  style.css         — All styles, mobile-first with media queries
js/
  app.js            — All application logic
```

No module system is used; `app.js` is loaded as a classic `<script>` at the bottom of `<body>`.

---

## Components and Interfaces

### 1. Input Form (`#input-form`)

Renders the transaction entry UI. Owned by `renderForm()` (initial render is static HTML; form is reset by `resetForm()`).

| Element | ID / Selector | Purpose |
|---|---|---|
| Item name field | `#item-name` | Text input, max 100 chars |
| Amount field | `#amount` | Number input, step 0.01 |
| Category dropdown | `#category` | Select with Food / Transport / Fun |
| Submit button | `#btn-add` | Triggers `handleAddTransaction()` |
| Error container | `#form-errors` | Inline validation messages |

**Interface — `handleAddTransaction(event)`**
- Reads form values
- Calls `validateInput(name, amount, category)` → `ValidationResult`
- On failure: renders errors into `#form-errors`, returns
- On success: calls `addTransaction(name, amount, category)`, resets form

**Interface — `validateInput(name, amount, category)`** → `{ valid: boolean, errors: string[] }`
- Name: non-empty, ≤100 chars
- Amount: numeric, 0.01–999,999.99
- Category: one of `["Food", "Transport", "Fun"]`

**Interface — `resetForm()`**
- Clears `#item-name`, `#amount`; resets `#category` to default option; clears `#form-errors`

---

### 2. Transaction List (`#transaction-list`)

Scrollable list of transaction cards. Fully re-rendered by `renderTransactionList()` on every state change.

**Interface — `renderTransactionList(transactions)`**
- Empties `#transaction-list`
- If `transactions.length === 0`: renders empty-state message
- Otherwise: iterates transactions (already in display order), creates a `<div class="transaction-item">` per entry
- Each card shows: item name, `$X.XX` amount, category badge, delete button
- If spending limit is active and `tx.amount > state.spendingLimit`: adds `.highlight` class

**Interface — `handleDeleteTransaction(id)`**
- Removes transaction by `id` from `AppState.transactions`
- Calls `persist()`; on failure: restores transaction, shows error
- Calls `recalculateBalance()`, `renderAll()`

---

### 3. Balance Display (`#balance-display`)

Single DOM element updated by `renderBalance(balance)`.

**Interface — `renderBalance(balance)`**
- Formats `balance` as `"$X.XX"` using `toFixed(2)`
- Sets `#balance-display` text content

---

### 4. Pie Chart (`#spending-chart`)

A `<canvas>` element managed by a Chart.js `Doughnut`/`Pie` instance stored in `AppState.chartInstance`.

**Interface — `renderChart(transactions)`**
- Aggregates totals by category: `{ Food: n, Transport: n, Fun: n }` (only categories with total > 0)
- If no transactions: destroys existing chart, shows `#chart-placeholder` text "No data available"
- Otherwise: builds `labels` and `data` arrays; calls `chartInstance.data.datasets[0].data = data; chartInstance.update()` (or creates new instance on first render)

Chart.js is initialized lazily on first render with a `Pie` type config. Subsequent updates reuse the same instance via `.update()` to avoid flickering.

---

### 5. Monthly Summary View (`#monthly-summary`) — Optional

Shown when `AppState.view === "summary"`. Toggle managed by `#btn-toggle-view`.

**Interface — `groupByMonth(transactions)`** → `MonthGroup[]`
- Groups transactions by `YYYY-MM` key derived from `tx.date`
- Returns array sorted most-recent-first: `[{ label: "October 2026", total: 123.45 }, ...]`

**Interface — `renderMonthlySummary(transactions)`**
- Calls `groupByMonth(transactions)`
- Renders each group as a summary row; if empty shows "No spending data to summarize"

---

### 6. Sorter — Optional

Sort controls rendered above `#transaction-list` when feature is enabled.

**Interface — `sortTransactions(transactions, criterion)`** → `Transaction[]`
- `criterion`: `"amount-asc"` | `"amount-desc"` | `"category-asc"` | `null`
- Returns a new sorted array (does **not** mutate `AppState.transactions`)
- Tiebreaker: reverse insertion order (higher index = more recent = first)
- `null` criterion returns original reverse-chronological order

`AppState.sortCriterion` holds the active criterion. `renderTransactionList()` always calls `sortTransactions()` before rendering.

---

### 7. Spending Limit — Optional

**Interface — `handleSetSpendingLimit(value)`**
- Validates: numeric, 0.01–999,999,999.99
- On failure: displays error, leaves `AppState.spendingLimit` unchanged
- On success: sets `AppState.spendingLimit`, calls `renderTransactionList()`

---

### 8. Persistence Module

**Interface — `persist()`**
- Serializes `AppState.transactions` to JSON → writes to `localStorage["expense_transactions"]`
- Writes `AppState.balance` to `localStorage["expense_balance"]`
- Returns `true` on success, `false` on `QuotaExceededError` / other errors

**Interface — `loadFromStorage()`** → `{ transactions: Transaction[], balance: number }`
- Reads `localStorage["expense_transactions"]`; if absent/null/empty → returns `{ transactions: [], balance: 0 }`
- Tries `JSON.parse`; on error: clears key, shows error message, returns empty state
- Validates each parsed item has required fields; discards malformed entries

---

## Data Models

### `Transaction`

```js
{
  id:       string,   // crypto.randomUUID() or Date.now().toString() fallback
  name:     string,   // 1–100 chars, as entered
  amount:   number,   // numeric, rounded to 2 decimal places
  category: string,   // "Food" | "Transport" | "Fun"
  date:     string    // ISO 8601 date string: "YYYY-MM-DD"
}
```

### `AppState`

```js
{
  transactions:  Transaction[],  // source of truth; mutable in memory
  balance:       number,         // sum of all transaction amounts
  sortCriterion: string | null,  // active sort key or null
  spendingLimit: number | null,  // active limit or null
  view:          "list" | "summary",  // active view
  chartInstance: Chart | null    // Chart.js instance reference
}
```

### `ValidationResult`

```js
{
  valid:  boolean,
  errors: string[]  // human-readable error messages per invalid field
}
```

### `MonthGroup`

```js
{
  key:   string,  // "YYYY-MM" for sorting
  label: string,  // "Month YYYY" e.g. "October 2026"
  total: number   // sum of transaction amounts for that month
}
```

### LocalStorage Schema

| Key | Value | Notes |
|---|---|---|
| `expense_transactions` | JSON string of `Transaction[]` | Serialized on every mutation |
| `expense_balance` | JSON string of `number` | Serialized on every balance recalculation |

---


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

---

### Property 1: Validator Rejects Invalid Inputs

*For any* combination of item name, amount, and category where at least one field violates its constraint (name empty or > 100 chars, amount outside 0.01–999,999.99, or category not one of "Food"/"Transport"/"Fun"), `validateInput()` SHALL return `{ valid: false }` with a non-empty `errors` array, and the transaction list SHALL remain unchanged.

**Validates: Requirements 1.3, 1.4**

---

### Property 2: Transaction Creation Correctness

*For any* valid item name, amount, and category, the transaction created by `addTransaction()` SHALL have `name` equal to the input name, `amount` equal to `parseFloat(input.toFixed(2))` (rounded to 2 decimal places), and `category` equal to the selected category.

**Validates: Requirements 1.5**

---

### Property 3: Form Resets After Successful Add

*For any* valid transaction that is successfully added, the input form's name field, amount field, and category dropdown SHALL all return to their default empty/unselected state immediately after the add operation completes.

**Validates: Requirements 1.6**

---

### Property 4: Transaction Card Rendering Invariant

*For any* non-empty transaction list, every transaction rendered in the `#transaction-list` SHALL display the transaction's item name, its amount formatted as `"$X.XX"` (two decimal places, `$` prefix), its category label, and a delete button.

**Validates: Requirements 2.1, 2.5**

---

### Property 5: Transaction List Reverse Chronological Order

*For any* sequence of transactions added to the list (when no sort criterion is active), the rendered `#transaction-list` SHALL display them in reverse order of insertion, with the most recently added transaction appearing first.

**Validates: Requirements 2.8**

---

### Property 6: Delete Removes Transaction from List and Storage

*For any* transaction present in the list, after activating its delete button, that transaction SHALL no longer appear in the rendered `#transaction-list` and SHALL be absent from the deserialized contents of `localStorage["expense_transactions"]`.

**Validates: Requirements 2.6**

---

### Property 7: Balance Equals Sum of All Transaction Amounts

*For any* state of the transaction list (after any sequence of add and delete operations, including an empty list), the displayed balance value SHALL equal the arithmetic sum of all current transaction amounts, formatted as `"$X.XX"`. An empty list SHALL display `"$0.00"`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

---

### Property 8: LocalStorage Serialization Round-Trip

*For any* array of valid `Transaction` objects written to `localStorage["expense_transactions"]` via `persist()`, reading and deserializing that value via `loadFromStorage()` SHALL produce a transaction list where each transaction has the same `name`, `amount`, `category`, and `date` as the original.

**Validates: Requirements 4.1, 4.2, 4.4, 4.6, 2.3**

---

### Property 9: Chart Category Aggregation Correctness

*For any* non-empty transaction list, the data structure produced by the chart aggregation logic SHALL include exactly one entry per category that has at least one transaction, with each entry's value equal to the sum of all transaction amounts in that category, and no entries for categories with a zero total.

**Validates: Requirements 5.2**

---

### Property 10: Transaction Date Is a Valid ISO Date String

*For any* transaction added to the system, its `date` field SHALL be a string matching the pattern `YYYY-MM-DD` representing the calendar date on which the transaction was added.

**Validates: Requirements 6.1**

---

### Property 11: Monthly Summary Grouping Correctness

*For any* list of transactions spanning multiple calendar months, `groupByMonth()` SHALL return one group per distinct month-year combination, where each group's `total` equals the sum of amounts of all transactions in that month, all groups are ordered most-recent-first, and each group's `label` matches the format `"Month YYYY"` (e.g., "October 2026").

**Validates: Requirements 6.3**

---

### Property 12: View Switch Preserves Transaction List

*For any* transaction list, switching from the `"list"` view to the `"summary"` view and then back to the `"list"` view SHALL render a transaction list containing all the same transactions that were present before the view switch, in the same order.

**Validates: Requirements 6.5**

---

### Property 13: Sort Order Correctness

*For any* transaction list and any active sort criterion (`"amount-asc"`, `"amount-desc"`, or `"category-asc"`), the output of `sortTransactions()` SHALL be ordered according to the selected criterion; where two transactions have equal sort values, they SHALL be ordered by reverse chronological insertion order (later-added transaction appears first).

**Validates: Requirements 7.2**

---

### Property 14: Sort Does Not Mutate Stored Data

*For any* transaction list and any sort criterion, after `sortTransactions()` is called and the display order changes, the transactions serialized in `localStorage["expense_transactions"]` SHALL remain in their original insertion order, unaffected by the sort.

**Validates: Requirements 7.4**

---

### Property 15: Spending Limit Validator Rejects Invalid Values

*For any* spending limit input value that is non-numeric, zero, negative, or greater than 999,999,999.99, the validator SHALL reject the input, leave `AppState.spendingLimit` unchanged, and produce a non-empty error message.

**Validates: Requirements 8.2**

---

### Property 16: Highlight Applied If and Only If Amount Strictly Exceeds Limit

*For any* transaction list and any active spending limit value, a transaction row SHALL have the `.highlight` CSS class applied if and only if `transaction.amount > spendingLimit` (strict greater-than); transactions whose `amount === spendingLimit` SHALL NOT be highlighted, and transactions whose `amount < spendingLimit` SHALL NOT be highlighted.

**Validates: Requirements 8.3**

---

## Error Handling

### Validation Errors (Form)
- Displayed inline inside `#form-errors` as a list of human-readable messages
- One message per invalid field (e.g., "Item name is required", "Amount must be between 0.01 and 999,999.99")
- Cleared on the next successful submission or when the form is reset

### LocalStorage Write Failure
- Caught via `try/catch` around `localStorage.setItem()`
- On failure during deletion: the transaction is restored to `AppState.transactions` before showing the error
- On failure during add: the transaction is removed from `AppState.transactions` before showing the error
- Error displayed in a `#app-error` banner at the top of the page; auto-dismissed after 5 seconds

### LocalStorage Corrupted Data
- `JSON.parse` wrapped in `try/catch` in `loadFromStorage()`
- On `SyntaxError`: clears the corrupted key, initializes empty state, shows error banner
- On structurally invalid data (missing required fields): discards that entry, logs a warning, continues with valid entries

### Chart.js Load Failure
- Detected by checking `typeof Chart === "undefined"` before first render
- Shows a fallback message in `#spending-chart` area: "Chart unavailable — Chart.js failed to load"

### Spending Limit Input Error
- Inline error message below the spending limit input field
- Previous `AppState.spendingLimit` value is preserved unchanged

---

## Testing Strategy

### Overview

This project uses a **dual testing approach**: example-based unit tests for specific scenarios and edge cases, and **property-based tests** for universal correctness properties. The pure logic functions (validator, sorter, groupByMonth, chart aggregation, persistence serialization) are well-suited to property-based testing.

### PBT Applicability Assessment

Property-based testing IS appropriate here because:
- The core logic functions (`validateInput`, `sortTransactions`, `groupByMonth`, chart aggregation, serialize/deserialize) are **pure functions** with clear input/output behavior
- The input space is large (any string, any number, any list of transactions)
- 100 random iterations will surface edge cases (e.g., amounts with many decimal places, Unicode names, empty lists, single-element lists, ties in sort)
- These functions are in-memory with no I/O cost, making 100+ iterations cheap

PBT is NOT applied to:
- CSS/layout properties (scrollability, tap targets, font sizes) → visual/smoke tests
- Chart.js CDN load → smoke test
- Cross-browser compatibility → integration test matrix
- Timing requirements (< 100ms, < 1s, < 3s) → performance smoke tests

### Property-Based Testing Library

**[fast-check](https://github.com/dubzzz/fast-check)** (JavaScript) — loaded via CDN or npm in test environment. Minimum **100 iterations** per property test.

Each property test is tagged with a comment:
```js
// Feature: expense-budget-visualizer, Property N: <property_text>
```

### Property Tests (one test per property)

| Property | Function Under Test | Generators |
|---|---|---|
| P1: Validator rejects invalid | `validateInput()` | `fc.string()`, `fc.float()`, invalid categories |
| P2: Transaction creation correctness | `addTransaction()` | `fc.string({minLength:1,maxLength:100})`, `fc.float({min:0.01,max:999999.99})`, category |
| P3: Form resets after add | `addTransaction()` + `resetForm()` | valid (name, amount, category) tuples |
| P4: Transaction card rendering invariant | `renderTransactionList()` | `fc.array(transactionArb, {minLength:1})` |
| P5: Reverse chronological order | `renderTransactionList()` | `fc.array(transactionArb, {minLength:2})` |
| P6: Delete removes from list and storage | `handleDeleteTransaction()` | `fc.array(transactionArb, {minLength:1})` + pick index |
| P7: Balance equals sum | `recalculateBalance()` | `fc.array(transactionArb)` |
| P8: localStorage round-trip | `persist()` + `loadFromStorage()` | `fc.array(transactionArb)` |
| P9: Chart aggregation correctness | `aggregateByCategory()` | `fc.array(transactionArb, {minLength:1})` |
| P10: Transaction date validity | `addTransaction()` | valid (name, amount, category) |
| P11: Monthly summary grouping | `groupByMonth()` | `fc.array(transactionArb)` with varied dates |
| P12: View switch preserves list | view toggle handlers | `fc.array(transactionArb)` |
| P13: Sort order correctness | `sortTransactions()` | `fc.array(transactionArb)`, `fc.constantFrom("amount-asc","amount-desc","category-asc")` |
| P14: Sort does not mutate storage | `sortTransactions()` + `persist()` | `fc.array(transactionArb)`, criterion |
| P15: Spending limit validator | `validateSpendingLimit()` | `fc.oneof(fc.string(), fc.float({max:0}), fc.constant(1e10))` |
| P16: Highlight iff strictly greater | `renderTransactionList()` with limit | `fc.array(transactionArb)`, `fc.float({min:0.01})` |

### Example-Based Unit Tests

- Form displays all required fields and submit button (1.1, 1.2)
- Empty transaction list shows empty-state message (2.7)
- Empty list balance shows `$0.00` (3.4)
- Chart shows "No data available" when all transactions deleted (5.6)
- Monthly summary empty-state message (6.6)
- No highlight when no spending limit set (8.6)
- Sort controls exist and no criterion active on load (7.1)
- Spending limit input field exists (8.1)

### Smoke Tests

- Chart.js (`window.Chart`) is defined after page load
- CSS file and JS file are loaded from correct paths in `index.html`
- App renders within 3 seconds on standard connection
- Font sizes meet minimum legibility requirements
- Tap targets meet 44×44px minimum on mobile viewport

### Integration Tests

- Cross-browser: submit transaction, delete transaction, balance update — verified in Chrome, Firefox, Edge, Safari (latest stable)
- App loads and renders previously saved transactions end-to-end in a real browser

### Test Configuration

```js
// fast-check configuration for all property tests
fc.configureGlobal({ numRuns: 100 });
```

Each property test references its design document property:
```js
test('P1: Validator rejects invalid inputs', () => {
  // Feature: expense-budget-visualizer, Property 1: Validator rejects invalid inputs
  fc.assert(fc.property(...));
});
```
