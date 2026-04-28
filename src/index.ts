import type { AdapterConfigSchema, ServerAdapterModule } from "@paperclipai/adapter-utils";
import { execute } from "./server/execute.js";
import { testEnvironment } from "./server/test.js";
import { sessionCodec } from "./server/session.js";
import { listModels as listOzModels, FALLBACK_MODELS } from "./server/models.js";
import { listOzSkills, syncOzSkills } from "./server/skills.js";

export const type = "oz_local";
export const label = "Oz (local)";

export const models = FALLBACK_MODELS;

export const agentConfigurationDoc = `# oz_local agent configuration

Adapter: oz_local

Core fields:
- cwd (string, optional): default absolute working directory for the agent process
- model (string, optional): Oz model id (e.g. claude-4-7-opus-xhigh, claude-4-5-haiku)
- promptTemplate (string, optional): run prompt template
- instructionsFilePath (string, optional): absolute path to instructions/persona file, prepended to prompt
- memoryFilePath (string, optional): absolute path to agent memory file, injected in <agent-memory> tags
- maxTurnsPerRun (number, optional): max turns for one run (not yet supported by Oz CLI)
- command (string, optional): defaults to "oz"
- extraArgs (string[], optional): additional CLI args passed to oz agent run
- env (object, optional): KEY=VALUE environment variables (WARP_API_KEY injected here)
- skill (string, optional): skill spec passed via --skill (e.g. "casaconomy-ops:heartbeat")

Cloud execution fields:
- cloudExecution (boolean, optional): use oz agent run-cloud instead of oz agent run
- cloudHost (string, optional): --host value for cloud runs (e.g. "warp" for Warp infra, or a self-hosted worker name)

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- Default is local execution (oz agent run). Set cloudExecution: true for cloud runs.
- Cloud runs do not use --cwd (the agent runs remotely).
- Auth via WARP_API_KEY env var or logged-in Warp desktop session.
- Session continuation via --conversation <id> (Oz equivalent of Claude --resume).
`;

async function getConfigSchema(): Promise<AdapterConfigSchema> {
  const dynamicModels = await listOzModels();
  const modelOptions = dynamicModels.map((m) => ({
    label: m.label,
    value: m.id,
    group: m.id.startsWith("claude-") ? "Claude"
      : m.id.startsWith("gpt-") ? "GPT"
      : m.id.startsWith("gemini-") ? "Gemini"
      : m.id.startsWith("auto") ? "Auto"
      : "Other",
  }));

  return {
    fields: [
      {
        key: "model",
        label: "Model",
        type: "combobox",
        options: modelOptions,
        default: "auto",
        hint: "Oz model id. Fetched dynamically from oz model list.",
        group: "core",
      },
      {
        key: "command",
        label: "Oz command",
        type: "text",
        default: "oz",
        hint: "Path or name of the Oz CLI binary.",
        group: "core",
      },
      {
        key: "instructionsFilePath",
        label: "Instructions file",
        type: "text",
        hint: "Absolute path to persona/instructions file, prepended to prompt.",
        group: "core",
      },
      {
        key: "memoryFilePath",
        label: "Memory file",
        type: "text",
        hint: "Absolute path to agent memory file (MEMORY.md), injected in <agent-memory> tags.",
        group: "core",
      },
      {
        key: "skill",
        label: "Skill",
        type: "text",
        hint: "Skill spec passed via --skill (e.g. casaconomy-ops:heartbeat).",
        group: "core",
      },
      {
        key: "cloudExecution",
        label: "Cloud execution",
        type: "toggle",
        default: false,
        hint: "Use oz agent run-cloud instead of local oz agent run.",
        group: "cloud",
      },
      {
        key: "cloudHost",
        label: "Cloud host",
        type: "text",
        hint: "Worker host for cloud runs (\"warp\" for Warp infra, or self-hosted worker name).",
        group: "cloud",
      },
      {
        key: "timeoutSec",
        label: "Timeout (seconds)",
        type: "number",
        default: 0,
        hint: "Run timeout. 0 means no timeout.",
        group: "operational",
      },
      {
        key: "graceSec",
        label: "Grace period (seconds)",
        type: "number",
        default: 20,
        hint: "SIGTERM grace period before force-killing the process.",
        group: "operational",
      },
    ],
  };
}

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    sessionCodec,
    models,
    listModels: listOzModels,
    listSkills: listOzSkills,
    syncSkills: syncOzSkills,
    getConfigSchema,
    supportsLocalAgentJwt: false,
    supportsInstructionsBundle: true,
    requiresMaterializedRuntimeSkills: false,
    agentConfigurationDoc,
  };
}
