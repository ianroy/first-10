import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/marketing/LandingPage";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "First Ten — Real conversations. A clearer next move." },
      {
        name: "description",
        content:
          "Turn customer conversations into a next decision you can explain. Explore a fictional demo, a $0 marketing assignment and classroom teaching resources.",
      },
      { property: "og:title", content: "First Ten — Real conversations. A clearer next move." },
      {
        property: "og:description",
        content:
          "Customer conversations. Student decisions. Explore the example and adapt the teaching kit.",
      },
      { property: "og:image", content: "https://first-10-three.vercel.app/pitch/slides/01.png" },
      {
        property: "og:image:alt",
        content: "First Ten: Customer conversations. Student decisions.",
      },
      { name: "twitter:image", content: "https://first-10-three.vercel.app/pitch/slides/01.png" },
    ],
  }),
  component: LandingPage,
});
