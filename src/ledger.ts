export interface Balance {
    account: string;
    type: string;
    startBalance: number;
    endBalance: number;
    difference: number;
    currentBalance: number;
}

export interface Transaction {
    date: string;
    description: string;
    tags: string[];
    postings: { account: string; amount: number; currency: string }[];
    isSynthetic?: boolean;
}

export class Ledger {
    private transactions: Transaction[] = [];
    private openAccounts: Map<string, string> = new Map(); // Account -> Date
    private pads: { date: string; account: string; source: string }[] = [];
    private balances: { date: string; account: string; amount: number; currency: string }[] = [];

    parse(content: string) {
        this.transactions = [];
        this.openAccounts = new Map();
        this.pads = [];
        this.balances = [];

        const lines = content.split('\n');
        let currentTransaction: Transaction | null = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(';')) continue;

            const parts = trimmed.split(/\s+/);
            const date = parts[0];

            // Open directive: YYYY-MM-DD open Account ...
            if (parts[1] === 'open') {
                this.openAccounts.set(parts[2], parts[0]);
            }
            // Pad directive: YYYY-MM-DD pad Account Source
            else if (parts[1] === 'pad') {
                this.pads.push({ date: parts[0], account: parts[2], source: parts[3] });
            }
            // Balance directive: YYYY-MM-DD balance Account Amount Currency
            else if (parts[1] === 'balance') {
                this.balances.push({
                    date: parts[0],
                    account: parts[2],
                    amount: parseFloat(parts[3]),
                    currency: parts[4]
                });
            }
            // Transaction start: YYYY-MM-DD * "Desc" ...
            else if (/^\d{4}-\d{2}-\d{2}/.test(date) && (parts[1] === '*' || parts[1] === '!')) {
                // Parse Description and Tags
                // Format: YYYY-MM-DD * "Description" #tag1 #tag2
                const rest = trimmed.substring(date.length + parts[1].length + 2).trim();

                // Extract string in quotes for description
                let desc = "";
                let tagStr = rest;

                const quoteMatch = rest.match(/^"([^"]*)"/);
                if (quoteMatch) {
                    desc = quoteMatch[1];
                    tagStr = rest.substring(quoteMatch[0].length).trim();
                }

                // Extract tags from remainder
                const tags: string[] = [];
                const tagMatches = tagStr.matchAll(/(?:^|\s)(#[a-zA-Z0-9\-_]+)/g);
                for (const m of tagMatches) {
                    tags.push(m[1]);
                }

                currentTransaction = {
                    date: date,
                    description: desc,
                    tags: tags,
                    postings: []
                };
                this.transactions.push(currentTransaction);
            }
            // Posting line (indented): Account Amount Currency
            else if (currentTransaction && /^\s+/.test(line)) {
                // Determine if it's a posting line
                // Regex for posting: ws Account Amount Currency
                // Note: This is a simplified parser. It assumes standard formatting from our plugin.
                const postingMatch = line.match(/^\s+([A-Za-z0-9\-_:]+)\s+(-?[\d\.]+)\s+([A-Z]+)/);
                if (postingMatch) {
                    currentTransaction.postings.push({
                        account: postingMatch[1],
                        amount: parseFloat(postingMatch[2]),
                        currency: postingMatch[3]
                    });
                }
            } else {
                currentTransaction = null;
            }
        }

        // Sort transactions by date
        this.transactions.sort((a, b) => a.date.localeCompare(b.date));

        // Process Pad/Balance Logic (Simplified)
        // Beancount logic: modify prev transaction or insert transaction to match balance.
        // For dashboard: We insert a synthetic transaction on the balance check date if needed.
        // NOTE: This is complex. For this iteration, we will rely on reported transactions. 
        // Real Beancount `bean-query` handles this. We are emulating.
        // Improvement: Use balance assertions to insert adjustment transactions.

