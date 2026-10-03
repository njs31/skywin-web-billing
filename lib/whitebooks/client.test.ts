import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearAuthTokenCache,
  getEwaybillDetailsByIrn,
  getIrnByDocDetails,
  getIrnDetails,
  WhitebooksError,
} from "./client";
import type { WhitebooksConfig } from "./config";

const cfg: WhitebooksConfig = {
  env: "sandbox",
  baseUrl: "https://apisandbox.whitebooks.in",
  clientId: "CID",
  clientSecret: "CSEC",
  gstUsername: "U",
  gstPassword: "P",
  gstin: "33TESTGSTIN0000",
  email: "a@b.c",
  ipAddress: "1.2.3.4",
};

type Call = { url: string; init: RequestInit };

let calls: Call[];
let script: Array<{ status: number; body: unknown }>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const AUTH_OK = {
  status_cd: "1",
  status_desc: "ok",
  data: { AuthToken: "TOK123", TokenExpiry: "2099-01-01 00:00:00" },
};

function headersOf(call: Call): Record<string, string> {
  return { ...(call.init.headers as Record<string, string>) };
}

beforeEach(() => {
  clearAuthTokenCache();
  calls = [];
  script = [];
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    const next = script.shift();
    if (!next) throw new Error("fetch stub ran out of scripted responses");
    return json(next.status, next.body);
  }) as typeof fetch;
});

function authThen(data: unknown) {
  script.push(
    { status: 200, body: AUTH_OK },
    { status: 200, body: { status_cd: "1", status_desc: "ok", data } }
  );
}

describe("whitebooks fetch endpoints", () => {
  it("GETIRN hits the documented path with auth-token and returns data", async () => {
    authThen({ Irn: "IRN123", Status: "ACT" });
    const data = await getIrnDetails(cfg, "IRN123");
    assert.deepEqual(data, { Irn: "IRN123", Status: "ACT" });
    assert.equal(calls.length, 2);
    assert.equal(
      calls[1].url,
      "https://apisandbox.whitebooks.in/einvoice/type/GETIRN/version/V1_03?param1=IRN123&email=a%40b.c"
    );
    const headers = headersOf(calls[1]);
    assert.equal(headers["auth-token"], "TOK123");
    assert.equal(headers.username, "U");
    assert.equal(headers.gstin, "33TESTGSTIN0000");
    assert.equal(calls[1].init.method, "GET");
  });

  it("GETIRNBYDOCDETAILS sends docnum/docdate headers in NIC format", async () => {
    authThen({ Irn: "FOUND" });
    await getIrnByDocDetails(cfg, {
      docType: "INV",
      docNo: "INV-261001-0001",
      docDate: new Date(2026, 0, 5),
    });
    assert.equal(calls.length, 2);
    assert.ok(
      calls[1].url.startsWith(
        "https://apisandbox.whitebooks.in/einvoice/type/GETIRNBYDOCDETAILS/version/V1_03?param1=INV&email="
      )
    );
    const headers = headersOf(calls[1]);
    assert.equal(headers.docnum, "INV-261001-0001");
    assert.equal(headers.docdate, "05/01/2026");
  });

  it("GETEWAYBILLIRN hits its documented path", async () => {
    authThen({ EwbNo: 123 });
    const data = await getEwaybillDetailsByIrn(cfg, "IRN123");
    assert.deepEqual(data, { EwbNo: 123 });
    assert.ok(
      calls[1].url.startsWith(
        "https://apisandbox.whitebooks.in/einvoice/type/GETEWAYBILLIRN/version/V1_03?param1=IRN123&email="
      )
    );
  });

  it("surfaces IRP failures as WhitebooksError with code", async () => {
    script.push(
      { status: 200, body: AUTH_OK },
      {
        status: 200,
        body: {
          status_cd: "0",
          errorCode: "2148",
          status_desc: "Requested IRN data is not available",
        },
      }
    );
    await assert.rejects(() => getIrnDetails(cfg, "NOPE"), (err: unknown) => {
      assert.ok(err instanceof WhitebooksError);
      assert.equal(err.code, "2148");
      assert.match(err.message, /not available/);
      return true;
    });
  });

  it("a 401 clears the token so the next call re-authenticates", async () => {
    script.push(
      { status: 200, body: AUTH_OK },
      { status: 401, body: { status_cd: "0", status_desc: "expired" } },
      { status: 200, body: AUTH_OK },
      { status: 200, body: { status_cd: "1", data: { Irn: "OK" } } }
    );
    await assert.rejects(() => getIrnDetails(cfg, "X"));
    const data = await getIrnDetails(cfg, "X");
    assert.deepEqual(data, { Irn: "OK" });
    const authCalls = calls.filter((c) => c.url.includes("/einvoice/authenticate"));
    assert.equal(authCalls.length, 2);
  });

  it("unwraps nested IRP error arrays into code + message", async () => {
    script.push(
      { status: 200, body: AUTH_OK },
      {
        status: 200,
        body: {
          status_cd: "0",
          status_desc:
            '[{"errorCode":"4005","errorMessage":"Eway Bill details are not found"}]',
        },
      }
    );
    await assert.rejects(
      () => getEwaybillDetailsByIrn(cfg, "IRN123"),
      (err: unknown) => {
        assert.ok(err instanceof WhitebooksError);
        assert.equal(err.code, "4005");
        assert.match(err.message, /E-way bill details fetch failed \[4005\]/);
        assert.match(err.message, /not found/);
        return true;
      }
    );
  });

  it("sends the irp server type from auth on the EWB lookup", async () => {
    script.push(
      {
        status: 200,
        body: {
          ...AUTH_OK,
          data: { ...AUTH_OK.data, irp: "NIC1" },
        },
      },
      { status: 200, body: { status_cd: "1", data: { EwbNo: 1 } } }
    );
    await getEwaybillDetailsByIrn(cfg, "IRN123");
    assert.ok(calls[1].url.includes("irp=NIC1"));
  });

  it("omits irp when auth did not return one", async () => {
    authThen({ EwbNo: 1 });
    await getEwaybillDetailsByIrn(cfg, "IRN123");
    assert.ok(!calls[1].url.includes("irp="));
  });
});
