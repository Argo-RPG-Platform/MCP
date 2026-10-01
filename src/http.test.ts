import { describe, expect, it, vi } from "vitest";
import type express from "express";
import { rejectStandaloneStream } from "./http.js";

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
