// Run with: node --experimental-vm-modules tests/module-graph.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const jsRoot = path.join(root, 'js');
const sourceFiles = [];

function collectFiles(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) collectFiles(filename);
        else if (entry.name.endsWith('.js')) sourceFiles.push(filename);
    }
}

collectFiles(jsRoot);

// CDN modules are represented by their import names. Local modules are linked
// by Node's module parser, which catches missing named exports without running
// Firebase or touching live data.
const cdnExports = new Map();
for (const filename of sourceFiles) {
    const source = fs.readFileSync(filename, 'utf8');
    for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](https?:[^'"]+)['"]/g)) {
        const names = cdnExports.get(match[2]) || new Set();
        for (const specifier of match[1].split(',')) {
            const name = specifier.trim().split(/\s+as\s+/)[0];
            if (name) names.add(name);
        }
        cdnExports.set(match[2], names);
    }
}

const modules = new Map();
function getModule(identifier) {
    if (modules.has(identifier)) return modules.get(identifier);
    let module;
    if (identifier.startsWith('http')) {
        const names = [...(cdnExports.get(identifier) || [])];
        module = new vm.SyntheticModule(names, function () {}, { identifier });
    } else {
        assert(fs.existsSync(identifier), `Missing module: ${identifier}`);
        module = new vm.SourceTextModule(fs.readFileSync(identifier, 'utf8'), { identifier });
    }
    modules.set(identifier, module);
    return module;
}

async function main() {
    for (const filename of sourceFiles) {
        const module = getModule(filename);
        if (module.status !== 'unlinked') continue;
        await module.link((specifier, importer) => {
            const target = specifier.startsWith('http')
                ? specifier
                : path.resolve(path.dirname(importer.identifier), specifier);
            return getModule(target);
        });
    }
    console.log(`Linked ${sourceFiles.length} local JavaScript modules.`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
