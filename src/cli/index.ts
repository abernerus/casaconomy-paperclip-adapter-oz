import { formatOzStreamEvent } from "./format-event.js";

export const type = "oz_local";
export const formatStdoutEvent = formatOzStreamEvent;
export { formatOzStreamEvent };
