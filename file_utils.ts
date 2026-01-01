import { App, TFile, Notice } from "obsidian";

export class FileUtils {
    constructor(private app: App) { }

    async appendToBeancountFile(path: string, content: string): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(path);

        if (!file) {
            new Notice(`Beancount file not found at path: ${path}`);
            return false;
        }

        if (!(file instanceof TFile)) {
            new Notice(`Path is not a file: ${path}`);
            return false;
        }

        try {
            await this.app.vault.append(file, "\n" + content);
            return true;
        } catch (error) {
            console.error("Error appending to beancount file:", error);
            new Notice("Error appending to beancount file. Check console for details.");
            return false;
        }
    }

    async getBeanCountFile(path: string): Promise<TFile | null> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            return file;
        }
        return null;
    }

    async getFileContent(path: string): Promise<string> {
        const file = await this.getBeanCountFile(path);
        if (file) {
            return await this.app.vault.read(file);
        }
        return "";
    }

    async getAccounts(path: string): Promise<string[]> {
        const content = await this.getFileContent(path);
        const accounts = new Set<string>();
        const lines = content.split("\n");

        for (const line of lines) {
            // Match "YYYY-MM-DD open Account:Name ..."
            // Allow for hyphens, underscores in account names
            // Remove ^ anchor to allow for indentation
            const openMatch = line.match(/\d{4}-\d{2}-\d{2}\s+open\s+([A-Za-z0-9\-_:]+)/);
            if (openMatch && openMatch[1]) {
                accounts.add(openMatch[1]);
            }
        }

        return Array.from(accounts).sort();
    }
}
