import { z } from "zod";
import { dfsItems, fail, num, ok, str, type Parsed } from "./shared";

const Item = z.looseObject({ keyword: str, keyword_difficulty: num });

/** DataForSEO Labs bulk keyword difficulty: a 0 to 100 score per keyword. */
export function parse(raw: unknown): Parsed<{ phrase: string; difficulty: number | null }[]> {
  const items = dfsItems(raw);
  if (!items) return fail("no items list");
  const r = z.array(Item).safeParse(items);
  if (!r.success) return fail("items are not objects");
  return ok(
    r.data
      .filter((i) => i.keyword)
      .map((i) => ({ phrase: i.keyword as string, difficulty: typeof i.keyword_difficulty === "number" ? Math.max(0, Math.min(100, Math.round(i.keyword_difficulty))) : null })),
  );
}
