const fs = require('fs');

const filesToFix = ['src/dashboard.ts', 'src/modals.ts', 'src/settings.ts'];

for (const file of filesToFix) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        // Replace regular import with type-only import for the main plugin class
        content = content.replace(
            /import ObsidianAccountingPlugin from "\.\/main";/g,
            'import type ObsidianAccountingPlugin from "./main";'
        );
        fs.writeFileSync(file, content, 'utf8');
    }
}

console.log('Fixed circular dependencies by using type imports!');
