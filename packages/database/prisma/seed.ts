import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { amazonDspDeck } from "./seed-data/amazon-dsp.js";
import { fedexPdDeck } from "./seed-data/fedex-pd.js";
import { meridianPropertyDeck } from "./seed-data/meridian-property.js";

const prisma = new PrismaClient();

// Pricing-driver restructuring migration — the three named decks above get their config
// fully replaced by the upsert loop below (already in the new pricingModels shape), but
// any OTHER deck already in the database (wizard/AI-drafted decks, e.g. Harbor Lane Dental,
// created before this change) still has the old single pricingDriver + per-service
// pricingDriverField/pricingDriverLabel shape. This mechanically converts each one in
// place, exactly like the seeded decks were converted by hand: the old driver becomes the
// primary model, each distinct pricingDriverField becomes its own named model (reusing the
// linked discovery question's own label/text, since the old override never had a unit —
// derived from the last word of its label), every service gets an explicit pricingModelId,
// and the now-superseded discoveryQuestions entries for converted override fields are
// dropped (that information now lives in the model itself, synthesized dynamically in
// Discovery Notes). Runs on every deploy (idempotent — skips configs that already have
// pricingModels), same "safe to run every time" pattern as the deck upserts below.
function deriveUnitFromLabel(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  return (words[words.length - 1] || "value").toLowerCase();
}

function migrateLegacyPricingDriver(raw: unknown): { config: object; migrated: boolean } {
  const cfg = raw as Record<string, unknown>;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg.pricingModels) || !cfg.pricingDriver) {
    return { config: cfg, migrated: false };
  }
  const oldDriver = cfg.pricingDriver as { label: string; unit: string; questionText: string };
  const discoveryQuestions = (cfg.discoveryQuestions as Array<Record<string, unknown>>) || [];
  const pricingModels: Array<Record<string, unknown>> = [
    { id: "primary", label: oldDriver.label, unit: oldDriver.unit, questionText: oldDriver.questionText, isPrimary: true },
  ];
  const modelIdByField = new Map<string, string>();

  const services = ((cfg.services as Array<Record<string, unknown>>) || []).map((svc) => {
    const { pricingDriverField, pricingDriverLabel, ...rest } = svc;
    if (!pricingDriverField || typeof pricingDriverField !== "string") {
      return { ...rest, pricingModelId: "primary" };
    }
    let modelId = modelIdByField.get(pricingDriverField);
    if (!modelId) {
      modelId = pricingDriverField;
      const linkedQuestion = discoveryQuestions.find((q) => q.id === pricingDriverField);
      const label = (pricingDriverLabel as string) || (linkedQuestion?.label as string) || pricingDriverField;
      const questionText = (linkedQuestion?.label as string) || label;
      pricingModels.push({ id: modelId, label, unit: deriveUnitFromLabel(label), questionText, isPrimary: false });
      modelIdByField.set(pricingDriverField, modelId);
    }
    return { ...rest, pricingModelId: modelId };
  });

  const filteredDiscoveryQuestions = discoveryQuestions.filter((q) => !modelIdByField.has(q.id as string));
  const { pricingDriver: _drop, ...restConfig } = cfg;
  return { config: { ...restConfig, pricingModels, services, discoveryQuestions: filteredDiscoveryQuestions }, migrated: true };
}

async function migrateLegacyPricingModels() {
  const decks = await prisma.deck.findMany();
  for (const deck of decks) {
    const { config, migrated } = migrateLegacyPricingDriver(deck.config);
    if (migrated) {
      await prisma.deck.update({ where: { id: deck.id }, data: { config: config as object } });
      console.log(`Migrated legacy pricing driver -> pricing models for deck: ${deck.companyName} (${deck.slug})`);
    }
  }
}

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

  await migrateLegacyPricingModels();

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
