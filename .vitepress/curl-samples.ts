import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// Build-time loader for curl samples with real captured responses.
// Single source: .vitepress/curl-samples.yaml (one file, easy to diff).

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplesPath = resolve(__dirname, "curl-samples.yaml");

export type CurlSample = {
  id: string;
  title: string;
  description?: string;
  curl: string;
  response: string;
  status: number;
  notes?: string;
  captured_at?: string;
};

type RawFile = {
  samples: CurlSample[];
};

export function buildCurlIndex(): Record<string, CurlSample> {
  if (!existsSync(samplesPath)) return {};
  const raw = parseYaml(readFileSync(samplesPath, "utf-8")) as RawFile | null;
  if (!raw || !Array.isArray(raw.samples)) return {};
  const index: Record<string, CurlSample> = {};
  for (const sample of raw.samples) {
    index[sample.id] = sample;
  }
  return index;
}
