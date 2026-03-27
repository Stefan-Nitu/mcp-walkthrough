import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  checkBridge,
  clearExplanations,
  getSelection,
  getWalkthroughStatus,
  isBridgeAvailable,
  navigateWalkthrough,
  openFile,
  resetBridgeState,
  showExplanation,
  startWalkthrough,
} from "../src/bridge";

const originalFetch = globalThis.fetch;

function mockFetch(response: Record<string, unknown>, status = 200) {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(response), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  ) as unknown as typeof fetch;
}

function mockFetchError() {
  globalThis.fetch = mock(() =>
    Promise.reject(new Error("Connection refused")),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  resetBridgeState();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("checkBridge", () => {
  test("returns true when bridge responds ok", async () => {
    // Arrange
    mockFetch({ ok: true });

    // Act
    const result = await checkBridge();

    // Assert
    expect(result).toBe(true);
    expect(isBridgeAvailable()).toBe(true);
  });

  test("returns false when bridge is unreachable", async () => {
    // Arrange
    mockFetchError();

    // Act
    const result = await checkBridge();

    // Assert
    expect(result).toBe(false);
    expect(isBridgeAvailable()).toBe(false);
  });

  test("returns false when bridge responds without ok", async () => {
    // Arrange
    mockFetch({ error: "something" });

    // Act
    const result = await checkBridge();

    // Assert
    expect(result).toBe(false);
  });
});

describe("bridge unavailable", () => {
  test("all tools return error when bridge is down", async () => {
    // Arrange
    mockFetchError();
    await checkBridge();

    // Act
    const results = await Promise.all([
      openFile("/test.ts", 1),
      showExplanation("/test.ts", 1, 5, "explanation"),
      clearExplanations(),
      startWalkthrough([{ file: "/test.ts", line: 1, explanation: "test" }]),
      navigateWalkthrough("next"),
      getWalkthroughStatus(),
      getSelection(),
    ]);

    // Assert
    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(result.error).toBe("This MCP server only works from VS Code.");
    }
  });

  test("does not make fetch calls when bridge is known unavailable", async () => {
    // Arrange
    mockFetchError();
    await checkBridge();
    const fetchSpy = mock(() =>
      Promise.resolve(new Response("{}")),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    // Act
    await openFile("/test.ts", 1);

    // Assert
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("bridge available", () => {
  test("openFile sends correct request", async () => {
    // Arrange
    mockFetch({ ok: true });
    await checkBridge();
    mockFetch({ ok: true });

    // Act
    const result = await openFile("/src/index.ts", 10, 20);

    // Assert
    expect(result).toEqual({ ok: true });
    const call = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
      .calls[0];
    expect(call![0]).toContain("/open");
    const body = JSON.parse(call![1]!.body as string);
    expect(body).toEqual({ file: "/src/index.ts", line: 10, endLine: 20 });
  });

  test("showExplanation sends correct request", async () => {
    // Arrange
    mockFetch({ ok: true });
    await checkBridge();
    mockFetch({ ok: true });

    // Act
    const result = await showExplanation(
      "/src/index.ts",
      5,
      10,
      "## Explanation",
      "Step 1",
    );

    // Assert
    expect(result).toEqual({ ok: true });
    const call = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
      .calls[0];
    expect(call![0]).toContain("/explain");
    const body = JSON.parse(call![1]!.body as string);
    expect(body.explanation).toBe("## Explanation");
    expect(body.title).toBe("Step 1");
  });

  test("startWalkthrough sends steps with autoplay config", async () => {
    // Arrange
    mockFetch({ ok: true });
    await checkBridge();
    mockFetch({ active: true, currentStep: 0, totalSteps: 2 });

    const steps = [
      { file: "/a.ts", line: 1, explanation: "First" },
      {
        file: "/b.ts",
        line: 5,
        endLine: 10,
        explanation: "Second",
        title: "Step 2",
      },
    ];

    // Act
    const result = await startWalkthrough(steps, true, 3000);

    // Assert
    expect(result.active).toBe(true);
    expect(result.totalSteps).toBe(2);
    const call = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
      .calls[0];
    const body = JSON.parse(call![1]!.body as string);
    expect(body.steps).toHaveLength(2);
    expect(body.autoplay).toBe(true);
    expect(body.delayMs).toBe(3000);
  });

  test("navigateWalkthrough sends action", async () => {
    // Arrange
    mockFetch({ ok: true });
    await checkBridge();
    mockFetch({ active: true, currentStep: 1, totalSteps: 3 });

    // Act
    const result = await navigateWalkthrough("next");

    // Assert
    expect(result.currentStep).toBe(1);
    const call = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
      .calls[0];
    const body = JSON.parse(call![1]!.body as string);
    expect(body.action).toBe("next");
  });

  test("navigateWalkthrough goto sends step index", async () => {
    // Arrange
    mockFetch({ ok: true });
    await checkBridge();
    mockFetch({ active: true, currentStep: 5, totalSteps: 10 });

    // Act
    const result = await navigateWalkthrough("goto", 5);

    // Assert
    expect(result.currentStep).toBe(5);
    const call = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
      .calls[0];
    const body = JSON.parse(call![1]!.body as string);
    expect(body.action).toBe("goto");
    expect(body.step).toBe(5);
  });

  test("getSelection returns selection data", async () => {
    // Arrange
    mockFetch({ ok: true });
    await checkBridge();
    mockFetch({
      ok: true,
      file: "/src/index.ts",
      line: 5,
      endLine: 8,
      text: "const x = 1;",
    });

    // Act
    const result = await getSelection();

    // Assert
    expect(result.ok).toBe(true);
    expect(result.file).toBe("/src/index.ts");
    expect(result.text).toBe("const x = 1;");
  });
});

describe("bridge connection loss", () => {
  test("marks bridge unavailable on fetch failure", async () => {
    // Arrange
    mockFetch({ ok: true });
    await checkBridge();
    expect(isBridgeAvailable()).toBe(true);

    mockFetchError();

    // Act
    const result = await openFile("/test.ts", 1);

    // Assert
    expect(result.ok).toBe(false);
    expect(isBridgeAvailable()).toBe(false);
  });
});
