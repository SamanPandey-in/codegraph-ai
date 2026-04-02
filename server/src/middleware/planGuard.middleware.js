import { getAuthUser, resolveDatabaseUserId } from '../utils/authUser.js';

const PLAN_LIMITS = {
  free: { reposPerMonth: Number.POSITIVE_INFINITY, aiQueriesPerDay: Number.POSITIVE_INFINITY },
};

// TODO: Enforce allowedPlans when paid tiers are introduced.
// Currently every authenticated user is treated as 'free' regardless
// of the plan list passed to this middleware.
export function requirePlan(..._allowedPlans) {
  return async (req, res, next) => {
    try {
      const authUser = getAuthUser(req);
      if (!authUser?.id) {
        return res.status(401).json({ error: 'Authentication required.' });
      }

      const userId = await resolveDatabaseUserId(authUser);
      if (!userId) {
        return res.status(500).json({ error: 'Failed to resolve authenticated user.' });
      }

      req.userPlan = 'free';
      req.planLimits = PLAN_LIMITS.free;
      req.userId = userId;

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
