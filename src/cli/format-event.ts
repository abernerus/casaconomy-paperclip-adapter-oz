/**
 * CLI-side formatter for Oz NDJSON stream events.
 *
 * Called by the Paperclip CLI when `--attach`-ing to a running heartbeat.
 * Each stdout line is one JSON event from `oz agent run --output-format json`.
 */
export function formatOzStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    console.log(line);
    return;
  }

  const type = typeof parsed.type === "string" ? parsed.type : "";

  if (type === "system") {
    const eventType = typeof parsed.event_type === "string" ? parsed.event_type : "";
    if (eventType === "run_started") {
      const runId = typeof parsed.run_id === "string" ? parsed.run_id : "";
      console.log(`Oz run started${runId ? ` (${runId})` : ""}`);
    } else if (eventType === "conversation_started") {
      const convId = typeof parsed.conversation_id === "string" ? parsed.conversation_id : "";
      console.log(`Oz conversation: ${convId}`);
    } else if (eventType === "run_completed") {
      console.log("Oz run completed");
    } else {
      console.log(`[oz:${eventType}]`);
    }
    return;
  }

  if (type === "tool_call") {
    const tool = typeof parsed.tool === "string" ? parsed.tool : "unknown";
    const cmd = typeof parsed.command === "string" ? parsed.command : "";
    console.log(`[tool] ${tool}${cmd ? `: ${cmd}` : ""}`);
    return;
  }

  if (type === "tool_result") {
    const tool = typeof parsed.tool === "string" ? parsed.tool : "";
    const status = typeof parsed.status === "string" ? parsed.status : "";
    const exitCode = typeof parsed.exit_code === "number" ? parsed.exit_code : null;
    const output = typeof parsed.output === "string" ? parsed.output : "";
    const label = exitCode !== null && exitCode !== 0 ? ` (exit ${exitCode})` : "";
    console.log(`[result] ${tool} ${status}${label}`);
    if (output) {
      const lines = output.split("\n");
      const preview = lines.length > 10 ? lines.slice(0, 10).join("\n") + `\n... (${lines.length - 10} more lines)` : output;
      console.log(preview);
    }
    return;
  }

  if (type === "agent") {
    const text = typeof parsed.text === "string" ? parsed.text : "";
    if (text) process.stdout.write(text);
    return;
  }

  // Unknown event type — print as-is
  console.log(line);
}
