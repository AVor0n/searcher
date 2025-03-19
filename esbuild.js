const esbuild = require("esbuild");
const { copy } = require('esbuild-plugin-copy');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location?.file}:${location?.line}:${location?.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
	entryPoints: ['src/extension.ts'],
	bundle: true,
	outfile: 'dist/extension.js',
	external: ['vscode'],
	format: 'cjs',
	platform: 'node',
	sourcemap: !production,
	minify: production,
	plugins: [esbuildProblemMatcherPlugin],
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
	entryPoints: ['src/webview/index.tsx'],
	bundle: true,
	outfile: 'dist/webview.js',
	format: 'iife',
	platform: 'browser',
	sourcemap: !production,
	minify: production,
	plugins: [
		copy({
			assets: [
				{ from: ['src/webview/styles.css'], to: ['webview.css'] }
			]
		})
	],
};

// Запуск сборки
if (watch) {
	Promise.all([
		esbuild.context(extensionConfig).then(ctx => ctx.watch()),
		esbuild.context(webviewConfig).then(ctx => ctx.watch())
	]).catch(() => process.exit(1));
} else {
	Promise.all([
		esbuild.build(extensionConfig),
		esbuild.build(webviewConfig)
	]).catch(() => process.exit(1));
}
