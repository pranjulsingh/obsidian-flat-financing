import { Plugin, Menu, WorkspaceLeaf } from "obsidian";
import { AccountingSettingTab, AccountingPluginSettings, DEFAULT_SETTINGS } from "./settings";
import { AddAccountModal, AddTransactionModal } from "./modals";
import { FileUtils } from "./file_utils";
import { AccountingDashboardView, DASHBOARD_VIEW_TYPE } from "./dashboard";

export default class ObsidianAccountingPlugin extends Plugin {
    settings!: AccountingPluginSettings;
    fileUtils!: FileUtils;

    async onload() {
        await this.loadSettings();

        this.fileUtils = new FileUtils(this.app);

        this.registerView(
            DASHBOARD_VIEW_TYPE,
            (leaf) => new AccountingDashboardView(leaf, this)
        );

        // Ribbon Icon
        this.addRibbonIcon('dollar-sign', 'Obsidian Accounting', (evt: MouseEvent) => {
            const menu = new Menu();

            menu.addItem((item) =>
                item
                    .setTitle("Add Account")
                    .setIcon("plus-circle")
                    .onClick(() => {
                        new AddAccountModal(this.app, this).open();
                    })
            );

            menu.addItem((item) =>
                item
                    .setTitle("Add Transaction")
                    .setIcon("banknote")
                    .onClick(() => {
                        new AddTransactionModal(this.app, this).open();
                    })
            );

            menu.addItem((item) =>
                item
                    .setTitle("Open Dashboard")
                    .setIcon("bar-chart")
                    .onClick(() => {
                        void this.activateView();
                    })
            );

            menu.showAtMouseEvent(evt);
        });

        // Commands
        this.addCommand({
            id: 'open-accounting-dashboard',
            name: 'Open Dashboard',
            callback: () => {
                void this.activateView();
            }
        });

        this.addCommand({
            id: 'add-accounting-account',
            name: 'Add Account',
            callback: () => {
                new AddAccountModal(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'add-accounting-transaction',
            name: 'Add Transaction',
            callback: () => {
                new AddTransactionModal(this.app, this).open();
            }
        });

        // Settings Tab
        this.addSettingTab(new AccountingSettingTab(this.app, this));
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);

        if (leaves.length > 0) {
            // A leaf with our view already exists, use that
            leaf = leaves[0];
        } else {
            // Our view could not be found in the workspace, create a new leaf
            // in the right sidebar for example, or main area
            leaf = workspace.getLeaf(true); // 'true' creates a new leaf in tab
            await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
        }

        // "Reveal" the leaf in case it is in a collapsed sidebar
        workspace.revealLeaf(leaf);
    }
}
