import { z } from "zod";
import { dfsItems, fail, ok, type Parsed } from "./shared";
import { KeywordItem, toNumbers, type KeywordNumbers } from "./keywordInfo";

/** DataForSEO Labs keyword ideas: keywords in the same category as the seeds, with their numbers when present. */
export function parse(raw: unknown): Parsed<KeywordNumbers[]> {
  const items = dfsItems(raw);
  if (!items) return fail("no items list");
  const r = z.array(KeywordItem).safeParse(items);
  if (!r.success) return fail("items are not objects");
  return ok(r.data.map(toNumbers).filter((k): k is KeywordNumbers => k !== null));
}
