import { execFile } from "node:child_process";
import type { AdapterModel } from "@paperclipai/adapter-utils";

const MODEL_LABELS: Record<string, string> = {
  "auto": "Auto",
  "auto-efficient": "Auto (efficient)",
  "auto-genius": "Auto (genius)",
  "claude-4-5-haiku": "Claude Haiku 4.5",
  "claude-4-5-opus": "Claude Opus 4.5",
  "claude-4-5-opus-thinking": "Claude Opus 4.5 (thinking)",
  "claude-4-5-sonnet": "Claude Sonnet 4.5",
  "claude-4-5-sonnet-thinking": "Claude Sonnet 4.5 (thinking)",
  "claude-4-6-opus-high": "Claude Opus 4.6 (high)",
  "claude-4-6-opus-max": "Claude Opus 4.6 (max)",
  "claude-4-6-sonnet-high": "Claude Sonnet 4.6 (high)",
  "claude-4-6-sonnet-max": "Claude Sonnet 4.6 (max)",
  "claude-4-7-opus-high": "Claude Opus 4.7 (high)",
  "claude-4-7-opus-max": "Claude Opus 4.7 (max)",
  "claude-4-7-opus-xhigh": "Claude Opus 4.7 (xhigh)",
  "gemini-3.1-pro": "Gemini 3.1 Pro",
  "glm-5-fireworks": "GLM 5 (Fireworks)",
  "glm-5.1-fireworks": "GLM 5.1 (Fireworks)",
  "gpt-5-2-codex-high": "GPT-5.2 Codex (high)",
  "gpt-5-2-codex-low": "GPT-5.2 Codex (low)",
  "gpt-5-2-codex-medium": "GPT-5.2 Codex (medium)",
  "gpt-5-2-codex-xhigh": "GPT-5.2 Codex (xhigh)",
  "gpt-5-2-high": "GPT-5.2 (high)",
  "gpt-5-2-low": "GPT-5.2 (low)",
  "gpt-5-2-medium": "GPT-5.2 (medium)",
  "gpt-5-2-xhigh": "GPT-5.2 (xhigh)",
  "gpt-5-3-codex-high": "GPT-5.3 Codex (high)",
  "gpt-5-3-codex-low": "GPT-5.3 Codex (low)",
  "gpt-5-3-codex-medium": "GPT-5.3 Codex (medium)",
  "gpt-5-3-codex-xhigh": "GPT-5.3 Codex (xhigh)",
  "gpt-5-4-high": "GPT-5.4 (high)",
  "gpt-5-4-low": "GPT-5.4 (low)",
  "gpt-5-4-medium": "GPT-5.4 (medium)",
  "gpt-5-4-xhigh": "GPT-5.4 (xhigh)",
  "gpt-5-5-high": "GPT-5.5 (high)",
  "gpt-5-5-low": "GPT-5.5 (low)",
  "gpt-5-5-medium": "GPT-5.5 (medium)",
  "gpt-5-5-xhigh": "GPT-5.5 (xhigh)",
  "kimi-k25-fireworks": "Kimi K25 (Fireworks)",
  "kimi-k26-fireworks": "Kimi K26 (Fireworks)",
};

function labelForId(id: string): string {
  return MODEL_LABELS[id] ?? id;
}

export async function listModels(command = "oz"): Promise<AdapterModel[]> {
  return new Promise((resolve) => {
    execFile(
      command,
      ["model", "list", "--output-format", "json"],
      { timeout: 15_000, encoding: "utf-8" },
      (error: Error | null, stdout: string) => {
        if (error || !stdout.trim()) {
          resolve(FALLBACK_MODELS);
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (!Array.isArray(parsed) || parsed.length === 0) {
            resolve(FALLBACK_MODELS);
            return;
          }
          const models: AdapterModel[] = parsed
            .filter(
              (m: unknown): m is { id: string } =>
                typeof m === "object" && m !== null && typeof (m as Record<string, unknown>).id === "string",
            )
            .map((m) => ({ id: m.id, label: labelForId(m.id) }));
          resolve(models.length > 0 ? models : FALLBACK_MODELS);
        } catch {
          resolve(FALLBACK_MODELS);
        }
      },
    );
  });
}

export const FALLBACK_MODELS: AdapterModel[] = [
  { id: "auto", label: "Auto" },
  { id: "auto-genius", label: "Auto (genius)" },
  { id: "claude-4-7-opus-xhigh", label: "Claude Opus 4.7 (xhigh)" },
  { id: "claude-4-7-opus-high", label: "Claude Opus 4.7 (high)" },
  { id: "claude-4-6-opus-max", label: "Claude Opus 4.6 (max)" },
  { id: "claude-4-6-sonnet-max", label: "Claude Sonnet 4.6 (max)" },
  { id: "claude-4-5-haiku", label: "Claude Haiku 4.5" },
  { id: "gpt-5-5-xhigh", label: "GPT-5.5 (xhigh)" },
  { id: "gpt-5-5-high", label: "GPT-5.5 (high)" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
];
