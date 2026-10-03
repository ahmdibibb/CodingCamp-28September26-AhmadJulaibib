# Requirements Document

## Introduction

A mobile-friendly single-page web application that helps users track daily spending. The app displays a total balance, a scrollable transaction history list, and a pie chart of spending by category. It supports adding and deleting transactions, persists data using LocalStorage, and includes three optional features: a monthly summary view, transaction sorting, and a spending limit highlight system. The app is built using HTML, CSS, and Vanilla JavaScript only, with Chart.js loaded via CDN.

## Glossary

- **App**: The expense-budget-visualizer single-page web application.
- **Transaction**: A single spending record containing an item name, a numeric amount, a category, and a submission date.
- **Category**: A classification for a transaction; one of: Food, Transport, or Fun.
- **Balance**: The computed total of all transaction amounts stored in the App.
- **Transaction_List**: The scrollable UI component that displays all stored transactions.
- **Input_Form**: The UI component containing the item name field, amount field, category dropdown, and submit button.
- **Pie_Chart**: The Chart.js-rendered chart showing spending distribution by category.
- **LocalStorage**: The browser-native key-value storage used for client-side data persistence.
- **Monthly_Summary**: An optional view that groups and totals transactions by calendar month.
- **Spending_Limit**: A user-configurable numeric threshold used to identify high-value transactions.
- **Validator**: The client-side logic component responsible for validating form input before submission.
- **Sorter**: The client-side logic component responsible for reordering the Transaction_List.

---

## Requirements

### Requirement 1: Transaction Input Form

**User Story:** As a user, I want to enter an item name, amount, and category and submit it as a transaction, so that I can record my daily spending.

#### Acceptance Criteria

1. THE Input_Form SHALL display a text field for item name, a number field for amount, and a dropdown field for category with options: Food, Transport, and Fun.
2. THE Input_Form SHALL display a submit button labeled "Add Transaction".
3. WHEN the submit button is activated, THE Validator SHALL verify that the item name field is non-empty and no longer than 100 characters, the amount field contains a numeric value between 0.01 and 999,999.99 inclusive, and a category is selected.
4. IF the Validator determines that any required field is empty or invalid, THEN THE Input_Form SHALL display an inline error message identifying the invalid field and SHALL NOT submit the transaction.
5. WHEN all fields pass validation, THE App SHALL create a new Transaction storing the item name as entered, the amount as a numeric value rounded to 2 decimal places, and the selected category, and add it to the Transaction_List.
6. WHEN a Transaction is successfully added, THE Input_Form SHALL reset the item name text field to empty, the amount number field to empty, and the category dropdown to its default unselected state.

---

### Requirement 2: Transaction List Display

**User Story:** As a user, I want to see all my transactions in a scrollable list, so that I can review my spending history at a glance.

#### Acceptance Criteria

1. THE Transaction_List SHALL display each Transaction with its item name, amount formatted to two decimal places, and category label.
2. THE Transaction_List SHALL be vertically scrollable when the number of transactions exceeds the visible area.
3. WHEN the App loads in a browser, THE Transaction_List SHALL render all Transactions previously persisted in LocalStorage.
4. WHEN a new Transaction is added, THE Transaction_List SHALL update to include the new Transaction within 100 milliseconds of the add action completing.
5. THE Transaction_List SHALL display a delete button for each Transaction entry.
6. WHEN a delete button is activated, THE App SHALL remove the corresponding Transaction from the Transaction_List and from LocalStorage; IF the LocalStorage write fails, THEN THE App SHALL restore the Transaction to the in-memory list and display an error message.
7. WHEN the Transaction_List contains no Transactions, THE Transaction_List SHALL display a message indicating there are no transactions to show.
8. THE Transaction_List SHALL display Transactions in reverse chronological order, with the most recently added Transaction appearing first.

---

### Requirement 3: Total Balance Display

