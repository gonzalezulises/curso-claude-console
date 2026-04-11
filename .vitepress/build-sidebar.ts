import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// Adapter de aislamiento (regla #3): la sidebar se deriva SIEMPRE de
// course.yaml + <slug>/module.yaml. Si algún día migramos a otro static site
// generator, reescribimos este archivo para su shape de sidebar y listo — los
// .yaml de contenido no cambian.

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const contentRoot = resolve(repoRoot, "content");
const courseYamlPath = resolve(repoRoot, "course.yaml");

type CourseModule = {
  id: string;
  slug: string;
  title: string;
  order: number;
  status: string;
  focus: string;
};

type CourseYaml = {
  title: string;
  modules: CourseModule[];
};

type LessonEntry = {
  id: string;
  file: string;
  title: string;
  order: number;
};

type ModuleYaml = {
  id: string;
  slug: string;
  title: string;
  lessons?: LessonEntry[];
};

type SidebarItem = {
  text: string;
  link?: string;
  items?: SidebarItem[];
  collapsed?: boolean;
};

function readYamlFile<T>(path: string): T {
  return parseYaml(readFileSync(path, "utf-8")) as T;
}

function readCourse(): CourseYaml {
  return readYamlFile<CourseYaml>(courseYamlPath);
}

function readModuleMetadata(slug: string): ModuleYaml | null {
  const modulePath = resolve(contentRoot, slug, "module.yaml");
  if (!existsSync(modulePath)) return null;
  return readYamlFile<ModuleYaml>(modulePath);
}

function hasOutline(slug: string): boolean {
  return existsSync(resolve(contentRoot, slug, "OUTLINE.md"));
}

function moduleHeading(mod: CourseModule): string {
  const num = String(mod.order).padStart(2, "0");
  return `M${num} · ${mod.title}`;
}

function buildModuleGroup(mod: CourseModule): SidebarItem | null {
  const metadata = readModuleMetadata(mod.slug);
  const prefix = `/${mod.slug}`;
  const heading = moduleHeading(mod);

  // Caso 1: módulo con module.yaml completo → lista las lecciones reales.
  if (metadata?.lessons?.length) {
    const items: SidebarItem[] = metadata.lessons
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((lesson) => {
        const fileNoExt = lesson.file.replace(/\.md$/, "");
        const num = String(lesson.order).padStart(2, "0");
        return {
          text: `${num}. ${lesson.title}`,
          link: `${prefix}/${fileNoExt}`,
        };
      });

    return {
      text: heading,
      // Mantenemos abiertos los módulos ya producidos (0 y 1) para que el
      // visitante los vea sin un click extra.
      collapsed: mod.order > 1,
      items,
    };
  }

  // Caso 2: solo OUTLINE.md → mostramos un único link al outline para que el
  // visitante pueda previsualizar lo que viene.
  if (hasOutline(mod.slug)) {
    return {
      text: heading,
      collapsed: true,
      items: [
        {
          text: "Outline (en producción)",
          link: `${prefix}/OUTLINE`,
        },
      ],
    };
  }

  // Caso 3: módulo sin ningún archivo → lo omitimos del sidebar.
  return null;
}

export function buildSidebar(): Record<string, SidebarItem[]> {
  const course = readCourse();

  const groups: SidebarItem[] = course.modules
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(buildModuleGroup)
    .filter((group): group is SidebarItem => group !== null);

  // Un único sidebar aplicado a todas las rutas. Si eventualmente queremos
  // sidebar por módulo, se genera un map `${prefix}: [group]`.
  return {
    "/": groups,
  };
}
