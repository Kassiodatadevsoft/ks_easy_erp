import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { COOKIE_NAME } from "@shared/const";
import { verifyKsSession } from "../routers/ksAuthRouter";
import type { KsSessionUser } from "../../shared/ksTypes";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: KsSessionUser | null;
};

function getCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ?? null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const token = getCookieValue(opts.req.headers.cookie, COOKIE_NAME);
  const user = await verifyKsSession(token);

  if (!user) {
    console.log("[Auth] Missing session cookie");
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}