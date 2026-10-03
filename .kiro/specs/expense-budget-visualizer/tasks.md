# Implementation Plan: expense-budget-visualizer

## Overview

Build a mobile-first single-page expense tracker using plain HTML, CSS, and Vanilla JavaScript. The implementation follows a unidirectional data flow pattern (AppState → persist → render) and is structured in layers: project scaffold → data/state → core logic → UI rendering → optional features → property-based tests. Chart.js is loaded via CDN.

## Tasks

- [x] 1. Scaffold project structure and HTML shell
  - [x] 1.1 Create index.html with semantic structure
    - Create `index.html` with a `<head>` that loads Chart.js from CDN, `css/style.css`, and `js/app.js` at bottom of `<body>`
    - Add skeleton sections: `#balance-display`, `#input-form`, `#transaction-list`, `#spending-chart`, `#monthly-summary`, `#app-error`
    - Include a `<canvas id="spending-chart">` and a `<div id="chart-placeholder">` sibling for the "No data available" fallback
    - _Requirements: 9.1_

  - [x] 1.2 Create css/style.css with mobile-first base styles
    - Write mobile-first CSS (base styles target 320px+), add a media query breakpoint at 768px for wider layouts
    - Ensure no horizontal overflow at any viewport width from 320px to 1440px; body text ≥14px, balance display ≥18px
    - Style all interactive elements (buttons, inputs, selects) with a minimum tap target of 44×44 CSS pixels
    - Add `.highlight` class for spending-limit rows (background visually distinct from default row background)
    - _Requirements: 9.1, 9.2, 9.3, 9.6_

- [x] 2. Implement AppState, data models, and persistence
  - [x] 2.1 Define AppState object and Transaction data model in js/app.js
    - Declare module-level `AppState` with fields: `transactions`, `balance`, `sortCriterion`, `spendingLimit`, `view`, `chartInstance`
    - Document the `Transaction` shape (`id`, `name`, `amount`, `category`, `date`) and `MonthGroup` shape in comments
    - Provide `generateId()` using `crypto.randomUUID()` with a `Date.now().toString()` fallback
    - _Requirements: 4.1, 6.1_

  - [x] 2.2 Implement persist() and loadFromStorage()
    - Write `persist()`: serializes `AppState.transactions` to JSON → `localStorage["expense_transactions"]`; serializes `AppState.balance` → `localStorage["expense_balance"]`; returns `true` on success, `false` on `QuotaExceededError`
    - Write `loadFromStorage()`: reads and `JSON.parse`s `localStorage["expense_transactions"]`; on absent/null/empty key returns `{ transactions: [], balance: 0 }`; on `SyntaxError` clears the key, shows error banner, returns empty state; discards entries missing required fields
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 2.3 Write property test P8: localStorage round-trip
    - **Property 8: LocalStorage Serialization Round-Trip**
    - Use `fc.array(transactionArb)` to generate arbitrary transaction arrays; call `persist()` then `loadFromStorage()` and assert each transaction's `name`, `amount`, `category`, and `date` are unchanged
    - Tag: `// Feature: expense-budget-visualizer, Property 8`
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.6, 2.3**

