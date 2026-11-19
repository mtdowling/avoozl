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
        text: "Working with Avoozl",
        items: [
          { text: "Workspaces", link: "/workspaces" },
          { text: "Specs", link: "/specs" },
          { text: "Epic types", link: "/epic-types" },
          { text: "Manual tasks and task links", link: "/manual-tasks" },
          { text: "Delivery", link: "/delivery" },
          { text: "Drivers", link: "/drivers" },
          { text: "Flow", link: "/flow" },
          { text: "Agents and the CLI", link: "/agents" },
        ],
      },
      {
        text: "GitHub",
        items: [
          { text: "GitHub", link: "/github" },
          { text: "Triage agent", link: "/triage" },
          { text: "Intake sources", link: "/intake" },
          { text: "GitHub rate limit", link: "/rate-limit" },
        ],
      },
      {
        text: "Safety",
        items: [
          { text: "Content rules", link: "/content-rules" },
          { text: "Content hook", link: "/content-hook" },
          { text: "Repository checks and isolation", link: "/checks" },
          { text: "Person-only operations", link: "/person-only" },
        ],
      },
      {
        text: "Extending",
        items: [
          { text: "Writing a plugin", link: "/plugins" },
          { text: "Build report format", link: "/build-report" },
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
