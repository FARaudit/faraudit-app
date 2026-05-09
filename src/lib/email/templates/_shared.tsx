import * as React from "react";
import { Section, Row, Column, Button, Text, Hr, Link } from "@react-email/components";

export const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://faraudit.com";

export const theme = {
  bg: "#0b0d10",
  bgLight: "#ffffff",
  panel: "#13161b",
  panelLight: "#f6f7f9",
  subtle: "#8a93a3",
  subtleLight: "#5a6473",
  text: "#e7ebf1",
  textLight: "#1a1f27",
  border: "#1f242c",
  borderLight: "#e3e6ec",
  accent: "#3f8cff",
  warn: "#f4b740",
  warnBg: "#3a2a0b",
  warnBgLight: "#fff7e0",
  success: "#3ddc84",
  successBg: "#0e2a1c",
  successBgLight: "#e6f8ee",
  info: "#3f8cff",
  infoBg: "#0e1f3a",
  infoBgLight: "#eaf2ff",
};

export const baseStyles = `
  body { background: ${theme.bgLight}; color: ${theme.textLight}; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  a { color: ${theme.accent}; }
  .panel { background: ${theme.panelLight}; border: 1px solid ${theme.borderLight}; border-radius: 8px; padding: 16px; margin: 12px 0; }
  .info-box { background: ${theme.infoBgLight}; border-left: 4px solid ${theme.info}; padding: 14px 16px; border-radius: 6px; margin: 12px 0; }
  .warn-box { background: ${theme.warnBgLight}; border-left: 4px solid ${theme.warn}; padding: 14px 16px; border-radius: 6px; margin: 12px 0; }
  .success-box { background: ${theme.successBgLight}; border-left: 4px solid ${theme.success}; padding: 14px 16px; border-radius: 6px; margin: 12px 0; }
  .subtle { color: ${theme.subtleLight}; font-size: 12px; }
  .citation { color: ${theme.accent}; text-decoration: underline; font-size: 12px; }
  .section-num { display: inline-block; width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 50%; background: ${theme.info}; color: #fff; font-size: 12px; font-weight: 600; margin-right: 8px; }
  .question-block { font-style: italic; background: ${theme.panelLight}; padding: 14px 16px; border-radius: 6px; margin: 16px 0; }
  table.cmp { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  table.cmp th, table.cmp td { border: 1px solid ${theme.borderLight}; padding: 8px 10px; text-align: left; }
  table.cmp th { background: ${theme.panelLight}; font-weight: 600; }
  @media (prefers-color-scheme: dark) {
    body { background: ${theme.bg}; color: ${theme.text}; }
    .panel { background: ${theme.panel}; border-color: ${theme.border}; }
    .info-box { background: ${theme.infoBg}; }
    .warn-box { background: ${theme.warnBg}; }
    .success-box { background: ${theme.successBg}; }
    .subtle { color: ${theme.subtle}; }
    .question-block { background: ${theme.panel}; }
    table.cmp th, table.cmp td { border-color: ${theme.border}; }
    table.cmp th { background: ${theme.panel}; }
  }
`;

export interface Citation { url: string; label: string }

export function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations || citations.length === 0) return null;
  return (
    <Text style={{ margin: "6px 0 0", fontSize: 12 }}>
      {citations.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 ? " · " : "Source: "}
          <Link href={c.url} className="citation">{c.label}</Link>
        </React.Fragment>
      ))}
    </Text>
  );
}

export function buildReactionUrls(token: string, emailId: string) {
  const q = `token=${encodeURIComponent(token)}&email_id=${encodeURIComponent(emailId)}`;
  return {
    useful: `${BASE_URL}/api/email/handle-reaction?reaction=useful&${q}`,
    skip: `${BASE_URL}/api/email/handle-reaction?reaction=skip&${q}`,
    deeper: `${BASE_URL}/api/email/handle-reaction?reaction=deeper&${q}`,
    pin: `${BASE_URL}/api/email/pin-to-notion?${q}`,
    ask: `mailto:academy@faraudit.com?subject=Ask%20Claude%20re%3A%20${encodeURIComponent(emailId)}`,
  };
}

const btn = (bg: string): React.CSSProperties => ({
  background: bg,
  color: "#ffffff",
  padding: "10px 14px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
});

export function ButtonBar({ token, emailId }: { token: string; emailId: string }) {
  const u = buildReactionUrls(token, emailId);
  return (
    <Section style={{ margin: "20px 0 8px" }}>
      <Row>
        <Column align="center">
          <table role="presentation" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "separate" }}>
            <tbody>
              <tr>
                <td style={{ padding: "0 4px" }}><Button href={u.useful} style={btn("#1f7a3a")}>👍 Useful</Button></td>
                <td style={{ padding: "0 4px" }}><Button href={u.skip} style={btn("#5a6473")}>⏭ Skip</Button></td>
                <td style={{ padding: "0 4px" }}><Button href={u.deeper} style={btn("#2a5fa3")}>🔍 Want Deeper</Button></td>
                <td style={{ padding: "0 4px" }}><Button href={u.pin} style={btn("#6b3aa8")}>📌 Pin to Notion</Button></td>
                <td style={{ padding: "0 4px" }}><Button href={u.ask} style={btn("#a8632a")}>💬 Ask Claude</Button></td>
              </tr>
            </tbody>
          </table>
        </Column>
      </Row>
    </Section>
  );
}

export function Footer({ cost, sources, replyPrompt }: { cost: number; sources: string[]; replyPrompt?: string }) {
  return (
    <>
      <Hr style={{ borderColor: theme.borderLight, margin: "24px 0 12px" }} />
      <Text className="subtle" style={{ margin: "4px 0" }}>
        Generated by Sonnet 4.6 · Cost: ${cost.toFixed(4)} · Sources: {sources.join(", ")}
      </Text>
      {replyPrompt && (
        <Text className="subtle" style={{ margin: "4px 0" }}>{replyPrompt}</Text>
      )}
      <Text className="subtle" style={{ margin: "4px 0" }}>
        Vertex Intelligence Holdings · 1111B S Governors Ave #99083, Dover, DE 19904
      </Text>
    </>
  );
}
