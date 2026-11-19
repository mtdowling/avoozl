import { defineConfig } from "vitepress";

// The docs site: the cleaned pages in docs/, built to static files. Dated
// records (research, evidence) and maintainer notes stay out of it.
export default defineConfig({
  title: "Avoozl",
  description:
    "Approve a spec; Avoozl runs it with coding agents, checks each commit itself, and lands it.",
  lang: "en-US",
  base: "/avoozl/",
  cleanUrls: true,
  srcExclude: [
    "research/**",
    "evidence/**",
    "kirocrew-requests/**",
    "live-proof-harness.md",
  ],
  themeConfig: {
    nav: [
      { text: "Get started", link: "/getting-started" },
      { text: "Overview", link: "/overview" },
      { text: "GitHub", link: "https://github.com/mtdowling/avoozl" },
    ],
    sidebar: [
      {
        text: "Start",
        items: [
          { text: "Getting started", link: "/getting-started" },
          { text: "Overview", link: "/overview" },
          { text: "Glossary", link: "/glossary" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Triage agent and policies", link: "/policies" },
          { text: "Epic types", link: "/epic-types" },
          { text: "Writing a plugin", link: "/plugins" },
          { text: "Content hook", link: "/content-hook" },
          { text: "Build report", link: "/build-report" },
        ],
      },
    ],
    search: { provider: "local" },
    socialLinks: [
      { icon: "github", link: "https://github.com/mtdowling/avoozl" },
    ],
    editLink: {
      pattern: "https://github.com/mtdowling/avoozl/edit/main/docs/:path",
    },
    footer: { message: "Released under the MIT License." },
  },
});
