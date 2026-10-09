import { z } from "zod";
import { dfsItems, fail, ok, type Parsed } from "./shared";
import { KeywordItem, toNumbers, type KeywordNumbers } from "./keywordInfo";

const Item = z.looseObject({ keyword_data: KeywordItem.nullish().catch(undefined) });

/** DataForSEO Labs related keywords: each item wraps the keyword under keyword_data. */
export function parse(raw: unknown): Parsed<KeywordNumbers[]> {
  const items = dfsItems(raw);
  if (!items) return fail("no items list");
  const r = z.array(Item).safeParse(items);
  if (!r.success) return fail("items are not objects");
  return ok(r.data.map((i) => (i.keyword_data ? toNumbers(i.keyword_data) : null)).filter((k): k is KeywordNumbers => k !== null));
}
