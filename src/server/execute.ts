import { readFile } from "node:fs/promises";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  parseObject,
  buildPaperclipEnv,
  joinPromptSections,
  buildInvocationEnvForLogs,
  ensureAbsoluteDirectory,
  ensureCommandResolvable,
  ensurePathInEnv,
  resolveCommandForLogs,
  renderTemplate,
  renderPaperclipWakePrompt,
  stringifyPaperclipWakePayload,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { parseOzStreamOutput } from "./parse.js";

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, onSpawn, authToken } =
    ctx;

  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );
  const model = asString(config.model, "");
  const skill = asString(config.skill, "");
  const command = asString(config.command, "oz");
  const configuredCwd = asString(config.cwd, "");
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const graceSec = asNumber(config.graceSec, 20);
  const extraArgs = asStringArray(config.extraArgs);
  const cloudExecution = asBoolean(config.cloudExecution, false);
  const cloudHost = asString(config.cloudHost, "");

  // --- Resolve workspace CWD (same logic as claude-local) ---
  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const workspaceSource = asString(workspaceContext.source, "");
  const useConfiguredInsteadOfAgentHome =
    workspaceSource === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = useConfiguredInsteadOfAgentHome ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  // --- Build env ---
  const envConfig = parseObject(config.env);
  const hasExplicitApiKey =
    typeof envConfig.PAPERCLIP_API_KEY === "string" &&
    envConfig.PAPERCLIP_API_KEY.trim().length > 0;
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;

  // Inject Paperclip context env vars
  const wakeTaskId =
    (typeof context.taskId === "string" && context.taskId.trim().length > 0 && context.taskId.trim()) ||
    (typeof context.issueId === "string" && context.issueId.trim().length > 0 && context.issueId.trim()) ||
    null;
  const wakeReason =
    typeof context.wakeReason === "string" && context.wakeReason.trim().length > 0
      ? context.wakeReason.trim()
      : null;
  const wakeCommentId =
    (typeof context.wakeCommentId === "string" && context.wakeCommentId.trim().length > 0 && context.wakeCommentId.trim()) ||
    (typeof context.commentId === "string" && context.commentId.trim().length > 0 && context.commentId.trim()) ||
    null;
  const wakePayloadJson = stringifyPaperclipWakePayload(context.paperclipWake);

  if (wakeTaskId) env.PAPERCLIP_TASK_ID = wakeTaskId;
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;
  if (wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  if (wakePayloadJson) env.PAPERCLIP_WAKE_PAYLOAD_JSON = wakePayloadJson;
  if (effectiveWorkspaceCwd) env.PAPERCLIP_WORKSPACE_CWD = effectiveWorkspaceCwd;

  // Merge user-configured env (WARP_API_KEY lives here)
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }

  // Inject the run-scoped Paperclip auth token (mirror of claude_local).
  // Tools the agent runs — including pc — read PAPERCLIP_API_KEY and
  // attribute API mutations to this agent rather than to local-board.
  if (!hasExplicitApiKey && authToken) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });
  await ensureCommandResolvable(command, cwd, runtimeEnv);
  const resolvedCommand = await resolveCommandForLogs(command, cwd, runtimeEnv);
  const loggedEnv = buildInvocationEnvForLogs(env, { runtimeEnv, resolvedCommand });

  // --- Resolve session for continuation ---
  const runtimeSessionParams = parseObject(runtime.sessionParams);
  const runtimeConversationId = asString(
    runtimeSessionParams.conversationId,
    asString(runtimeSessionParams.conversation_id, ""),
  );
  const runtimeSessionCwd = asString(runtimeSessionParams.cwd, "");
  const canResumeSession =
    runtimeConversationId.length > 0 &&
    (runtimeSessionCwd.length === 0 ||
      runtimeSessionCwd === cwd);
  const conversationId = canResumeSession ? runtimeConversationId : null;

  if (runtimeConversationId && runtimeSessionCwd && runtimeSessionCwd !== cwd) {
    await onLog(
      "stdout",
      `[paperclip] Oz conversation "${runtimeConversationId}" was saved for cwd "${runtimeSessionCwd}" and will not be resumed in "${cwd}".\n`,
    );
  }

  // --- Read instructions file (persona) if configured ---
  const instructionsFilePath = asString(config.instructionsFilePath, "");
  let instructionsContent = "";
  if (instructionsFilePath) {
    try {
      instructionsContent = (await readFile(instructionsFilePath, "utf-8")).trim();
    } catch {
      await onLog(
        "stderr",
        `[paperclip] Could not read instructions file: ${instructionsFilePath}\n`,
      );
    }
  }

  // --- Read memory file if configured or discoverable ---
  const memoryFilePath = asString(config.memoryFilePath, "");
  let memoryContent = "";
  if (memoryFilePath) {
    try {
      memoryContent = (await readFile(memoryFilePath, "utf-8")).trim();
    } catch {
      await onLog(
        "stderr",
        `[paperclip] Could not read memory file: ${memoryFilePath}\n`,
      );
    }
  }

  // --- Build prompt ---
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };

  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, {
    resumedSession: Boolean(conversationId),
  });
  const shouldUseResumeDeltaPrompt = Boolean(conversationId) && wakePrompt.length > 0;
  const renderedPrompt = shouldUseResumeDeltaPrompt
    ? ""
    : renderTemplate(promptTemplate, templateData);

  const sessionHandoffNote = asString(
    context.paperclipSessionHandoffMarkdown,
    "",
  ).trim();

  const prompt = joinPromptSections([
    instructionsContent,
    memoryContent ? `<agent-memory>\n${memoryContent}\n</agent-memory>` : "",
    wakePrompt,
    sessionHandoffNote,
    renderedPrompt,
  ]);

  // --- Build CLI args ---
  const subcommand = cloudExecution ? "run-cloud" : "run";
  const args = ["agent", subcommand, "--output-format", "json"];

  if (conversationId) {
    args.push("--conversation", conversationId);
  }

  if (model) {
    args.push("--model", model);
  }

  if (skill) {
    args.push("--skill", skill);
  }

  if (!cloudExecution) {
    args.push("--cwd", cwd);
  }

  if (cloudExecution && cloudHost) {
    args.push("--host", cloudHost);
  }

  args.push("--prompt", prompt);

  if (extraArgs.length > 0) {
    args.push(...extraArgs);
  }

  // --- Report invocation metadata ---
  if (onMeta) {
    await onMeta({
      adapterType: "oz_local",
      command: resolvedCommand,
      cwd,
      commandArgs: args,
      env: loggedEnv,
      prompt,
      context,
    });
  }

  // --- Execute ---
  const proc = await runChildProcess(runId, command, args, {
    cwd,
    env,
    timeoutSec,
    graceSec,
    onSpawn,
    onLog,
  });

  // --- Parse result ---
  const parsed = parseOzStreamOutput(proc.stdout);

  if (proc.timedOut) {
    return {
      exitCode: proc.exitCode,
      signal: proc.signal,
      timedOut: true,
      errorMessage: `Timed out after ${timeoutSec}s`,
      errorCode: "timeout",
      clearSession: false,
    };
  }

  const resolvedConversationId = parsed.conversationId ?? conversationId;
  const sessionParams = resolvedConversationId
    ? { conversationId: resolvedConversationId, cwd }
    : null;

  const errorMessage =
    (proc.exitCode ?? 0) !== 0
      ? extractErrorMessage(proc.stderr, proc.exitCode)
      : null;

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: false,
    errorMessage,
    usage: parsed.usage.inputTokens > 0 || parsed.usage.outputTokens > 0
      ? parsed.usage
      : undefined,
    sessionId: resolvedConversationId,
    sessionParams,
    sessionDisplayId: resolvedConversationId,
    provider: "warp",
    biller: "warp",
    model: parsed.model || model || null,
    billingType: "subscription",
    costUsd: parsed.costUsd || null,
    resultJson: parsed.runId ? { run_id: parsed.runId, run_url: parsed.runUrl } : null,
    summary: parsed.agentText.trim() || null,
    clearSession: false,
  };
}

function extractErrorMessage(
  stderr: string,
  exitCode: number | null,
): string {
  const firstLine = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (firstLine) {
    return `Oz exited with code ${exitCode ?? -1}: ${firstLine}`;
  }
  return `Oz exited with code ${exitCode ?? -1}`;
}