**User Story:** As a user, I want to see my total spending balance prominently at the top of the page, so that I always know how much I have spent in total.

#### Acceptance Criteria

1. THE App SHALL display the Balance above the Transaction_List, formatted as a currency value with the "$" symbol and two decimal places.
2. WHEN a Transaction is added, THE App SHALL recalculate the Balance by summing all Transaction amounts and update the displayed value within 1 second.
3. WHEN a Transaction is deleted, THE App SHALL recalculate the Balance by summing all remaining Transaction amounts and update the displayed value within 1 second.
4. WHEN the App loads, THE App SHALL compute the Balance by summing all Transaction amounts deserialized from LocalStorage and display the result; IF no Transactions are stored, THE App SHALL display a Balance of $0.00.

---

### Requirement 4: Data Persistence via LocalStorage

**User Story:** As a user, I want my transactions and balance to be saved automatically, so that my data is not lost when I refresh or reopen the page.

#### Acceptance Criteria

1. WHEN a Transaction is added, THE App SHALL serialize the updated Transaction list and write it to LocalStorage under the key "expense_transactions".
2. WHEN a Transaction is deleted, THE App SHALL serialize the updated Transaction list and write it to LocalStorage under the key "expense_transactions".
3. WHEN the Balance is recalculated, THE App SHALL write the updated Balance value to LocalStorage under the key "expense_balance".
4. WHEN the App initializes and the key "expense_transactions" exists in LocalStorage with a non-null, non-empty value, THE App SHALL deserialize it into the in-memory Transaction list.
5. WHEN the App initializes and the key "expense_transactions" is absent, null, or empty in LocalStorage, THE App SHALL initialize with an empty Transaction list and a Balance of $0.00.
6. FOR a given Transaction list written to LocalStorage, WHEN the App subsequently reads and deserializes that value, THE App SHALL produce a Transaction list where each Transaction has the same item name, amount, category, and date as the original.
7. IF the value stored under "expense_transactions" in LocalStorage cannot be deserialized as a valid Transaction list, THEN THE App SHALL discard the corrupted value, initialize with an empty Transaction list and a Balance of $0.00, and display an error message indicating that saved data could not be loaded.

---

### Requirement 5: Pie Chart of Spending by Category

**User Story:** As a user, I want to see a pie chart that shows my spending broken down by category, so that I can understand where my money is going.

#### Acceptance Criteria

1. THE Pie_Chart SHALL render using the Chart.js library loaded via CDN.
2. THE Pie_Chart SHALL display one segment per category that has at least one Transaction, sized proportionally to that category's total amount relative to the total sum of all Transaction amounts; each segment SHALL be labeled with its category name.
3. WHEN the App loads with Transactions persisted in LocalStorage, THE Pie_Chart SHALL render the spending distribution for those Transactions on initial page load.
4. WHEN a Transaction is added, THE Pie_Chart SHALL update automatically to reflect the new spending distribution without requiring a page reload.
5. WHEN a Transaction is deleted, THE Pie_Chart SHALL update automatically to reflect the revised spending distribution.
6. WHEN all Transactions are deleted, THE Pie_Chart SHALL display a visible text placeholder reading "No data available" and SHALL NOT render any segments.

---

### Requirement 6: Monthly Summary View (Optional Feature)

**User Story:** As a user, I want to view a monthly summary of my spending, so that I can see how much I spent in each calendar month.

#### Acceptance Criteria

1. THE App SHALL record the submission date (year, month, day) on each Transaction at the time it is added.
2. WHERE the Monthly_Summary feature is enabled, THE App SHALL display a toggle or button that switches the view between the Transaction_List and the Monthly_Summary.
3. WHILE the Monthly_Summary view is active, THE App SHALL group all Transactions by their calendar month and year, display each group with a label formatted as "Month YYYY" (e.g., "October 2026"), and show the summed total for that month formatted to two decimal places; groups SHALL be ordered most-recent-first.
4. WHILE the Monthly_Summary view is active, WHEN a Transaction is added or deleted, THE App SHALL recalculate and re-render the Monthly_Summary without requiring a page reload.
5. WHEN the user switches from the Monthly_Summary view to the Transaction_List view, THE App SHALL render the Transaction_List containing all Transactions that were present before the view switch.
6. WHEN the Monthly_Summary view is active and there are no Transactions, THE App SHALL display a message indicating there is no spending data to summarize.

