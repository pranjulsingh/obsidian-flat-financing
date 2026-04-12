import { ItemView, WorkspaceLeaf, Setting, ButtonComponent, Notice } from "obsidian";
import ObsidianAccountingPlugin from "./main";
import { Ledger } from "./ledger";
import { AccountSuggest } from "./suggester";
import { EditTransactionModal } from "./modals";

export const DASHBOARD_VIEW_TYPE = "obsidian-accounting-dashboard";

export class AccountingDashboardView extends ItemView {
    plugin: ObsidianAccountingPlugin;
    ledger: Ledger;
    startDate: string;
    endDate: string;

    // Filters
    selectedTypes: Set<string> = new Set(['Assets']);
    selectedAccounts: Set<string> = new Set(); // For Summary Tab
    accountInput: string = "";

    // Transaction Tab Filters
    tagFilter: string = "";
    selectedSourceAccounts: Set<string> = new Set();
    selectedTargetAccounts: Set<string> = new Set();
    transactionSortColumn: string = "Date";
    transactionSortOrder: 'asc' | 'desc' = 'desc';

    // Summary Tab Sorting
    summarySortColumn: string = "Account";
    summarySortOrder: 'asc' | 'desc' = 'asc';

    // Tabs
    activeTab: 'summary' | 'transactions' = 'summary';

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianAccountingPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.ledger = new Ledger();
        // Default dates: First day of current month to Current Date
        const now = new Date();
        this.startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        this.endDate = now.toISOString().split('T')[0];
    }

    getViewType() {
        return DASHBOARD_VIEW_TYPE;
    }

    getDisplayText() {
        return "Accounting dashboard";
    }

    async onOpen() {
        await this.refresh(true);
    }

    async refresh(forceLoad: boolean = false) {
        const container = this.contentEl;
        container.empty();

        // Ensure data is loaded
        if (forceLoad || this.ledger['transactions'].length === 0) {
            const content = await this.plugin.fileUtils.getFileContent(this.plugin.settings.beancountFilePath);
            this.ledger.parse(content);
        }

        new Setting(container)
            .setName("Accounting dashboard")
            .setHeading();

        // Tab Buttons
        const tabContainer = container.createEl("div");
        tabContainer.addClass("accounting-dashboard-tabs");

        const summaryTab = tabContainer.createEl("div", { text: "Summary" });
        summaryTab.addClass("accounting-tab-button");
        if (this.activeTab === 'summary') summaryTab.addClass("active");

        summaryTab.onclick = () => {
            this.activeTab = 'summary';
            void this.refresh();
        };

        const transactionsTab = tabContainer.createEl("div", { text: "Transactions" });
        transactionsTab.addClass("accounting-tab-button");
        if (this.activeTab === 'transactions') transactionsTab.addClass("active");

        transactionsTab.onclick = () => {
            this.activeTab = 'transactions';
            void this.refresh();
        };


        // Controls Container
        const controls = container.createEl("div");
        controls.addClass("accounting-dashboard-controls");

        // Date Row (Shared)
        const dateRow = controls.createEl("div");
        dateRow.addClass("accounting-row");

        new Setting(dateRow)
            .setName("Start date")
            .addText(text => {
                text.inputEl.type = "date";
                text.setValue(this.startDate)
                    .onChange((val) => {
                        this.startDate = val;
                        this.renderCurrentView(container);
                    })
            });

        new Setting(dateRow)
            .setName("End date")
            .addText(text => {
                text.inputEl.type = "date";
                text.setValue(this.endDate)
                    .onChange((val) => {
                        this.endDate = val;
                        this.renderCurrentView(container);
                    })
            });

        new Setting(dateRow)
            .addButton(btn => btn
                .setButtonText("Refresh data")
                .onClick(() => {
                    void this.refresh(true); // Full refresh
                }))
            .addButton(btn => btn
                .setButtonText("Export CSV")
                .onClick(() => {
                    this.exportToCSV();
                }))
            .addButton(btn => btn
                .setButtonText("Export PDF (Markdown)")
                .onClick(() => {
                    void this.exportToMarkdown();
                }));

        // --- SUMMARY TAB FILTERS ---
        if (this.activeTab === 'summary') {
            // Type Filters Row
            const typeRow = controls.createEl("div");
            typeRow.addClass("accounting-filter-row");

            const typeLabel = typeRow.createSpan({ text: "Types: " });
            typeLabel.addClass("accounting-filter-label");

            const types = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'];
            types.forEach(type => {
                const span = typeRow.createEl("label");
                span.addClass("accounting-flex-item");

                const cb = span.createEl("input", { type: "checkbox" });
                cb.checked = this.selectedTypes.has(type);
                cb.onclick = () => {
                    if (cb.checked) this.selectedTypes.add(type);
                    else this.selectedTypes.delete(type);
                    this.renderCurrentView(container);
                };
                span.createSpan({ text: type });
            });

            // Account Filter Row
            const accRow = controls.createEl("div");
            accRow.addClass("accounting-row");

            const accLabel = accRow.createSpan({ text: "Filter accounts: " });
            accLabel.addClass("accounting-filter-label");

            const accInputDiv = accRow.createEl("div");
            const accInput = accInputDiv.createEl("input", { type: "text", placeholder: "Search account..." });

            const knownAccounts = Array.from(this.ledger['openAccounts']?.keys() || []);
            new AccountSuggest(this.app, accInput, knownAccounts);

            accInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") addAccountBtn.buttonEl.click();
            });

            const addAccountBtn = new ButtonComponent(accRow)
                .setButtonText("Add filter")
                .onClick(() => {
                    const val = accInput.value.trim();
                    if (val && !this.selectedAccounts.has(val)) {
                        this.selectedAccounts.add(val);
                        accInput.value = "";
                        this.renderSelectedAccounts(selectedAccsContainer, container, this.selectedAccounts, 'summary');
                        this.renderCurrentView(container);
                    }
                });

            // Selected Accounts Container
            const selectedAccsContainer = controls.createEl("div");
            selectedAccsContainer.addClass("accounting-pill-container");
            this.renderSelectedAccounts(selectedAccsContainer, container, this.selectedAccounts, 'summary');
        }

        // --- TRANSACTIONS TAB FILTERS ---
        if (this.activeTab === 'transactions') {
            // 1. Tag Filter
            const tagRow = controls.createEl("div");
            tagRow.addClass("accounting-row");

            const tagLabel = tagRow.createSpan({ text: "Filter tag: " });
            tagLabel.addClass("accounting-filter-label");

            new Setting(tagRow)
                .addText(text => text
                    .setPlaceholder("#tag")
                    .setValue(this.tagFilter)
                    .onChange((val) => {
                        this.tagFilter = val;
                        this.renderTransactionsTable(container);
                    }));

            const knownAccounts = Array.from(this.ledger['openAccounts']?.keys() || []);

            // 2. Source Account Filter
            const sourceRow = controls.createEl("div");
            sourceRow.addClass("accounting-row");
            const sourceLabel = sourceRow.createSpan({ text: "Source accounts: " });
            sourceLabel.addClass("accounting-filter-label");

            const sourceInput = sourceRow.createEl("input", { type: "text", placeholder: "Search source..." });
            new AccountSuggest(this.app, sourceInput, knownAccounts);
            sourceInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addSourceBtn.buttonEl.click(); });

            const addSourceBtn = new ButtonComponent(sourceRow).setButtonText("Add").onClick(() => {
                const val = sourceInput.value.trim();
                if (val && !this.selectedSourceAccounts.has(val)) {
                    this.selectedSourceAccounts.add(val);
                    sourceInput.value = "";
                    this.renderSelectedAccounts(selectedSourceContainer, container, this.selectedSourceAccounts, 'transactions');
                    this.renderCurrentView(container);
                }
            });
            const selectedSourceContainer = controls.createEl("div");
            selectedSourceContainer.addClass("accounting-pill-container");
            this.renderSelectedAccounts(selectedSourceContainer, container, this.selectedSourceAccounts, 'transactions');

            // 3. Target Account Filter
            const targetRow = controls.createEl("div");
            targetRow.addClass("accounting-row");
            const targetLabel = targetRow.createSpan({ text: "Target accounts: " });
            targetLabel.addClass("accounting-filter-label");

            const targetInput = targetRow.createEl("input", { type: "text", placeholder: "Search target..." });
            new AccountSuggest(this.app, targetInput, knownAccounts);
            targetInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addTargetBtn.buttonEl.click(); });

            const addTargetBtn = new ButtonComponent(targetRow).setButtonText("Add").onClick(() => {
                const val = targetInput.value.trim();
                if (val && !this.selectedTargetAccounts.has(val)) {
                    this.selectedTargetAccounts.add(val);
                    targetInput.value = "";
                    this.renderSelectedAccounts(selectedTargetContainer, container, this.selectedTargetAccounts, 'transactions');
                    this.renderCurrentView(container);
                }
            });
            const selectedTargetContainer = controls.createEl("div");
            selectedTargetContainer.addClass("accounting-pill-container");
            this.renderSelectedAccounts(selectedTargetContainer, container, this.selectedTargetAccounts, 'transactions');
        }


        // Table Container
        const tableContainer = container.createEl("div");
        tableContainer.addClass("accounting-table-container");

        this.renderCurrentView(container);
    }

    renderCurrentView(container: HTMLElement) {
        if (this.activeTab === 'summary') {
            this.renderTable(container);
        } else {
            this.renderTransactionsTable(container);
        }
    }

    renderSelectedAccounts(container: HTMLElement, viewContainer: HTMLElement, set: Set<string>, tabContext: string) {
        container.empty();
        if (set.size === 0) return;

        set.forEach(acc => {
            const pill = container.createEl("div");
            pill.addClass("accounting-pill");

            pill.createSpan({ text: acc });
            const close = pill.createEl("span", { text: "✖" });
            close.addClass("accounting-pill-close");
            close.onclick = () => {
                set.delete(acc);
                // Re-render only own container
                this.renderSelectedAccounts(container, viewContainer, set, tabContext);
                this.renderCurrentView(viewContainer);
            };
        });
    }

    renderTable(container: HTMLElement) {
        // Find existing table container or use the one created
        let tableContainer = container.querySelector(".accounting-table-container");
        if (!tableContainer) return; // Should exist

        tableContainer.empty();

        let balances = this.ledger.getBalances(this.startDate, this.endDate, this.plugin.settings);

        // Apply Filters
        balances = balances.filter(bal => {
            // Type Filter
            if (this.selectedTypes.size > 0 && !this.selectedTypes.has(bal.type)) {
                return false;
            }
            // Account Filter
            if (this.selectedAccounts.size > 0 && !this.selectedAccounts.has(bal.account)) {
                return false;
            }
            return true;
        });

        // Apply Sorting
        balances.sort((a, b) => {
            let valA: string | number = "";
            let valB: string | number = "";
            
            if (this.summarySortColumn === "Type") { valA = a.type; valB = b.type; }
            else if (this.summarySortColumn === "Account") { valA = a.account; valB = b.account; }
            else if (this.summarySortColumn === "Start balance") { valA = a.startBalance; valB = b.startBalance; }
            else if (this.summarySortColumn === "End balance") { valA = a.endBalance; valB = b.endBalance; }
            else if (this.summarySortColumn === "Difference") { valA = a.difference; valB = b.difference; }
            else if (this.summarySortColumn === "Current balance") { valA = a.currentBalance; valB = b.currentBalance; }

            if (valA < valB) return this.summarySortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return this.summarySortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        const currency = this.plugin.settings.currencySymbol;

        const table = tableContainer.createEl("table");
        table.addClass("accounting-table");

        // Header
        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");
        const headers = ["Type", "Account", "Start balance", "End balance", "Difference", "Current balance"];
        headers.forEach(h => {
            const th = headerRow.createEl("th");
            th.setText(this.summarySortColumn === h ? `${h} ${this.summarySortOrder === 'asc' ? '↑' : '↓'}` : h);
            th.style.cursor = "pointer";
            th.onclick = () => {
                if (this.summarySortColumn === h) {
                    this.summarySortOrder = this.summarySortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    this.summarySortColumn = h;
                    this.summarySortOrder = 'asc';
                }
                this.renderCurrentView(container);
            };
            if (["Start balance", "End balance", "Difference", "Current balance"].includes(h)) {
                th.addClass("accounting-align-right");
            }
        });

        // Body
        const tbody = table.createEl("tbody");

        let totalStart = 0;
        let totalEnd = 0;
        let totalDiff = 0;
        let totalCurr = 0;

        balances.forEach(bal => {
            const row = tbody.createEl("tr");

            // Cells
            this.createCell(row, bal.type);
            this.createCell(row, bal.account);
            this.createCell(row, `${bal.startBalance.toFixed(2)} ${currency}`);
            this.createCell(row, `${bal.endBalance.toFixed(2)} ${currency}`);
            this.createCell(row, `${bal.difference.toFixed(2)} ${currency}`);
            this.createCell(row, `${bal.currentBalance.toFixed(2)} ${currency}`);

            totalStart += bal.startBalance;
            totalEnd += bal.endBalance;
            totalDiff += bal.difference;
            totalCurr += bal.currentBalance;
        });

        // Footer (Totals)
        const tfoot = table.createEl("tfoot");
        const footerRow = tfoot.createEl("tr");
        footerRow.addClass("accounting-table-footer");

        this.createCell(footerRow, "TOTAL");
        this.createCell(footerRow, `(${balances.length} filtered)`); // Account placeholder
        this.createCell(footerRow, `${totalStart.toFixed(2)} ${currency}`);
        this.createCell(footerRow, `${totalEnd.toFixed(2)} ${currency}`);
        this.createCell(footerRow, `${totalDiff.toFixed(2)} ${currency}`);
        this.createCell(footerRow, `${totalCurr.toFixed(2)} ${currency}`);
    }

    renderTransactionsTable(container: HTMLElement) {
        let tableContainer = container.querySelector(".accounting-table-container");
        if (!tableContainer) return;
        tableContainer.empty();

        let transactions = this.ledger.getTransactions(this.startDate, this.endDate, this.plugin.settings);

        // Filter Transactions
        transactions = transactions.filter(t => {
            // Tag Filter
            if (this.tagFilter) {
                const filterTag = this.tagFilter.startsWith("#") ? this.tagFilter.substring(1) : this.tagFilter;
                if (!t.tags.some(tag => tag.toLowerCase().includes(filterTag.toLowerCase()))) return false;
            }

            // Source Accounts Filter (Money leaving account, i.e. Credit/Negative)
            if (this.selectedSourceAccounts.size > 0) {
                // Keep transaction if ANY negative posting matches one of the selected source accounts
                const hasSource = t.postings.some(p => p.amount < 0 && this.selectedSourceAccounts.has(p.account));
                if (!hasSource) return false;
            }

            // Target Accounts Filter (Money entering account, i.e. Debit/Positive)
            if (this.selectedTargetAccounts.size > 0) {
                // Keep transaction if ANY positive posting matches one of the selected target accounts
                const hasTarget = t.postings.some(p => p.amount > 0 && this.selectedTargetAccounts.has(p.account));
                if (!hasTarget) return false;
            }

            return true;
        });

        // Sort Transactions
        transactions.sort((a, b) => {
            let valA: string | number = "";
            let valB: string | number = "";

            if (this.transactionSortColumn === "Date") { valA = a.date; valB = b.date; }
            else if (this.transactionSortColumn === "Tag") { valA = a.tags.join(" "); valB = b.tags.join(" "); }
            else if (this.transactionSortColumn === "Description") { valA = a.description; valB = b.description; }
            else if (this.transactionSortColumn === "Source account") { valA = a.postings.filter(p => p.amount < 0).map(p => p.account).join(", "); valB = b.postings.filter(p => p.amount < 0).map(p => p.account).join(", "); }
            else if (this.transactionSortColumn === "Target account") { valA = a.postings.filter(p => p.amount > 0).map(p => p.account).join(", "); valB = b.postings.filter(p => p.amount > 0).map(p => p.account).join(", "); }
            else if (this.transactionSortColumn === "Amount") { valA = a.postings.filter(p => p.amount > 0).reduce((acc, p) => acc + p.amount, 0); valB = b.postings.filter(p => p.amount > 0).reduce((acc, p) => acc + p.amount, 0); }

            if (valA < valB) return this.transactionSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return this.transactionSortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        const table = tableContainer.createEl("table");
        table.addClass("accounting-table");

        // Header
        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");
        const headers = ["Date", "Tag", "Description", "Source account", "Target account", "Amount", "Edit"];
        headers.forEach(h => {
            const th = headerRow.createEl("th");
            if (h !== "Edit") {
                th.setText(this.transactionSortColumn === h ? `${h} ${this.transactionSortOrder === 'asc' ? '↑' : '↓'}` : h);
                th.style.cursor = "pointer";
                th.onclick = () => {
                    if (this.transactionSortColumn === h) {
                        this.transactionSortOrder = this.transactionSortOrder === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.transactionSortColumn = h;
                        this.transactionSortOrder = h === "Date" ? 'desc' : 'asc'; // Date defaults desc, others default asc
                    }
                    this.renderTransactionsTable(container);
                };
            } else {
                th.setText(h);
            }
            if (h === "Amount") th.addClass("accounting-align-right");
        });

        const tbody = table.createEl("tbody");

        const currency = this.plugin.settings.currencySymbol;
        let totalAmount = 0;

        transactions.forEach(t => {
            const row = tbody.createEl("tr");

            this.createCell(row, t.date);

            // Tag Column
            const tagCell = row.createEl("td");
            if (t.tags.length > 0) {
                t.tags.forEach(tag => {
                    const span = tagCell.createSpan({ text: tag });
                    span.addClass("accounting-tag-pill");
                });
            } else {
                tagCell.setText("");
            }

            this.createCell(row, t.description);

            // Logic for Source/Target/Amount
            const sources = t.postings.filter(p => p.amount < 0);
            const targets = t.postings.filter(p => p.amount > 0);

            const sourceText = sources.map(p => p.account).join(", ");
            const targetText = targets.map(p => p.account).join(", ");

            // Calculate transaction "value" (sum of positive legs)
            const amount = targets.reduce((acc, p) => acc + p.amount, 0);

            this.createCell(row, sourceText);
            this.createCell(row, targetText);

            const amountCell = row.createEl("td", { text: `${amount.toFixed(2)} ${currency}` });
            amountCell.addClass("accounting-align-right");

            const editCell = row.createEl("td");
            new ButtonComponent(editCell)
                .setIcon("pencil")
                .onClick(() => {
                    const modal = new EditTransactionModal(this.app, this.plugin, t);
                    modal.open();
                });

            totalAmount += amount;
        });

        // Total Row
        const tfoot = table.createEl("tfoot");
        const footerRow = tfoot.createEl("tr");
        footerRow.addClass("accounting-table-footer");

        // Date, Tag, Desc, Source, Target, Amount (6 columns)
        // Span first 5 cols for "Total" label
        const totalLabelCell = footerRow.createEl("td", { text: "TOTAL" });
        totalLabelCell.colSpan = 5;
        totalLabelCell.addClass("accounting-align-right");

        const totalValueCell = footerRow.createEl("td", { text: `${totalAmount.toFixed(2)} ${currency}` });
        totalValueCell.addClass("accounting-align-right");
    }

    createCell(row: HTMLElement, text: string) {
        row.createEl("td", { text: text });
    }

    async onClose() {
        // Cleanup if needed
    }

    // --- EXPORT LOGIC ---
    exportToCSV() {
        if (this.activeTab === 'summary') {
            const data = this.getTableDataForSummary();
            this.downloadCSV("summary.csv", data.headers, data.rows);
        } else {
            const data = this.getTableDataForTransactions();
            this.downloadCSV("transactions.csv", data.headers, data.rows);
        }
    }

    async exportToMarkdown() {
        if (this.activeTab === 'summary') {
            const data = this.getTableDataForSummary();
            await this.downloadMarkdown("summary", data.headers, data.rows);
        } else {
            const data = this.getTableDataForTransactions();
            await this.downloadMarkdown("transactions", data.headers, data.rows);
        }
    }

    private downloadCSV(filename: string, headers: string[], rows: string[][]) {
        let csvContent = headers.map(h => `"${h}"`).join(",") + "\n";
        csvContent += rows.map(e => e.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    private async downloadMarkdown(prefix: string, headers: string[], rows: string[][]) {
        let content = `# Accounting Export - ${prefix}\n\n`;
        content += `| ${headers.join(" | ")} |\n`;
        content += `| ${headers.map(() => "---").join(" | ")} |\n`;
        rows.forEach(row => {
            content += `| ${row.join(" | ")} |\n`;
        });
        
        const path = `Accounting_Export_${prefix}_${new Date().getTime()}.md`;
        await this.app.vault.create(path, content);
        new Notice(`Exported to ${path}. Open this file and use 'Export to PDF'.`);
    }

    private getTableDataForSummary(): { headers: string[], rows: string[][] } {
        const headers = ["Type", "Account", "Start balance", "End balance", "Difference", "Current balance"];
        const rows: string[][] = [];
        const currency = this.plugin.settings.currencySymbol;

        let balances = this.ledger.getBalances(this.startDate, this.endDate, this.plugin.settings);
        balances = balances.filter(bal => {
            if (this.selectedTypes.size > 0 && !this.selectedTypes.has(bal.type)) return false;
            if (this.selectedAccounts.size > 0 && !this.selectedAccounts.has(bal.account)) return false;
            return true;
        });

        let totalStart = 0; let totalEnd = 0; let totalDiff = 0; let totalCurr = 0;

        balances.forEach(bal => {
            rows.push([
                bal.type, bal.account,
                `${bal.startBalance.toFixed(2)} ${currency}`,
                `${bal.endBalance.toFixed(2)} ${currency}`,
                `${bal.difference.toFixed(2)} ${currency}`,
                `${bal.currentBalance.toFixed(2)} ${currency}`
            ]);
            totalStart += bal.startBalance; totalEnd += bal.endBalance; totalDiff += bal.difference; totalCurr += bal.currentBalance;
        });

        rows.push(["TOTAL", `(${balances.length} filtered)`, `${totalStart.toFixed(2)} ${currency}`, `${totalEnd.toFixed(2)} ${currency}`, `${totalDiff.toFixed(2)} ${currency}`, `${totalCurr.toFixed(2)} ${currency}`]);

        return { headers, rows };
    }

    private getTableDataForTransactions(): { headers: string[], rows: string[][] } {
        const headers = ["Date", "Tag", "Description", "Source account", "Target account", "Amount"];
        const rows: string[][] = [];
        const currency = this.plugin.settings.currencySymbol;

        let transactions = this.ledger.getTransactions(this.startDate, this.endDate, this.plugin.settings);
        transactions = transactions.filter(t => {
            if (this.tagFilter) {
                const filterTag = this.tagFilter.startsWith("#") ? this.tagFilter.substring(1) : this.tagFilter;
                if (!t.tags.some(tag => tag.toLowerCase().includes(filterTag.toLowerCase()))) return false;
            }
            if (this.selectedSourceAccounts.size > 0 && !t.postings.some(p => p.amount < 0 && this.selectedSourceAccounts.has(p.account))) return false;
            if (this.selectedTargetAccounts.size > 0 && !t.postings.some(p => p.amount > 0 && this.selectedTargetAccounts.has(p.account))) return false;
            return true;
        });

        transactions.sort((a, b) => {
            if (this.transactionSortOrder === 'asc') return a.date.localeCompare(b.date);
            return b.date.localeCompare(a.date);
        });

        let totalAmount = 0;

        transactions.forEach(t => {
            const sources = t.postings.filter(p => p.amount < 0);
            const targets = t.postings.filter(p => p.amount > 0);
            const sourceText = sources.map(p => p.account).join(", ");
            const targetText = targets.map(p => p.account).join(", ");
            const amount = targets.reduce((acc, p) => acc + p.amount, 0);

            rows.push([
                t.date,
                t.tags.join(" "),
                t.description,
                sourceText,
                targetText,
                `${amount.toFixed(2)} ${currency}`
            ]);
            totalAmount += amount;
        });

        rows.push(["TOTAL", "", "", "", "", `${totalAmount.toFixed(2)} ${currency}`]);

        return { headers, rows };
    }
}
