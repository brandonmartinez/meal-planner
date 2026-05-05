import { Router, Request, Response } from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import { getApprovedMealsForRange, getSundayOfWeek } from '../services/weekPlan.js';
import { DAYS_OF_WEEK } from '@meal-planner/shared';

export const displayRouter = Router();

// GET /api/display/meals
displayRouter.get('/meals', authenticateApiKey, async (req: Request, res: Response) => {
  try {
    const familyId = req.familyId!;
    let startDate: Date;
    let endDate: Date;

    const { from, to, days, weekStart } = req.query;

    if (from && to) {
      startDate = new Date(String(from) + 'T00:00:00Z');
      endDate = new Date(String(to) + 'T00:00:00Z');
    } else if (days) {
      startDate = new Date();
      startDate.setUTCHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + Number(days) - 1);
    } else if (weekStart) {
      startDate = new Date(String(weekStart) + 'T00:00:00Z');
      endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 6);
    } else {
      // Default to current week
      startDate = getSundayOfWeek(new Date());
      endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 6);
    }

    const approvedMeals = await getApprovedMealsForRange(familyId, startDate, endDate);

    const meals = approvedMeals.map(day => {
      const d = new Date(day.date + 'T00:00:00Z');
      return {
        date: day.date,
        dayOfWeek: DAYS_OF_WEEK[d.getUTCDay()],
        meals: day.meals,
      };
    });

    res.json({ meals });
  } catch {
    res.status(500).json({ error: 'Failed to fetch display meals' });
  }
});
