import { App, Modal, Setting, Notice } from "obsidian";
import type ObsidianAccountingPlugin from "./main";
import { AccountSuggest } from "./suggester";
import { Transaction } from "./ledger";
import { SavingsGoal } from "./settings";

function setupKeyboardPadding(modal: Modal) {
    const onFocus = (e: Event) => {
        window.setTimeout(() => {
            const target = e.target as HTMLElement;
            if (!target) return;

            // Guess standard keyboard height if visualViewport isn't changing
            let kbHeight = window.innerHeight * 0.45; // Approximately 45% of screen height
            if (window.visualViewport && window.innerHeight - window.visualViewport.height > 50) {
                kbHeight = window.innerHeight - window.visualViewport.height;
            }

            const keyboardTop = window.innerHeight - kbHeight;
            const targetRect = target.getBoundingClientRect();
            
            // We want the input and its suggestion dropdown to be fully visible.
            // Estimate dropdown height to be about ~150px.
            const requiredSpaceBottom = targetRect.bottom + 180;
            
            // If the element + dropdown overlaps into the keyboard area
            if (requiredSpaceBottom > keyboardTop) {
                const offset = requiredSpaceBottom - keyboardTop;
                
                modal.modalEl.addClass("accounting-modal-transition");
                // Shift the entire modal box up
                modal.modalEl.style.transform = `translateY(-${offset}px)`;
            }
        }, 300); // 300ms allows the keyboard sliding animation to finish
    };

    const onBlur = () => {
        window.setTimeout(() => {
            // Only reset if focus has completely left the modal's inputs
            if (!modal.contentEl.contains(activeDocument.activeElement)) {
                modal.modalEl.addClass("accounting-modal-transition");
                modal.modalEl.style.removeProperty("transform");
            }
        }, 100);
    };

    modal.contentEl.addEventListener('focusin', onFocus);
    modal.contentEl.addEventListener('focusout', onBlur);
    
    const originalOnClose = modal.onClose.bind(modal) as () => void;
    modal.onClose = () => {
        modal.contentEl.removeEventListener('focusin', onFocus);
        modal.contentEl.removeEventListener('focusout', onBlur);
        // Reset transform on close just in case
        modal.modalEl.style.removeProperty("transform");
        originalOnClose();
    };
}

export class AddAccountModal extends Modal {
    plugin: ObsidianAccountingPlugin;

    // Form fields
    accountDate: string;
    accountType: string;
    accountName: string;
    currency: string;
    openingBalance: string;

    constructor(app: App, plugin: ObsidianAccountingPlugin) {
        super(app);
        this.plugin = plugin;
        this.accountDate = new Date().toISOString().split('T')[0];
        this.accountType = "Assets";
        this.accountName = "";
        this.currency = plugin.settings.currencySymbol;
        this.openingBalance = "0";
    }

