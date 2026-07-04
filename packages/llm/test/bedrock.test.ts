/**
 * Bedrock adapter mapping tests — no network. A stub `send` captures the
 * ConverseCommand input so we can assert the request mapping (model, system,
 * message shape, inference config) and the response parsing, plus the fake double.
 */
import { test, expect, describe } from "bun:test";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { BedrockLlmClient, FakeLlmClient } from "../src/index";

/** A BedrockRuntimeClient whose send() records the command input and returns a canned Converse output. */
function stubClient(output: unknown) {
  const captured: { input?: any } = {};
  const client = {
    send: async (cmd: any) => {
      captured.input = cmd.input;
      return output;
    },
  } as unknown as BedrockRuntimeClient;
  return { client, captured };
}

const CONVERSE_OK = { output: { message: { role: "assistant", content: [{ text: "Your deductible is $1,500." }] } } };

describe("BedrockLlmClient", () => {
  test("maps an LlmRequest to a ConverseCommand and parses the reply", async () => {
    const { client, captured } = stubClient(CONVERSE_OK);
    const llm = new BedrockLlmClient({ modelId: "anthropic.claude-x", client });

    const res = await llm.complete({
      system: "You are the benefits assistant.",
      messages: [{ role: "user", content: "What's my deductible?" }],
      maxTokens: 600,
      temperature: 0.1,
    });

    expect(res.text).toBe("Your deductible is $1,500.");
    expect(captured.input.modelId).toBe("anthropic.claude-x");
    expect(captured.input.system).toEqual([{ text: "You are the benefits assistant." }]);
    expect(captured.input.messages).toEqual([{ role: "user", content: [{ text: "What's my deductible?" }] }]);
    expect(captured.input.inferenceConfig).toEqual({ maxTokens: 600, temperature: 0.1 });
  });

  test("defaults maxTokens/temperature when omitted", async () => {
    const { client, captured } = stubClient(CONVERSE_OK);
    const llm = new BedrockLlmClient({ modelId: "m", client });
    await llm.complete({ system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(captured.input.inferenceConfig.maxTokens).toBe(1024);
    expect(captured.input.inferenceConfig.temperature).toBe(0.2);
  });

  test("concatenates multi-block text output", async () => {
    const { client } = stubClient({ output: { message: { content: [{ text: "Part one. " }, { text: "Part two." }] } } });
    const llm = new BedrockLlmClient({ modelId: "m", client });
    const res = await llm.complete({ system: "s", messages: [{ role: "user", content: "q" }] });
    expect(res.text).toBe("Part one. Part two.");
  });

  test("throws on an empty response (nothing to show the employee)", async () => {
    const { client } = stubClient({ output: { message: { content: [] } } });
    const llm = new BedrockLlmClient({ modelId: "m", client });
    expect(llm.complete({ system: "s", messages: [{ role: "user", content: "q" }] })).rejects.toThrow("empty response");
  });

  test("requires a modelId", () => {
    expect(() => new BedrockLlmClient({ modelId: "" })).toThrow("modelId");
  });
});

describe("FakeLlmClient", () => {
  test("records the last request and returns the scripted answer", async () => {
    const fake = new FakeLlmClient((req) => `echo:${req.messages[0].content}`);
    const res = await fake.complete({ system: "sys", messages: [{ role: "user", content: "ping" }] });
    expect(res.text).toBe("echo:ping");
    expect(fake.calls).toBe(1);
    expect(fake.lastRequest?.system).toBe("sys");
  });
});
