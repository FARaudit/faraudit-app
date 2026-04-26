import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

export const anthropic: Anthropic | null = apiKey ? new Anthropic({ apiKey }) : null;

export const CLAUDE_MODEL = "claude-sonnet-4-20250514";
