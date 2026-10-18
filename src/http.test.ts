import { describe, expect, it, vi } from "vitest";
import type express from "express";
import { rejectStandaloneStream, rejectUnknownSession, routeStreamRequest } from "./http.js";

describe("GET on the Streamable HTTP endpoint", () => {
  it("answers 405 with the allowed methods instead of opening a stream", () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    rejectStandaloneStream({} as express.Request, res as unknown as express.Response);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.set).toHaveBeenCalledWith("Allow", "POST, DELETE");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ jsonrpc: "2.0", id: null, error: expect.objectContaining({ code: -32000 }) }),
    );
  });
});

describe("a POST naming a session", () => {
  const initialize = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
  };
  const toolCall = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_campaigns", arguments: {} } };

  it("goes to the session it names when this server holds it", () => {
    expect(routeStreamRequest("s-1", true, toolCall)).toBe("existing");
  });

  it("starts a session when it names none, or is an initialize", () => {
    expect(routeStreamRequest(undefined, false, initialize)).toBe("new");
    expect(routeStreamRequest("stale", false, initialize)).toBe("new");
  });

  it("is refused as unknown when it names a session this server dropped", () => {
    expect(routeStreamRequest("stale", false, toolCall)).toBe("unknown-session");
  });

  it("answers an unknown session 404, so the client starts a new one", () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    rejectUnknownSession(res as unknown as express.Response);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ jsonrpc: "2.0", id: null, error: expect.objectContaining({ code: -32001 }) }),
    );
  });
});
