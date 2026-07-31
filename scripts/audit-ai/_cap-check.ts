// Live capability lookup — never answer a model-capability question from memory.
import dotenv from "dotenv"; dotenv.config({ path: ".env.local", quiet: true });
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();
(async () => {
  for (const id of ["claude-opus-4-6", "claude-opus-4-8", "claude-opus-5"]) {
    try {
      const m: any = await client.models.retrieve(id);
      const c = m.capabilities ?? {};
      const so = c.structured_outputs?.supported;
      console.log(`${id.padEnd(18)} structured_outputs=${so}  ctx=${m.max_input_tokens}  out=${m.max_tokens}`);
    } catch (e: any) { console.log(`${id.padEnd(18)} ERROR ${String(e?.status ?? e?.message).slice(0,60)}`); }
  }
})();
