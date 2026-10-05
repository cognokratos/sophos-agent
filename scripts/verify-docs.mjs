#!/usr/bin/env node
/**
 * Documentation drift checks that need nothing but Node.
 *
 * The learning material is only useful while it points at things that exist.
 * This checks the references that silently rot when the implementation moves:
 *
 *   - every relative Markdown link (and image) resolves to a file in the
 *     repository, and every `#anchor` on a Markdown target matches a heading
 *     GitHub would generate;
 *   - every `make <target>` in a code span or shell code block names a target
 *     the Makefile defines;
 *   - every `pnpm <script>` in a code span or shell code block names a script
 *     in package.json (or a pnpm built-in command);
 *   - every repository path written as a code span (`src/lib/agent/runs.ts`,
 *     `infra/compose.yml:17`) exists.
 *
 * External URLs are deliberately not fetched: a network-dependent check would
 * make an offline gate flaky, and the claims worth guarding are the ones about
 * this repository.
 *
 * Usage: node scripts/verify-docs.mjs   (exit code 1 on any problem)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const REFERENCE_LINK = /^\s{0,3}\[[^\]]+\]:\s+(\S+)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const INLINE_CODE = /`([^`\n]+)`/g;
const MAKE_CALL = /(?:^|[\s;&|(])make\s+([a-z][a-z0-9-]*)/g;
const PNPM_CALL = /(?:^|[\s;&|(])pnpm\s+(?:run\s+)?([a-z][a-z0-9:-]*)/g;
const MAKE_TARGET = /^([a-zA-Z0-9_.-]+):(?!=)/gm;
const SHELL_FENCES = new Set(['', 'sh', 'bash', 'shell', 'zsh', 'console']);
/** pnpm commands that are not package.json scripts. */
const PNPM_BUILTINS = new Set([
	'add',
	'dlx',
	'exec',
	'i',
	'install',
	'list',
	'ls',
	'outdated',
	'remove',
	'run',
	'update',
	'why'
]);
/** A code span that is a repository path, optionally with `:line` or `:start-end`. */
const REPO_PATH =
	/^(?:\.\/)?((?:src|docs|config|infra|scripts|e2e|examples|static)\/[\w.\-/[\]+$]*)(?::\d+(?:-\d+)?)?$/;
/** Historical records: kept as written, so their file references are not checked. */
const PATH_CHECK_EXEMPT = ['docs/prd/', 'docs/stories/'];

/** Markdown files known to git (tracked or new), so build output and dependencies are never read. */
export function markdownFiles(root = ROOT) {
	const listed = execFileSync(
		'git',
		['ls-files', '--cached', '--others', '--exclude-standard', '*.md'],
		{ cwd: root, encoding: 'utf8' }
	)
		.split('\n')
		.filter(Boolean);
	return listed.map((name) => join(root, name)).filter((path) => existsSync(path));
}

