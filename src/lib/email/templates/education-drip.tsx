import * as React from "react";
import {
  Html, Head, Preview, Body, Container, Section, Heading, Text, Hr, Link,
} from "@react-email/components";
import {
  baseStyles, theme, ButtonBar, Footer, type Citation,
} from "./_shared";

export interface EducationDripProps {
  dayNumber: number;
  totalDays: number;
  moduleName: string;
  vertical: "faraudit" | "bullrize";
  title: string;
  concept: string;
  realExample: string;
  practice: string;
  answer: string;
  citation: Citation;
  tomorrowDay: number;
  tomorrowTitle: string;
  cost: number;
  reactionToken: string;
  emailId?: string;
  readMinutes?: number;
  wordCount?: number;
}

function wordCountOf(s: string) {
  return s.split(/\s+/).filter(Boolean).length;
}

export default function EducationDrip({
  dayNumber,
  totalDays,
  moduleName,
  vertical,
  title,
  concept,
  realExample,
  practice,
  answer,
  citation,
  tomorrowDay,
  tomorrowTitle,
  cost,
  reactionToken,
  emailId = "preview",
  readMinutes,
  wordCount,
}: EducationDripProps) {
  const totalWords = wordCount ?? wordCountOf(`${concept} ${realExample} ${practice} ${answer}`);
  const readMin = readMinutes ?? Math.max(1, Math.round(totalWords / 220));
  const academy = vertical === "faraudit" ? "FARaudit Academy" : "Bullrize Academy";
  const progress = Math.round((dayNumber / totalDays) * 100);

  return (
    <Html>
      <Head>
        <style>{baseStyles}</style>
      </Head>
      <Preview>{`Day ${dayNumber}: ${title}`}</Preview>
      <Body>
        <Container style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
          <Section style={{ borderBottom: `1px solid ${theme.borderLight}`, paddingBottom: 12 }}>
            <Text className="subtle" style={{ margin: 0 }}>
              {academy} · Module: {moduleName}
            </Text>
            <Text className="subtle" style={{ margin: "4px 0 0" }}>
              Day {dayNumber} of {totalDays} · {progress}% complete
            </Text>
            <div style={{ background: theme.borderLight, borderRadius: 4, height: 6, marginTop: 6, overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: 6, background: theme.accent }} />
            </div>
            <Heading as="h1" style={{ fontSize: 22, margin: "12px 0 4px" }}>{title}</Heading>
            <Text className="subtle" style={{ margin: 0 }}>
              {readMin} min read · {totalWords} words · 1 citation
            </Text>
          </Section>

          <Section className="panel">
            <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span className="section-num">1</span>Concept
            </Text>
            <Text style={{ margin: "8px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{concept}</Text>
          </Section>

          <Section className="panel">
            <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span className="section-num">2</span>Real Example
            </Text>
            <Text style={{ margin: "8px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{realExample}</Text>
          </Section>

          <Section className="warn-box">
            <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span className="section-num">3</span>Practice
            </Text>
            <Text style={{ margin: "8px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{practice}</Text>
          </Section>

          <Section className="success-box">
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 15, listStyle: "none" }}>
                <span className="section-num">4</span>Answer (click to reveal)
              </summary>
              <Text style={{ margin: "10px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{answer}</Text>
            </details>
          </Section>

          <Section style={{ margin: "12px 0" }}>
            <Text className="subtle" style={{ margin: 0 }}>
              Citation: <Link href={citation.url} className="citation">{citation.label}</Link>
            </Text>
          </Section>

          <Section className="panel" style={{ borderStyle: "dashed" } as React.CSSProperties}>
            <Text className="subtle" style={{ margin: 0 }}>Tomorrow — Day {tomorrowDay}</Text>
            <Text style={{ margin: "4px 0 0", fontWeight: 600 }}>{tomorrowTitle}</Text>
          </Section>

          <ButtonBar token={reactionToken} emailId={emailId} />

          <Footer
            cost={cost}
            sources={[citation.label]}
            replyPrompt="Reply to this email to ask Claude a follow-up question on this lesson."
          />
        </Container>
      </Body>
    </Html>
  );
}
