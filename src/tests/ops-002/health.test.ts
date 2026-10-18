import { describe, expect, it } from "vitest";
import { deploymentHealth } from "@/lib/deployment-health";

const valid = {
  publicUrl: "https://example.supabase.co",
  publicKey: "sb_publishable_fictional_public_fixture",
  serverUrl: "https://example.supabase.co",
  serverKey: "sb_publishable_fictional_public_fixture",
};

describe("redacted deployment health", () => {
  it("requires browser build values even if server values exist", () => {
    expect(deploymentHealth(valid).status).toBe("ok");
    const report = deploymentHealth({ ...valid, publicKey: undefined });
    expect(report.status).toBe("misconfigured");
    expect(report.checks.publicSupabaseKey).toBe(false);
  });
  it("rejects secret-role keys without echoing any configuration", () => {
    const secret = "sb_secret_do_not_return_this_value";
    const report = deploymentHealth({ ...valid, publicKey: secret });
    expect(report.status).toBe("misconfigured");
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(JSON.stringify(report)).not.toContain(valid.publicUrl);
  });
  it("allows only anon-role legacy keys and never service-role keys", () => {
    const jwt = (role: string) => `eyJ0eXAiOiJKV1QifQ.${btoa(JSON.stringify({ role }))}.signature`;
    expect(deploymentHealth({ ...valid, publicKey: jwt("anon") }).status).toBe("ok");
    expect(deploymentHealth({ ...valid, publicKey: jwt("service_role") }).status).toBe(
      "misconfigured",
    );
  });
  it("rejects remote HTTP, credentials, paths and placeholders", () => {
    for (const publicUrl of [
      "http://example.com",
      "https://user:secret@example.com",
      "https://example.com/path",
      "[SENSITIVE]",
    ]) {
      expect(deploymentHealth({ ...valid, publicUrl }).status).toBe("misconfigured");
    }
    expect(deploymentHealth({ ...valid, publicUrl: "http://127.0.0.1:55321" }).status).toBe("ok");
  });
});
