/**
 * LLM port. The whole point is a narrow, provider-agnostic seam: the service layer
 * depends on THIS interface, never on a concrete SDK, so integration tests inject a
 * FakeLlmClient and never touch the network. The Bedrock adapter (bedrock.ts) and the
 * fake (fake.ts) are the only two implementations.
 */
export type LlmRole = "user" | "assistant";

export type LlmMessage = { role: LlmRole; content: string };

export type LlmRequest = {
  /** System prompt — stable rules/role; grounding facts go in the user message. */
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type LlmResponse = { text: string };

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}
