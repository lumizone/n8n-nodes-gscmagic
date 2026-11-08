// Runs the exact ESLint gate of `npx @n8n/scan-community-package` (same config and file patterns)
// on this repo's source and on the packed tarball, so verification findings show up before publishing.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// The scanner is installed in a throwaway directory (needs network) instead of as a devDependency:
// its aliased TypeScript 6 would take over node_modules/.bin/tsc and break this repo's build.
const SCANNER_VERSION = '0.42.0';
const scannerHome = mkdtempSync(join(tmpdir(), 'gscmagic-scanner-'));
execFileSync('npm', ['init', '-y'], { cwd: scannerHome, stdio: 'pipe' });
execFileSync('npm', ['i', '--silent', '--no-audit', '--no-fund', `@n8n/scan-community-package@${SCANNER_VERSION}`], { cwd: scannerHome, stdio: 'pipe' });
const req = createRequire(join(scannerHome, 'index.js'));
const scannerDir = join(scannerHome, 'node_modules/@n8n/scan-community-package');
const { SOURCE_FILE_PATTERNS, analyzePackage, buildScanConfig } = await import(pathToFileURL(join(scannerDir, 'dist/scanner.js')).href);
const { ESLint } = await import(pathToFileURL(req.resolve('eslint', { paths: [scannerDir] })).href);
const { default: fg } = await import(pathToFileURL(req.resolve('fast-glob', { paths: [scannerDir] })).href);

const root = resolve(import.meta.dirname, '..');

// analyzePackage only reports errors; also fail on warnings, which verification may flag later.
async function strict(dir, patterns, label) {
	const result = await analyzePackage(dir, patterns);
	const eslint = new ESLint({ cwd: dir, allowInlineConfig: false, overrideConfigFile: true, overrideConfig: await buildScanConfig() });
	const files = fg.sync(patterns, { cwd: dir, absolute: true, ignore: ['node_modules/**', '**/package-lock.json'] });
	const results = await eslint.lintFiles(files);
	const warnings = results.reduce((n, r) => n + r.warningCount, 0);
	const errors = results.reduce((n, r) => n + r.errorCount, 0);
	if (!result.passed || errors > 0 || warnings > 0) {
		console.error(await (await eslint.loadFormatter('stylish')).format(results));
		console.error(`scan-lint FAILED (${label}): ${errors} errors, ${warnings} warnings`);
		process.exitCode = 1;
	} else {
		console.log(`scan-lint ok (${label}): ${files.length} files, 0 errors, 0 warnings`);
	}
}

await strict(root, SOURCE_FILE_PATTERNS, 'source');

const tmp = mkdtempSync(join(tmpdir(), 'gscmagic-scan-'));
try {
	execFileSync('npm', ['pack', '--pack-destination', tmp, '--ignore-scripts', '--silent'], { cwd: root, stdio: 'pipe' });
	const tgz = readdirSync(tmp).find((f) => f.endsWith('.tgz'));
	execFileSync('tar', ['-xzf', join(tmp, tgz), '-C', tmp, '--strip-components=1']);
	await strict(tmp, ['**/*.js', 'package.json'], 'tarball');
} finally {
	rmSync(tmp, { recursive: true, force: true });
	rmSync(scannerHome, { recursive: true, force: true });
}