- [x] 3. Implement form validation and transaction add/delete logic
  - [x] 3.1 Implement validateInput()
    - Write `validateInput(name, amount, category)` → `{ valid, errors[] }` enforcing: name non-empty and ≤100 chars; amount numeric and in [0.01, 999999.99]; category one of `["Food","Transport","Fun"]`
    - Return all applicable error messages (one per failing field) in `errors`
    - _Requirements: 1.3, 1.4_

  - [ ]* 3.2 Write property test P1: Validator rejects invalid inputs
    - **Property 1: Validator Rejects Invalid Inputs**
    - Generate invalid inputs: empty/over-100-char names via `fc.string()`, out-of-range amounts via `fc.float()`, invalid category strings; assert `validateInput()` returns `{ valid: false }` with non-empty `errors`
    - Tag: `// Feature: expense-budget-visualizer, Property 1`
    - **Validates: Requirements 1.3, 1.4**

  - [x] 3.3 Implement addTransaction() and resetForm()
    - Write `addTransaction(name, amount, category)`: creates a `Transaction` with `id` from `generateId()`, `name` as entered, `amount` rounded via `parseFloat(parseFloat(amount).toFixed(2))`, `category`, and `date` as today's `YYYY-MM-DD` ISO string; unshifts into `AppState.transactions`; calls `recalculateBalance()`, `persist()`, `renderAll()`
    - Write `resetForm()`: clears `#item-name`, `#amount`, resets `#category` to default option, clears `#form-errors`
    - _Requirements: 1.5, 1.6, 6.1_

  - [ ]* 3.4 Write property test P2: Transaction creation correctness
    - **Property 2: Transaction Creation Correctness**
    - Use `fc.string({minLength:1,maxLength:100})` + `fc.float({min:0.01,max:999999.99})` + category; call `addTransaction()` and assert `name`, `amount` (rounded to 2 dp), `category` match inputs exactly
    - Tag: `// Feature: expense-budget-visualizer, Property 2`
    - **Validates: Requirements 1.5**

  - [ ]* 3.5 Write property test P10: Transaction date is a valid ISO date string
    - **Property 10: Transaction Date Is a Valid ISO Date String**
    - For any valid (name, amount, category) input, assert the created transaction's `date` field matches `/^\d{4}-\d{2}-\d{2}$/`
    - Tag: `// Feature: expense-budget-visualizer, Property 10`
    - **Validates: Requirements 6.1**

  - [x] 3.6 Implement handleDeleteTransaction()
    - Write `handleDeleteTransaction(id)`: saves a copy of the current list; removes the transaction by `id` from `AppState.transactions`; calls `persist()` — on failure restores the saved list to `AppState.transactions` and shows the `#app-error` banner; on success calls `recalculateBalance()`, `renderAll()`
    - _Requirements: 2.6_

  - [ ]* 3.7 Write property test P6: Delete removes transaction from list and storage
    - **Property 6: Delete Removes Transaction from List and Storage**
    - Generate `fc.array(transactionArb, {minLength:1})`, pick a random index; call `handleDeleteTransaction(id)` and assert the target transaction is absent from `AppState.transactions` and from `loadFromStorage().transactions`
    - Tag: `// Feature: expense-budget-visualizer, Property 6`
    - **Validates: Requirements 2.6**

- [x] 4. Checkpoint — Ensure core state and persistence tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement balance calculation and rendering
  - [x] 5.1 Implement recalculateBalance() and renderBalance()
    - Write `recalculateBalance()`: sums `AppState.transactions` amounts with `reduce`; stores result in `AppState.balance`; calls `persist()` to write the updated balance to `localStorage["expense_balance"]`
    - Write `renderBalance(balance)`: formats balance as `"$X.XX"` with `toFixed(2)` and sets `#balance-display` text content
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.3_

  - [ ]* 5.2 Write property test P7: Balance equals sum of all transaction amounts
    - **Property 7: Balance Equals Sum of All Transaction Amounts**
    - Use `fc.array(transactionArb)` to generate any transaction list; set `AppState.transactions`, call `recalculateBalance()`, assert `AppState.balance` equals the arithmetic sum of all amounts; assert `renderBalance(AppState.balance)` sets `#balance-display` to `"$X.XX"` format; empty list → `"$0.00"`
    - Tag: `// Feature: expense-budget-visualizer, Property 7`
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 6. Implement Transaction List rendering
  - [x] 6.1 Implement renderTransactionList()
    - Write `renderTransactionList(transactions)`: empties `#transaction-list`; if empty renders an empty-state `<p>` message; otherwise iterates the passed array and builds a `<div class="transaction-item">` per entry showing name, `$X.XX` amount, category badge, and a delete button wired to `handleDeleteTransaction(id)`
    - Apply `.highlight` class when `AppState.spendingLimit !== null && tx.amount > AppState.spendingLimit`
    - _Requirements: 2.1, 2.4, 2.5, 2.7, 2.8, 8.3, 8.6_

  - [ ]* 6.2 Write property test P4: Transaction card rendering invariant
    - **Property 4: Transaction Card Rendering Invariant**
    - Use `fc.array(transactionArb, {minLength:1})`; call `renderTransactionList(transactions)` and query `#transaction-list`; assert every rendered card shows the transaction's name, `$X.XX` amount, category label, and a delete button
    - Tag: `// Feature: expense-budget-visualizer, Property 4`
    - **Validates: Requirements 2.1, 2.5**

  - [ ]* 6.3 Write property test P5: Transaction list reverse chronological order
    - **Property 5: Transaction List Reverse Chronological Order**
    - Use `fc.array(transactionArb, {minLength:2})` with no sort criterion active; after `renderTransactionList()` assert the first rendered item matches the most-recently-added transaction
    - Tag: `// Feature: expense-budget-visualizer, Property 5`
    - **Validates: Requirements 2.8**

  - [ ]* 6.4 Write property test P3: Form resets after successful add
    - **Property 3: Form Resets After Successful Add**
    - For any valid (name, amount, category) tuple, call `addTransaction()` + `resetForm()` and assert `#item-name` value is `""`, `#amount` value is `""`, `#category` selectedIndex is `0`, `#form-errors` is empty
    - Tag: `// Feature: expense-budget-visualizer, Property 3`
    - **Validates: Requirements 1.6**

