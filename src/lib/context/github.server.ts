import { createHash } from "node:crypto";
import { z } from "zod";
import { PUBLIC_CONTEXT_LIMITS as L, remoteSourceSchema, type RemoteSource } from "./contracts";
import { githubTarget, githubPath, PublicRetrievalError } from "./url-policy.server";
import { fetchPublic, freshDeadline, type PublicTransport } from "./fetch-public.server";
import { decodeText, sha256 } from "./extract.server";
const objectId = z.string().regex(/^[a-f0-9]{40}$/);
const entrySchema = z
  .object({
    path: z.string().max(200),
    mode: z.string(),
    type: z.string(),
    sha: objectId,
    size: z.number().int().nonnegative().optional(),
  })
  .passthrough();
export async function retrieveGithub(
  url: string,
  requestedPaths: string[],
  transport?: PublicTransport,
): Promise<RemoteSource[]> {
  const { owner, repo } = githubTarget(url);
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const deadline = freshDeadline();
  const paths = requestedPaths.length ? requestedPaths.map(githubPath) : ["README.md"];
  if (paths.length > 3 || new Set(paths).size !== paths.length) throw new PublicRetrievalError();
  const api = async (path: string) => {
    const response = await fetchPublic(`${base}${path ? `/${path}` : ""}`, deadline, {
      maxBytes: L.apiBytes,
      accept: "application/vnd.github+json",
      redirects: 0,
      ...(transport ? { transport } : {}),
    });
    if (
      response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json"
    )
      throw new PublicRetrievalError();
    try {
      return { value: JSON.parse(decodeText(response.body)) as unknown, bytes: response.body };
    } catch {
      throw new PublicRetrievalError();
    }
  };
  const metadata = await api("");
  const project = z
    .object({
      private: z.literal(false),
      full_name: z.string().max(150),
      description: z.string().max(3000).nullable(),
      default_branch: z.string().min(1).max(200),
    })
    .passthrough()
    .parse(metadata.value);
  if (
    !project.default_branch
      .split("/")
      .every((p) => /^[A-Za-z0-9_.-]+$/.test(p) && p !== "." && p !== "..")
  )
    throw new PublicRetrievalError();
  const ref = await api(
    `git/ref/heads/${project.default_branch.split("/").map(encodeURIComponent).join("/")}`,
  );
  const commitSha = z
    .object({ object: z.object({ type: z.literal("commit"), sha: objectId }).passthrough() })
    .passthrough()
    .parse(ref.value).object.sha;
  const commit = await api(`git/commits/${commitSha}`);
  const treeSha = z
    .object({ sha: objectId, tree: z.object({ sha: objectId }).passthrough() })
    .passthrough()
    .parse(commit.value);
  if (treeSha.sha !== commitSha) throw new PublicRetrievalError();
  const trees = new Map<string, z.infer<typeof entrySchema>[]>();
  const tree = async (sha: string) => {
    if (trees.has(sha)) return trees.get(sha)!;
    const result = await api(`git/trees/${sha}`);
    const value = z
      .object({ sha: objectId, truncated: z.literal(false), tree: z.array(entrySchema).max(500) })
      .passthrough()
      .parse(result.value);
    if (value.sha !== sha) throw new PublicRetrievalError();
    trees.set(sha, value.tree);
    return value.tree;
  };
  const root = await tree(treeSha.tree.sha);
  const text = `Repository: ${project.full_name}\nPublic repository description (unverified author claim): ${project.description ?? "No description provided."}`;
  const sources: RemoteSource[] = [
    remoteSourceSchema.parse({
      url: `https://github.com/${owner}/${repo}`,
      title: project.full_name,
      format: "github_metadata",
      contentHash: sha256(metadata.bytes),
      previewHash: sha256(text),
      text,
      bytes: metadata.bytes.length,
      commitSha,
      path: null,
      blobSha: null,
    }),
  ];
  for (const path of paths) {
    const parts = path.split("/");
    let rows = root;
    if (parts.length === 2) {
      const folder = rows.find((e) => e.path === parts[0]);
      if (!folder || folder.type !== "tree" || folder.mode !== "040000")
        throw new PublicRetrievalError();
      rows = await tree(folder.sha);
    }
    const item = rows.find((e) => e.path === parts.at(-1));
    if (
      !item ||
      item.type !== "blob" ||
      !["100644", "100755"].includes(item.mode) ||
      item.size === undefined ||
      item.size < 1 ||
      item.size > L.fileBytes
    )
      throw new PublicRetrievalError();
    if (item.size > L.previewBytes) throw new PublicRetrievalError("SOURCE_TOO_LARGE");
    const blob = await api(`git/blobs/${item.sha}`);
    const data = z
      .object({
        sha: objectId,
        size: z.number().int().min(1).max(L.fileBytes),
        encoding: z.literal("base64"),
        content: z.string().max(100000),
      })
      .passthrough()
      .parse(blob.value);
    const encoded = data.content.replace(/\n/g, "");
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
      throw new PublicRetrievalError();
    const bytes = Buffer.from(encoded, "base64");
    if (
      data.sha !== item.sha ||
      data.size !== bytes.length ||
      item.size !== bytes.length ||
      createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== item.sha
    )
      throw new PublicRetrievalError();
    const fileText = decodeText(bytes);
    sources.push(
      remoteSourceSchema.parse({
        url: `https://github.com/${owner}/${repo}/blob/${commitSha}/${path.split("/").map(encodeURIComponent).join("/")}`,
        title: path,
        format: "github_file",
        contentHash: sha256(bytes),
        previewHash: sha256(fileText),
        text: fileText,
        bytes: bytes.length,
        commitSha,
        path,
        blobSha: item.sha,
      }),
    );
  }
  if (Date.now() >= deadline.endsAt) throw new PublicRetrievalError("UNAVAILABLE");
  return sources;
}
