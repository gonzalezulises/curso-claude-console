import { computed } from "vue";
import type { ComputedRef } from "vue";
import { useData } from "vitepress";
import type { CourseStructure, ModuleRef } from "../../course-structure";

type ThemeWithCourse = {
  courseStructure?: CourseStructure;
};

const emptyCourse: CourseStructure = { title: "", modules: [] };

export function useCourseStructure(): ComputedRef<CourseStructure> {
  const { theme } = useData();
  return computed(() => {
    const themeValue = theme.value as ThemeWithCourse;
    return themeValue.courseStructure ?? emptyCourse;
  });
}

export function useCurrentLesson(): ComputedRef<{
  module: ModuleRef | null;
  index: number;
  prev: string | null;
  next: string | null;
} | null> {
  const { page } = useData();
  const course = useCourseStructure();

  return computed(() => {
    const currentPath = `/${page.value.relativePath.replace(/\.md$/, "")}`;
    for (const mod of course.value.modules) {
      const index = mod.lessons.findIndex((l) => l.path === currentPath);
      if (index === -1) continue;
      const prev = index > 0 ? mod.lessons[index - 1]!.path : null;
      const next =
        index < mod.lessons.length - 1 ? mod.lessons[index + 1]!.path : null;
      return { module: mod, index, prev, next };
    }
    return null;
  });
}
