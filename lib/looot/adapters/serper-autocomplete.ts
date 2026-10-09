import { z } from "zod";
import { fail, ok, str, type Parsed } from "./shared";

const Body = z.looseObject({ suggestions: z.array(z.union([z.string(), z.looseObject({ value: str })])) });

/** Serper autocomplete: the suggestion strings. */
export function parse(raw: unknown): Parsed<string[]> {
  const r = Body.safeParse(raw);
  if (!r.success) return fail("no suggestions list");
  return ok(r.data.suggestions.map((s) => (typeof s === "string" ? s : s.value)).filter((s): s is string => Boolean(s)));
}
