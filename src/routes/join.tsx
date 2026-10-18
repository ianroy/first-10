import { createFileRoute } from "@tanstack/react-router";
import { GuestRoom } from "@/components/classes/GuestRoom";
export const Route = createFileRoute("/join")({
  headers: () => ({
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  }),
  head: () => ({
    meta: [
      { title: "Join your class — First Ten" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: GuestRoom,
});
