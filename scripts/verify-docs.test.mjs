/**
 * The documentation checker must actually fail on the drift it exists to catch.
 *
 * A link checker that passes on everything looks identical to one that works,
 * so each class of defect is planted in a throwaway tree and must be reported.
 *
 * Usage: node --test scripts/verify-docs.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { anchors, checkFile, makeTargets, packageScripts, slugify } from './verify-docs.mjs';

function check(files, { targets = [], scripts = [] } = {}) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'verify-docs-')));
	try {
		for (const [name, text] of Object.entries(files)) {
			mkdirSync(dirname(join(root, name)), { recursive: true });
			writeFileSync(join(root, name), text);
		}
		return checkFile(join(root, 'doc.md'), {
			root,
			targets: new Set(targets),
			scripts: new Set(scripts)
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

describe('slugify', () => {
	it('matches GitHub heading anchors', () => {
		const cases = {
			'Stage R2: What is an execution?': 'stage-r2-what-is-an-execution',
			'2.1 System Context & Goals': '21-system-context--goals',
			'`activeRuns` and the SSE buffer': 'activeruns-and-the-sse-buffer',
			'📌 Overview': '-overview',
			'Σοφός Agent — Source Tree': 'σοφός-agent--source-tree',
			'Step 4: `runs` row = running': 'step-4-runs-row--running'
		};
		for (const [heading, slug] of Object.entries(cases)) {
			assert.equal(slugify(heading), slug, heading);
		}
	});

	it('numbers duplicate headings and ignores headings inside code blocks', () => {
		const found = anchors('# Lab\n\n## Lab\n\n```sh\n# not a heading\n```\n');
		assert.deepEqual([...found].sort(), ['lab', 'lab-1']);
	});
});

describe('checkFile', () => {
	it('passes a clean document', () => {
		const errors = check(
			{
				'doc.md':
					'# Title\n\nSee [other](other.md#a-heading), [self](#title) and [site](https://example.com).\n\n' +
					'Run `make docs-check` and `pnpm test:unit --run`; read `src/app.ts:12`.\n\n' +
					'```sh\nmake docs-check   # comment mentioning make nothing\npnpm install\n```\n',
				'other.md': '## A heading\n',
				'src/app.ts': ''
			},
			{ targets: ['docs-check'], scripts: ['test:unit'] }
		);
		assert.deepEqual(errors, []);
	});

	it('reports a missing file', () => {
		const errors = check({ 'doc.md': '[gone](missing.md)\n' });
		assert.equal(errors.length, 1);
		assert.match(errors[0], /broken link: missing\.md/);
	});

	it('reports a missing image', () => {
		const errors = check({ 'doc.md': '![diagram](img/missing.png)\n' });
		assert.equal(errors.length, 1);
		assert.match(errors[0], /broken link/);
	});

	it('reports a missing anchor in another file', () => {
		const errors = check({ 'doc.md': '[x](other.md#nope)\n', 'other.md': '## Yes\n' });
		assert.equal(errors.length, 1);
		assert.match(errors[0], /no heading for anchor: other\.md#nope/);
	});

	it('reports a missing anchor in the same file', () => {
		const errors = check({ 'doc.md': '# Title\n\n[x](#missing)\n' });
		assert.equal(errors.length, 1);
		assert.match(errors[0], /no heading for anchor: #missing/);
	});

	it('reports a link that leaves the repository', () => {
		const errors = check({ 'doc.md': '[x](../../outside.md)\n' });
		assert.equal(errors.length, 1);
		assert.match(errors[0], /link leaves the repository/);
	});

	it('reports an unknown make target in a code span and in a shell block', () => {
		const errors = check(
			{ 'doc.md': 'Run `make nope`.\n\n```bash\nmake start\nmake also-nope\n```\n' },
			{ targets: ['start'] }
		);
		assert.equal(errors.length, 2);
		assert.match(errors[0], /doc\.md:1: `make nope` is not a Makefile target/);
		assert.match(errors[1], /doc\.md:5: `make also-nope`/);
	});

	it('does not read commands in non-shell code blocks', () => {
		const errors = check({ 'doc.md': '```text\nthis does not make sense\n```\n' });
		assert.deepEqual(errors, []);
	});

	it('reports an unknown pnpm script', () => {
		const errors = check(
			{ 'doc.md': 'Run `pnpm run nope` or `pnpm dev`.\n' },
			{ scripts: ['dev'] }
		);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /`pnpm nope` is not a package.json script/);
	});

	it('reports a referenced repository path that does not exist', () => {
		const errors = check({
			'doc.md': 'See `src/lib/agent/gone.ts:10` and `config/` and `docs/*.md`.\n',
			'config/mcp.json': '{}'
		});
		assert.equal(errors.length, 1);
		assert.match(errors[0], /referenced path does not exist: src\/lib\/agent\/gone\.ts/);
	});

	it('does not check paths in historical records', () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'verify-docs-')));
		try {
			mkdirSync(join(root, 'docs/stories'), { recursive: true });
			writeFileSync(join(root, 'docs/stories/1.1.story.md'), 'Old: `src/routes/old.ts`\n');
			const errors = checkFile(join(root, 'docs/stories/1.1.story.md'), {
				root,
				targets: new Set(),
				scripts: new Set()
			});
			assert.deepEqual(errors, []);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('ignores links inside code spans and code blocks', () => {
		const errors = check({ 'doc.md': '`[x](nope.md)`\n\n```md\n[y](nope.md)\n```\n' });
		assert.deepEqual(errors, []);
	});
});

describe('makeTargets and packageScripts', () => {
	it('reads rule names but not variable assignments', () => {
		const targets = makeTargets('COMPOSE:=x\n.PHONY: a\na:\n\techo\nb: a\n');
		assert.ok(targets.has('a'));
		assert.ok(targets.has('b'));
		assert.ok(!targets.has('COMPOSE'));
	});

	it('reads package.json scripts', () => {
		assert.deepEqual([...packageScripts('{"scripts":{"dev":"vite"}}')], ['dev']);
	});
});
