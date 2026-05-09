import * as React from "react";
import {
  Html, Head, Preview, Body, Container, Section, Heading, Text, Hr, Link, Row, Column,
} from "@react-email/components";
import {
  baseStyles, theme, ButtonBar, Footer, type Citation,
} from "./_shared";

export interface ComparisonRow {
  feature: string;
  bullrize: string;
  competitor1: string;
  competitor2?: string;
}

export interface MetricCard {
  label: string;
  value: string;
  note?: string;
}

export interface SundayDeepdiveProps {
  weekNumber: number;
  totalWeeks: number;
  apiName: string;
  featureName: string;
  title: string;
  vertical?: "bullrize" | "faraudit";
  part1: { whatItDoes: string; sampleQuery: string };
  part2: {
    featureDescription: string;
    mockScreen: string;
    comparisonHeader: { competitor1: string; competitor2?: string };
    comparison: ComparisonRow[];
  };
  part3: {
    metrics: { complexity: MetricCard; cost: MetricCard; refresh: MetricCard; risk: MetricCard };
    sequencingDeps: string;
  };
  ceoDecisionPrompt: string;
  nextWeek: { number: number; title: string };
  citations: Citation[];
  cost: number;
  reactionToken: string;
  emailId?: string;
  readMinutes?: number;
}

export default function SundayDeepdive({
  weekNumber,
  totalWeeks,
  apiName,
  featureName,
  title,
  vertical = "bullrize",
  part1,
  part2,
  part3,
  ceoDecisionPrompt,
  nextWeek,
  citations,
  cost,
  reactionToken,
  emailId = "preview",
  readMinutes = 8,
}: SundayDeepdiveProps) {
  const program = vertical === "bullrize" ? "Bullrize Sunday Deep-Dive" : "FARaudit Sunday Deep-Dive";
  const progress = Math.round((weekNumber / totalWeeks) * 100);
  const cmpHeader2 = part2.comparisonHeader.competitor2;

  return (
    <Html>
      <Head>
        <style>{baseStyles}</style>
      </Head>
      <Preview>{`Week ${weekNumber}: ${apiName} → ${featureName}`}</Preview>
      <Body>
        <Container style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
          <Section style={{ borderBottom: `1px solid ${theme.borderLight}`, paddingBottom: 12 }}>
            <Text className="subtle" style={{ margin: 0 }}>
              {program} · API Mastery + Feature Roadmap
            </Text>
            <Text className="subtle" style={{ margin: "4px 0 0" }}>
              Week {weekNumber} of {totalWeeks} · {progress}% complete
            </Text>
            <Heading as="h1" style={{ fontSize: 22, margin: "12px 0 4px" }}>{title}</Heading>
            <Text className="subtle" style={{ margin: 0 }}>
              {readMinutes} min read · API: {apiName} · Feature: {featureName}
            </Text>
          </Section>

          <Section className="info-box">
            <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span className="section-num">1</span>What This API Can Do Today
            </Text>
            <Text style={{ margin: "8px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{part1.whatItDoes}</Text>
            <pre style={{
              background: "#0b0d10", color: "#e7ebf1", padding: 12, borderRadius: 6,
              fontSize: 12, overflowX: "auto", margin: "10px 0 0", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}>
              {part1.sampleQuery}
            </pre>
          </Section>

          <Section className="panel">
            <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span className="section-num">2</span>What Platform Feature This Enables
            </Text>
            <Text style={{ margin: "8px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{part2.featureDescription}</Text>
            <Text className="subtle" style={{ margin: "10px 0 0" }}>Mock screen:</Text>
            <Text style={{ margin: "4px 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
              {part2.mockScreen}
            </Text>

            <Text className="subtle" style={{ margin: "16px 0 4px" }}>Competitive comparison:</Text>
            <table className="cmp">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Bullrize</th>
                  <th>{part2.comparisonHeader.competitor1}</th>
                  {cmpHeader2 && <th>{cmpHeader2}</th>}
                </tr>
              </thead>
              <tbody>
                {part2.comparison.map((row, i) => (
                  <tr key={i}>
                    <td>{row.feature}</td>
                    <td>{row.bullrize}</td>
                    <td>{row.competitor1}</td>
                    {cmpHeader2 && <td>{row.competitor2 || "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section className="panel">
            <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span className="section-num">3</span>Implementation Tradeoffs
            </Text>
            <Row style={{ marginTop: 10 }}>
              {(["complexity", "cost", "refresh", "risk"] as const).map((k) => {
                const m = part3.metrics[k];
                return (
                  <Column key={k} style={{ padding: 6 }}>
                    <div style={{ background: theme.panelLight, borderRadius: 6, padding: 10, border: `1px solid ${theme.borderLight}` }}>
                      <Text className="subtle" style={{ margin: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</Text>
                      <Text style={{ margin: "4px 0 0", fontWeight: 700, fontSize: 16 }}>{m.value}</Text>
                      {m.note && <Text className="subtle" style={{ margin: "2px 0 0" }}>{m.note}</Text>}
                    </div>
                  </Column>
                );
              })}
            </Row>
            <Text className="subtle" style={{ margin: "12px 0 4px" }}>Sequencing dependencies:</Text>
            <Text style={{ margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{part3.sequencingDeps}</Text>
          </Section>

          <Section className="warn-box">
            <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span className="section-num">4</span>CEO Decision Prompt
            </Text>
            <Text style={{ margin: "8px 0 0", lineHeight: 1.6 }}>{ceoDecisionPrompt}</Text>
          </Section>

          <Section className="panel" style={{ borderStyle: "dashed" } as React.CSSProperties}>
            <Text className="subtle" style={{ margin: 0 }}>Next Sunday — Week {nextWeek.number}</Text>
            <Text style={{ margin: "4px 0 0", fontWeight: 600 }}>{nextWeek.title}</Text>
          </Section>

          <ButtonBar token={reactionToken} emailId={emailId} />

          <Footer
            cost={cost}
            sources={citations.map((c) => c.label)}
            replyPrompt="Reply with your build decision (build / queue / decline) and Claude will draft a tactical follow-up."
          />
        </Container>
      </Body>
    </Html>
  );
}
