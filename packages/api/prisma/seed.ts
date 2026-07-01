import {
  MEAL_PLACEHOLDER_KINDS,
  MEAL_PLACEHOLDERS,
} from "@meal-planner/shared";
import prisma from "../src/config/database.js";
import {
  DEMO_FAMILY_NAME,
  DEMO_FAMILY_TIMEZONE,
  DEMO_MEMBERS,
  DEMO_MEMBER_EMAILS,
} from "../src/config/demo.js";
import {
  WEEK_OFFSETS,
  buildSeedSchedule,
} from "../src/services/seedSchedule.js";
import { DEMO_RECIPES } from "./data/recipes.js";

/**
 * Idempotently remove any previously-seeded demo family + demo users so the
 * seed can run repeatedly (and so `db:reset` reseeds cleanly). Deletes in
 * FK-safe order: week plans (cascades day plans + suggestions) -> grocery lists
 * -> meals (cascades ingredients) -> agent credentials -> api keys ->
 * memberships -> family -> demo users.
 */
async function clearDemoData(): Promise<void> {
  const demoUsers = await prisma.user.findMany({
    where: { email: { in: [...DEMO_MEMBER_EMAILS] } },
    select: { id: true },
  });
  const userIds = demoUsers.map((u) => u.id);

  if (userIds.length > 0) {
    const memberships = await prisma.familyMember.findMany({
      where: { userId: { in: userIds } },
      select: { familyId: true },
    });
    const familyIds = [...new Set(memberships.map((m) => m.familyId))];

    for (const familyId of familyIds) {
      await prisma.weekPlan.deleteMany({ where: { familyId } });
      await prisma.groceryList.deleteMany({ where: { familyId } });
      await prisma.meal.deleteMany({ where: { familyId } });
      await prisma.agentCredential.deleteMany({ where: { familyId } });
      await prisma.apiKey.deleteMany({ where: { familyId } });
      await prisma.familyMember.deleteMany({ where: { familyId } });
      await prisma.family.delete({ where: { id: familyId } });
    }
  }

  await prisma.user.deleteMany({
    where: { email: { in: [...DEMO_MEMBER_EMAILS] } },
  });
}

async function seed() {
  console.log("Seeding demo data...");

  await clearDemoData();

  // 1. Demo users (two parents + three kids).
  const usersByEmail = new Map<string, { id: string }>();
  for (const member of DEMO_MEMBERS) {
    const user = await prisma.user.create({
      data: { email: member.email, name: member.name },
      select: { id: true },
    });
    usersByEmail.set(member.email, user);
  }
  const parents = DEMO_MEMBERS.filter((m) => m.role === "PARENT").map(
    (m) => usersByEmail.get(m.email)!,
  );

  // 2. Demo family with all members + the standard placeholder meals.
  const family = await prisma.family.create({
    data: {
      name: DEMO_FAMILY_NAME,
      timezone: DEMO_FAMILY_TIMEZONE,
      members: {
        create: DEMO_MEMBERS.map((m) => ({
          userId: usersByEmail.get(m.email)!.id,
          role: m.role,
        })),
      },
      meals: {
        create: MEAL_PLACEHOLDER_KINDS.map((kind) => ({
          name: MEAL_PLACEHOLDERS[kind].name,
          description: MEAL_PLACEHOLDERS[kind].description,
          placeholderKind: kind,
        })),
      },
    },
    select: { id: true },
  });

  // 3. Recipe library - 50 real meals with ingredients.
  const recipeMeals: {
    id: string;
    ingredients: (typeof DEMO_RECIPES)[number]["ingredients"];
    name: string;
  }[] = [];
  for (const recipe of DEMO_RECIPES) {
    const meal = await prisma.meal.create({
      data: {
        familyId: family.id,
        name: recipe.name,
        description: recipe.description,
        difficulty: recipe.difficulty,
        ingredients: {
          create: recipe.ingredients.map((ing) => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            category: ing.category,
          })),
        },
      },
      select: { id: true },
    });
    recipeMeals.push({
      id: meal.id,
      ingredients: recipe.ingredients,
      name: recipe.name,
    });
  }

  // 4. Week plans anchored to the current Monday. Past + current weeks are
  // approved (with approver metadata); the future week is left pending. The
  // schedule is date-relative (see buildSeedSchedule) so reseeds never trail
  // the calendar.
  const { anchorMonday: thisMonday, weeks } = buildSeedSchedule(new Date());
  let mealCursor = 0;
  const nextMeal = () => recipeMeals[mealCursor++ % recipeMeals.length];

  // Ingredients for the current week's dinners feed the grocery list.
  const currentWeekMeals: typeof recipeMeals = [];

  for (const week of weeks) {
    const weekPlan = await prisma.weekPlan.create({
      data: { familyId: family.id, weekStart: week.weekStart },
      select: { id: true },
    });

    for (const { dayIndex, date } of week.days) {
      const dayPlan = await prisma.dayPlan.create({
        data: { weekPlanId: weekPlan.id, date },
        select: { id: true },
      });

      // One dinner every day; a second suggestion on weekends for a richer plan.
      const suggestionsForDay = dayIndex >= 5 ? 2 : 1;
      for (let s = 0; s < suggestionsForDay; s++) {
        const meal = nextMeal();
        const proposer = parents[(dayIndex + s) % parents.length];
        await prisma.mealSuggestion.create({
          data: {
            mealId: meal.id,
            dayPlanId: dayPlan.id,
            userId: proposer.id,
            approved: !week.isFuture,
            approvedByActorType: week.isFuture ? null : "user",
            approvedById: week.isFuture ? null : proposer.id,
            approvedAt: week.isFuture ? null : date,
          },
        });
        if (week.offset === 0 && s === 0) currentWeekMeals.push(meal);
      }
    }
  }

  // 5. A grocery list for the current week, aggregated from its dinners.
  const groceryItems = new Map<
    string,
    {
      name: string;
      quantity?: string;
      unit?: string;
      category: string;
      sources: Set<string>;
    }
  >();
  for (const meal of currentWeekMeals) {
    for (const ing of meal.ingredients) {
      const key = `${ing.name.toLowerCase()}|${ing.unit ?? ""}`;
      const existing = groceryItems.get(key);
      if (existing) {
        existing.sources.add(meal.name);
      } else {
        groceryItems.set(key, {
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category,
          sources: new Set([meal.name]),
        });
      }
    }
  }

  await prisma.groceryList.create({
    data: {
      familyId: family.id,
      weekStart: thisMonday,
      items: {
        create: [...groceryItems.values()].map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          sources: [...item.sources],
        })),
      },
    },
  });

  console.log(
    `Seed complete: family "${DEMO_FAMILY_NAME}" with ${DEMO_MEMBERS.length} members, ` +
      `${DEMO_RECIPES.length} recipes, ${WEEK_OFFSETS.length} weeks of plans, 1 grocery list.`,
  );
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
