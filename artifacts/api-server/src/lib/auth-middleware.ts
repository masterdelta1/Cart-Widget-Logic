import type { Request, Response, NextFunction } from "express";

/**
 * Requires an active dashboard session. Populates nothing extra —
 * downstream handlers read req.session.storeId directly.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.storeId) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  next();
}

/**
 * Requires the session's store to match the :id route param.
 * Must run after requireAuth.
 */
export function requireOwnStore(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.session.storeId !== req.params.id) {
    res.status(401).json({ error: "Not authorized for this store" });
    return;
  }
  next();
}
