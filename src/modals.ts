import { App, Modal, Setting, Notice } from "obsidian";
import ObsidianAccountingPlugin from "./main";
import { AccountSuggest } from "./suggester";

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
            .setDesc("Colon separated (e.g. bank:checking)")
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
                .onClick(() => {
                    void this.createAccount();
                    this.close();
                }));
    }

    async createAccount() {
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

        const success = await this.plugin.fileUtils.appendToBeancountFile(this.plugin.settings.beancountFilePath, content);
        if (success) {
            new Notice("Account added to beancount file!");
        }
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
        this.amount = "0";
        this.sourceAccount = "";
        this.targetAccount = "";
        this.tags = "";
    }

    async onOpen() {
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
                .setValue(this.amount)
                .onChange(value => this.amount = value));

        // Source Account with Suggestion
        new Setting(contentEl)
            .setName("Source account")
            .setDesc("e.g. assets:cash")
            .addText(text => {
                text.setValue(this.sourceAccount)
                    .onChange(value => this.sourceAccount = value);
                new AccountSuggest(this.app, text.inputEl, this.allAccounts);
            });

        // Target Account with Suggestion
        new Setting(contentEl)
            .setName("Target account")
            .setDesc("e.g. expenses:food")
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
                .onClick(() => {
                    void this.createTransaction();
                    this.close();
                }));
    }

    async createTransaction() {
        // Construct beancount entry
        /*
        2024-05-21 * "Description"
          TargetAccount  Amount Currency
          SourceAccount -Amount Currency
        */
        const amountNum = parseFloat(this.amount);
        if (isNaN(amountNum)) {
            new Notice("Invalid amount");
            return;
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
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
