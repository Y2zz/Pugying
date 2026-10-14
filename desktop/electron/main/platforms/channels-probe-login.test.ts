import {
  ChannelsGraphicClient,
  type ChannelsHttpTransport,
} from "./channels-graphic-client";

vi.mock("electron", () => ({ net: { fetch: vi.fn() } }));

const cookies = [
  {
    name: "sessionid",
    value: "s",
    domain: ".channels.weixin.qq.com",
    path: "/",
  },
];

function clientReturning(status: number, body: unknown): ChannelsGraphicClient {
  const transport: ChannelsHttpTransport = {
    async request() {
      return {
        status,
        headers: {},
        body: new TextEncoder().encode(JSON.stringify(body)),
      };
    },
  };
  return new ChannelsGraphicClient(
    cookies as unknown as ConstructorParameters<
      typeof ChannelsGraphicClient
    >[0],
    transport,
  );
}

describe("ChannelsGraphicClient.probeLogin", () => {
  it("is logged in when auth_data returns the finder user", async () => {
    const client = clientReturning(200, {
      errCode: 0,
      data: { finderUser: { finderUsername: "v2_x" } },
    });
    await expect(client.probeLogin()).resolves.toBe("logged-in");
  });

  it("does not treat the generic 300333 failure as logged out", async () => {
    const client = clientReturning(200, {
      errCode: 300333,
      errMsg: "request failed",
    });
    await expect(client.probeLogin()).resolves.toBe("unknown");
  });

  it("treats an explicit auth-expired code as logged out", async () => {
    const client = clientReturning(200, { errCode: 300334 });
    await expect(client.probeLogin()).resolves.toBe("logged-out");
  });

  it("treats HTTP 401 as logged out", async () => {
    const client = clientReturning(401, {});
    await expect(client.probeLogin()).resolves.toBe("logged-out");
  });
});