        this.applyBalanceAssertions();
    }

    // Naive implementation of balance assertions handling:
    // If a balance assertion exists, we check the running balance up to that date.
    // If different, we assume a PAD occurred or manual adjustment logic (not fully implemented here without full PAD logic).
    // For now, let's just use transactions. Full beancount logic is heavy. 
    // Wait, the user requirement mentions "Account Opening Balance" which uses PAD + BALANCE.
    // We MUST handle that.
    // `pad Account Source` means: Insert enough into `Account` from `Source` so that the next `balance` directive matches.

    private applyBalanceAssertions() {
        // Iterate balances, find preceding pad, insert transaction.
        // Sort balances by date.
        this.balances.sort((a, b) => a.date.localeCompare(b.date));

        for (const bal of this.balances) {
            // Calculate actual balance for this account up to bal.date
            // We need to calculate running balance of account occurring BEFORE bal.date (exclusive or inclusive? Beancount is start of day usually)
            // Beancount balance check typically happens at start of day (checks previous day closing).

            const running = this.calculateBalanceUpTo(bal.account, bal.date);
            const diff = bal.amount - running;

            if (Math.abs(diff) > 0.00001) {
                // Look for a PAD directive for this account before this date
                // We'll search backwards from bal.date
                const relevantPad = this.pads
                    .filter(p => p.account === bal.account && p.date <= bal.date)
                    .sort((a, b) => b.date.localeCompare(a.date))[0]; // Most recent pad

                if (relevantPad) {
                    // Create synthetic transaction
                    // Date = bal.date (or pad date? usually pad fills to balance) -> Beancount fills on pad date? 
                    // Actually, 'pad' directive specifies WHERE to fill.
                    this.transactions.push({
                        date: relevantPad.date, // Insert at pad date? Or balance date checks?
                        // Usually pad works with the *next* balance directive.
                        description: "Opening Balance Correction",
                        tags: [],
                        isSynthetic: true,
                        postings: [
                            { account: bal.account, amount: diff, currency: bal.currency },
                            { account: relevantPad.source, amount: -diff, currency: bal.currency }
                        ]
                    });

                    // Re-sort transactions
                    this.transactions.sort((a, b) => a.date.localeCompare(b.date));
                }
            }
        }
    }

    private calculateBalanceUpTo(account: string, date: string): number {
        let sum = 0;
        for (const t of this.transactions) {
            if (t.date < date) { // Balance check is usually "beginning of day" implies transactions strictly before? 
                // Or inclusive? 'balance' assertion asserts the accumulated balance /after/ all transactions of previous days.
                // So < date is correct.
                for (const p of t.postings) {
                    if (p.account === account) {
                        sum += p.amount;
                    }
                }
            }
        }
        return sum;
    }

    getBalances(startDate: string, endDate: string): Balance[] {
        const results: Map<string, Balance> = new Map();

        // Initialize all known accounts
        for (const [acc, _] of this.openAccounts) {
            results.set(acc, {
                account: acc,
                // Naive type extraction: Assets:Bank -> Assets
                type: acc.split(':')[0],
                startBalance: 0,
                endBalance: 0,
                difference: 0,
                currentBalance: 0
            });
        }

        // Also capture accounts seen in transactions even if not opened explicitly
        for (const t of this.transactions) {
            for (const p of t.postings) {
                if (!results.has(p.account)) {
                    results.set(p.account, {
                        account: p.account,
                        type: p.account.split(':')[0],
                        startBalance: 0,
                        endBalance: 0,
                        difference: 0,
                        currentBalance: 0
                    });
                }
            }
        }

        // Calculate balances

        for (const t of this.transactions) {
            for (const p of t.postings) {
                const res = results.get(p.account);
                if (!res) continue;

                const openDate = this.openAccounts.get(p.account);

                // Start Balance Logic
                // Requested: if start date < account opening date then show opening-balance as Start Balance
                let addToStart = false;

                if (openDate && startDate < openDate) {
                    // If we are in the "pre-opening" view:
                    // Include transactions UP TO opening date IF they are synthetic (Opening Balance)
                    // But EXCLUDE regular transactions that happen on the opening date or after.
                    if (t.date <= openDate) {
                        // Only include if it is synthetic (the opening balance) OR properly strictly before open date (shouldnt happen)
                        // User asked to exclude "transactions happening on the day of account opening" implies regular ones.
                        if (t.isSynthetic) {
                            addToStart = true;
                        } else if (t.date < openDate) {
                            addToStart = true;
                        }
                    }
                } else {
                    // Standard logic: Transactions strictly before start date
                    if (t.date < startDate) {
                        addToStart = true;
                    }
                }

                if (addToStart) {
                    res.startBalance += p.amount;
                }

                // End Balance (<= endDate)
                if (t.date <= endDate) {
                    res.endBalance += p.amount;
                }

                // Current Balance (All time)
                res.currentBalance += p.amount;
            }
        }

        // Calculate Difference and Format
        for (const res of results.values()) {
            res.difference = res.endBalance - res.startBalance;
            // Rounding for display clean up
            res.startBalance = Math.round(res.startBalance * 100) / 100;
            res.endBalance = Math.round(res.endBalance * 100) / 100;
            res.difference = Math.round(res.difference * 100) / 100;
            res.currentBalance = Math.round(res.currentBalance * 100) / 100;
        }

        // Filter out Equity:Opening-Balances as requested
        const finalResults = Array.from(results.values())
            .filter(r => r.account !== "Equity:Opening-Balances")
            .sort((a, b) => a.account.localeCompare(b.account));

        return finalResults;
    }

    getTransactions(startDate: string, endDate: string): Transaction[] {
        return this.transactions.filter(t => t.date >= startDate && t.date <= endDate);
    }
}
