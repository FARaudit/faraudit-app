import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

export const anthropic: Anthropic | null = apiKey ? new Anthropic({ apiKey }) : null;

export const CLAUDE_MODEL = "claude-opus-4-7";
