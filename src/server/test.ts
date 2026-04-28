import { execFileSync } from "node:child_process";
import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentCheck,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const command = asString(ctx.config.command, "oz");

  try {
    const helpOutput = execFileSync(command, ["--help"], {
      timeout: 10_000,
      encoding: "utf-8",
    }).trim();
    const firstLine = helpOutput.split(/\r?\n/)[0] || "available";
    checks.push({
      code: "oz_cli_found",
      level: "info",
      message: `Oz CLI found: ${firstLine}`,
    });
  } catch {
    checks.push({
      code: "oz_cli_missing",
      level: "error",
      message: `Oz CLI ("${command}") not found or not executable`,
      hint: "Install Warp desktop app — the oz CLI is bundled at /Applications/Warp.app/Contents/Resources/bin/oz",
    });
    return {
      adapterType: "oz_local",
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  // Check WARP_API_KEY
  const envConfig = parseObject(ctx.config.env);
  const hasApiKey =
    typeof envConfig.WARP_API_KEY === "string" &&
    envConfig.WARP_API_KEY.trim().length > 0;
  if (hasApiKey) {
    checks.push({
      code: "warp_api_key_configured",
      level: "info",
      message: "WARP_API_KEY is configured in adapter env",
    });
  } else {
    checks.push({
      code: "warp_api_key_missing",
      level: "warn",
      message: "WARP_API_KEY not found in adapter env",
      hint: "Oz may still work if the Warp desktop app is logged in, but explicit API key is recommended for headless use",
    });
  }

  // Check model availability
  const model = asString(ctx.config.model, "");
  if (model) {
    try {
      const modelsOutput = execFileSync(command, ["model", "list", "--output-format", "json"], {
        timeout: 15_000,
        encoding: "utf-8",
      });
      const modelList = JSON.parse(modelsOutput);
      const ids = Array.isArray(modelList)
        ? modelList.map((m: Record<string, unknown>) => asString(m.id, ""))
        : [];
      if (ids.includes(model)) {
        checks.push({
          code: "model_available",
          level: "info",
          message: `Model "${model}" is available`,
        });
      } else {
        checks.push({
          code: "model_not_found",
          level: "warn",
          message: `Model "${model}" not found in Oz model list`,
          hint: `Available models: ${ids.slice(0, 5).join(", ")}...`,
        });
      }
    } catch {
      checks.push({
        code: "model_check_failed",
        level: "warn",
        message: "Could not verify model availability",
        hint: "oz model list failed — check auth or network",
      });
    }
  }

  const hasError = checks.some((c) => c.level === "error");
  const hasWarn = checks.some((c) => c.level === "warn");
  return {
    adapterType: "oz_local",
    status: hasError ? "fail" : hasWarn ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
