import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

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
