import { isIP } from "node:net";
import { Resolver } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import { PUBLIC_CONTEXT_LIMITS as L } from "./contracts";
import { PublicRetrievalError, publicAddress, publicURL } from "./url-policy.server";
export type Deadline = { endsAt: number; requests: number };
export type ResolvedAddress = { address: string; family: 4 | 6 };
export type PublicResponse = {
  status: number;
  headers: IncomingMessage["headers"];
  body: Buffer;
  url: string;
};
export type PublicTransport = {
  resolve: (host: string, deadline: Deadline) => Promise<ResolvedAddress[]>;
  request: (
    url: URL,
    address: ResolvedAddress,
    deadline: Deadline,
    maxBytes: number,
    accept: string,
  ) => Promise<PublicResponse>;
};
export const freshDeadline = (): Deadline => ({ endsAt: Date.now() + L.totalMs, requests: 0 });
const remaining = (d: Deadline) => {
  const n = d.endsAt - Date.now();
  if (n <= 0) throw new PublicRetrievalError("UNAVAILABLE");
  return n;
};
async function resolve(host: string, d: Deadline): Promise<ResolvedAddress[]> {
  const resolver = new Resolver({ timeout: Math.min(L.dnsMs, remaining(d)), tries: 1 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = async (family: 4 | 6) => {
      try {
        return (family === 4 ? await resolver.resolve4(host) : await resolver.resolve6(host)).map(
          (address) => ({ address, family }),
        );
      } catch (e) {
        if (e && typeof e === "object" && "code" in e && e.code === "ENODATA") return [];
        throw new PublicRetrievalError();
      }
    };
    return await Promise.race([
      Promise.all([query(4), query(6)]).then((a) => a.flat()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            resolver.cancel();
            reject(new PublicRetrievalError("UNAVAILABLE"));
          },
          Math.min(L.dnsMs, remaining(d)),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    resolver.cancel();
  }
}
function request(
  url: URL,
  address: ResolvedAddress,
  d: Deadline,
  maxBytes: number,
  accept: string,
): Promise<PublicResponse> {
  return new Promise((resolve, reject) => {
    const timeout = remaining(d);
    let done = false;
    const fail = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      req?.destroy();
      reject(new PublicRetrievalError("UNAVAILABLE"));
    };
    // Explicit empty proxyEnv and one-use agent prevent ambient global proxy/pool policy.
    const options: RequestOptions & {
      autoSelectFamily: boolean;
      proxyEnv: Record<string, string>;
    } = {
      method: "GET",
      agent: false,
      family: address.family,
      autoSelectFamily: false,
      servername: url.hostname,
      rejectUnauthorized: true,
      maxHeaderSize: 16384,
      lookup: (_host, _options, callback) => callback(null, address.address, address.family),
      proxyEnv: {},
      headers: {
        Accept: accept,
        "Accept-Encoding": "identity",
        "User-Agent": "FirstTen-PublicContext/1.0",
      },
    };
    const req = httpsRequest(url, options, (res) => {
      if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") {
        fail();
        return;
      }
      const declared = res.headers["content-length"];
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
        fail();
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          fail();
          res.destroy();
        } else chunks.push(chunk);
      });
      res.once("aborted", fail);
      res.once("error", fail);
      res.once("end", () => {
        if (done) return;
        if (Date.now() >= d.endsAt) {
          fail();
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
          url: url.href,
        });
      });
    });
    const timer = setTimeout(fail, timeout);
    req.once("error", fail);
    req.setTimeout(L.idleMs, fail);
    req.once("socket", (socket) => {
      const tls = socket as TLSSocket;
      tls.once("secureConnect", () => {
        if (done) return;
        if (Date.now() >= d.endsAt) {
          fail();
          return;
        }
        const remote = tls.remoteAddress;
        const normalized = (s: string) => s.toLowerCase().replace(/^::ffff:/, "");
        if (
          !tls.authorized ||
          !remote ||
          !publicAddress(remote) ||
          normalized(remote) !== normalized(address.address)
        ) {
          fail();
          return;
        }
        req?.end();
      });
    });
  });
}
export const nodePublicTransport: PublicTransport = { resolve, request };
/** Validation and DNS happen on every hop; lookup can return ONLY the already-vetted address. */
export async function fetchPublic(
  raw: string,
  d: Deadline = freshDeadline(),
  options: {
    maxBytes?: number;
    accept?: string;
    redirects?: number;
    transport?: PublicTransport;
  } = {},
): Promise<PublicResponse> {
  let url = publicURL(raw);
  const origin = url.origin;
  const transport = options.transport ?? nodePublicTransport;
  for (let hop = 0; ; hop++) {
    remaining(d);
    if (++d.requests > L.requests) throw new PublicRetrievalError();
    const addresses = await transport.resolve(url.hostname, d);
    if (
      !addresses.length ||
      addresses.length > 32 ||
      addresses.some((a) => isIP(a.address) !== a.family || !publicAddress(a.address))
    )
      throw new PublicRetrievalError();
    const address = addresses.find((a) => a.family === 4) ?? addresses[0]!;
    const response = await transport.request(
      url,
      address,
      d,
      options.maxBytes ?? L.pageBytes,
      options.accept ?? "text/html,text/plain,text/markdown",
    );
    remaining(d);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (hop >= (options.redirects ?? L.redirects) || !response.headers.location)
        throw new PublicRetrievalError();
      const next = publicURL(new URL(response.headers.location, url).href);
      if (next.origin !== origin) throw new PublicRetrievalError();
      url = next;
      continue;
    }
    if (response.status !== 200) throw new PublicRetrievalError("UNAVAILABLE");
    return response;
  }
}
