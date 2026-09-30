export interface SearchQuery {
  q: string;
  recency?: number;
  domains?: string[];
}

export interface OpenOperation {
  ref_id: string;
  lineno?: number;
}

export interface ClickOperation {
  ref_id: string;
  id: number;
}

export interface FindOperation {
  ref_id: string;
  pattern: string;
}

export type ResponseLength = "short" | "medium" | "long";

/** Backend operations exposed by this extension, in serialization order. */
export const OPERATION_KEYS = ["search_query", "image_query", "open", "click", "find", "weather"] as const;

export interface WeatherLookup {
  location: string;
  /** First forecast day, YYYY-MM-DD (default: today) */
  start?: string;
  /** Number of forecast days */
  duration?: number;
}

export interface WebRunCommand {
  search_query?: SearchQuery[];
  image_query?: SearchQuery[];
  open?: OpenOperation[];
  click?: ClickOperation[];
  find?: FindOperation[];
  weather?: WeatherLookup[];
  response_length?: ResponseLength;
}

export interface SearchToolRequest {
  query: string;
  recency?: number;
  domains?: string[];
  response_length?: ResponseLength;
}

export class InvalidCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCommandError";
  }
}

export function validateSearchToolRequest(input: unknown): SearchToolRequest {
  if (typeof input !== "object" || input === null) {
    throw new InvalidCommandError("Search parameters must be a non-null object");
  }

  const obj = input as Record<string, unknown>;
  if (typeof obj.query !== "string" || !obj.query.trim()) {
    throw new InvalidCommandError("query must be a non-empty string");
  }

  const request: SearchToolRequest = { query: obj.query.trim() };
  if (obj.recency !== undefined) {
    if (typeof obj.recency !== "number") throw new InvalidCommandError("recency must be a number");
    request.recency = obj.recency;
  }
  if (obj.domains !== undefined) {
    if (!Array.isArray(obj.domains) || obj.domains.some((domain) => typeof domain !== "string" || !domain.trim())) {
      throw new InvalidCommandError("domains must be an array of non-empty strings");
    }
    request.domains = obj.domains.map((domain) => domain.trim());
  }
  if (obj.response_length !== undefined) {
    if (obj.response_length !== "short" && obj.response_length !== "medium" && obj.response_length !== "long") {
      throw new InvalidCommandError("response_length must be 'short', 'medium', or 'long'");
    }
    request.response_length = obj.response_length;
  }
  return request;
}