- [ ] 7. Implement pie chart rendering
  - [x] 7.1 Implement aggregateByCategory() and renderChart()
    - Write `aggregateByCategory(transactions)`: returns an object `{ Food: n, Transport: n, Fun: n }` containing only categories with total > 0
    - Write `renderChart(transactions)`: if `typeof Chart === "undefined"` show fallback text in `#spending-chart` area; if transactions empty destroy existing chart instance and show `#chart-placeholder` with "No data available"; otherwise build labels/data arrays and create or update `AppState.chartInstance` (Pie type) via `.update()` to avoid flicker
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 7.2 Write property test P9: Chart category aggregation correctness
    - **Property 9: Chart Category Aggregation Correctness**
    - Use `fc.array(transactionArb, {minLength:1})`; call `aggregateByCategory(transactions)` and assert: exactly one entry per category with total > 0; each entry's value equals the sum of amounts for that category; no entries for zero-total categories
    - Tag: `// Feature: expense-budget-visualizer, Property 9`
    - **Validates: Requirements 5.2**

- [x] 8. Wire handleAddTransaction() and initialize app
  - [x] 8.1 Implement handleAddTransaction() and app initialization
    - Write `handleAddTransaction(event)`: prevents default; reads `#item-name`, `#amount`, `#category`; calls `validateInput()`; on failure renders errors into `#form-errors` and returns; on success calls `addTransaction()` then `resetForm()`
    - Write `init()`: calls `loadFromStorage()`, sets `AppState.transactions` and `AppState.balance`, calls `renderAll()` (which calls `renderBalance`, `renderTransactionList`, `renderChart`)
    - Attach `submit` listener on `#input-form` → `handleAddTransaction`; call `init()` at script bottom
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.3, 2.4, 3.4, 5.3_

- [ ] 9. Checkpoint — Ensure core feature is functional end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Monthly Summary view (optional feature)
  - [x] 10.1 Implement groupByMonth() and renderMonthlySummary()
    - Write `groupByMonth(transactions)` → `MonthGroup[]`: group by `YYYY-MM` derived from `tx.date`; sort most-recent-first; each group has `key`, `label` (e.g., "October 2026"), and `total` (sum of amounts, two decimal places)
    - Write `renderMonthlySummary(transactions)`: calls `groupByMonth()`; renders each group as a row showing label and formatted total; if empty shows "No spending data to summarize"
    - _Requirements: 6.1, 6.3, 6.6_

  - [x] 10.2 Add view toggle and integrate Monthly Summary
    - Add `#btn-toggle-view` button to HTML; attach click listener that toggles `AppState.view` between `"list"` and `"summary"` and calls `renderAll()`
    - Update `renderAll()` to show `#transaction-list` or `#monthly-summary` based on `AppState.view`; re-render summary on add/delete
    - _Requirements: 6.2, 6.4, 6.5_

  - [ ]* 10.3 Write property test P11: Monthly summary grouping correctness
    - **Property 11: Monthly Summary Grouping Correctness**
    - Use `fc.array(transactionArb)` with varied `date` values spanning multiple months; call `groupByMonth()` and assert: one group per distinct month-year; each group total equals the sum of its transactions' amounts; groups ordered most-recent-first; each label matches `"Month YYYY"` format
    - Tag: `// Feature: expense-budget-visualizer, Property 11`
    - **Validates: Requirements 6.3**

  - [ ]* 10.4 Write property test P12: View switch preserves transaction list
    - **Property 12: View Switch Preserves Transaction List**
    - Use `fc.array(transactionArb)`; toggle `AppState.view` to `"summary"` then back to `"list"`; assert all same transactions are present in the rendered list in the same order
    - Tag: `// Feature: expense-budget-visualizer, Property 12`
    - **Validates: Requirements 6.5**

