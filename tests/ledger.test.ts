
import { Ledger } from '../ledger';

// --- Test Runner Helpers ---
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        console.log(`[PASS] ${message}`);
        passed++;
    } else {
        console.error(`[FAIL] ${message}`);
        failed++;
    }
}

function assertEqual(actual: any, expected: any, message: string) {
    if (actual === expected) {
        console.log(`[PASS] ${message}: ${actual} === ${expected}`);
        passed++;
    } else {
        console.error(`[FAIL] ${message}: Expected ${expected}, got ${actual}`);
        failed++;
    }
}

// --- Dummy Data ---
const DUMMY_DATA = `
2023-01-01 open Assets:Bank
2023-01-01 open Assets:Cash
2023-01-01 open Expenses:Food
2023-01-01 open Income:Salary

2023-01-01 pad Assets:Bank Equity:Opening-Balances
2023-01-02 balance Assets:Bank 1000.00 USD

2023-01-05 * "Paycheck" #salary
  Assets:Bank     2000.00 USD
  Income:Salary  -2000.00 USD

2023-01-10 * "Grocery Store" #food #groceries
  Expenses:Food    150.00 USD
  Assets:Bank     -150.00 USD

2023-01-15 * "ATM Withdrawal"
  Assets:Cash      100.00 USD
  Assets:Bank     -100.00 USD
`;

async function runTests() {
    console.log("Starting Unit Tests for Ledger...");

    const ledger = new Ledger();

    // Test 1: Open Accounts
    ledger.parse(DUMMY_DATA);
    // Accounts: Assets:Bank, Assets:Cash, Expenses:Food, Income:Salary, Equity:Opening-Balances (implied/padded)
    // Note: Our parser extracts 'open' directives.
    // openAccounts map size
    assert(ledger['openAccounts'].size === 4, "Should have 4 explicitly opened accounts");
    assert(ledger['openAccounts'].has('Assets:Bank'), "Assets:Bank should be open");

    // Test 2: Transactions Parsed
    // Transactions:
    // 1. Synthetic Opening Balance (2023-01-01 or 02 depending on logic)
    // 2. Paycheck (2023-01-05)
    // 3. Grocery (2023-01-10)
    // 4. ATM (2023-01-15)
    // Total 4 transactions.
    const allTransactions = ledger.getTransactions("2000-01-01", "2099-12-31");
    assertEqual(allTransactions.length, 4, "Should have 4 transactions including synthetic one");

    // Verify Synthetic
    const synthetic = allTransactions.find(t => t.isSynthetic);
    assert(!!synthetic, "Should have a synthetic opening balance transaction");
    if (synthetic) {
        assertEqual(synthetic.postings[0].account, "Assets:Bank", "Synthetic should target Assets:Bank");
        assertEqual(synthetic.postings[0].amount, 1000, "Synthetic amount should be 1000");
    }

    // Verify Tag Parsing
    const groceryParams = allTransactions.find(t => t.description === "Grocery Store");
    assert(!!groceryParams, "Should find 'Grocery Store' transaction");
    if (groceryParams) {
        assert(groceryParams.tags.includes("#food"), "Should have #food tag");
        assert(groceryParams.tags.includes("#groceries"), "Should have #groceries tag");
    }

    // Test 3: Get Balances (Date Range)
    // Checking Bank Balance
    // Start: 1000 + 2000 - 150 - 100 = 2750
    // As of 2023-01-31
    const balances = ledger.getBalances("2023-01-01", "2023-01-31");
    const bankBal = balances.find(b => b.account === "Assets:Bank");

    if (bankBal) {
        assertEqual(bankBal.endBalance, 2750, "Bank end balance should be 2750");
        // Start balance logic check:
        // Query Date: 2023-01-06 (After opening, after paycheck)
        const midMonth = ledger.getBalances("2023-01-06", "2023-01-31");
        const bankBalMid = midMonth.find(b => b.account === "Assets:Bank");
        if (bankBalMid) {
            // Start Balance: 1000 (Open) + 2000 (Paycheck) = 3000
            assertEqual(bankBalMid.startBalance, 3000, "Bank start balance on Jan 6 should be 3000");
        } else {
            assert(false, "Could not find Bank balance for mid-month");
        }
    } else {
        assert(false, "Could not find Bank balance");
    }

    // Test 4: Transaction Filters (Logic Verification)
    // Tag Filter
    const foodTx = allTransactions.filter(t => t.tags.includes("#food"));
    assertEqual(foodTx.length, 1, "Should have 1 transaction with #food tag");

    // Source Filter Logic (Mock)
    // Filter Source: Assets:Bank (Credits)
    // - Paycheck: Bank is Debit (Positive) -> No
    // - Grocery: Bank is Credit (-150) -> Yes
    // - ATM: Bank is Credit (-100) -> Yes
    // Expect 2
    const sourceBank = allTransactions.filter(t => t.postings.some(p => p.amount < 0 && p.account === "Assets:Bank"));
    assertEqual(sourceBank.length, 2, "Should match 2 transactions where Bank is source");

    // Target Filter Logic (Mock)
    // Filter Target: Expenses:Food (Debits)
    // - Grocery: Food is Debit (150) -> Yes
    // Expect 1
    const targetFood = allTransactions.filter(t => t.postings.some(p => p.amount > 0 && p.account === "Expenses:Food"));
    assertEqual(targetFood.length, 1, "Should match 1 transaction where Food is target");


    console.log("\n--- Test Summary ---");
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) process.exit(1);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
