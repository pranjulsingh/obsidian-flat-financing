# Obsidian Flat Financing Plugin

A simple [Beancount](https://beancount.github.io/docs/) integration for Obsidian, allowing you to manage your personal finances, track expenses, and view interactive dashboards directly within your vault.

![Add Account](resources/ff-add-account.png)

![Add Transactions](resources/ff-add-transactions.png)

![Account Distribution Dashboard](resources/ff-dash-account-distribution.png)

![Networth Dashboard](resources/ff-dash-net-worth.png)

![Account Summary Dashboard](resources/ff-dash-account-summary.png)

![Transactions Dashboard](resources/ff-dash-transactions.png)

![Expense Target Dashboard](resources/ff-dash-expense-target.png)

![Savings Goal Dashboard](resources/ff-dash-savings-goal.png)

![Savings Goal Dashboard](resources/ff-dash-savings-goal.png)

![Import Data Dashboard](resources/ff-dash-import-data.png)

## Features

- **Interactive Dashboard**:
    - **Visualization View**: Top-level graphical timeline. Automatically calculates precise Date-wise Net Worth flow tracks, Cumulative Expenses tracking, Income vs. Expense velocity overlays, Periodic Savings KPI, and active Doughnut Account distributions.
    - **Expense Target View**: Set monthly target limits for expense accounts and monitor your actual spending progress against them dynamically using bullet charts.
    - **Savings Goal View**: Track dedicated savings allocations across your asset accounts, complete with visual progress bars mapping free vs reserved balances!
    - **Summary View**: View account balances filtered by Date, Type (Assets, Income, etc.), and specific Accounts.
    - **Transactions View**: List transaction details with powerful filtering.
    - **Tabs**: Easily switch between Visualization, Expense Target, Savings Goal, Summary and Transaction lists!
    - **Multi-column Sorting**: Every table header is intuitively clickable. Easily swap between ascending/descending modes across financial metrics and descriptions.
    - **Privacy Mode**: Seamlessly obscure raw global balances and timeline bounds using the strict 'Hide Balances' toggle while leaving temporal differential tools and transactional logs fully mapped.
- **Data Export**:
    - **Export CSV / PDF**: Leverage out-of-the-box download capabilities translating your table configurations instantly into universal formats directly connected to native Obsidian capabilities.
- **Advanced Filtering**:
    - **Wildcard Support**: Seamlessly filter categories by appending `*` (e.g., `Expenses:Food:*` captures all sub-categories instantly).
    - Multi-select filters for **Source Accounts** (Credits) and **Target Accounts** (Debits).
    - Filter by **Tags** (e.g., `#vacation`).
    - Standard Date Range filters.
- **Modern, Classy UI**:
    - The dashboard has been comprehensively revamped to feature glassmorphism, depth, segmented control tabs, smooth micro-animations, and a responsive layout that natively respects your active Obsidian theme.
- **Easy Data Entry & Maintenance**:
    - **Add Account**: Create new accounts with opening balances. The engine intelligently prepends new declarations right below your global configuration header instead of crashing at the file-base!
    - **Add Transaction**: Quick entry modal with auto-completion for account names. Supports robust field verification constraints locking zero-value or invalid assignments natively.
    - **Edit Transactions**: Hover over any dashboard record and pop open a direct live modification terminal visually. Changes seamlessly merge straight back into the exact `.beancount` block coordinates perfectly untouched via block splicing!
    - **Delete Transactions**: Click the trash icon to easily remove records directly from the Transactions view!
    - **Auto-Creation**: Automatically initializes new accounts found in transaction entries.
- **Full Mobile Responsive Optimization**:
    - The underlying environment maps complex dynamic variables against Android and iOS footprints! Form controls smartly wrap into broad columns. Native Horizontal view-swiping natively unlocks robust data tables without crushing mobile columns.
    - Custom JS APIs automatically track your live keyboard size on standard inputs, visually sweeping your entire framework straight out of the virtual keyboard overlay seamlessly.
- **Seamless Integration**:
    - Works with your existing `.beancount` text files.
    - Updates in real-time.

## Installation

### Method 1: Using BRAT (Recommended for Beta Testing)
1. Install the **[Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat)** plugin from the Community Plugins in Obsidian.
2. Enable the BRAT plugin.
3. In Obsidian, open the command palette and run `BRAT: Add a beta plugin for testing`.
4. Paste the URL of this GitHub repository.
5. Click **Add Plugin** and wait for BRAT to confirm the installation.
6. Enable the plugin in your Community Plugins settings.

### Method 2: Manual Installation
1.  Clone this repository into your vault's `.obsidian/plugins/` directory.
2.  Run `npm install` to install dependencies.
3.  Run `npm run build` to compile the plugin.
4.  Reload Obsidian and enable the plugin in Community Plugins.

## Usage

### 1. Configuration
Go to **Settings > Obsidian Accounting**:
- **Beancount File Path**: Enter the absolute path to your main `.beancount` file.
- **Currency Symbol**: Set your default currency (e.g., `USD`, `EUR`).
- **Hide Balances**: Globally masks raw Net Worth and explicit Dashboard coordinates tracking natively (rendering values mathematically to strings via `***` or rendering proportional `Percentages` automatically).

### 2. The Dashboard
Open the dashboard via the Ribbon icon (Graph) or the Command Palette (`Accounting: Open Dashboard`).

#### Visualization Tab (Default)
- Graphically chart out native **Account Distribution** density maps natively across explicit filters!
- Toggle legend boundaries pinning exact volume markers. 
- Map robust isolated Timeline tracks spanning **Income vs Expense** flow!

#### Summary Tab
- View start/end balances for all accounts natively mapped.
- Filter by **Account Type** (Assets, Liabilities, etc.) or specific **Account Names**.

#### Transactions Tab
- View a detailed line-item list of transactions.
- **Source Filter**: See where money is coming *from* (e.g., filter `Assets:Bank` to see all payments made from the bank).
- **Target Filter**: See where money is going *to* (e.g., filter `Expenses:Food` to see all food purchases).
- **Tag Filter**: Search for transactions with specific tags like `#reimbursable`.

### 3. Adding Data
- **Add Account**: Use the command `Accounting: Add Account` to open a new account.
- **Add Transaction**: Use the Ribbon icon ("+" symbol) or command `Accounting: Add Transaction`.
    - Supports Description, Amount, Source/Target accounts, and Tags.

## Development

- **Build**: `npm run build`
- **Dev Mode** (Auto-watch): `npm run dev`
- **Unit Tests**:
    This project uses a custom test runner for the Ledger logic.
    ```bash
    npx tsc tests/ledger.test.ts --esModuleInterop --resolveJsonModule --target ES6 --module commonjs
    node tests/ledger.test.js
    ```

## License
MIT

## About
This plugin was entirely generated by **Google Gemini** models (specifically the Antigravity agentic coding assistant) within **Antigravity**.
- **Model**: Google Gemini 
- **Editor**: Antigravity 