- [x] 11. Implement Sorter (optional feature)
  - [x] 11.1 Implement sortTransactions() and sort controls
    - Write `sortTransactions(transactions, criterion)` → new sorted array (never mutates input): `"amount-asc"`, `"amount-desc"`, `"category-asc"` (case-insensitive); tiebreaker is reverse chronological insertion order (higher array index = more recent = first); `null` criterion returns reverse-chronological copy
    - Add sort control UI (radio buttons or `<select>`) above `#transaction-list`; attach change listener that sets `AppState.sortCriterion` and calls `renderTransactionList()`
    - Update `renderTransactionList()` to call `sortTransactions(AppState.transactions, AppState.sortCriterion)` before iterating
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 11.2 Write property test P13: Sort order correctness
    - **Property 13: Sort Order Correctness**
    - Use `fc.array(transactionArb)` + `fc.constantFrom("amount-asc","amount-desc","category-asc")`; call `sortTransactions()` and assert output is sorted by the selected criterion; assert ties are broken by reverse chronological insertion order
    - Tag: `// Feature: expense-budget-visualizer, Property 13`
    - **Validates: Requirements 7.2**

  - [ ]* 11.3 Write property test P14: Sort does not mutate stored data
    - **Property 14: Sort Does Not Mutate Stored Data**
    - For any transaction list and criterion, call `sortTransactions()` then inspect `localStorage["expense_transactions"]`; assert the stored order matches original insertion order
    - Tag: `// Feature: expense-budget-visualizer, Property 14`
    - **Validates: Requirements 7.4**

- [x] 12. Implement Spending Limit highlight (optional feature)
  - [x] 12.1 Implement validateSpendingLimit() and handleSetSpendingLimit()
    - Write `validateSpendingLimit(value)`: rejects non-numeric, zero, negative, or > 999,999,999.99 values; returns `{ valid, error }` 
    - Write `handleSetSpendingLimit(value)`: calls `validateSpendingLimit()`; on failure displays inline error, leaves `AppState.spendingLimit` unchanged; on success sets `AppState.spendingLimit` and calls `renderTransactionList()`
    - Add spending limit `<input>` and confirm button to HTML; wire to `handleSetSpendingLimit()`
    - _Requirements: 8.1, 8.2, 8.5_

  - [ ]* 12.2 Write property test P15: Spending limit validator rejects invalid values
    - **Property 15: Spending Limit Validator Rejects Invalid Values**
    - Use `fc.oneof(fc.string(), fc.float({max:0}), fc.constant(1e10))`; call `validateSpendingLimit()` and assert it returns `{ valid: false }` with a non-empty error message; assert `AppState.spendingLimit` is unchanged
    - Tag: `// Feature: expense-budget-visualizer, Property 15`
    - **Validates: Requirements 8.2**

  - [ ]* 12.3 Write property test P16: Highlight applied if and only if amount strictly exceeds limit
    - **Property 16: Highlight Applied If and Only If Amount Strictly Exceeds Limit**
    - Use `fc.array(transactionArb)` + `fc.float({min:0.01})`; set `AppState.spendingLimit` and call `renderTransactionList()`; for each rendered row assert `.highlight` is present iff `tx.amount > spendingLimit` (strict), absent when `tx.amount <= spendingLimit`
    - Tag: `// Feature: expense-budget-visualizer, Property 16`
    - **Validates: Requirements 8.3**

- [ ] 13. Set up fast-check test environment and shared arbitraries
  - [ ] 13.1 Create test/setup.js with fast-check config and transactionArb
    - Create `test/` directory; load fast-check via CDN or npm dev dependency in `test/setup.js`
    - Configure `fc.configureGlobal({ numRuns: 100 })`
    - Define `transactionArb`: `fc.record({ id: fc.string(), name: fc.string({minLength:1, maxLength:100}), amount: fc.float({min:0.01, max:999999.99}), category: fc.constantFrom("Food","Transport","Fun"), date: fc.date().map(d => d.toISOString().slice(0,10)) })`
    - _Requirements: (test infrastructure)_

  - [ ] 13.2 Create test/app.test.js and wire all 16 property tests
    - Create `test/app.test.js` importing `setup.js` and `js/app.js`; scaffold test blocks for Properties 1–16 with correct tags and `fc.assert(fc.property(...))` calls
    - Ensure each test block matches the property definitions in the design document sections and the stubs created in tasks 2–12
    - _Requirements: all (test coverage)_

- [ ] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Properties 1–16 each map to a `fc.assert(fc.property(...))` call in `test/app.test.js` with `numRuns: 100`
- Unit tests (explicit examples) cover empty-state messages, `$0.00` balance, chart placeholder, no-highlight default, and sort-controls initial state
- `sortTransactions()` must return a *new* array — never mutate `AppState.transactions` or `localStorage`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "13.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3"] },
    { "id": 5, "tasks": ["3.4", "3.5", "3.6", "5.1"] },
    { "id": 6, "tasks": ["3.7", "5.2", "6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 8, "tasks": ["7.2", "8.1"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["10.2"] },
    { "id": 11, "tasks": ["10.3", "10.4", "11.1"] },
    { "id": 12, "tasks": ["11.2", "11.3", "12.1"] },
    { "id": 13, "tasks": ["12.2", "12.3", "13.2"] }
  ]
}
```
