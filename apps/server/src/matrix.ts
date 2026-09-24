import { createHmac } from "node:crypto";
import { config } from "./config.js";
import type { Identity } from "./auth.js";

/**
 * Server-side Matrix account provisioning. Every werk identity maps to one Matrix
 * user whose password is derived from a server secret, so the browser never needs
 * a Matrix password: it asks us for an access token for its device.
 */

export interface MatrixSession {
  homeserverUrl: string;
  userId: string;
  accessToken: string;
  deviceId: string;
}

export function matrixEnabled(): boolean {
  return !!(config.matrix.internalUrl && config.matrix.serverName && config.matrix.registrationToken);
}

export function localpartFor(sub: string): string {
  if (sub.startsWith("u:")) return sub.slice(2);
  return `g_${sub.slice(2).replace(/-/g, "").slice(0, 20)}`;
}

export function matrixIdFor(sub: string): string | undefined {
  return matrixEnabled() ? `@${localpartFor(sub)}:${config.matrix.serverName}` : undefined;
}

function passwordFor(localpart: string): string {
  return createHmac("sha256", config.matrix.passwordSecret).update(localpart).digest("base64url");
}

async function call(path: string, body: unknown, token?: string, method = "POST"): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${config.matrix.internalUrl}/_matrix/client/v3${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

export async function matrixLogin(identity: Identity, deviceId?: string): Promise<MatrixSession> {
  const localpart = localpartFor(identity.sub);
  const password = passwordFor(localpart);
  const device = deviceId && /^[A-Za-z0-9_-]{1,64}$/.test(deviceId) ? deviceId : undefined;
  const deviceName = `WerkAdventure (${identity.registered ? "account" : "guest"})`;

  let r = await call("/login", {
    type: "m.login.password",
    identifier: { type: "m.id.user", user: localpart },
    password,
    device_id: device,
    initial_device_display_name: deviceName,
  });

  if (r.status === 403) {
    // first visit: register with the homeserver's registration token (user-interactive auth)
    const first = await call("/register", { username: localpart, password, device_id: device, initial_device_display_name: deviceName });
    const session = first.json.session as string | undefined;
    r =
      first.status === 200
        ? first
        : await call("/register", {
            username: localpart,
            password,
            device_id: device,
            initial_device_display_name: deviceName,
            auth: { type: "m.login.registration_token", token: config.matrix.registrationToken, session },
          });
  }
  if (r.status !== 200) throw new Error(`matrix login failed (${r.status}): ${r.json.error ?? r.json.errcode}`);

  const userId = r.json.user_id as string;
  const accessToken = r.json.access_token as string;
  await call(`/profile/${encodeURIComponent(userId)}/displayname`, { displayname: identity.name }, accessToken, "PUT").catch(() => {});
  return { homeserverUrl: config.matrix.publicUrl, userId, accessToken, deviceId: r.json.device_id as string };
}
