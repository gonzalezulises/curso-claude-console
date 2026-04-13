import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// Build-time loader for playground seeds. Seeds are pre-filled prompts + config
// for the <LivePlayground id="..." /> component. The component fires fetch
// directly against api.anthropic.com using the user's own API key (BYOK).

const __dirname = dirname(fileURLToPath(import.meta.url));
const playgroundsPath = resolve(__dirname, "playgrounds.yaml");

export type PlaygroundSeed = {
  id: string;
  title: string;
  description: string;
  model: string;
  max_tokens: number;
  system?: string;
  user: string;
  temperature?: number;
  learning_tip?: string;
};

type RawFile = {
  playgrounds: PlaygroundSeed[];
};

export function buildPlaygroundIndex(): Record<string, PlaygroundSeed> {
  if (!existsSync(playgroundsPath)) return {};
  const raw = parseYaml(readFileSync(playgroundsPath, "utf-8")) as RawFile | null;
  if (!raw || !Array.isArray(raw.playgrounds)) return {};
  const index: Record<string, PlaygroundSeed> = {};
  for (const seed of raw.playgrounds) {
    index[seed.id] = seed;
  }
  return index;
}
