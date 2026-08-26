import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { amazonDspDeck } from "./seed-data/amazon-dsp.js";
import { fedexPdDeck } from "./seed-data/fedex-pd.js";
import { meridianPropertyDeck } from "./seed-data/meridian-property.js";

const prisma = new PrismaClient();

async function main() {
  for (const deckConfig of [amazonDspDeck, meridianPropertyDeck, fedexPdDeck]) {
    const deck = await prisma.deck.upsert({
      where: { slug: deckConfig.id },
      update: {
        companyName: deckConfig.companyName,
        industry: deckConfig.industry,
        config: deckConfig as object,
      },
      create: {
        slug: deckConfig.id,
        companyName: deckConfig.companyName,
        industry: deckConfig.industry,
        config: deckConfig as object,
      },
    });
    console.log(`Seeded deck: ${deck.companyName} (${deck.slug})`);
  }

  const demoEmail = process.env.SEED_DEMO_USER_EMAIL || "demo@aeonsynergies.com";
  const demoPassword = process.env.SEED_DEMO_USER_PASSWORD || "AeonDemo123!";
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: {
      email: demoEmail,
      passwordHash,
      name: "Demo Admin",
      role: "ADMIN",
    },
  });
  console.log(`Seeded user: ${user.email} (password from SEED_DEMO_USER_PASSWORD env or default)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