    onOpen() {
        setupKeyboardPadding(this);
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Add new account" });
        contentEl.addClass("accounting-modal-content");

        new Setting(contentEl)
            .setName("Date")
            .addText(text => text
                .setValue(this.accountDate)
                .onChange(value => this.accountDate = value));

        new Setting(contentEl)
            .setName("Account type")
            .addDropdown(drop => drop
                .addOption("Assets", "Assets")
                .addOption("Liabilities", "Liabilities")
                .addOption("Equity", "Equity")
                .addOption("Income", "Income")
                .addOption("Expenses", "Expenses")
                .setValue(this.accountType)
                .onChange(value => this.accountType = value));

        new Setting(contentEl)
            .setName("Account name")
            .setDesc("Colon separated (e.g. Bank:Checking)")
            .addText(text => text
                .setValue(this.accountName)
                .onChange(value => this.accountName = value));

        new Setting(contentEl)
            .setName("Currency")
            .addText(text => text
                .setValue(this.currency)
                .onChange(value => this.currency = value));

        new Setting(contentEl)
            .setName("Opening balance")
            .addText(text => text
                .setValue(this.openingBalance)
                .onChange(value => this.openingBalance = value));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Create account")
                .setCta()
                .onClick(async () => {
                    const success = await this.createAccount();
                    if (success) {
                        this.close();
                    }
                }));
    }

    async createAccount(): Promise<boolean> {
        if (!this.accountDate || !this.accountType || !this.accountName || !this.currency || !this.openingBalance) {
            new Notice("Please provide all fields.");
            return false;
        }

        const fullAccountName = `${this.accountType}:${this.accountName}`;
        // Basic loose validation for beancount format
        // OPEN
        let content = `${this.accountDate} open ${fullAccountName} ${this.currency}`;

        const balance = parseFloat(this.openingBalance);
        if (!isNaN(balance) && balance !== 0) {
            // PAD
            content += `\n${this.accountDate} pad ${fullAccountName} Equity:Opening-Balances`;
            // BALANCE
            content += `\n${this.accountDate} balance ${fullAccountName} ${balance} ${this.currency}`;
        }

        const success = await this.plugin.fileUtils.prependAccountToBeancountFile(this.plugin.settings.beancountFilePath, content);
        if (success) {
            new Notice("Account added to beancount file!");
            return true;
        }
        return false;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class AddTransactionModal extends Modal {
    plugin: ObsidianAccountingPlugin;

    // Form fields
    date: string;
    type: string;
    description: string;
    amount: string;
    sourceAccount: string;
    targetAccount: string;
    tags: string;
    allAccounts: string[] = [];

    constructor(app: App, plugin: ObsidianAccountingPlugin) {
        super(app);
        this.plugin = plugin;
        this.date = new Date().toISOString().split('T')[0];
        this.type = "Expense";
        this.description = "";
        this.amount = "";
        this.sourceAccount = "";
        this.targetAccount = "";
        this.tags = "";
    }

    async onOpen() {
        setupKeyboardPadding(this);
        const { contentEl } = this;

        // Load accounts
        this.allAccounts = await this.plugin.fileUtils.getAccounts(this.plugin.settings.beancountFilePath);

        contentEl.createEl("h2", { text: "Add transaction" });
        contentEl.addClass("accounting-modal-content");

        new Setting(contentEl)
            .setName("Date")
            .addText(text => text
                .setValue(this.date)
                .onChange(value => this.date = value));

        new Setting(contentEl)
            .setName("Type")
            .addDropdown(drop => drop
                .addOption("Expense", "Expense")
                .addOption("Income", "Income")
                .addOption("Transfer", "Transfer")
                .setValue(this.type)
                .onChange(value => this.type = value));

        new Setting(contentEl)
            .setName("Description")
            .addText(text => text
                .setValue(this.description)
                .onChange(value => this.description = value));

        new Setting(contentEl)
            .setName("Tags")
            .setDesc("Space separated (e.g. #vacation 2024)")
            .addText(text => text
                .setValue(this.tags)
                .onChange(value => this.tags = value));

        new Setting(contentEl)
            .setName("Amount")
            .addText(text => text
                .setPlaceholder("0.00")
                .setValue(this.amount)
                .onChange(value => this.amount = value));

        // Source Account with Suggestion
        new Setting(contentEl)
            .setName("Source account")
            .setDesc("e.g. Assets:Cash")
            .addText(text => {
                text.setValue(this.sourceAccount)
                    .onChange(value => this.sourceAccount = value);
                new AccountSuggest(this.app, text.inputEl, this.allAccounts);
            });

        // Target Account with Suggestion
        new Setting(contentEl)
            .setName("Target account")
            .setDesc("e.g. Expenses:Food")
            .addText(text => {
                text.setValue(this.targetAccount)
                    .onChange(value => this.targetAccount = value);

                // Filter suggestions based on type?? For now show all, users know what they need.
                // Or we could filter: if Type=Expense, show Expenses:*, if Income show Income:*.
                let relevantAccounts = this.allAccounts;
                /* Optional smart filtering:
                if (this.type === "Expense") relevantAccounts = this.allAccounts.filter(a => a.startsWith("Expenses"));
                if (this.type === "Income") relevantAccounts = this.allAccounts.filter(a => a.startsWith("Income"));
                */
                new AccountSuggest(this.app, text.inputEl, relevantAccounts);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Add transaction")
                .setCta()
                .onClick(async () => {
                    const success = await this.createTransaction();
                    if (success) {
                        this.close();
                    }
                }));
    }

    async createTransaction(): Promise<boolean> {
        if (!this.sourceAccount || !this.targetAccount || !this.date || !this.amount) {
            new Notice("Please provide source account, target account, date and amount.");
            return false;
        }

        // Construct beancount entry
        /*
        2024-05-21 * "Description"
          TargetAccount  Amount Currency
          SourceAccount -Amount Currency
        */
        const amountNum = parseFloat(this.amount);
        if (isNaN(amountNum)) {
            new Notice("Invalid amount");
            return false;
        }

        const currency = this.plugin.settings.currencySymbol;

        let content = "";

        // Auto-create accounts if they don't exist
        const accountsToCheck = [this.sourceAccount, this.targetAccount];
        for (const account of accountsToCheck) {
            if (account && !this.allAccounts.includes(account)) {
                // Not found in current list, prepend open directive
                // 2024-05-21 open Account:Name Currency
                content += `${this.date} open ${account} ${currency}\n`;
                // Add to local list to avoid duplicate open directives if source==target (rare but possible)
                this.allAccounts.push(account);
            }
        }

        let tagString = "";
        if (this.tags && this.tags.trim().length > 0) {
            const tags = this.tags.split(" ").filter(t => t.length > 0);
            tagString = tags.map(t => t.startsWith("#") ? t : "#" + t).join(" ");
            tagString = " " + tagString;
        }

        content += `${this.date} * "${this.description}"${tagString}\n`;

        // Logic depends on type slightly, primarily sign convention
        // For an Expense: You increase Expense (Debit) and decrease Asset (Credit)
        // Beancount: Expenses positive, Assets negative usually in a transaction leg

        if (this.type === "Expense") {
            content += `  ${this.targetAccount} ${amountNum} ${currency}\n`;
            content += `  ${this.sourceAccount} -${amountNum} ${currency}`;
        } else if (this.type === "Income") {
            // Income: Increase Asset (Debit, +), Increase Income (Credit, -)
            // So Asset Positive, Income Negative
            content += `  ${this.sourceAccount} ${amountNum} ${currency}\n`;
            content += `  ${this.targetAccount} -${amountNum} ${currency}`;
        } else {
            // Transfer: Source -> Target
            // Target increases (+), Source decreases (-)
            content += `  ${this.targetAccount} ${amountNum} ${currency}\n`;
            content += `  ${this.sourceAccount} -${amountNum} ${currency}`;
        }

        const success = await this.plugin.fileUtils.appendToBeancountFile(this.plugin.settings.beancountFilePath, content);
        if (success) {
            new Notice("Transaction added!");
            return true;
        }
        return false;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class EditTransactionModal extends Modal {
    plugin: ObsidianAccountingPlugin;
    transaction: Transaction;

    // Form fields
    date: string;
    type: string;
    description: string;
    amount: string;
    sourceAccount: string;
    targetAccount: string;
    tags: string;
    allAccounts: string[] = [];

    constructor(app: App, plugin: ObsidianAccountingPlugin, transaction: Transaction) {
        super(app);
        this.plugin = plugin;
        this.transaction = transaction;
        
        this.date = transaction.date;
        this.description = transaction.description;
        this.tags = transaction.tags.join(" ");

        const sources = transaction.postings.filter(p => p.amount < 0);
        const targets = transaction.postings.filter(p => p.amount > 0);
        
        this.sourceAccount = sources.length > 0 ? sources[0].account : "";
        this.targetAccount = targets.length > 0 ? targets[0].account : "";
        
        const sum = targets.reduce((acc, p) => acc + p.amount, 0);
        this.amount = sum.toString();

        // Infer Type
        this.type = "Transfer";
        if (targets.some(t => t.account.startsWith("Expenses"))) {
            this.type = "Expense";
        } else if (targets.some(t => t.account.startsWith("Assets")) && sources.some(s => s.account.startsWith("Income"))) {
            this.type = "Income";
        } else if (sources.some(s => s.account.startsWith("Equity"))) {
            this.type = "Transfer"; // Opening balance / synthetic handled as transfer
        }
    }

    async onOpen() {
        setupKeyboardPadding(this);
        const { contentEl } = this;

        this.allAccounts = await this.plugin.fileUtils.getAccounts(this.plugin.settings.beancountFilePath);

        contentEl.createEl("h2", { text: "Edit transaction" });
        contentEl.addClass("accounting-modal-content");

        new Setting(contentEl)
            .setName("Date")
            .addText(text => text
                .setValue(this.date)
                .onChange(value => this.date = value));

        new Setting(contentEl)
            .setName("Type")
            .addDropdown(drop => drop
                .addOption("Expense", "Expense")
                .addOption("Income", "Income")
                .addOption("Transfer", "Transfer")
                .setValue(this.type)
                .onChange(value => this.type = value));

        new Setting(contentEl)
            .setName("Description")
            .addText(text => text
                .setValue(this.description)
                .onChange(value => this.description = value));

        new Setting(contentEl)
            .setName("Tags")
            .setDesc("Space separated (e.g. #vacation 2024)")
            .addText(text => text
                .setValue(this.tags)
                .onChange(value => this.tags = value));

        new Setting(contentEl)
            .setName("Amount")
            .addText(text => text
                .setValue(this.amount)
                .onChange(value => this.amount = value));

        new Setting(contentEl)
            .setName("Source account")
            .addText(text => {
                text.setValue(this.sourceAccount)
                    .onChange(value => this.sourceAccount = value);
                new AccountSuggest(this.app, text.inputEl, this.allAccounts);
            });

        new Setting(contentEl)
            .setName("Target account")
            .addText(text => {
                text.setValue(this.targetAccount)
                    .onChange(value => this.targetAccount = value);
                new AccountSuggest(this.app, text.inputEl, this.allAccounts);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Update transaction")
                .setCta()
                .onClick(async () => {
                    const success = await this.updateTransaction();
                    if (success) {
                        this.close();
                    }
                }));
    }

    async updateTransaction(): Promise<boolean> {
        if (!this.sourceAccount || !this.targetAccount || !this.date || !this.amount) {
            new Notice("Please provide source account, target account, date and amount.");
            return false;
        }

        const amountNum = parseFloat(this.amount);
        if (isNaN(amountNum)) {
            new Notice("Invalid amount");
            return false;
        }

        if (this.transaction.lineStart === undefined || this.transaction.lineEnd === undefined) {
            new Notice("Error: Cannot find transaction location in file.");
            return false;
        }

        const currency = this.plugin.settings.currencySymbol;
        let content = "";
        let newDirectives = "";

        // Collect new accounts missing
        const accountsToCheck = [this.sourceAccount, this.targetAccount];
        for (const account of accountsToCheck) {
            if (account && !this.allAccounts.includes(account)) {
                newDirectives += `${this.date} open ${account} ${currency}\n`;
                this.allAccounts.push(account);
            }
        }

        if (newDirectives.length > 0) {
            await this.plugin.fileUtils.prependAccountToBeancountFile(this.plugin.settings.beancountFilePath, newDirectives.trim());
        }

        let tagString = "";
        if (this.tags && this.tags.trim().length > 0) {
            const tags = this.tags.split(" ").filter(t => t.length > 0);
            tagString = tags.map(t => t.startsWith("#") ? t : "#" + t).join(" ");
            tagString = " " + tagString;
        }

        content += `${this.date} * "${this.description}"${tagString}\n`;

        if (this.type === "Expense") {
            content += `  ${this.targetAccount} ${amountNum} ${currency}\n`;
            content += `  ${this.sourceAccount} -${amountNum} ${currency}`;
        } else if (this.type === "Income") {
            content += `  ${this.sourceAccount} ${amountNum} ${currency}\n`;
            content += `  ${this.targetAccount} -${amountNum} ${currency}`;
        } else {
            content += `  ${this.targetAccount} ${amountNum} ${currency}\n`;
            content += `  ${this.sourceAccount} -${amountNum} ${currency}`;
        }

        const success = await this.plugin.fileUtils.replaceTransactionBlock(
            this.plugin.settings.beancountFilePath, 
            this.transaction.lineStart, 
            this.transaction.lineEnd, 
            content
        );

        if (success) {
            new Notice("Transaction updated!");
            return true;
        }
        return false;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class DeleteTransactionModal extends Modal {
    plugin: ObsidianAccountingPlugin;
    transaction: Transaction;

    constructor(app: App, plugin: ObsidianAccountingPlugin, transaction: Transaction) {
        super(app);
        this.plugin = plugin;
        this.transaction = transaction;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Delete transaction?" });
        contentEl.createEl("p", { text: `Are you sure you want to delete the transaction from ${this.transaction.date} for "${this.transaction.description}"?` });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Cancel")
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText("Delete")
                .setDestructive()
                .onClick(async () => {
                    if (this.transaction.lineStart === undefined || this.transaction.lineEnd === undefined) {
                        new Notice("Error: Cannot find transaction location in file.");
                        this.close();
                        return;
                    }

                    const success = await this.plugin.fileUtils.deleteTransactionBlock(
                        this.plugin.settings.beancountFilePath,
                        this.transaction.lineStart,
                        this.transaction.lineEnd
                    );

                    if (success) {
                        new Notice("Transaction deleted!");
                    }
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class GoalModal extends Modal {
    plugin: ObsidianAccountingPlugin;
    goal: Partial<SavingsGoal>;
    isEdit: boolean;
    allAccounts: string[] = [];

    constructor(app: App, plugin: ObsidianAccountingPlugin, existingGoal?: SavingsGoal) {
        super(app);
        this.plugin = plugin;
        this.isEdit = !!existingGoal;
        this.goal = existingGoal ? { ...existingGoal } : {
            id: crypto.randomUUID(),
            text: "",
            startDate: new Date().toISOString().substring(0, 7),
            endDate: new Date().toISOString().substring(0, 7),
            linkedAccount: "",
            totalAmount: 0
        };
    }

    async onOpen() {
        setupKeyboardPadding(this);
        const { contentEl } = this;
        
        this.allAccounts = await this.plugin.fileUtils.getAccounts(this.plugin.settings.beancountFilePath);
        const assetAccounts = this.allAccounts.filter(a => a.startsWith("Assets:"));

        contentEl.createEl("h2", { text: this.isEdit ? "Edit savings goal" : "Create savings goal" });
        contentEl.addClass("accounting-modal-content");

        new Setting(contentEl)
            .setName("Goal text")
            .addText(text => text
                .setValue(this.goal.text || "")
                .onChange(val => this.goal.text = val));

        new Setting(contentEl)
            .setName("Start month")
            .addText(text => {
                text.inputEl.type = "month";
                text.setValue(this.goal.startDate || "")
                    .onChange(val => this.goal.startDate = val);
            });

        new Setting(contentEl)
            .setName("End month")
            .addText(text => {
                text.inputEl.type = "month";
                text.setValue(this.goal.endDate || "")
                    .onChange(val => this.goal.endDate = val);
            });

        new Setting(contentEl)
            .setName("Linked account")
            .addText(text => {
                text.setValue(this.goal.linkedAccount || "")
                    .onChange(val => this.goal.linkedAccount = val);
                new AccountSuggest(this.app, text.inputEl, assetAccounts);
            });

        new Setting(contentEl)
            .setName("Total amount")
            .addText(text => {
                text.inputEl.type = "number";
                text.setValue(this.goal.totalAmount ? this.goal.totalAmount.toString() : "")
                    .onChange(val => this.goal.totalAmount = parseFloat(val));
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(this.isEdit ? "Save changes" : "Create goal")
                .setCta()
                .onClick(async () => {
                    if (!this.goal.text || !this.goal.startDate || !this.goal.endDate || !this.goal.linkedAccount || !this.goal.totalAmount) {
                        new Notice("Please fill out all fields.");
                        return;
                    }
                    if (this.goal.startDate > this.goal.endDate) {
                        new Notice("Start month cannot be after end month.");
                        return;
                    }

                    if (!this.plugin.settings.savingsGoals) {
                        this.plugin.settings.savingsGoals = [];
                    }

                    if (this.isEdit) {
                        const idx = this.plugin.settings.savingsGoals.findIndex(g => g.id === this.goal.id);
                        if (idx !== -1) {
                            this.plugin.settings.savingsGoals[idx] = this.goal as SavingsGoal;
                        }
                    } else {
                        this.plugin.settings.savingsGoals.push(this.goal as SavingsGoal);
                    }

                    await this.plugin.saveSettings();
                    new Notice("Goal saved!");
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class DeleteGoalModal extends Modal {
    plugin: ObsidianAccountingPlugin;
    goal: SavingsGoal;

    constructor(app: App, plugin: ObsidianAccountingPlugin, goal: SavingsGoal) {
        super(app);
        this.plugin = plugin;
        this.goal = goal;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Delete goal?" });
        contentEl.createEl("p", { text: `Are you sure you want to delete the goal "${this.goal.text}"?` });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Cancel")
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText("Delete")
                .setDestructive()
                .onClick(async () => {
                    this.plugin.settings.savingsGoals = this.plugin.settings.savingsGoals.filter(g => g.id !== this.goal.id);
                    await this.plugin.saveSettings();
                    new Notice("Goal deleted!");
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}

export class CloseGoalModal extends Modal {
    plugin: ObsidianAccountingPlugin;
    goal: SavingsGoal;
    closeType: 'Successful' | 'Cancelled' = 'Successful';

    constructor(app: App, plugin: ObsidianAccountingPlugin, goal: SavingsGoal) {
        super(app);
        this.plugin = plugin;
        this.goal = goal;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Close goal?" });
        contentEl.createEl("p", { text: `Are you sure you want to close the goal "${this.goal.text}"? This will release reserved funds.` });

        new Setting(contentEl)
            .setName("Close type")
            .addDropdown(drop => drop
                .addOption('Successful', 'Successful')
                .addOption('Cancelled', 'Cancelled')
                .setValue(this.closeType)
                .onChange((val: 'Successful' | 'Cancelled') => {
                    this.closeType = val;
                }));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText("Cancel")
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText("Close goal")
                .setCta()
                .onClick(async () => {
                    const idx = this.plugin.settings.savingsGoals.findIndex(g => g.id === this.goal.id);
                    if (idx !== -1) {
                        this.plugin.settings.savingsGoals[idx].status = this.closeType;
                        await this.plugin.saveSettings();
                        new Notice(`Goal marked as ${this.closeType}!`);
                    }
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}