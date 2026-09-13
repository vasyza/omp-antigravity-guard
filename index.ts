import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

function sanitizeString(str: string): string {
	if (!str.includes("<system-conventions>")) return str;
	const nonce = Math.random().toString(16).slice(2, 10);
	return str.replaceAll("<system-conventions>", `<system-conventions id="${nonce}">`);
}

function sanitizeValue(value: unknown): unknown {
	if (typeof value === "string") {
		return sanitizeString(value);
	}
	if (Array.isArray(value)) {
		let changed = false;
		const next = value.map((item) => {
			const sanitized = sanitizeValue(item);
			if (sanitized !== item) changed = true;
			return sanitized;
		});
		return changed ? next : value;
	}
	if (value !== null && typeof value === "object") {
		let changed = false;
		const next: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			const sanitized = sanitizeValue(v);
			if (sanitized !== v) changed = true;
			next[k] = sanitized;
		}
		return changed ? next : value;
	}
	return value;
}

/**
 * Oh My Pi extension that prevents Antigravity from hitting synthetic 429 errors.
 *
 * Antigravity proxies trigger an intentional 429 ("You have exhausted your capacity on this model...")
 * when the exact prompt contains `<system-conventions>`.
 *
 * This extension hooks:
 * 1. `before_agent_start`: sanitizes the system prompt when a user enters a new prompt.
 * 2. `before_provider_request`: sanitizes the outgoing wire payload on EVERY LLM request,
 *    including in-place retries via F5 / `app.retry` (`agent.continue()`), auto-retries, and subagents.
 */
export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		if (event.systemPrompt && Array.isArray(event.systemPrompt)) {
			let modified = false;
			const sanitized = event.systemPrompt.map((prompt: string) => {
				if (typeof prompt !== "string" || !prompt.includes("<system-conventions>")) {
					return prompt;
				}
				modified = true;
				return sanitizeString(prompt);
			});

			if (modified) {
				return { systemPrompt: sanitized };
			}
		}
	});

	pi.on("before_provider_request", async (event) => {
		if (!event.payload || typeof event.payload !== "object") return undefined;
		return sanitizeValue(event.payload);
	});
}
