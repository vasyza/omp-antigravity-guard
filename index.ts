import { createHash } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";

function getSessionNonce(ctx: ExtensionContext): string {
	const sessionId = ctx.sessionManager?.getSessionId?.() ?? "default";
	return createHash("sha256").update(sessionId).digest("hex").slice(0, 8);
}

function sanitizeString(str: string, nonce: string): string {
	const hasSystemConventions = str.includes("<system-conventions>");
	const hasConventions = str.includes("<conventions>");
	if (!hasSystemConventions && !hasConventions) return str;
	let result = str;
	if (hasSystemConventions) {
		result = result.replaceAll("<system-conventions>", `<system-conventions id="${nonce}">`);
	}
	if (hasConventions) {
		result = result.replaceAll("<conventions>", `<conventions id="${nonce}">`);
	}
	return result;
}

function sanitizeValue(value: unknown, nonce: string): unknown {
	if (typeof value === "string") {
		return sanitizeString(value, nonce);
	}
	if (Array.isArray(value)) {
		let changed = false;
		const next = value.map((item) => {
			const sanitized = sanitizeValue(item, nonce);
			if (sanitized !== item) changed = true;
			return sanitized;
		});
		return changed ? next : value;
	}
	if (value !== null && typeof value === "object") {
		let changed = false;
		const next: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			const sanitized = sanitizeValue(v, nonce);
			if (sanitized !== v) changed = true;
			next[k] = sanitized;
		}
		return changed ? next : value;
	}
	return value;
}

/**
 * Oh My Pi extension that prevents Antigravity and other reverse proxies from
 * detecting OMP fingerprints or hitting synthetic 429 errors.
 *
 * Derives a deterministic 8-character hex nonce from SHA-256 of the session ID.
 * This guarantees the system prompt prefix remains 100% identical and cache-friendly
 * across all turns within a dialogue for all providers, while different sessions
 * each receive a unique tag.
 */
export default function (pi: ExtensionAPI) {
	// 1. Initial user turn
	pi.on("before_agent_start", async (event, ctx) => {
		if (event.systemPrompt && Array.isArray(event.systemPrompt)) {
			const nonce = getSessionNonce(ctx);
			let modified = false;
			const sanitized = event.systemPrompt.map((prompt: string) => {
				if (
					typeof prompt !== "string" ||
					(!prompt.includes("<system-conventions>") && !prompt.includes("<conventions>"))
				) {
					return prompt;
				}
				modified = true;
				return sanitizeString(prompt, nonce);
			});

			if (modified) {
				return { systemPrompt: sanitized };
			}
		}
	});

	// 2. Outgoing wire payload (including F5 / retry / continue)
	pi.on("before_provider_request", async (event, ctx) => {
		if (!event.payload || typeof event.payload !== "object") return undefined;

		const nonce = getSessionNonce(ctx);
		return sanitizeValue(event.payload, nonce);
	});
}
