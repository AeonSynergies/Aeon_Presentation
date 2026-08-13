import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { amazonDspDeck } from "./seed-data/amazon-dsp.js";

const prisma = new PrismaClient();

async function main() {
  const deck = await prisma.deck.upsert({
    where: { slug: amazonDspDeck.id },
    update: {
      companyName: amazonDspDeck.companyName,
      industry: amazonDspDeck.industry,
      config: amazonDspDeck as object,
    },
    create: {
      slug: amazonDspDeck.id,
      companyName: amazonDspDeck.companyName,
      industry: amazonDspDeck.industry,
      config: amazonDspDeck as object,
    },
  });
  console.log(`Seeded deck: ${deck.companyName} (${deck.slug})`);

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
