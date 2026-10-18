type Configuration = {
  publicUrl: string | undefined;
  publicKey: string | undefined;
  serverUrl: string | undefined;
  serverKey: string | undefined;
};

function validUrl(value: string | undefined) {
  if (!value?.trim() || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || (url.protocol === "http:" && local)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function publicKey(value: string | undefined) {
  if (!value) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(value)) return true;
  // A legacy public key must identify the anonymous role. This is a shape
  // check, not signature verification or a live credential test.
  try {
    const parts = value.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
    const encodedPayload = parts[1];
    if (!encodedPayload) return false;
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "anon";
  } catch {
    return false;
  }
}

/** Only booleans leave this boundary. Never include configuration values. */
export function deploymentHealth(config: Configuration) {
  const checks = {
    publicSupabaseUrl: validUrl(config.publicUrl),
    publicSupabaseKey: publicKey(config.publicKey),
    serverSupabaseUrl: validUrl(config.serverUrl),
    serverSupabaseKey: publicKey(config.serverKey),
  };
  const ok = Object.values(checks).every(Boolean);
  return {
    schemaVersion: 1 as const,
    service: "first-ten" as const,
    status: ok ? ("ok" as const) : ("misconfigured" as const),
    checks,
  };
}
