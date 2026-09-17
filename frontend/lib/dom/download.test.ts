import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "@/lib/dom/download";

describe("downloadFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an object URL, clicks a download anchor, then revokes the URL", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadFile("report.csv", "a,b\n1,2", "text/csv");

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("is a no-op when window is undefined (SSR safety)", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - simulate SSR
    delete globalThis.window;
    expect(() => downloadFile("f.csv", "x", "text/csv")).not.toThrow();
    globalThis.window = originalWindow;
  });
});
