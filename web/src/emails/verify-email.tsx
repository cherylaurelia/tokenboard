// Branded OTP + magic-link email. The SAME 6-digit code is shown paste-able AND embedded in the
// magic-link Button href. This is the ONE legit place hardcoded brand hex/px live — email clients
// require inline styles (CSS vars don't work in mail), so frontend.md's no-raw-hex rule (which
// governs the web APP via globals.css tokens) does not apply here. Invoked as a FUNCTION CALL in
// Resend's react: prop, so the route handler stays plain TS.
import { Html, Head, Preview, Body, Container, Heading, Text, Button, Hr, Section } from "@react-email/components";

const BG = "#14151f"; // == --bg
const PANEL = "#1f212e"; // == --panel
const FRAME = "#34374a"; // == --frame
const INK = "#e6e6ea"; // == --ink
const INK_MUTED = "#9698a8"; // == --ink-3-text
const CORAL = "#cc785c"; // == --coral
const ON_CORAL = "#14151f"; // == --on-coral

export function VerifyEmail({ code, confirmUrl, domain }: { code: string; confirmUrl: string; domain: string }) {
  return (
    <Html>
      <Head />
      <Preview>Your tokenboard verification code: {code}</Preview>
      <Body
        style={{
          backgroundColor: BG,
          color: INK,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          margin: 0,
          padding: "24px",
        }}
      >
        <Container
          style={{
            backgroundColor: PANEL,
            border: `1px solid ${FRAME}`,
            borderRadius: "12px",
            padding: "32px",
            maxWidth: "480px",
          }}
        >
          <Heading style={{ color: INK, fontSize: "20px", margin: "0 0 8px" }}>Verify your work email</Heading>
          <Text style={{ color: INK_MUTED, fontSize: "14px", lineHeight: "1.5", margin: "0 0 24px" }}>
            Confirm you control an email at <strong style={{ color: INK }}>{domain}</strong> to join your company
            board.
          </Text>
          <Section style={{ textAlign: "center", margin: "0 0 24px" }}>
            <Text style={{ color: CORAL, fontSize: "40px", letterSpacing: "8px", fontWeight: 700, margin: 0 }}>
              {code}
            </Text>
          </Section>
          <Section style={{ textAlign: "center", margin: "0 0 24px" }}>
            <Button
              href={confirmUrl}
              style={{
                backgroundColor: CORAL,
                color: ON_CORAL,
                borderRadius: "8px",
                padding: "12px 24px",
                fontSize: "16px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Verify and join
            </Button>
          </Section>
          <Hr style={{ borderColor: FRAME, margin: "24px 0" }} />
          <Text style={{ color: INK_MUTED, fontSize: "12px", lineHeight: "1.5", margin: 0 }}>
            This code expires in 15 minutes and can be used once. If you didn&rsquo;t request it, ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
