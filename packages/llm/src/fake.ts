/**
 * Deterministic LLM double for tests. Records the last request (so a test can assert
 * exactly what grounding context the service passed) and returns a scripted answer.
 * Never touches the network.
 */
import type { LlmClient, LlmRequest, LlmResponse } from "./client.js";

export class FakeLlmClient implements LlmClient {
  lastRequest: LlmRequest | null = null;
  calls = 0;

  /** `responder` can inspect the request to return a context-aware answer. */
  constructor(private readonly responder: (req: LlmRequest) => string = () => "Here to help.") {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    this.lastRequest = req;
    return { text: this.responder(req) };
  }
}
