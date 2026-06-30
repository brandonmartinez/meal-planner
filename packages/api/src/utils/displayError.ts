import type { Response } from "express";
import type {
  DisplayErrorCode,
  DisplayErrorResponse,
} from "@meal-planner/shared";

/**
 * Sends a structured error envelope used by the public Display API.
 * Shape: { error: { code, message } }.
 */
export function sendDisplayError(
  res: Response,
  status: number,
  code: DisplayErrorCode,
  message: string,
): void {
  const body: DisplayErrorResponse = { error: { code, message } };
  res.status(status).json(body);
}

/**
 * True if the originalUrl belongs to the public Display API.
 * Used by shared middleware (e.g. auth) to decide which error
 * envelope to send.
 */
export function isDisplayRequest(originalUrl: string | undefined): boolean {
  if (!originalUrl) return false;
  // Strip any query string before matching
  const path = originalUrl.split("?", 1)[0];
  return path.startsWith("/api/display");
}