---

### Requirement 7: Transaction Sorting (Optional Feature)

**User Story:** As a user, I want to sort my transactions by amount or category, so that I can quickly find or analyze specific spending patterns.

#### Acceptance Criteria

1. WHERE the sorting feature is enabled, THE Transaction_List SHALL display sort controls allowing the user to select a sort criterion: amount ascending, amount descending, or category alphabetical (case-insensitive); no sort criterion SHALL be active by default on initial load.
2. WHEN a sort criterion is selected, THE Sorter SHALL reorder the Transaction_List according to the selected criterion and re-render the list within 100 milliseconds; WHERE two Transactions have equal sort values, THE Sorter SHALL order them by reverse chronological insertion order as a tiebreaker.
3. WHEN a new Transaction is added while a sort criterion is active, THE Sorter SHALL apply the active sort to the updated Transaction_List.
4. THE Sorter SHALL not modify the underlying stored Transaction data in LocalStorage; only the display order SHALL change.

---

### Requirement 8: Spending Limit Highlight (Optional Feature)

**User Story:** As a user, I want transactions that exceed a spending limit to be visually highlighted, so that I can quickly identify high-value purchases.

#### Acceptance Criteria

1. WHERE the spending limit feature is enabled, THE App SHALL display an input field allowing the user to set a numeric Spending_Limit value between 0.01 and 999,999,999.99 inclusive.
2. IF the user enters a Spending_Limit value that is non-numeric, zero, negative, or greater than 999,999,999.99, THEN THE App SHALL reject the input and display an error message indicating the value must be a number between 0.01 and 999,999,999.99, leaving the previous Spending_Limit unchanged.
3. WHEN the Spending_Limit is set, THE Transaction_List SHALL apply a distinct visual highlight — defined as a background color visually different from the default Transaction row background — to every Transaction whose amount is strictly greater than the Spending_Limit; Transactions whose amount equals the Spending_Limit SHALL NOT be highlighted.
4. WHEN a Transaction is added and its amount is strictly greater than the active Spending_Limit, THE Transaction_List SHALL render the new Transaction with the highlight applied within 500 milliseconds of the Transaction being added.
5. WHEN the Spending_Limit value is changed, THE Transaction_List SHALL re-evaluate all visible Transactions and update highlights within 500 milliseconds of the change being confirmed.
6. IF no Spending_Limit has been set, THEN THE Transaction_List SHALL display all Transactions without any highlight styling.

---

### Requirement 9: Mobile-First Responsive Design

**User Story:** As a user on a mobile device, I want the app to display correctly on small screens, so that I can track spending on the go without usability issues.

#### Acceptance Criteria

1. THE App SHALL use a single CSS file (css/style.css) and a single JavaScript file (js/app.js) loaded from index.html.
2. THE App SHALL render without horizontal overflow on viewport widths from 320px to 1440px.
3. THE App SHALL use legible font sizes of at least 14px for body text and at least 18px for the Balance display.
4. WHEN the App loads on a device with a network connection of at least 10 Mbps download speed, THE App SHALL render the initial state within 3 seconds.
5. WHEN a user submits a transaction, deletes a transaction, or the Balance updates in the latest stable versions of Chrome, Firefox, Edge, and Safari, THE App SHALL produce identical functional results across all four browsers.
6. THE App SHALL render all interactive elements (buttons, inputs, dropdowns) with a minimum tap target size of 44×44 CSS pixels on viewport widths between 320px and 767px.
