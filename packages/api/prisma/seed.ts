import prisma from "../src/config/database.js";

async function seed() {
  console.log("🌱 Seeding database...");
  // No seed data: families are created by users via the app, and the
  // placeholder meals (Free Day, Leftovers, Takeout, Dining Out, Travel,
  // Skip) are created automatically when a family is created.
  console.log("✅ Seed complete (no-op)");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
