import { ItemView, WorkspaceLeaf, Setting, ButtonComponent, Notice } from "obsidian";
import ObsidianAccountingPlugin from "./main";
import { Ledger } from "./ledger";
import { AccountSuggest } from "./suggester";
import { EditTransactionModal } from "./modals";
import Chart from 'chart.js/auto';

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

    // Import Tab State
    csvData: string[][] = [];
    csvHeaders: string[] = [];
    hasCsvHeader: boolean = true;
    csvDelimiter: string = ',';
    rawCsvText: string = "";
    csvMapping: { [key: string]: number | null } = {
        date: null,
        type: null,
        description: null,
        tags: null,
        amount: null,
        source: null,
        target: null
    };

    // Tabs
    activeTab: 'summary' | 'transactions' | 'visualization' | 'import' = 'visualization';
    chartInstances: Chart[] = [];
    showChartAmounts: boolean = false;

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

    formatMoney(amount: number): string {
        if (this.plugin.settings.hideBalances) {
            return `*** ${this.plugin.settings.currencySymbol}`;
        }
        return `${amount.toFixed(2)} ${this.plugin.settings.currencySymbol}`;
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

        const visualizationTab = tabContainer.createEl("div", { text: "Visualization" });
        visualizationTab.addClass("accounting-tab-button");
        if (this.activeTab === 'visualization') visualizationTab.addClass("active");

        visualizationTab.onclick = () => {
            this.activeTab = 'visualization';
            void this.refresh();
        };

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

        const importTab = tabContainer.createEl("div", { text: "Import data" });
        importTab.addClass("accounting-tab-button");
        if (this.activeTab === 'import') importTab.addClass("active");

        importTab.onclick = () => {
            this.activeTab = 'import';
            void this.refresh();
        };

        // Controls Container
        const controls = container.createEl("div");
        controls.addClass("accounting-dashboard-controls");

        if (this.activeTab !== 'import') {
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

        const exportActions = new Setting(dateRow)
            .addButton(btn => btn
                .setButtonText("Refresh data")
                .onClick(() => {
                    void this.refresh(true); // Full refresh
                }));

        if (this.activeTab !== 'visualization') {
            exportActions
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
        }

        // --- TAB FILTERS ---
        // Render Summary filters (Type/Accounts) for Summary AND Visualization
        if (this.activeTab === 'summary' || this.activeTab === 'visualization') {
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
            if (this.activeTab === 'summary') {
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
        }

        // Render Transaction filters (Tags/Source/Target) ONLY for Transactions
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
        } // End of activeTab !== 'import' wrapper


        // Table Container
        const tableContainer = container.createEl("div");
        tableContainer.addClass("accounting-table-container");

        this.renderCurrentView(container);
    }

    renderCurrentView(container: HTMLElement) {
        if (this.activeTab === 'summary') {
            this.renderTable(container);
        } else if (this.activeTab === 'transactions') {
            this.renderTransactionsTable(container);
        } else if (this.activeTab === 'visualization') {
            this.renderVisualizationView(container);
        } else if (this.activeTab === 'import') {
            this.renderImportView(container);
        }
    }

    renderVisualizationView(container: HTMLElement) {
        let tableContainer = container.querySelector(".accounting-table-container");
        if (!tableContainer) return;
        tableContainer.empty();

        // Clean up old charts strictly tied to this container session
        this.chartInstances.forEach(c => c.destroy());
        this.chartInstances = [];

        // Apply Global Filters dynamically
        let balances = this.ledger.getBalances(this.startDate, this.endDate, this.plugin.settings);
        balances = balances.filter(bal => {
            if (this.selectedTypes.size > 0 && !this.selectedTypes.has(bal.type)) return false;
            if (this.selectedAccounts.size > 0 && !this.selectedAccounts.has(bal.account)) return false;
            return true;
        });

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

        const currency = this.plugin.settings.currencySymbol;

        // --- KPI Generation ---
        let assets = 0;
        let liabilities = 0;
        let income = 0;
        let expenses = 0;

        balances.forEach(b => {
             if (b.type === 'Assets') assets += b.currentBalance;
             if (b.type === 'Liabilities') liabilities += b.currentBalance;
             if (b.type === 'Income') income += b.difference; // the net change exactly within the date range
             if (b.type === 'Expenses') expenses += b.difference;
        });

        // "Net Worth should be exclusively derived from Assets + Liabilities" precisely as mathematically handled via signs
        const netWorth = assets + liabilities; 
        const totalEarnings = Math.abs(income);
        const monthlyExpense = Math.abs(expenses);

        const kpiContainer = tableContainer.createEl("div");
        kpiContainer.addClass("accounting-kpi-container");

        this.createKpiCard(kpiContainer, "Net Worth", this.formatMoney(netWorth));
        this.createKpiCard(kpiContainer, "Total Earnings", `${totalEarnings.toFixed(2)} ${currency}`);
        this.createKpiCard(kpiContainer, "Periodic Expenses", `${monthlyExpense.toFixed(2)} ${currency}`);

        // --- Chart Generation ---
        const chartsContainer = tableContainer.createEl("div");
        chartsContainer.addClass("accounting-charts-container");

        // Options toggle for charts
        const toggleRow = chartsContainer.createEl("div");
        toggleRow.style.display = "flex";
        toggleRow.style.justifyContent = "flex-end";
        toggleRow.style.width = "100%";
        
        const labelParams = toggleRow.createEl("label");
        labelParams.style.display = "flex";
        labelParams.style.alignItems = "center";
        labelParams.style.gap = "8px";
        labelParams.style.cursor = "pointer";
        labelParams.style.fontSize = "0.9em";
        labelParams.style.color = "var(--text-muted)";
        
        const amntCb = labelParams.createEl("input", { type: "checkbox" });
        amntCb.checked = this.showChartAmounts;
        amntCb.onchange = () => {
            this.showChartAmounts = amntCb.checked;
            this.renderVisualizationView(container);
        };
        labelParams.createSpan({ text: "Display legend and amounts in distribution" });

        // 1. Account Distribution Array Doughnut (Per account)
        const typeChartBox = chartsContainer.createEl("div");
        typeChartBox.addClass("accounting-chart-box");
        const typeCanvas = typeChartBox.createEl("canvas");
        
        const dataVals = balances.map(b => Math.abs(b.currentBalance));
        const totalVal = dataVals.reduce((a, b) => a + b, 0);
        const labels = balances.map((b, i) => {
            if (!this.showChartAmounts) return b.account;
            let valStr = this.plugin.settings.hideBalances ? 
                (totalVal > 0 ? `${((dataVals[i] / totalVal) * 100).toFixed(1)}%` : `0%`) : 
                `${dataVals[i].toFixed(2)} ${currency}`;
            return `${b.account} [${valStr}]`;
        });
        const bgColors = balances.map((_, i) => `hsl(${(i * 360 / Math.max(balances.length, 1)) % 360}, 70%, 50%)`);

        const typeChart = new Chart(typeCanvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: dataVals,
                    backgroundColor: bgColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Account Distribution' },
                    legend: { display: this.showChartAmounts, position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: (context: any) => {
                                let baseLabel = context.label.split(' [')[0];
                                if (!this.plugin.settings.hideBalances) {
                                    return `${baseLabel}: ${(context.raw as number).toFixed(2)} ${currency}`;
                                }
                                const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                                const percentage = total > 0 ? (((context.raw as number) / total) * 100).toFixed(1) + "%" : "0%";
                                return `${baseLabel}: ${percentage}`;
                            }
                        }
                    }
                }
            }
        });
        this.chartInstances.push(typeChart);

        // Filters isolated from "Type" rule for line graphs
        let baseBalancesIgnoredType = this.ledger.getBalances(this.startDate, this.endDate, this.plugin.settings);
        let strictlyAccountFiltered = baseBalancesIgnoredType.filter(bal => {
            if (this.selectedAccounts.size > 0 && !this.selectedAccounts.has(bal.account)) return false;
            return true;
        });

        // 2. Transaction Density Flow Timeline & Net Worth Tracking
        const dateMap: { [date: string]: { income: number, expense: number, netWorthImpact: number } } = {};
        
        // Setup dates inside bounds
        transactions.forEach(t => {
            const date = t.date;
            if (!dateMap[date]) dateMap[date] = { income: 0, expense: 0, netWorthImpact: 0 };
            
            // Derive fundamental transaction sets honoring global filters precisely
            const isAccountSelected = (acc: string) => balances.some(b => b.account === acc);
            const isAccountSelectedWithoutTypeLock = (acc: string) => strictlyAccountFiltered.some(b => b.account === acc);

            let incomeImpact = t.postings
                .filter(p => isAccountSelectedWithoutTypeLock(p.account) && p.account.startsWith('Income'))
                .reduce((val, p) => val + p.amount, 0);

            let expenseImpact = t.postings
                .filter(p => isAccountSelectedWithoutTypeLock(p.account) && p.account.startsWith('Expenses'))
                .reduce((val, p) => val + p.amount, 0);

            let nwImpact = t.postings
                .filter(p => isAccountSelected(p.account) && (p.account.startsWith('Assets') || p.account.startsWith('Liabilities')))
                .reduce((val, p) => val + p.amount, 0);

            dateMap[date].income += Math.abs(incomeImpact);
            dateMap[date].expense += expenseImpact;
            dateMap[date].netWorthImpact += nwImpact;
        });

        const sortedDates = Object.keys(dateMap).sort();
        
        // Arrays for plots
        const incData: number[] = [];
        const expData: number[] = [];
        const nwData: number[] = [];

        // Base Starting net worth resolved strictly prior to timeline mapping (to allow accurate charting)
        let trackingNetWorth = balances.filter(b => b.type === 'Assets' || b.type === 'Liabilities').reduce((acc, b) => acc + b.startBalance, 0);

        sortedDates.forEach(d => {
            incData.push(dateMap[d].income);
            expData.push(dateMap[d].expense);
            trackingNetWorth += dateMap[d].netWorthImpact;
            nwData.push(trackingNetWorth);
        });

        // 2: Smooth Line Chart (Income vs Expense)
        const transChartBox = chartsContainer.createEl("div");
        transChartBox.addClass("accounting-chart-box");
        const transCanvas = transChartBox.createEl("canvas");

        const transChart = new Chart(transCanvas, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: [
                    { 
                        label: 'Income', 
                        data: incData, 
                        borderColor: '#60a5fa', 
                        backgroundColor: 'rgba(96, 165, 250, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    { 
                        label: 'Expense', 
                        data: expData, 
                        borderColor: '#facc15', 
                        backgroundColor: 'rgba(250, 204, 21, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Income vs Expense' }
                },
                scales: {
                    x: { stacked: false },
                    y: { stacked: false }
                }
            }
        });
        this.chartInstances.push(transChart);

        // 3: Smooth Line Chart (Date-wise Net Worth)
        const nwChartBox = chartsContainer.createEl("div");
        nwChartBox.addClass("accounting-chart-box");
        const nwCanvas = nwChartBox.createEl("canvas");

        const nwChart = new Chart(nwCanvas, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: [
                    { 
                        label: 'Net Worth', 
                        data: nwData, 
                        borderColor: '#4ade80', 
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        fill: true,
                        tension: 0.4 
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Date-wise Net Worth' },
                    tooltip: {
                        callbacks: {
                            label: (context: any) => {
                                if (this.plugin.settings.hideBalances) {
                                    return `${context.dataset.label}: ***`;
                                }
                                return `${context.dataset.label}: ${(context.raw as number).toFixed(2)} ${currency}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { display: !this.plugin.settings.hideBalances } },
                    y: { ticks: { display: !this.plugin.settings.hideBalances } }
                }
            }
        });
        this.chartInstances.push(nwChart);
    }

    createKpiCard(container: HTMLElement, title: string, value: string) {
        const card = container.createEl("div");
        card.addClass("accounting-kpi-card");
        
        const t = card.createEl("div", { text: title });
        t.addClass("accounting-kpi-title");

        const v = card.createEl("div", { text: value });
        v.addClass("accounting-kpi-value");
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

            this.createCell(row, bal.type);
            this.createCell(row, bal.account);
            this.createCell(row, this.formatMoney(bal.startBalance));
            this.createCell(row, this.formatMoney(bal.endBalance));
            this.createCell(row, `${bal.difference.toFixed(2)} ${currency}`);
            this.createCell(row, this.formatMoney(bal.currentBalance));

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
        this.createCell(footerRow, this.formatMoney(totalStart));
        this.createCell(footerRow, this.formatMoney(totalEnd));
        this.createCell(footerRow, `${totalDiff.toFixed(2)} ${currency}`);
        this.createCell(footerRow, this.formatMoney(totalCurr));
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
                this.formatMoney(bal.startBalance),
                this.formatMoney(bal.endBalance),
                `${bal.difference.toFixed(2)} ${currency}`,
                this.formatMoney(bal.currentBalance)
            ]);
            totalStart += bal.startBalance; totalEnd += bal.endBalance; totalDiff += bal.difference; totalCurr += bal.currentBalance;
        });

        rows.push(["TOTAL", `(${balances.length} filtered)`, this.formatMoney(totalStart), this.formatMoney(totalEnd), `${totalDiff.toFixed(2)} ${currency}`, this.formatMoney(totalCurr)]);

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

    renderImportView(container: HTMLElement) {
        let tableContainer = container.querySelector(".accounting-table-container");
        if (!tableContainer) return;
        tableContainer.empty();

        const importWrapper = tableContainer.createEl("div");
        importWrapper.addClass("accounting-import-wrapper");
        importWrapper.style.padding = "20px";

        importWrapper.createEl("h3", { text: "Import CSV Data" });

        // Step 1: File Input
        const fileRow = importWrapper.createEl("div");
        fileRow.addClass("accounting-row");
        fileRow.style.marginBottom = "20px";
        
        const fileInput = fileRow.createEl("input", { type: "file" });
        fileInput.accept = ".csv";

        const headerRow = importWrapper.createEl("div");
        headerRow.addClass("accounting-row");
        headerRow.style.marginBottom = "20px";
        
        const delimiterLabel = headerRow.createEl("label");
        delimiterLabel.addClass("accounting-flex-item");
        delimiterLabel.style.marginRight = "15px";
        delimiterLabel.createSpan({ text: "Delimiter: " });
        const delimiterSelect = delimiterLabel.createEl("select");
        delimiterSelect.addClass("dropdown");
        delimiterSelect.createEl("option", { value: ",", text: "Comma (,)"});
        delimiterSelect.createEl("option", { value: ";", text: "Semicolon (;)"});
        delimiterSelect.createEl("option", { value: "|", text: "Pipe (|)"});
        delimiterSelect.createEl("option", { value: "\t", text: "Tab" });
        delimiterSelect.value = this.csvDelimiter;
        
        delimiterSelect.onchange = () => {
            this.csvDelimiter = delimiterSelect.value;
            if (this.rawCsvText) {
                this.parseCsv(this.rawCsvText);
                this.renderImportView(container);
            }
        };

        const headerLabel = headerRow.createEl("label");
        headerLabel.addClass("accounting-flex-item");
        const headerCheckbox = headerLabel.createEl("input", { type: "checkbox" });
        headerCheckbox.checked = this.hasCsvHeader;
        headerLabel.createSpan({ text: "File contains headers" });
        headerCheckbox.onchange = () => {
            this.hasCsvHeader = headerCheckbox.checked;
            if (this.csvData && this.csvData.length > 0) {
                if (this.hasCsvHeader) {
                    this.csvHeaders = this.csvData[0];
                } else {
                    this.csvHeaders = this.csvData[0].map((_, i) => `Column ${i + 1}`);
                }
            }
            this.renderImportView(container);
        };

        fileInput.onchange = (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                this.rawCsvText = text;
                this.parseCsv(text);
                this.renderImportView(container); // Refresh UI with mapping
            };
            reader.readAsText(file);
        };

        // If data loaded, show Mapper
        if (this.csvData.length > 0) {
            importWrapper.createEl("h4", { text: "Map Columns" });

            const mappingGrid = importWrapper.createEl("div");
            mappingGrid.style.display = "grid";
            mappingGrid.style.gridTemplateColumns = "150px 1fr";
            mappingGrid.style.gap = "10px";
            mappingGrid.style.marginBottom = "20px";
            mappingGrid.style.alignItems = "center";

            const options: { value: string, text: string }[] = [{ value: "-1", text: "-- Select Column --" }];
            this.csvHeaders.forEach((h, i) => options.push({ value: i.toString(), text: h }));

            const createMappingRow = (key: keyof typeof this.csvMapping, label: string, required: boolean) => {
                const titleSpan = mappingGrid.createEl("div", { text: label + (required ? " *" : "") });
                titleSpan.style.fontWeight = "bold";
                if (required) titleSpan.style.color = "var(--text-accent)";
                
                const select = mappingGrid.createEl("select");
                select.addClass("dropdown");
                options.forEach(opt => select.createEl("option", { value: opt.value, text: opt.text }));
                
                if (this.csvMapping[key] !== null) {
                    select.value = this.csvMapping[key]!.toString();
                }

                select.onchange = () => {
                    const val = parseInt(select.value);
                    this.csvMapping[key] = val >= 0 ? val : null;
                };
            };

            createMappingRow('date', 'Transaction Date', true);
            createMappingRow('amount', 'Amount', true);
            createMappingRow('source', 'Source Account', true);
            createMappingRow('target', 'Target Account', true);
            createMappingRow('type', 'Type', false);
            createMappingRow('description', 'Description', false);
            createMappingRow('tags', 'Tags', false);

            const btnRow = importWrapper.createEl("div");
            new ButtonComponent(btnRow)
                .setButtonText("Execute Import")
                .setCta()
                .onClick(() => this.executeImport());
        }
    }

    parseCsvLine(text: string, delimiter: string = ','): string[] {
        const result: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                if (inQuotes && text[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === delimiter && !inQuotes) {
                result.push(cur);
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur);
        return result.map(s => s.trim());
    }

    parseCsv(text: string) {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        this.csvData = lines.map(l => this.parseCsvLine(l, this.csvDelimiter));
        
        if (this.csvData.length === 0) return;

        if (this.hasCsvHeader) {
            this.csvHeaders = this.csvData[0];
        } else {
            this.csvHeaders = this.csvData[0].map((_, i) => `Column ${i + 1}`);
        }
        
        // Reset mapping
        Object.keys(this.csvMapping).forEach(k => this.csvMapping[k] = null);
    }

    async executeImport() {
        const { date, amount, source, target, type, description, tags } = this.csvMapping;

        if (date === null || amount === null || source === null || target === null) {
            new Notice("Please map all mandatory fields (Date, Amount, Source, Target).");
            return;
        }

        let transactionsString = "";
        const currency = this.plugin.settings.currencySymbol;

        const startIndex = this.hasCsvHeader ? 1 : 0;
        let successCount = 0;

        for (let i = startIndex; i < this.csvData.length; i++) {
            const row = this.csvData[i];
            if (row.length === 0) continue;

            const tDateStr = row[date];
            let tAmountStr = row[amount];
            const tSource = row[source];
            const tTarget = row[target];

            if (!tDateStr || !tAmountStr || !tSource || !tTarget) continue;

            // Date validation (Ensure YYYY-MM-DD or attempt basic parsing)
            let tDate = tDateStr;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(tDate)) {
                // Try converting formats like MM/DD/YYYY to YYYY-MM-DD
                const dObj = new Date(tDate);
                if (!isNaN(dObj.getTime())) {
                    tDate = dObj.toISOString().split('T')[0];
                } else {
                    continue; // Skip invalid dates
                }
            }

            // Clean amount
            tAmountStr = tAmountStr.replace(/[^0-9.-]/g, '');
            const tAmt = parseFloat(tAmountStr);
            if (isNaN(tAmt)) continue;
            const absoluteAmt = Math.abs(tAmt); // Ensure proper sign logic below

            // Optional
            const tType = type !== null ? row[type] : "Expense";
            let tDesc = description !== null && row[description] ? row[description] : "";
            const tTagsStr = tags !== null && row[tags] ? row[tags] : "";

            // Format Desc
            if (tType && tType.trim() !== "") {
                if (tDesc) {
                    tDesc = `[${tType}] ${tDesc}`;
                } else {
                    tDesc = `[${tType}]`;
                }
            } else {
                if (!tDesc) tDesc = "[Expense]"; // Default to Expense if totally unmapped and empty
            }
            if (!tDesc) tDesc = "Imported Transaction";

            // Format Tags
            let rawTags = tTagsStr.split(/[\s,]+/).filter(t => t.length > 0);
            let formattedTags = rawTags.map(t => t.startsWith('#') ? t : `#${t}`).join(" ");

            // Beancount Structure
            const line1 = `${tDate} * "${tDesc}" ${formattedTags}\n`;
            // Beancount uses negative for Source (outgoing) and positive for Target (incoming)
            const line2 = `  ${tSource} -${absoluteAmt.toFixed(2)} ${currency}\n`;
            const line3 = `  ${tTarget} ${absoluteAmt.toFixed(2)} ${currency}\n`;

            transactionsString += line1 + line2 + line3 + "\n";
            successCount++;
        }

        if (successCount === 0) {
            new Notice("No valid transactions found to import. Check date & amount formats.");
            return;
        }

        const success = await this.plugin.fileUtils.appendToBeancountFile(this.plugin.settings.beancountFilePath, transactionsString.trim());
        
        if (success) {
            new Notice(`Successfully imported ${successCount} transactions!`);
            this.activeTab = 'transactions';
            
            // Clean state
            this.csvData = [];
            this.csvHeaders = [];
            
            void this.refresh(true);
        }
    }
}
