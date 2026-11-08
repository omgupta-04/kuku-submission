import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { wrapProvider, RateLimitError } from "@/lib/llm";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pf-"));
const opts = (cacheDir?: string) => ({ model: "m", cacheDir, sleep: async () => {} });

describe("wrapProvider", () => {
  it("parses JSON", async () => {
    const llm = wrapProvider(async () => '{"a":1}', opts());
    expect(await llm.json<{ a: number }>("p", {})).toEqual({ a: 1 });
  });

  it("retries once with the error message when JSON is invalid", async () => {
    const raw = vi.fn().mockResolvedValueOnce("not json").mockResolvedValueOnce('{"ok":true}');
    const llm = wrapProvider(raw, opts());
    expect(await llm.json("p", {})).toEqual({ ok: true });
    expect(raw.mock.calls[1][0]).toMatch(/not valid JSON/);
  });

  it("throws if repair also fails", async () => {
    const llm = wrapProvider(async () => "nope", opts());
    await expect(llm.json("p", {})).rejects.toThrow(/JSON/);
  });

  it("backs off and retries on 429", async () => {
    const raw = vi.fn().mockRejectedValueOnce(new RateLimitError()).mockResolvedValueOnce("{}");
    const llm = wrapProvider(raw, opts());
    await llm.json("p", {});
    expect(raw).toHaveBeenCalledTimes(2);
  });

  it("caches by prompt+model so re-runs cost zero", async () => {
    const dir = tmp();
    const raw = vi.fn().mockResolvedValue('{"x":2}');
    await wrapProvider(raw, opts(dir)).json("same", {});
    await wrapProvider(raw, opts(dir)).json("same", {});
    expect(raw).toHaveBeenCalledTimes(1);
    await wrapProvider(raw, { ...opts(dir), model: "other" }).json("same", {});
    expect(raw).toHaveBeenCalledTimes(2);
  });
});
