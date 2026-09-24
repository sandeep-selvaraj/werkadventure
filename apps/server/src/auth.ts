import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { Avatar, Name } from "@werk/shared";
import { z } from "zod";
import { config } from "./config.js";

export interface Identity {
  /** stable user id: "g:<uuid>" for guests, "u:<username>" for accounts */
  sub: string;
  name: string;
  avatar: Avatar;
  registered: boolean;
}

export const GuestRequest = z.object({
  name: Name,
  avatar: Avatar,
  /** a returning guest keeps their id (and Matrix account) */
  token: z.string().optional(),
});

export async function signIdentity(id: Identity): Promise<string> {
  return new SignJWT({ name: id.name, avatar: id.avatar, registered: id.registered })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id.sub)
    .setIssuedAt()
    .setExpirationTime(id.registered ? "30d" : "365d")
    .sign(config.jwtSecret);
}

export async function verifyToken(token: string): Promise<Identity | null> {
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret);
    const avatar = Avatar.safeParse(payload.avatar);
    const name = Name.safeParse(payload.name);
    if (!payload.sub || !avatar.success || !name.success) return null;
    return { sub: payload.sub, name: name.data, avatar: avatar.data, registered: payload.registered === true };
  } catch {
    return null;
  }
}

export async function guestLogin(req: z.infer<typeof GuestRequest>): Promise<{ token: string; identity: Identity }> {
  const prev = req.token ? await verifyToken(req.token) : null;
  const sub = prev && !prev.registered ? prev.sub : `g:${randomUUID()}`;
  const identity: Identity = { sub, name: req.name, avatar: req.avatar, registered: false };
  return { token: await signIdentity(identity), identity };
}