export function validateWebRunCommand(cmd: unknown): WebRunCommand {
  if (typeof cmd !== "object" || cmd === null) {
    throw new InvalidCommandError("Command must be a non-null object");
  }

  const obj = cmd as Record<string, unknown>;
  const validated: WebRunCommand = {};

  for (const key of ["search_query", "image_query"] as const) {
    const list = obj[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      throw new InvalidCommandError(`${key} must be an array`);
    }
    validated[key] = list.map((sq, idx) => {
      if (typeof sq !== "object" || sq === null || typeof (sq as { q?: unknown }).q !== "string") {
        throw new InvalidCommandError(`${key}[${idx}] must be an object with a string 'q' property`);
      }
      const item: SearchQuery = { q: (sq as { q: string }).q.trim() };
      if (!item.q) {
        throw new InvalidCommandError(`${key}[${idx}].q cannot be empty`);
      }
      if (typeof (sq as { recency?: unknown }).recency === "number") {
        item.recency = (sq as { recency: number }).recency;
      }
      if (Array.isArray((sq as { domains?: unknown }).domains)) {
        item.domains = (sq as { domains: string[] }).domains
          .filter((d) => typeof d === "string" && d.trim())
          .map((d) => d.trim());
      }
      return item;
    });
  }

  if (obj.weather !== undefined) {
    if (!Array.isArray(obj.weather)) {
      throw new InvalidCommandError("weather must be an array");
    }
    validated.weather = obj.weather.map((w, idx) => {
      const raw = (typeof w === "object" && w !== null ? w : {}) as Record<string, unknown>;
      const location = typeof raw.location === "string" ? raw.location.trim() : "";
      if (!location) {
        throw new InvalidCommandError(`weather[${idx}].location must be a non-empty string`);
      }
      const item: WeatherLookup = { location };
      if (raw.start !== undefined && raw.start !== null) {
        if (typeof raw.start !== "string") throw new InvalidCommandError(`weather[${idx}].start must be a YYYY-MM-DD string`);
        item.start = raw.start.trim();
      }
      if (raw.duration !== undefined && raw.duration !== null) {
        if (typeof raw.duration !== "number") throw new InvalidCommandError(`weather[${idx}].duration must be a number of days`);
        item.duration = raw.duration;
      }
      return item;
    });
  }

  if ("open" in obj && obj.open !== undefined) {
    if (!Array.isArray(obj.open)) {
      throw new InvalidCommandError("open must be an array");
    }
    validated.open = obj.open.map((op, idx) => {
      if (typeof op !== "object" || op === null || typeof (op as { ref_id?: unknown }).ref_id !== "string") {
        throw new InvalidCommandError(`open[${idx}] must be an object with a string 'ref_id' property`);
      }
      const item: OpenOperation = { ref_id: (op as { ref_id: string }).ref_id.trim() };
      if (!item.ref_id) {
        throw new InvalidCommandError(`open[${idx}].ref_id cannot be empty`);
      }
      if (typeof (op as { lineno?: unknown }).lineno === "number") {
        item.lineno = (op as { lineno: number }).lineno;
      }
      return item;
    });
  }

  if ("click" in obj && obj.click !== undefined) {
    if (!Array.isArray(obj.click)) {
      throw new InvalidCommandError("click must be an array");
    }
    validated.click = obj.click.map((cl, idx) => {
      if (
        typeof cl !== "object" ||
        cl === null ||
        typeof (cl as { ref_id?: unknown }).ref_id !== "string" ||
        typeof (cl as { id?: unknown }).id !== "number"
      ) {
        throw new InvalidCommandError(
          `click[${idx}] must be an object with a string 'ref_id' and numeric 'id'`
        );
      }
      const item: ClickOperation = {
        ref_id: (cl as { ref_id: string }).ref_id.trim(),
        id: (cl as { id: number }).id,
      };
      if (!item.ref_id) {
        throw new InvalidCommandError(`click[${idx}].ref_id cannot be empty`);
      }
      return item;
    });
  }

  if ("find" in obj && obj.find !== undefined) {
    if (!Array.isArray(obj.find)) {
      throw new InvalidCommandError("find must be an array");
    }
    validated.find = obj.find.map((fn, idx) => {
      if (
        typeof fn !== "object" ||
        fn === null ||
        typeof (fn as { ref_id?: unknown }).ref_id !== "string" ||
        typeof (fn as { pattern?: unknown }).pattern !== "string"
      ) {
        throw new InvalidCommandError(
          `find[${idx}] must be an object with string 'ref_id' and 'pattern'`
        );
      }
      const item: FindOperation = {
        ref_id: (fn as { ref_id: string }).ref_id.trim(),
        pattern: (fn as { pattern: string }).pattern,
      };
      if (!item.ref_id) {
        throw new InvalidCommandError(`find[${idx}].ref_id cannot be empty`);
      }
      return item;
    });
  }

  if ("response_length" in obj && obj.response_length !== undefined) {
    const rl = obj.response_length;
    if (rl !== "short" && rl !== "medium" && rl !== "long") {
      throw new InvalidCommandError("response_length must be 'short', 'medium', or 'long'");
    }
    validated.response_length = rl;
  }

  const hasOperations = OPERATION_KEYS.some((key) => (validated[key]?.length ?? 0) > 0);

  if (!hasOperations) {
    throw new InvalidCommandError(`Command must contain at least one operation: ${OPERATION_KEYS.join(", ")}`);
  }

  return validated;
}

export interface EndpointPayloadOptions {
  sessionId?: string;
  model?: string;
}

export function serializeWebRunPayload(command: WebRunCommand, options?: EndpointPayloadOptions): Record<string, unknown> {
  const commandsObj: Record<string, unknown> = {};

  for (const key of OPERATION_KEYS) {
    const list = command[key];
    if (list && list.length > 0) commandsObj[key] = list;
  }
  if (command.response_length) {
    commandsObj.response_length = command.response_length;
  }

  const payload: Record<string, unknown> = {
    id: options?.sessionId ?? "search_1",
    model: options?.model ?? "gpt-4o",
    commands: commandsObj,
  };

  return payload;
}
