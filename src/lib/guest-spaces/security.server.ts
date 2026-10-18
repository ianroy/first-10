import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getCookie, getRequest, setCookie, setResponseHeader } from "@tanstack/react-start/server";
import { secretSchema } from "./contracts";
export function privacy() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
}
export function sameOrigin(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    return (
      request.method === "POST" &&
      origin === url.origin &&
      (url.protocol === "https:" ||
        (process.env["NODE_ENV"] !== "production" &&
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) &&
      (!site || site === "same-origin")
    );
  } catch {
    return false;
  }
}
function configuration() {
  const request = getRequest();
  const url = new URL(request.url);
  const local =
    process.env["NODE_ENV"] !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    url.protocol === "http:";
  return {
    session: local ? "firstten_guest_dev" : "__Host-firstten_guest",
    csrf: local ? "firstten_guest_csrf_dev" : "__Host-firstten_guest_csrf",
    options: { httpOnly: true, secure: !local, sameSite: "strict" as const, path: "/" },
  };
}
function key() {
  const value = process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();
  if (!value) throw new Error("Guest service unavailable");
  return value;
}
export function sessionToken() {
  const parsed = secretSchema.safeParse(getCookie(configuration().session));
  return parsed.success ? parsed.data : null;
}
function signature(challenge: string, session: string | null) {
  return createHmac("sha256", key())
    .update("firstten-guest-csrf:v1:" + challenge + ":" + (session ?? "entry"))
    .digest("hex");
}
export function issueCsrf(rotate = false) {
  const config = configuration();
  const found = secretSchema.safeParse(getCookie(config.csrf));
  const challenge = rotate || !found.success ? randomBytes(32).toString("hex") : found.data;
  setCookie(config.csrf, challenge, { ...config.options, maxAge: 86400 });
  return signature(challenge, sessionToken());
}
export function verifyCsrf(value: string) {
  const challenge = getCookie(configuration().csrf);
  if (
    !challenge ||
    !secretSchema.safeParse(challenge).success ||
    !secretSchema.safeParse(value).success
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature(challenge, sessionToken()), "hex"),
    Buffer.from(value, "hex"),
  );
}
export function setGuestSession(token: string, expiresAt: string) {
  const config = configuration();
  setCookie(config.session, secretSchema.parse(token), {
    ...config.options,
    expires: new Date(expiresAt),
  });
  // Return a CSRF value bound to the newly issued cookie, not getCookie's old value.
  const challenge = randomBytes(32).toString("hex");
  setCookie(config.csrf, challenge, { ...config.options, maxAge: 86400 });
  return signature(challenge, token);
}
export function clearGuestSession() {
  const config = configuration();
  setCookie(config.session, "", { ...config.options, maxAge: 0 });
  const challenge = randomBytes(32).toString("hex");
  setCookie(config.csrf, challenge, { ...config.options, maxAge: 86400 });
  return signature(challenge, null);
}
export function admissionClientHash(request: Request) {
  // Only Vercel's overwritten platform header is trusted. No arbitrary XFF,
  // cookie or caller-provided identity; unknown environments share a bucket.
  const ip =
    process.env["VERCEL"] === "1"
      ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
      : null;
  return createHmac("sha256", key())
    .update(
      "firstten-guest-admission:v1:" + (ip && ip.length <= 256 ? ip : "unknown-trusted-client"),
    )
    .digest("hex");
}
