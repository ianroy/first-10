import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { retrieveGithub } from "@/lib/context/github.server";
const commit = "a".repeat(40),
  root = "b".repeat(40);
const text = "# Fictional app\nAn untested idea, not customer evidence.";
const blob = createHash("sha1")
  .update(`blob ${Buffer.byteLength(text)}\0${text}`)
  .digest("hex");
function fixture(change: (path: string, value: Record<string, unknown>) => void = () => {}) {
  const values: Record<string, Record<string, unknown>> = {
    "/repos/classroom/fictional": {
      private: false,
      full_name: "classroom/fictional",
      description: "Unverified public author description",
      default_branch: "main",
    },
    "/repos/classroom/fictional/git/ref/heads/main": { object: { type: "commit", sha: commit } },
    [`/repos/classroom/fictional/git/commits/${commit}`]: { sha: commit, tree: { sha: root } },
    [`/repos/classroom/fictional/git/trees/${root}`]: {
      sha: root,
      truncated: false,
      tree: [
        {
          path: "README.md",
          mode: "100644",
          type: "blob",
          sha: blob,
          size: Buffer.byteLength(text),
        },
      ],
    },
    [`/repos/classroom/fictional/git/blobs/${blob}`]: {
      sha: blob,
      size: Buffer.byteLength(text),
      encoding: "base64",
      content: Buffer.from(text).toString("base64"),
      download_url: "https://127.0.0.1/private",
    },
  };
  for (const [path, value] of Object.entries(values)) change(path, value);
  return {
    resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 as const }]),
    request: vi.fn(async (url: URL) => {
      const value = values[url.pathname];
      if (!value) throw Error("Unexpected request");
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify(value)),
        url: url.href,
      };
    }),
  };
}
describe("CTX001 public commit-pinned GitHub sources", () => {
  it("retrieves only constructed metadata/ref/tree/blob requests, never a returned download URL or code execution", async () => {
    const t = fixture();
    const sources = await retrieveGithub("https://github.com/classroom/fictional", [], t);
    expect(sources).toHaveLength(2);
    expect(sources[1]).toMatchObject({
      format: "github_file",
      text,
      commitSha: commit,
      blobSha: blob,
      path: "README.md",
    });
    expect(t.request).toHaveBeenCalledTimes(5);
    expect(t.request.mock.calls.every(([url]) => url.hostname === "api.github.com")).toBe(true);
    expect(t.request.mock.calls.some(([url]) => url.hostname === "127.0.0.1")).toBe(false);
    expect(sources[0]!.text).toContain("unverified");
  });
  it.each([
    "private repo",
    "symlink",
    "submodule",
    "truncated tree",
    "changed commit",
    "changed blob",
    "binary",
    "oversized file",
    "bad base64",
  ])("rejects %s", async (scenario) => {
    const t = fixture((path, value) => {
      if (scenario === "private repo" && path.endsWith("/fictional")) value["private"] = true;
      if (path.includes("/trees/")) {
        const file = (value["tree"] as Record<string, unknown>[])[0]!;
        if (scenario === "symlink") file["mode"] = "120000";
        if (scenario === "submodule") {
          file["mode"] = "160000";
          file["type"] = "commit";
        }
        if (scenario === "truncated tree") value["truncated"] = true;
        if (scenario === "oversized file") file["size"] = 65537;
      }
      if (scenario === "changed commit" && path.includes("/commits/"))
        value["sha"] = "c".repeat(40);
      if (path.includes("/blobs/")) {
        if (scenario === "changed blob") value["sha"] = "c".repeat(40);
        if (scenario === "binary") value["content"] = Buffer.from("\0private").toString("base64");
        if (scenario === "bad base64") value["content"] = "%%%";
      }
    });
    await expect(retrieveGithub("https://github.com/classroom/fictional", [], t)).rejects.toThrow();
  });
  it("explains a large README and never downloads or marks a partial file read", async () => {
    const t = fixture((path, value) => {
      if (path.includes("/trees/"))
        (value["tree"] as Record<string, unknown>[])[0]!["size"] = 39174;
    });
    await expect(
      retrieveGithub("https://github.com/classroom/fictional", [], t),
    ).rejects.toMatchObject({ code: "SOURCE_TOO_LARGE" });
    expect(t.request.mock.calls.some(([url]) => url.pathname.includes("/blobs/"))).toBe(false);
  });
  it("refuses credentials, deep paths and duplicate files before any network request", async () => {
    const t = fixture();
    for (const paths of [[".env"], ["src/components/App.tsx"], ["README.md", "README.md"]])
      await expect(
        retrieveGithub("https://github.com/classroom/fictional", paths, t),
      ).rejects.toThrow();
    expect(t.resolve).not.toHaveBeenCalled();
  });
});
