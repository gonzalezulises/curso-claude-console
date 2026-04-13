import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// Build-time derivation of the course shape that client components need.
// Shape is intentionally flat and serializable so it can be injected into
// themeConfig and consumed via useData().theme.value.courseStructure.

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const contentRoot = resolve(repoRoot, "content");
const courseYamlPath = resolve(repoRoot, "course.yaml");

type CourseModuleYaml = {
  id: string;
  slug: string;
  title: string;
  order: number;
  status: string;
};

type CourseYaml = {
  title: string;
  modules: CourseModuleYaml[];
};

type ModuleLessonYaml = {
  id: string;
  file: string;
  title: string;
  order?: number;
};

type ModuleYaml = {
  id: string;
  slug: string;
  title: string;
  lessons?: ModuleLessonYaml[];
};

export type LessonRef = {
  id: string;
  path: string;
  title: string;
  order: number;
};

export type ModuleRef = {
  id: string;
  slug: string;
  title: string;
  order: number;
  status: string;
  lessons: LessonRef[];
};

export type CourseStructure = {
  title: string;
  modules: ModuleRef[];
};

function readYamlFile<T>(path: string): T {
  return parseYaml(readFileSync(path, "utf-8")) as T;
}

function readModule(slug: string): ModuleYaml | null {
  const modulePath = resolve(contentRoot, slug, "module.yaml");
  if (!existsSync(modulePath)) return null;
  return readYamlFile<ModuleYaml>(modulePath);
}

function buildLessonList(slug: string, metadata: ModuleYaml): LessonRef[] {
  const lessons = metadata.lessons ?? [];
  return lessons
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((lesson, index) => {
      const fileNoExt = lesson.file.replace(/\.md$/, "");
      return {
        id: lesson.id,
        path: `/${slug}/${fileNoExt}`,
        title: lesson.title,
        order: lesson.order ?? index + 1,
      };
    });
}

export function buildCourseStructure(): CourseStructure {
  const course = readYamlFile<CourseYaml>(courseYamlPath);

  const modules: ModuleRef[] = course.modules
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((mod) => {
      const metadata = readModule(mod.slug);
      const lessons = metadata ? buildLessonList(mod.slug, metadata) : [];
      return {
        id: mod.id,
        slug: mod.slug,
        title: mod.title,
        order: mod.order,
        status: mod.status,
        lessons,
      };
    });

  return {
    title: course.title,
    modules,
  };
}
