import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import LessonProgress from "./components/LessonProgress.vue";
import CourseProgress from "./components/CourseProgress.vue";
import ResetProgressButton from "./components/ResetProgressButton.vue";

import "./style.css";

const theme: Theme = {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("LessonProgress", LessonProgress);
    app.component("CourseProgress", CourseProgress);
    app.component("ResetProgressButton", ResetProgressButton);
  },
};

export default theme;
