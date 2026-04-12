import { App, PluginSettingTab, Setting } from "obsidian";
import ObsidianAccountingPlugin from "./main";

export interface AccountingPluginSettings {
    beancountFilePath: string;
    currencySymbol: string;
    showOpeningBalances: boolean;
    showTransfers: boolean;
}

export const DEFAULT_SETTINGS: AccountingPluginSettings = {
    beancountFilePath: "accounting.beancount",
    currencySymbol: "USD",
    showOpeningBalances: true,
    showTransfers: true
}

export class AccountingSettingTab extends PluginSettingTab {
    plugin: ObsidianAccountingPlugin;

    constructor(app: App, plugin: ObsidianAccountingPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("Obsidian accounting")
            .setHeading();

        new Setting(containerEl)
            .setName("Beancount file path")
            .setDesc("Path to your .beancount file relative to the vault root (e.g., folder/accounting.beancount)")
            .addText(text => text
                .setPlaceholder("accounting.beancount")
                .setValue(this.plugin.settings.beancountFilePath)
                .onChange(async (value) => {
                    this.plugin.settings.beancountFilePath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Currency symbol")
            .setDesc("Default currency code")
            .addText(text => text
                .setPlaceholder("USD")
                .setValue(this.plugin.settings.currencySymbol)
                .onChange(async (value) => {
                    this.plugin.settings.currencySymbol = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Show opening balances")
            .setDesc("Include opening balances in calculations and dashboard")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showOpeningBalances)
                .onChange(async (value) => {
                    this.plugin.settings.showOpeningBalances = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Show transfers")
            .setDesc("Include transfer transactions in calculations")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showTransfers)
                .onChange(async (value) => {
                    this.plugin.settings.showTransfers = value;
                    await this.plugin.saveSettings();
                }));
    }
}
