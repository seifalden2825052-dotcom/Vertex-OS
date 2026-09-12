import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";

export const USER_COOKIE = "vertex_user";

export function getUserKey(req: Request, res: Response) {
  const existing = typeof req.cookies?.[USER_COOKIE] === "string" ? req.cookies[USER_COOKIE] : "";
  if (/^[a-f0-9-]{36}$/.test(existing)) return existing;

  const userKey = randomUUID();
  res.cookie(USER_COOKIE, userKey, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
  return userKey;
}