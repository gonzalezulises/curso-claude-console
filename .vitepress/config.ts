import { defineConfig } from "vitepress";
import { buildSidebar } from "./build-sidebar";
import { buildCourseStructure } from "./course-structure";

// Regla de aislamiento #1: este archivo NUNCA modifica content/.
// Regla de aislamiento #2: los componentes Vue viven en .vitepress/theme/ y se
// registran globalmente en theme/index.ts. Los .md siguen siendo GFM estándar;
// los componentes solo aparecen cuando el .md los usa explícitamente como tags.
// Regla de aislamiento #3: la sidebar y la courseStructure se generan desde
// course.yaml + module.yaml (ver build-sidebar.ts y course-structure.ts). Nunca
// declaradas a mano.

export default defineConfig({
  title: "Claude Console",
  titleTemplate: ":title · Claude Console",
  description:
    "Megacurso técnico del ecosistema Anthropic: Messages API, Workbench, " +
    "prompt engineering, tool use, MCP, Managed Agents, Skills, Claude Code y Admin API.",
  lang: "es-AR",

  // Los .md viven en content/. .vitepress/ queda al root del repo.
  srcDir: "content",

  // Excluimos metadata y OUTLINE.md de los módulos todavía-en-producción los
  // manejamos como páginas válidas (se renderizan como markdown normal).
  srcExclude: ["**/exercises/**", "**/module.yaml"],

  // GH Pages sirve bajo /curso-claude-console/. El workflow setea DOCS_BASE.
  base: process.env.DOCS_BASE ?? "/",

  cleanUrls: true,
  lastUpdated: true,
  appearance: "dark",

  head: [
    ["meta", { name: "theme-color", content: "#d97757" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:locale", content: "es_AR" }],
    ["meta", { property: "og:title", content: "Claude Console · Megacurso" }],
  ],

  themeConfig: {
    siteTitle: "Claude Console",

    nav: [
      { text: "Inicio", link: "/" },
      {
        text: "Módulos",
        items: [
          { text: "M00 · Setup", link: "/module-00-setup/lessons/01-bienvenida-al-curso" },
          { text: "M01 · Messages API", link: "/module-01-messages-api/lessons/01-familia-de-modelos" },
        ],
      },
      { text: "GitHub", link: "https://github.com/gonzalezulises/curso-claude-console" },
    ],

    sidebar: buildSidebar(),

    // Build-time course shape, consumido por componentes Vue via
    // useData().theme.value.courseStructure.
    courseStructure: buildCourseStructure(),

    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "Buscar", buttonAriaLabel: "Buscar" },
              modal: {
                noResultsText: "Sin resultados para",
                resetButtonTitle: "Limpiar",
                footer: {
                  selectText: "para seleccionar",
                  navigateText: "para navegar",
                  closeText: "para cerrar",
                },
              },
            },
          },
        },
      },
    },

    outline: { label: "En esta página", level: [2, 3] },
    docFooter: { prev: "Anterior", next: "Siguiente" },
    darkModeSwitchLabel: "Tema",
    sidebarMenuLabel: "Menú",
    returnToTopLabel: "Volver arriba",
    lastUpdated: { text: "Última actualización" },

    socialLinks: [
      { icon: "github", link: "https://github.com/gonzalezulises/curso-claude-console" },
    ],

    footer: {
      message: "Curso en producción — v0.1.0",
      copyright: "© 2026 Ulises González",
    },
  },

  markdown: {
    theme: { light: "github-light", dark: "github-dark" },
    lineNumbers: true,
  },
});