/** GitHub's heading anchor: lowercase, punctuation dropped, spaces to hyphens. */
export function slugify(heading) {
	const text = heading
		.replace(/`([^`]*)`/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, '')
		.trim()
		.toLowerCase();
	let kept = '';
	for (const char of text) {
		if (char === ' ' || char === '-' || char === '_' || /[\p{L}\p{N}\p{M}]/u.test(char)) {
			kept += char;
		}
	}
	return kept.replaceAll(' ', '-');
}

/** Every anchor GitHub generates for a Markdown document (duplicates get `-1`, `-2`, …). */
export function anchors(text) {
	const seen = new Map();
	const result = new Set();
	let inFence = false;
	for (const line of text.split('\n')) {
		if (FENCE.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const match = HEADING.exec(line);
		if (!match) continue;
		const slug = slugify(match[2]);
		const count = seen.get(slug) ?? 0;
		seen.set(slug, count + 1);
		result.add(count === 0 ? slug : `${slug}-${count}`);
	}
	return result;
}

export function makeTargets(makefile) {
	return new Set([...makefile.matchAll(MAKE_TARGET)].map((match) => match[1]));
}

export function packageScripts(packageJson) {
	return new Set(Object.keys(JSON.parse(packageJson).scripts ?? {}));
}

/**
 * Checks one Markdown file and returns `path:line: problem` strings.
 *
 * @param {string} path absolute path of the file
 * @param {{ root?: string, targets: Set<string>, scripts: Set<string>, anchorCache?: Map<string, Set<string>> }} context
 */
export function checkFile(path, { root = ROOT, targets, scripts, anchorCache = new Map() }) {
	const errors = [];
	const name = relative(root, path).split(sep).join('/');
	const checkPaths = !PATH_CHECK_EXEMPT.some((prefix) => name.startsWith(prefix));
	let inFence = false;
	let fenceIsShell = false;

	const report = (number, message) => errors.push(`${name}:${number}: ${message}`);

	const checkCommands = (number, text) => {
		for (const [, target] of text.matchAll(MAKE_CALL)) {
			if (!targets.has(target)) report(number, `\`make ${target}\` is not a Makefile target`);
		}
		for (const [, script] of text.matchAll(PNPM_CALL)) {
			if (!scripts.has(script) && !PNPM_BUILTINS.has(script)) {
				report(number, `\`pnpm ${script}\` is not a package.json script`);
			}
		}
	};

	const checkLink = (number, target) => {
		if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return; // http:, https:, mailto: — not checked offline
		const hashAt = target.indexOf('#');
		const filePart = hashAt === -1 ? target : target.slice(0, hashAt);
		const anchor = hashAt === -1 ? '' : target.slice(hashAt + 1);
		const resolved = filePart ? resolve(dirname(path), decodeURI(filePart)) : path;
		const fromRoot = relative(root, resolved);
		if (fromRoot.startsWith('..') || resolve(root, fromRoot) !== resolved) {
			report(number, `link leaves the repository: ${target}`);
			return;
		}
		if (!existsSync(resolved)) {
			report(number, `broken link: ${target}`);
			return;
		}
		if (anchor && extname(resolved) === '.md') {
			if (!anchorCache.has(resolved)) {
				anchorCache.set(resolved, anchors(readFileSync(resolved, 'utf8')));
			}
			if (!anchorCache.get(resolved).has(anchor.toLowerCase())) {
				report(number, `no heading for anchor: ${target}`);
			}
		}
	};

	const lines = readFileSync(path, 'utf8').split('\n');
	lines.forEach((line, index) => {
		const number = index + 1;
		if (FENCE.test(line)) {
			if (!inFence) {
				const info = line.trim().slice(3).trim().toLowerCase();
				fenceIsShell = SHELL_FENCES.has(info);
			}
			inFence = !inFence;
			return;
		}

		if (inFence) {
			if (fenceIsShell) checkCommands(number, line.split(' #')[0]);
			return;
		}

		for (const [, span] of line.matchAll(INLINE_CODE)) {
			checkCommands(number, span);
			const pathMatch = checkPaths ? REPO_PATH.exec(span.trim()) : null;
			if (pathMatch && !existsSync(join(root, pathMatch[1]))) {
				report(number, `referenced path does not exist: ${pathMatch[1]}`);
			}
		}

		// Links inside code spans are examples, not links.
		const prose = line.replace(INLINE_CODE, '');
		for (const [, target] of prose.matchAll(LINK)) checkLink(number, target);
		const reference = REFERENCE_LINK.exec(prose);
		if (reference) checkLink(number, reference[1]);
	});
	return errors;
}

function main() {
	const targets = makeTargets(readFileSync(join(ROOT, 'Makefile'), 'utf8'));
	const scripts = packageScripts(readFileSync(join(ROOT, 'package.json'), 'utf8'));
	const anchorCache = new Map();
	const files = markdownFiles();
	const errors = files.flatMap((path) => checkFile(path, { targets, scripts, anchorCache }));

	if (errors.length > 0) {
		console.error(errors.join('\n'));
		console.error(`Documentation checks failed: ${errors.length} problem(s).`);
		return 1;
	}
	console.log(`Documentation links, anchors, paths and commands passed (${files.length} files).`);
	return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
