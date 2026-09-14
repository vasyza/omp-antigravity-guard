import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import plugin from "./index";

describe("omp-antigravity-guard", () => {
	it("derives deterministic 8-char hex nonce from session id", async () => {
		const handlers = new Map<string, Function>();
		const fakePi = {
			on: (event: string, handler: Function) => {
				handlers.set(event, handler);
			},
		};

		plugin(fakePi as any);
		expect(handlers.has("before_agent_start")).toBe(true);
		expect(handlers.has("before_provider_request")).toBe(true);

		const expectedNonce1 = createHash("sha256").update("session-1").digest("hex").slice(0, 8);
		const expectedNonce2 = createHash("sha256").update("session-2").digest("hex").slice(0, 8);
		expect(expectedNonce1).toHaveLength(8);
		expect(expectedNonce2).toHaveLength(8);
		expect(expectedNonce1).not.toBe(expectedNonce2);

		const fakeCtx1 = {
			model: { provider: "google-antigravity" },
			models: { current: () => ({ provider: "google-antigravity" }) },
			sessionManager: { getSessionId: () => "session-1" },
		};

		const beforeAgentStart = handlers.get("before_agent_start")!;
		const res1 = await beforeAgentStart(
			{
				systemPrompt: ["Hello <system-conventions> instructions </system-conventions>"],
			},
			fakeCtx1,
		);

		expect(res1?.systemPrompt?.[0]).toBe(
			`Hello <system-conventions id="${expectedNonce1}"> instructions </system-conventions>`,
		);

		// Second turn in same session retains same nonce
		const res1Turn2 = await beforeAgentStart(
			{
				systemPrompt: ["Hello <system-conventions> instructions </system-conventions>"],
			},
			fakeCtx1,
		);
		expect(res1Turn2?.systemPrompt?.[0]).toBe(
			`Hello <system-conventions id="${expectedNonce1}"> instructions </system-conventions>`,
		);

		// Different session gets distinct nonce
		const fakeCtx2 = {
			model: { provider: "google-antigravity" },
			models: { current: () => ({ provider: "google-antigravity" }) },
			sessionManager: { getSessionId: () => "session-2" },
		};
		const res2 = await beforeAgentStart(
			{
				systemPrompt: ["Hello <system-conventions> instructions </system-conventions>"],
			},
			fakeCtx2,
		);
		expect(res2?.systemPrompt?.[0]).toBe(
			`Hello <system-conventions id="${expectedNonce2}"> instructions </system-conventions>`,
		);
	});

	it("does not modify prompts for other providers like deepseek or anthropic", async () => {
		const handlers = new Map<string, Function>();
		plugin({
			on: (event: string, handler: Function) => {
				handlers.set(event, handler);
			},
		} as any);

		const fakeCtxDeepseek = {
			model: { provider: "deepseek" },
			models: { current: () => ({ provider: "deepseek" }) },
			sessionManager: { getSessionId: () => "session-1" },
		};

		const beforeAgentStart = handlers.get("before_agent_start")!;
		const beforeProviderRequest = handlers.get("before_provider_request")!;

		const res = await beforeAgentStart(
			{ systemPrompt: ["<system-conventions> test </system-conventions>"] },
			fakeCtxDeepseek,
		);
		expect(res).toBeUndefined();

		const payloadRes = await beforeProviderRequest(
			{ payload: { prompt: "<system-conventions> test </system-conventions>" } },
			fakeCtxDeepseek,
		);
		expect(payloadRes).toBeUndefined();
	});

	it("sanitizes outgoing payload on before_provider_request (F5/retry/continue)", async () => {
		const handlers = new Map<string, Function>();
		plugin({
			on: (event: string, handler: Function) => {
				handlers.set(event, handler);
			},
		} as any);

		const fakeCtx = {
			model: { provider: "google-antigravity" },
			models: { current: () => ({ provider: "google-antigravity" }) },
			sessionManager: { getSessionId: () => "session-abc" },
		};

		const expectedNonce = createHash("sha256").update("session-abc").digest("hex").slice(0, 8);
		const beforeProviderRequest = handlers.get("before_provider_request")!;

		const payload = {
			contents: [
				{
					parts: [{ text: "<system-conventions> rules </system-conventions>" }],
				},
			],
		};

		const res = (await beforeProviderRequest({ payload }, fakeCtx)) as any;
		expect(res.contents[0].parts[0].text).toBe(
			`<system-conventions id="${expectedNonce}"> rules </system-conventions>`,
		);
	});
});
