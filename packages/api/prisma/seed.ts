import prisma from '../src/config/database.js';

async function seed() {
  console.log('🌱 Seeding database...');

  const family = await prisma.family.upsert({
    where: { id: 'seed-martinez-family' },
    update: {},
    create: {
      id: 'seed-martinez-family',
      name: 'The Martinez Family',
    },
  });

  console.log(`  Created family: ${family.name}`);

  const freeDayMeal = await prisma.meal.upsert({
    where: { id: 'seed-free-day-meal' },
    update: {},
    create: {
      id: 'seed-free-day-meal',
      name: 'Free Day',
      description: 'No planned meal — eat whatever you like!',
      isFreeDayPlaceholder: true,
      familyId: family.id,
    },
  });

  console.log(`  Created meal: ${freeDayMeal.name}`);
  console.log('✅ Seed complete');
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
