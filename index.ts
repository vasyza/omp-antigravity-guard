import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";

// Stable attribute that breaks Antigravity's verbatim string match without busting prompt caches
const ANTIGRAVITY_TAG = '<system-conventions id="omp">';

function isAntigravity(ctx: ExtensionContext): boolean {
	const provider = ctx.model?.provider ?? ctx.models.current()?.provider;
	return provider === "google-antigravity";
}

function sanitizeString(str: string): string {
	if (!str.includes("<system-conventions>")) return str;
	return str.replaceAll("<system-conventions>", ANTIGRAVITY_TAG);
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
 * Scoped strictly to `provider === "google-antigravity"`, leaving all other providers
 * (DeepSeek, Anthropic, OpenAI, etc.) completely untouched so prompt caching is 100% preserved.
 *
 * Uses a stable tag `<system-conventions id="omp">` so that even within Antigravity,
 * the prompt prefix remains consistent and cache-friendly across requests.
 */
export default function (pi: ExtensionAPI) {
	// 1. Initial user turn
	pi.on("before_agent_start", async (event, ctx) => {
		if (!isAntigravity(ctx)) return undefined;

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

	// 2. Outgoing wire payload (including F5 / retry / continue)
	pi.on("before_provider_request", async (event, ctx) => {
		if (!isAntigravity(ctx)) return undefined;
		if (!event.payload || typeof event.payload !== "object") return undefined;

		return sanitizeValue(event.payload);
	});
}
