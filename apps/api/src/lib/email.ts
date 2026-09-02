import crypto from "node:crypto";
import { SESClient, SendEmailCommand, SendRawEmailCommand } from "@aws-sdk/client-ses";

// Real email sending via Amazon SES — the api service's App Runner instance role has
// ses:SendEmail/ses:SendRawEmail scoped to only the verified aeonsynergies.com identity
// (infra/aws/deploy.sh), so no access key belongs in env: the SDK's default credential
// chain picks up the instance role's credentials automatically. Region matches the region
// the identity was verified in (deploy.sh's REGION, default us-east-1).
const sesClient = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });

const FROM_ADDRESS = process.env.SES_FROM_ADDRESS || "no-reply@aeonsynergies.com";

export async function sendEmail(input: { to: string; subject: string; text: string; html: string }): Promise<{ messageId: string | null }> {
  const result = await sesClient.send(
    new SendEmailCommand({
      Source: FROM_ADDRESS,
      Destination: { ToAddresses: [input.to] },
      Message: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: input.text, Charset: "UTF-8" },
          Html: { Data: input.html, Charset: "UTF-8" },
        },
      },
    })
  );
  return { messageId: result.MessageId ?? null };
}

// RFC 2047-encodes a header value (subject, display name) as UTF-8/base64 unconditionally
// — simpler and always correct, vs. only encoding when non-ASCII is detected.
function encodeMimeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export interface RawEmailInput {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachment: { filename: string; contentType: string; content: Buffer };
}

// SendEmailCommand (above) has no attachment support at all — the only way to actually
// attach a file (vs. a mailto: link, which can't carry one either) is SendRawEmailCommand,
// which takes a hand-built RFC 2822 message. No MIME-building library is in this project's
// dependencies (nodemailer/mailcomposer etc.) — a single-attachment multipart/mixed message
// (with a multipart/alternative text+html body inside it) is simple enough to build by hand
// rather than take on a new dependency for it. Exported (pure, no SES call) so this exact
// byte structure is directly unit-testable without needing real AWS credentials.
export function buildRawMimeMessage(input: RawEmailInput): Buffer {
  const boundaryMixed = `AeonMixed_${crypto.randomBytes(16).toString("hex")}`;
  const boundaryAlt = `AeonAlt_${crypto.randomBytes(16).toString("hex")}`;

  const headers = [
    `From: ${FROM_ADDRESS}`,
    `To: ${input.to}`,
    ...(input.replyTo ? [`Reply-To: ${input.replyTo}`] : []),
    `Subject: ${encodeMimeHeader(input.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
  ].join("\r\n");

  const bodyPart = [
    `--${boundaryMixed}`,
    `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
    ``,
    `--${boundaryAlt}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    input.text,
    `--${boundaryAlt}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    input.html,
    `--${boundaryAlt}--`,
  ].join("\r\n");

  // Base64 lines are wrapped at 76 chars — not strictly required by every MTA, but is the
  // actual RFC 2045 limit, so wrapping avoids relying on SES tolerating unwrapped lines.
  const attachmentBase64 = input.attachment.content.toString("base64").replace(/.{76}/g, "$&\r\n");
  const attachmentPart = [
    `--${boundaryMixed}`,
    `Content-Type: ${input.attachment.contentType}; name="${input.attachment.filename}"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${input.attachment.filename}"`,
    ``,
    attachmentBase64,
  ].join("\r\n");

  return Buffer.from(`${headers}\r\n\r\n${bodyPart}\r\n${attachmentPart}\r\n--${boundaryMixed}--`, "utf-8");
}

export async function sendEmailWithAttachment(input: RawEmailInput): Promise<{ messageId: string | null; rawMessage: Buffer }> {
  const rawMessage = buildRawMimeMessage(input);
  const result = await sesClient.send(new SendRawEmailCommand({ RawMessage: { Data: rawMessage } }));
  return { messageId: result.MessageId ?? null, rawMessage };
}
