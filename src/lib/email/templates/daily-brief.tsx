import * as React from "react";
import {
  Html, Head, Preview, Body, Container, Section, Heading, Text, Hr, Link,
} from "@react-email/components";
import {
  baseStyles, theme, ButtonBar, Footer, CitationList, type Citation,
} from "./_shared";

export interface WhatMovedItem {
  icon: string;
  bold: string;
  body: string;
  citations: Citation[];
}

export interface NewTrap {
  title: string;
  body: string;
  citations: Citation[];
}

export interface DailyBriefProps {
  vertical: "faraudit" | "bullrize";
  sendDate: string;
  bigOne: { title: string; body: string; citations: Citation[] };
  whatMoved: WhatMovedItem[];
  newTraps: NewTrap[];
  scanOrSignal: { title?: string; items: { bold: string; body: string; citations?: Citation[] }[] };
  oneQuestion: string;
  cost: number;
  sources: string[];
  reactionToken: string;
  emailId?: string;
  fromName?: string;
  toName?: string;
}

export default function DailyBrief({
  vertical,
  sendDate,
  bigOne,
  whatMoved,
  newTraps,
  scanOrSignal,
  oneQuestion,
  cost,
  sources,
  reactionToken,
  emailId = "preview",
  fromName,
  toName = "CEO",
}: DailyBriefProps) {
  const isFA = vertical === "faraudit";
  const brief = isFA ? "Defense Brief" : "Markets Brief";
  const sender = fromName || (isFA ? "FARaudit Intelligence Desk" : "Bullrize Signal Desk");
  const scanTitle = scanOrSignal.title || (isFA ? "Opportunity Scan" : "Today's Signal");
  const preview = `${brief} · ${bigOne.title}`;

  return (
    <Html>
      <Head>
        <style>{baseStyles}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body>
        <Container style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
          <Section style={{ borderBottom: `1px solid ${theme.borderLight}`, paddingBottom: 12 }}>
            <Text className="subtle" style={{ margin: 0 }}>
              From: {sender} · To: {toName} · {sendDate}
            </Text>
            <Heading as="h1" style={{ fontSize: 22, margin: "8px 0 0" }}>{brief}</Heading>
          </Section>

          <Section className="info-box">
            <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span className="section-num">1</span>The Big One — {bigOne.title}
            </Text>
            <Text style={{ margin: "8px 0 0", lineHeight: 1.55 }}>{bigOne.body}</Text>
            <CitationList citations={bigOne.citations} />
          </Section>

          <Section className="panel">
            <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span className="section-num">2</span>What Moved (past 24h)
            </Text>
            {whatMoved.map((item, i) => (
              <div key={i} style={{ marginTop: 12 }}>
                <Text style={{ margin: 0, lineHeight: 1.5 }}>
                  {item.icon} <strong>{item.bold}</strong> — {item.body}
                </Text>
                <CitationList citations={item.citations} />
              </div>
            ))}
          </Section>

          {newTraps.length > 0 && (
            <Section className="warn-box">
              <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
                <span className="section-num">3</span>New Traps
              </Text>
              {newTraps.map((trap, i) => (
                <div key={i} style={{ marginTop: 10 }}>
                  <Text style={{ margin: 0 }}>
                    <strong>{trap.title}</strong> — {trap.body}
                  </Text>
                  <CitationList citations={trap.citations} />
                </div>
              ))}
            </Section>
          )}

          <Section className="panel">
            <Text style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              <span className="section-num">4</span>{scanTitle}
            </Text>
            {scanOrSignal.items.map((item, i) => (
              <div key={i} style={{ marginTop: 10 }}>
                <Text style={{ margin: 0, lineHeight: 1.5 }}>
                  <strong>{item.bold}</strong> — {item.body}
                </Text>
                {item.citations && <CitationList citations={item.citations} />}
              </div>
            ))}
          </Section>

          <Section className="question-block">
            <Text style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>
              <span className="section-num">5</span>One Question to Ponder
            </Text>
            <Text style={{ margin: "8px 0 0" }}>{oneQuestion}</Text>
          </Section>

          <ButtonBar token={reactionToken} emailId={emailId} />

          <Footer
            cost={cost}
            sources={sources}
            replyPrompt={`Reply to this email to ask Claude a follow-up. Subject line is the thread key.`}
          />
        </Container>
      </Body>
    </Html>
  );
}
