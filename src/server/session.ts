import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown): Record<string, unknown> | null {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;

    const conversationId =
      readNonEmptyString(record.conversationId) ??
      readNonEmptyString(record.conversation_id);
    if (!conversationId) return null;

    const cwd = readNonEmptyString(record.cwd);
    return {
      conversationId,
      ...(cwd ? { cwd } : {}),
    };
  },

  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!params) return null;
    const conversationId =
      readNonEmptyString(params.conversationId) ??
      readNonEmptyString(params.conversation_id);
    if (!conversationId) return null;

    const cwd = readNonEmptyString(params.cwd);
    return {
      conversationId,
      ...(cwd ? { cwd } : {}),
    };
  },

  getDisplayId(params: Record<string, unknown> | null): string | null {
    if (!params) return null;
    return (
      readNonEmptyString(params.conversationId) ??
      readNonEmptyString(params.conversation_id)
    );
  },
};
