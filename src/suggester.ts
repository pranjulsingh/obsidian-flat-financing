import { App, AbstractInputSuggest } from "obsidian";

export class AccountSuggest extends AbstractInputSuggest<string> {
    accounts: string[];
    textInputEl: HTMLInputElement;

    constructor(app: App, textInputEl: HTMLInputElement, accounts: string[]) {
        super(app, textInputEl);
        this.textInputEl = textInputEl;
        this.accounts = accounts;
    }

    getSuggestions(query: string): string[] {
        const lowerQuery = query.toLowerCase();
        return this.accounts.filter(account =>
            account.toLowerCase().contains(lowerQuery)
        );
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }

    selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
        this.setValue(value);
        this.textInputEl.trigger("input");
        this.close();
    }
}
