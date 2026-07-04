/**
 * Bedrock adapter for the LLM port. Uses the Converse API (model-agnostic message
 * shape) so the model id is the only thing that changes between Claude versions.
 * Credentials + region come from the standard AWS provider chain (the Lambda's
 * execution role at deploy) — nothing is read here beyond the injected config.
 *
 * The `client` is injectable so the adapter's request mapping can be unit-tested
 * against a stub `send` without a network call (see test/bedrock.test.ts).
 */
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { LlmClient, LlmRequest, LlmResponse } from "./client.js";

export type BedrockConfig = {
  modelId: string;
  region?: string;
  /** Injected in tests; defaults to a real client from the AWS provider chain. */
  client?: BedrockRuntimeClient;
};

export class BedrockLlmClient implements LlmClient {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(cfg: BedrockConfig) {
    if (!cfg.modelId) throw new Error("BedrockLlmClient requires a modelId");
    this.modelId = cfg.modelId;
    this.client = cfg.client ?? new BedrockRuntimeClient(cfg.region ? { region: cfg.region } : {});
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const out = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: req.system }],
        messages: req.messages.map((m) => ({ role: m.role, content: [{ text: m.content }] })),
        inferenceConfig: {
          maxTokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.2,
        },
      })
    );
    const text = (out.output?.message?.content ?? [])
      .map((block) => ("text" in block && block.text ? block.text : ""))
      .join("")
      .trim();
    if (!text) throw new Error("Bedrock returned an empty response");
    return { text };
  }
}
