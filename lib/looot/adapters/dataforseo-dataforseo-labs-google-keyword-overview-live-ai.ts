import { z } from "zod";
import { dfsItems, fail, ok, type Parsed } from "./shared";
import { KeywordItem, toNumbers, type KeywordNumbers } from "./keywordInfo";

/** DataForSEO Labs keyword overview: volume, CPC, competition, intent and monthly searches per keyword. */
export function parse(raw: unknown): Parsed<KeywordNumbers[]> {
  const items = dfsItems(raw);
  if (!items) return fail("no items list");
  const r = z.array(KeywordItem).safeParse(items);
  if (!r.success) return fail("items are not objects");
  return ok(r.data.map(toNumbers).filter((k): k is KeywordNumbers => k !== null));
}
