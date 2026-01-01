import { ItemView, WorkspaceLeaf, Setting, ButtonComponent } from "obsidian";
import ObsidianAccountingPlugin from "./main";
import { Ledger, BalanceResult } from "./ledger";
import { AccountSuggest } from "./suggester";

export const DASHBOARD_VIEW_TYPE = "obsidian-accounting-dashboard";

export class AccountingDashboardView extends ItemView {
    plugin: ObsidianAccountingPlugin;
    ledger: Ledger;
    startDate: string;
    endDate: string;

    // Filters
    selectedTypes: Set<string> = new Set(['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses']);
    selectedAccounts: Set<string> = new Set(); // For Summary Tab
    accountInput: string = "";

    // Transaction Tab Filters
    tagFilter: string = "";
    selectedSourceAccounts: Set<string> = new Set();
    selectedTargetAccounts: Set<string> = new Set();

    // Tabs
    activeTab: 'summary' | 'transactions' = 'summary';

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianAccountingPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.ledger = new Ledger();
        // Default dates: 2000-01-01 to Current Date
        this.startDate = "2000-01-01";
        this.endDate = new Date().toISOString().split('T')[0];
    }

    getViewType() {
        return DASHBOARD_VIEW_TYPE;
    }

    getDisplayText() {
        return "Accounting Dashboard";
    }

    async onOpen() {
        await this.refresh();
    }

    async refresh() {
        const container = this.contentEl;
        container.empty();

        // Ensure data is loaded
        if (this.ledger['transactions'].length === 0) {
            const content = await this.plugin.fileUtils.getFileContent(this.plugin.settings.beancountFilePath);
            this.ledger.parse(content);
        }

        container.createEl("h2", { text: "Accounting Dashboard" });

        // Tab Buttons
        const tabContainer = container.createEl("div", { cls: "accounting-dashboard-tabs" });
        tabContainer.style.display = "flex";
        tabContainer.style.borderBottom = "1px solid var(--background-modifier-border)";
        tabContainer.style.marginBottom = "15px";

        const summaryTab = tabContainer.createEl("div", { text: "Summary", cls: "nav-button" });
        summaryTab.style.padding = "10px 20px";
        summaryTab.style.cursor = "pointer";
        summaryTab.style.fontWeight = this.activeTab === 'summary' ? 'bold' : 'normal';
        summaryTab.style.borderBottom = this.activeTab === 'summary' ? '2px solid var(--interactive-accent)' : 'none';
        summaryTab.onclick = () => { this.activeTab = 'summary'; this.refresh(); };

        const transactionsTab = tabContainer.createEl("div", { text: "Transactions", cls: "nav-button" });
        transactionsTab.style.padding = "10px 20px";
        transactionsTab.style.cursor = "pointer";
        transactionsTab.style.fontWeight = this.activeTab === 'transactions' ? 'bold' : 'normal';
        transactionsTab.style.borderBottom = this.activeTab === 'transactions' ? '2px solid var(--interactive-accent)' : 'none';
        transactionsTab.onclick = () => { this.activeTab = 'transactions'; this.refresh(); };


        // Controls Container
        const controls = container.createEl("div", { cls: "accounting-dashboard-controls" });
        controls.style.display = "flex";
        controls.style.flexDirection = "column";
        controls.style.gap = "10px";
        controls.style.marginBottom = "20px";
        controls.style.padding = "10px";
        controls.style.border = "1px solid var(--background-modifier-border)";
        controls.style.borderRadius = "5px";

        // Date Row (Shared)
        const dateRow = controls.createEl("div");
        dateRow.style.display = "flex";
        dateRow.style.gap = "20px";
        dateRow.style.alignItems = "center";

        new Setting(dateRow)
            .setName("Start Date")
            .addText(text => {
                text.inputEl.type = "date";
                text.setValue(this.startDate)
                    .onChange(async (val) => {
                        this.startDate = val;
                        await this.renderCurrentView(container);
                    })
            });

        new Setting(dateRow)
            .setName("End Date")
            .addText(text => {
                text.inputEl.type = "date";
                text.setValue(this.endDate)
                    .onChange(async (val) => {
                        this.endDate = val;
                        await this.renderCurrentView(container);
                    })
            });

        new Setting(dateRow)
            .addButton(btn => btn
                .setButtonText("Refresh Data")
                .onClick(async () => {
                    await this.refresh(); // Full refresh
                }));

        // --- SUMMARY TAB FILTERS ---
        if (this.activeTab === 'summary') {
            // Type Filters Row
            const typeRow = controls.createEl("div");
            typeRow.style.display = "flex";
            typeRow.style.gap = "15px";
            typeRow.style.alignItems = "center";

            const typeLabel = typeRow.createSpan({ text: "Types: " });
            typeLabel.style.fontWeight = "bold";

            const types = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'];
            types.forEach(type => {
                const span = typeRow.createEl("label");
                span.style.display = "flex";
                span.style.gap = "5px";
                span.style.alignItems = "center";

                const cb = span.createEl("input", { type: "checkbox" });
                cb.checked = this.selectedTypes.has(type);
                cb.onclick = async () => {
                    if (cb.checked) this.selectedTypes.add(type);
                    else this.selectedTypes.delete(type);
                    await this.renderCurrentView(container);
                };
                span.createSpan({ text: type });
            });

            // Account Filter Row
            const accRow = controls.createEl("div");
            accRow.style.display = "flex";
            accRow.style.gap = "10px";
            accRow.style.alignItems = "center";

            const accLabel = accRow.createSpan({ text: "Filter Accounts: " });
            accLabel.style.fontWeight = "bold";

            const accInputDiv = accRow.createEl("div");
            const accInput = accInputDiv.createEl("input", { type: "text", placeholder: "Search account..." });

            const knownAccounts = Array.from(this.ledger['openAccounts']?.keys() || []);
            new AccountSuggest(this.app, accInput, knownAccounts);

            accInput.onkeypress = (e) => {
                if (e.key === "Enter") addAccountBtn.buttonEl.click();
            };

            const addAccountBtn = new ButtonComponent(accRow)
                .setButtonText("Add Filter")
                .onClick(async () => {
                    const val = accInput.value.trim();
                    if (val && !this.selectedAccounts.has(val)) {
                        this.selectedAccounts.add(val);
                        accInput.value = "";
                        this.renderSelectedAccounts(selectedAccsContainer, container, this.selectedAccounts, 'summary');
                        await this.renderCurrentView(container);
                    }
                });

            // Selected Accounts Container
            const selectedAccsContainer = controls.createEl("div");
            selectedAccsContainer.style.display = "flex";
            selectedAccsContainer.style.flexWrap = "wrap";
            selectedAccsContainer.style.gap = "5px";
            selectedAccsContainer.style.marginTop = "5px";
            this.renderSelectedAccounts(selectedAccsContainer, container, this.selectedAccounts, 'summary');
        }

        // --- TRANSACTIONS TAB FILTERS ---
        if (this.activeTab === 'transactions') {
            // 1. Tag Filter
            const tagRow = controls.createEl("div");
            tagRow.style.display = "flex";
            tagRow.style.gap = "10px";
            tagRow.style.alignItems = "center";

            const tagLabel = tagRow.createSpan({ text: "Filter Tag: " });
            tagLabel.style.fontWeight = "bold";

            new Setting(tagRow)
                .addText(text => text
                    .setPlaceholder("#tag")
                    .setValue(this.tagFilter)
                    .onChange(async (val) => {
                        this.tagFilter = val;
                        await this.renderTransactionsTable(container);
                    }));

            const knownAccounts = Array.from(this.ledger['openAccounts']?.keys() || []);

            // 2. Source Account Filter
            const sourceRow = controls.createEl("div");
            sourceRow.style.display = "flex";
            sourceRow.style.gap = "10px";
            sourceRow.style.alignItems = "center";
            sourceRow.createSpan({ text: "Source Accounts: ", cls: "accounting-filter-label" }).style.fontWeight = "bold";

            const sourceInput = sourceRow.createEl("input", { type: "text", placeholder: "Search Source..." });
            new AccountSuggest(this.app, sourceInput, knownAccounts);
            sourceInput.onkeypress = (e) => { if (e.key === "Enter") addSourceBtn.buttonEl.click(); };

            const addSourceBtn = new ButtonComponent(sourceRow).setButtonText("Add").onClick(async () => {
                const val = sourceInput.value.trim();
                if (val && !this.selectedSourceAccounts.has(val)) {
                    this.selectedSourceAccounts.add(val);
                    sourceInput.value = "";
                    this.renderSelectedAccounts(selectedSourceContainer, container, this.selectedSourceAccounts, 'transactions');
                    await this.renderCurrentView(container);
                }
            });
            const selectedSourceContainer = controls.createEl("div");
            selectedSourceContainer.style.display = "flex";
            selectedSourceContainer.style.gap = "5px";
            selectedSourceContainer.style.marginBottom = "5px";
            this.renderSelectedAccounts(selectedSourceContainer, container, this.selectedSourceAccounts, 'transactions');

            // 3. Target Account Filter
            const targetRow = controls.createEl("div");
            targetRow.style.display = "flex";
            targetRow.style.gap = "10px";
            targetRow.style.alignItems = "center";
            targetRow.createSpan({ text: "Target Accounts: ", cls: "accounting-filter-label" }).style.fontWeight = "bold";

            const targetInput = targetRow.createEl("input", { type: "text", placeholder: "Search Target..." });
            new AccountSuggest(this.app, targetInput, knownAccounts);
            targetInput.onkeypress = (e) => { if (e.key === "Enter") addTargetBtn.buttonEl.click(); };

            const addTargetBtn = new ButtonComponent(targetRow).setButtonText("Add").onClick(async () => {
                const val = targetInput.value.trim();
                if (val && !this.selectedTargetAccounts.has(val)) {
                    this.selectedTargetAccounts.add(val);
                    targetInput.value = "";
                    this.renderSelectedAccounts(selectedTargetContainer, container, this.selectedTargetAccounts, 'transactions');
                    await this.renderCurrentView(container);
                }
            });
            const selectedTargetContainer = controls.createEl("div");
            selectedTargetContainer.style.display = "flex";
            selectedTargetContainer.style.gap = "5px";
            this.renderSelectedAccounts(selectedTargetContainer, container, this.selectedTargetAccounts, 'transactions');
        }


        // Table Container
        const tableContainer = container.createEl("div", { cls: "accounting-table-container" });
        tableContainer.style.overflowY = "auto";
        tableContainer.style.maxHeight = "calc(100% - 350px)";
        tableContainer.style.marginTop = "10px";

        await this.renderCurrentView(container);
    }

    async renderCurrentView(container: HTMLElement) {
        if (this.activeTab === 'summary') {
            await this.renderTable(container);
        } else {
            await this.renderTransactionsTable(container);
        }
    }

    renderSelectedAccounts(container: HTMLElement, viewContainer: HTMLElement, set: Set<string>, tabContext: string) {
        container.empty();
        if (set.size === 0) return;

        set.forEach(acc => {
            const pill = container.createEl("div");
            pill.style.background = "var(--interactive-accent)";
            pill.style.color = "var(--text-on-accent)";
            pill.style.padding = "2px 8px";
            pill.style.borderRadius = "10px";
            pill.style.display = "flex";
            pill.style.gap = "5px";
            pill.style.alignItems = "center";
            pill.style.fontSize = "0.9em";

            pill.createSpan({ text: acc });
            const close = pill.createEl("span", { text: "✖" });
            close.style.cursor = "pointer";
            close.onclick = async () => {
                set.delete(acc);
                // Re-render only own container
                this.renderSelectedAccounts(container, viewContainer, set, tabContext);
                await this.renderCurrentView(viewContainer);
            };
        });
    }

    async renderTable(container: HTMLElement) {
        // Find existing table container or use the one created
        let tableContainer = container.querySelector(".accounting-table-container") as HTMLElement;
        if (!tableContainer) return; // Should exist

        tableContainer.empty();

        let balances = this.ledger.getBalances(this.startDate, this.endDate);

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

        const currency = this.plugin.settings.currencySymbol;

        const table = tableContainer.createEl("table");
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";

        // Header
        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");
        const headers = ["Type", "Account", "Start Balance", "End Balance", "Difference", "Current Balance"];
        headers.forEach(h => {
            const th = headerRow.createEl("th", { text: h });
            th.style.textAlign = "left";
            th.style.borderBottom = "1px solid var(--background-modifier-border)";
            th.style.padding = "10px";
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

        // Footer (Totals) - Added as a last row in tbody or tfoot
        const tfoot = table.createEl("tfoot");
        const footerRow = tfoot.createEl("tr");
        footerRow.style.fontWeight = "bold";
        footerRow.style.background = "var(--background-secondary)";

        this.createCell(footerRow, "TOTAL");
        this.createCell(footerRow, `(${balances.length} filtered)`); // Account placeholder
        this.createCell(footerRow, `${totalStart.toFixed(2)} ${currency}`);
        this.createCell(footerRow, `${totalEnd.toFixed(2)} ${currency}`);
        this.createCell(footerRow, `${totalDiff.toFixed(2)} ${currency}`);
        this.createCell(footerRow, `${totalCurr.toFixed(2)} ${currency}`);
    }

    async renderTransactionsTable(container: HTMLElement) {
        let tableContainer = container.querySelector(".accounting-table-container") as HTMLElement;
        if (!tableContainer) return;
        tableContainer.empty();

        let transactions = this.ledger.getTransactions(this.startDate, this.endDate);

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

        const table = tableContainer.createEl("table");
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";

        // Header
        const thead = table.createEl("thead");
        const headerRow = thead.createEl("tr");
        const headers = ["Date", "Tag", "Description", "Source Account", "Target Account", "Amount"];
        headers.forEach(h => {
            const th = headerRow.createEl("th", { text: h });
            th.style.textAlign = "left";
            th.style.borderBottom = "1px solid var(--background-modifier-border)";
            th.style.padding = "10px";
            // Align Amount to right?
            if (h === "Amount") th.style.textAlign = "right";
        });

        const tbody = table.createEl("tbody");

        const currency = this.plugin.settings.currencySymbol;
        let totalAmount = 0;

        transactions.forEach(t => {
            const row = tbody.createEl("tr");

            this.createCell(row, t.date);

            // Tag Column
            const tagCell = row.createEl("td");
            tagCell.style.padding = "5px 10px";
            tagCell.style.borderBottom = "1px solid var(--background-modifier-border)";
            if (t.tags.length > 0) {
                t.tags.forEach(tag => {
                    const span = tagCell.createSpan({ text: tag });
                    span.style.background = "var(--background-modifier-accent)";
                    span.style.color = "var(--text-on-accent)";
                    span.style.borderRadius = "5px";
                    span.style.padding = "2px 5px";
                    span.style.fontSize = "0.8em";
                    span.style.marginRight = "5px";
                    span.style.whiteSpace = "nowrap";
                });
            } else {
                tagCell.setText("");
            }

            this.createCell(row, t.description);

            // Logic for Source/Target/Amount
            // Source: Negative amounts (Credit)
            // Target: Positive amounts (Debit)
            // Amount: Absolute sum of positives (flow magnitude)

            const sources = t.postings.filter(p => p.amount < 0);
            const targets = t.postings.filter(p => p.amount > 0);

            const sourceText = sources.map(p => p.account).join(", ");
            const targetText = targets.map(p => p.account).join(", ");

            // Calculate transaction "value" (sum of positive legs)
            const amount = targets.reduce((acc, p) => acc + p.amount, 0);

            this.createCell(row, sourceText);
            this.createCell(row, targetText);

            const amountCell = row.createEl("td", { text: `${amount.toFixed(2)} ${currency}` });
            amountCell.style.padding = "5px 10px";
            amountCell.style.borderBottom = "1px solid var(--background-modifier-border)";
            amountCell.style.textAlign = "right";

            totalAmount += amount;
        });

        // Total Row
        const tfoot = table.createEl("tfoot");
        const footerRow = tfoot.createEl("tr");
        footerRow.style.fontWeight = "bold";
        footerRow.style.background = "var(--background-secondary)";

        // Date, Tag, Desc, Source, Target, Amount (6 columns)
        // Span first 5 cols for "Total" label
        const totalLabelCell = footerRow.createEl("td", { text: "TOTAL" });
        totalLabelCell.colSpan = 5;
        totalLabelCell.style.padding = "5px 10px";
        totalLabelCell.style.textAlign = "right"; // Right align label to be close to amount

        const totalValueCell = footerRow.createEl("td", { text: `${totalAmount.toFixed(2)} ${currency}` });
        totalValueCell.style.padding = "5px 10px";
        totalValueCell.style.textAlign = "right";
    }

    createCell(row: HTMLElement, text: string) {
        const td = row.createEl("td", { text: text });
        td.style.padding = "5px 10px";
        td.style.borderBottom = "1px solid var(--background-modifier-border)";
    }

    async onClose() {
        // Cleanup if needed
    }
}
