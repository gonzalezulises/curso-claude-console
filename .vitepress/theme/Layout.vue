<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { useProgress, isLessonPath } from "./composables/useProgress";
import LessonProgress from "./components/LessonProgress.vue";

const { Layout } = DefaultTheme;

const route = useRoute();
const { markVisited } = useProgress();

const showLessonProgress = computed(() => isLessonPath(route.path));

watch(
  () => route.path,
  (path) => {
    markVisited(path);
  },
  { immediate: true },
);
</script>

<template>
  <Layout>
    <template #doc-before>
      <LessonProgress v-if="showLessonProgress" />
    </template>
  </Layout>
</template>
