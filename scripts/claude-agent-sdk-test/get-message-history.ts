import { getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

const messages = await getSessionMessages("3679f26d-85d7-48c6-9695-ef8400a81063");
Bun.write("results.json", JSON.stringify(messages, null, 2));