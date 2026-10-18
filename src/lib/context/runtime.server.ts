import { Resolver } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

/** Availability only: deployed DNS, TLS and destination pinning need a controlled network probe. */
export function publicContextRuntimeCapabilities() {
  return {
    ok: true as const,
    nodeVersion: process.versions.node,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    transportContract: "pinned-public-https-v1" as const,
    apis: {
      dnsResolver:
        typeof Resolver === "function" &&
        typeof Resolver.prototype.resolve4 === "function" &&
        typeof Resolver.prototype.resolve6 === "function" &&
        typeof Resolver.prototype.cancel === "function",
      httpsRequest: typeof request === "function",
      blockList:
        typeof BlockList === "function" &&
        typeof BlockList.prototype.addSubnet === "function" &&
        typeof BlockList.prototype.check === "function",
      isIP: typeof isIP === "function",
    },
  };
}
