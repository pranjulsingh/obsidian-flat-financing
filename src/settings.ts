import { App, PluginSettingTab, Setting } from "obsidian";
import ObsidianAccountingPlugin from "./main";

export interface AccountingPluginSettings {
    beancountFilePath: string;
    currencySymbol: string;
}

export const DEFAULT_SETTINGS: AccountingPluginSettings = {
    beancountFilePath: "accounting.beancount",
    currencySymbol: "USD"
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
    }
}
