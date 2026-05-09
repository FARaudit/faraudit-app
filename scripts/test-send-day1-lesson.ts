/**
 * Phase C Day 1 — test-send Day 1 Education lesson to jose@faraudit.com.
 * Tries Notion API first; falls back to inline lesson content if NOTION_TOKEN missing.
 *
 * Run:  npx tsx scripts/test-send-day1-lesson.ts
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Resend } from "resend";
import { Client as NotionClient } from "@notionhq/client";
import { render } from "@react-email/render";
import EducationDrip, { type EducationDripProps } from "../src/lib/email/templates/education-drip";

const EDUCATION_LESSONS_DB_ID = "02f1f89049c74dd987691bebd29e8b66";

const INLINE_DAY1: EducationDripProps = {
  dayNumber: 1,
  totalDays: 90,
  moduleName: "SF1449 Anatomy",
  vertical: "faraudit",
  title: "What is SF1449? Why every federal contractor must read it fluently",
  concept:
    "SF1449 is the Solicitation/Contract/Order for Commercial Items — the 17-block cover sheet the federal government wraps around almost every FAR Part 12 commercial-item acquisition. It is not the contract; it is the index. Blocks 1–8 identify the buying activity, solicitation number, response date, and small-business set-aside status. Blocks 9–14 carry the line items, NAICS code, and contract type. Blocks 15–17 carry pricing, payment terms, and the CO signature that converts a solicitation into a contract. If you cannot read SF1449 cold, you cannot price, qualify, or protest the work — every downstream decision (teaming, bid/no-bid, KO email, capability statement match) depends on facts that only this form makes legible.",
  realExample:
    "Solicitation FA251726Q0024 (Air Force, posted 2026-04-22) opens with an SF1449. Block 4 says solicitation #, Block 7 sets the offer due date (10:00 CT, 2026-05-15), Block 10 lists NAICS 541330 with $25.5M small-business size standard, Block 12 marks 'Commercial Items — FAR 12.6 Streamlined Procedures.' That single page tells you: small-business set-aside, engineering services, you have ~3 weeks, and the streamlined procedures path means proposals are evaluated on price + technical narrative, not full FAR Part 15 source selection. Reading those four blocks correctly is what separates a 5-minute go/no-go from a 5-day analysis.",
  practice:
    "On the SF1449 above, Block 10 lists NAICS 541330 and a $25.5M size standard. The bidder you're considering teaming with reported $32M revenue last fiscal year. Are they eligible to bid as the prime on this solicitation? What is the single block on the SF1449 you would cite to defend your answer in a size protest?",
  answer:
    "No — they are over the size standard for NAICS 541330 ($25.5M average annual receipts, 3-year lookback per 13 CFR §121.104). They cannot prime a small-business set-aside with $32M revenue. Cite Block 10 (NAICS code + size standard) plus Block 9 (set-aside designation). In a size protest the SBA Area Office will pull the SF1449 first to confirm the set-aside type and NAICS, then audit the offeror's three-year average receipts against the size standard. If your teaming partner is the prime, the entire bid is defective on its face — you would need to flip roles (you prime, they sub) or no-bid.",
  citation: {
    url: "https://www.acquisition.gov/far/53.212",
    label: "FAR 53.212 — Forms (SF1449 prescribed for commercial item acquisitions)",
  },
  tomorrowDay: 2,
  tomorrowTitle: "Block 9: How to identify and target your CO",
  cost: 0,
  reactionToken: "test-token-day1-" + Date.now(),
  emailId: "test-day1-" + Date.now(),
};

async function fetchFromNotion(): Promise<EducationDripProps | null> {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.log("NOTION_TOKEN not set — skipping Notion fetch, using inline fallback.");
    return null;
  }
  try {
    const notion = new NotionClient({ auth: token });
    // @notionhq/client v5 removed databases.query in favor of dataSources.query.
    // Day 2 should resolve the data source id once and cache it; for the test we cast
    // and call dataSources.query with the DB id (works for single-source databases).
    const response = await (notion.dataSources as unknown as {
      query: (a: unknown) => Promise<{ results: unknown[] }>;
    }).query({
      data_source_id: EDUCATION_LESSONS_DB_ID,
      filter: {
        and: [
          { property: "Vertical", select: { equals: "FARaudit" } },
          { property: "Day Number", number: { equals: 1 } },
        ],
      },
      page_size: 1,
    });
    if (response.results.length === 0) {
      console.log("Notion query returned 0 results — using inline fallback.");
      return null;
    }
    // Defensive parse — Notion property shapes vary by config.
    const row = response.results[0] as { properties: Record<string, unknown> };
    const props = row.properties;
    const text = (key: string): string => {
      const p = props[key] as { rich_text?: { plain_text?: string }[]; title?: { plain_text?: string }[] } | undefined;
      return p?.rich_text?.[0]?.plain_text ?? p?.title?.[0]?.plain_text ?? "";
    };
    const sel = (key: string): string => {
      const p = props[key] as { select?: { name?: string } } | undefined;
      return p?.select?.name ?? "";
    };
    const title = text("Lesson Title") || INLINE_DAY1.title;
    console.log(`Notion lesson found: "${title}"`);
    return {
      ...INLINE_DAY1,
      moduleName: sel("Module") || INLINE_DAY1.moduleName,
      title,
      concept: text("Concept") || INLINE_DAY1.concept,
      realExample: text("Real Example") || INLINE_DAY1.realExample,
      practice: text("Practice Question") || INLINE_DAY1.practice,
      answer: text("Answer") || INLINE_DAY1.answer,
    };
  } catch (err) {
    console.error("Notion fetch failed — using inline fallback:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM_EMAIL || "FARaudit Academy <academy@faraudit.com>";
  const renderOnly = process.argv.includes("--render-only") || !apiKey;

  const fromNotion = await fetchFromNotion();
  const props = fromNotion || INLINE_DAY1;
  const source = fromNotion ? "notion" : "inline-fallback";

  const html = await render(EducationDrip(props));
  console.log(`Rendered HTML length: ${html.length} bytes (source: ${source})`);

  // Always write the rendered HTML for visual inspection.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const outDir = path.resolve("outputs");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "test-day1-preview.html");
  await fs.writeFile(outPath, html, "utf8");
  console.log(`Preview written to: file://${outPath}`);

  if (renderOnly) {
    console.log(apiKey ? "--render-only flag set — skipping Resend send." : "RESEND_API_KEY empty/missing — skipping send (render-only mode).");
    return;
  }

  const resend = new Resend(apiKey);
  const subjectTag = source === "notion" ? "[TEST]" : "[TEST · INLINE]";
  const result = await resend.emails.send({
    from: fromAddr,
    to: "jose@faraudit.com",
    subject: `${subjectTag} Day ${props.dayNumber}: ${props.title}`,
    html,
  });

  if (result.error) {
    console.error("Resend send error:", result.error);
    process.exit(1);
  }
  console.log("Resend message id:", result.data?.id);
  console.log("Source:", source);
  console.log("Subject:", `${subjectTag} Day ${props.dayNumber}: ${props.title}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
