import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import * as http from "node:http";
import {
  _setSocketPath,
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
import { socketPathForDir } from "../src/socket";

const TEST_DIR = `/tmp/walkthrough-bridge-test-${process.pid}`;
const SOCKET_PATH = socketPathForDir(TEST_DIR);

let testServer: http.Server;
let lastRequest: { url: string; body: Record<string, unknown> } | null = null;
let serverResponse: Record<string, unknown> = { ok: true };

function startTestServer(): Promise<void> {
  return new Promise((resolve) => {
    testServer = http.createServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      lastRequest = {
        url: req.url || "",
        body: body ? JSON.parse(body) : {},
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(serverResponse));
    });
    testServer.listen(SOCKET_PATH, resolve);
  });
}

function stopTestServer(): Promise<void> {
  return new Promise((resolve) => {
    testServer?.close(() => {
      rmSync(SOCKET_PATH, { force: true });
      resolve();
    });
  });
}

beforeEach(async () => {
  resetBridgeState();
  lastRequest = null;
  serverResponse = { ok: true };
  await startTestServer();
  _setSocketPath(SOCKET_PATH);
});

afterEach(async () => {
  await stopTestServer();
});

describe("checkBridge", () => {
  test("returns true when bridge responds ok", async () => {
    // Arrange
    serverResponse = { ok: true };

    // Act
    const result = await checkBridge();

    // Assert
    expect(result).toBe(true);
    expect(isBridgeAvailable()).toBe(true);
  });

  test("returns false when bridge is unreachable", async () => {
    // Arrange
    await stopTestServer();
    _setSocketPath("/tmp/nonexistent-socket.sock");

    // Act
    const result = await checkBridge();

    // Assert
    expect(result).toBe(false);
    expect(isBridgeAvailable()).toBe(false);

    // Restart for afterEach cleanup
    await startTestServer();
    _setSocketPath(SOCKET_PATH);
  });

  test("returns false when bridge responds without ok", async () => {
    // Arrange
    serverResponse = { error: "something" };

    // Act
    const result = await checkBridge();

    // Assert
    expect(result).toBe(false);
  });
});

describe("bridge unavailable", () => {
  test("all tools return error when bridge is down", async () => {
    // Arrange
    await stopTestServer();
    _setSocketPath("/tmp/nonexistent-socket.sock");

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
      expect(typeof result.error).toBe("string");
    }

    // Restart for afterEach cleanup
    await startTestServer();
    _setSocketPath(SOCKET_PATH);
  });

  test("retries on each call instead of caching failure", async () => {
    // Arrange - bridge down
    await stopTestServer();
    _setSocketPath("/tmp/nonexistent-socket.sock");
    await openFile("/test.ts", 1);

    // Act - bridge comes back
    await startTestServer();
    _setSocketPath(SOCKET_PATH);
    serverResponse = { ok: true };
    const result = await openFile("/test.ts", 1);

    // Assert
    expect(result.ok).toBe(true);
  });
});

describe("bridge available", () => {
  test("openFile sends correct request", async () => {
    // Arrange
    serverResponse = { ok: true };

    // Act
    const result = await openFile("/src/index.ts", 10, 20);

    // Assert
    expect(result).toEqual({ ok: true });
    expect(lastRequest?.url).toBe("/open");
    expect(lastRequest?.body).toEqual({
      file: "/src/index.ts",
      line: 10,
      endLine: 20,
    });
  });

  test("showExplanation sends correct request", async () => {
    // Arrange
    serverResponse = { ok: true };

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
    expect(lastRequest?.url).toBe("/explain");
    expect(lastRequest?.body.explanation).toBe("## Explanation");
    expect(lastRequest?.body.title).toBe("Step 1");
  });

  test("startWalkthrough sends steps with autoplay config", async () => {
    // Arrange
    serverResponse = { active: true, currentStep: 0, totalSteps: 2 };
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
    expect(lastRequest?.url).toBe("/walkthrough");
    expect(lastRequest?.body.steps).toHaveLength(2);
    expect(lastRequest?.body.autoplay).toBe(true);
    expect(lastRequest?.body.delayMs).toBe(3000);
  });

  test("navigateWalkthrough sends action", async () => {
    // Arrange
    serverResponse = { active: true, currentStep: 1, totalSteps: 3 };

    // Act
    const result = await navigateWalkthrough("next");

    // Assert
    expect(result.currentStep).toBe(1);
    expect(lastRequest?.url).toBe("/walkthrough/navigate");
    expect(lastRequest?.body.action).toBe("next");
  });

  test("navigateWalkthrough goto sends step index", async () => {
    // Arrange
    serverResponse = { active: true, currentStep: 5, totalSteps: 10 };

    // Act
    const result = await navigateWalkthrough("goto", 5);

    // Assert
    expect(result.currentStep).toBe(5);
    expect(lastRequest?.url).toBe("/walkthrough/navigate");
    expect(lastRequest?.body.action).toBe("goto");
    expect(lastRequest?.body.step).toBe(5);
  });

  test("getSelection returns selection data", async () => {
    // Arrange
    serverResponse = {
      ok: true,
      file: "/src/index.ts",
      line: 5,
      endLine: 8,
      text: "const x = 1;",
    };

    // Act
    const result = await getSelection();

    // Assert
    expect(result.ok).toBe(true);
    expect(result.file).toBe("/src/index.ts");
    expect(result.text).toBe("const x = 1;");
  });
});

describe("bridge connection loss and recovery", () => {
  test("returns error on failure but recovers when bridge comes back", async () => {
    // Arrange
    serverResponse = { ok: true };
    await checkBridge();
    expect(isBridgeAvailable()).toBe(true);

    // Act - bridge goes down
    await stopTestServer();
    _setSocketPath("/tmp/nonexistent-socket.sock");
    const failResult = await openFile("/test.ts", 1);

    // Assert - fails
    expect(failResult.ok).toBe(false);

    // Act - bridge comes back
    await startTestServer();
    _setSocketPath(SOCKET_PATH);
    serverResponse = { ok: true };
    const successResult = await openFile("/test.ts", 1);

    // Assert - recovers
    expect(successResult.ok).toBe(true);
  });
});
