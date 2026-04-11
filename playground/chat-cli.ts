import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type Turn = { role: "user" | "assistant"; content: string };
type Session = {
  model: string;
  system: string;
  messages: Turn[];
  totals: { input_tokens: number; output_tokens: number };
};

const SESSION_PATH = process.env.CHAT_SESSION_PATH ?? "./chat-session.json";
const MODEL = "claude-haiku-4-5";
const SYSTEM =
  "Eres un asistente breve y técnico. Respondes en español, en 3 frases máximo. Sin preámbulos.";
const MAX_HISTORY_TURNS = 20; // sliding window

function loadSession(): Session {
  if (existsSync(SESSION_PATH)) {
    const raw = readFileSync(SESSION_PATH, "utf-8");
    return JSON.parse(raw);
  }
  return {
    model: MODEL,
    system: SYSTEM,
    messages: [],
    totals: { input_tokens: 0, output_tokens: 0 },
  };
}

function saveSession(s: Session) {
  writeFileSync(SESSION_PATH, JSON.stringify(s, null, 2));
}

function trimHistory(messages: Turn[]): Turn[] {
  if (messages.length <= MAX_HISTORY_TURNS) return messages;
  return messages.slice(messages.length - MAX_HISTORY_TURNS);
}

async function sendTurn(client: Anthropic, session: Session, userInput: string) {
  session.messages.push({ role: "user", content: userInput });
  const trimmed = trimHistory(session.messages);

  const stream = client.messages.stream({
    model: session.model,
    max_tokens: 300,
    system: session.system,
    messages: trimmed,
  });

  process.stdout.write("claude> ");
  stream.on("text", (text) => process.stdout.write(text));
  const final = await stream.finalMessage();
  process.stdout.write("\n");

  const assistantText = final.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  session.messages.push({ role: "assistant", content: assistantText });
  session.totals.input_tokens += final.usage.input_tokens;
  session.totals.output_tokens += final.usage.output_tokens;

  saveSession(session);
}

async function main() {
  const client = new Anthropic({ maxRetries: 5 });
  const session = loadSession();

  const rl = createInterface({ input, output });
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });

  console.log(`Chat persistente — sesión: ${SESSION_PATH}`);
  console.log(`Modelo: ${session.model} — historial: ${session.messages.length} turnos`);
  console.log(`Comandos: /exit, /stats, /reset. Enter para enviar.\n`);

  while (!closed) {
    let userInput: string;
    try {
      userInput = (await rl.question("you> ")).trim();
    } catch {
      break; // readline cerrado (EOF en stdin pipeado)
    }
    if (!userInput) continue;

    if (userInput === "/exit") break;
    if (userInput === "/stats") {
      console.log(
        `tokens totales: in=${session.totals.input_tokens} out=${session.totals.output_tokens} — turnos=${session.messages.length}\n`
      );
      continue;
    }
    if (userInput === "/reset") {
      session.messages = [];
      session.totals = { input_tokens: 0, output_tokens: 0 };
      saveSession(session);
      console.log("historial reseteado.\n");
      continue;
    }

    try {
      await sendTurn(client, session, userInput);
    } catch (err: any) {
      console.error(`[error] ${err.status ?? "?"} ${err.message}`);
      session.messages.pop(); // rollback del turno user si la llamada falló
    }
  }

  rl.close();
}

main();
