import {
  buildImagexQuery,
  randomImagexSalt,
  signImagexGetAuthorization,
  signVodGetAuthorization,
  signVodPostAuthorization,
} from "./douyin-imagex-aws4";

it("builds imagex query sorted by key for SigV4", () => {
  expect(
    buildImagexQuery({
      Action: "ApplyImageUpload",
      Version: "2018-08-01",
      ServiceId: "jm8ajry58r",
      app_id: "2906",
      user_id: "",
      s: "abcdefghijk",
    }),
  ).toBe(
    "Action=ApplyImageUpload&ServiceId=jm8ajry58r&Version=2018-08-01&app_id=2906&s=abcdefghijk&user_id=",
  );
});

it("produces stable AWS4 authorization for a fixed STS and clock", () => {
  const sts = {
    accessKeyId: "AKTPTESTKEY",
    secretAccessKey: "secretAccessKeyValue",
    sessionToken: "STS2tokenValue",
  };
  const query = buildImagexQuery({
    Action: "ApplyImageUpload",
    Version: "2018-08-01",
    ServiceId: "jm8ajry58r",
    app_id: "2906",
    user_id: "",
    s: "abcdefghijk",
  });
  const signed = signImagexGetAuthorization(
    sts,
    query,
    new Date("2024-03-18T09:53:16.000Z"),
  );
  expect(signed.amzDate).toBe("20240318T095316Z");
  expect(signed.dateStamp).toBe("20240318");
  expect(signed.authorization).toMatch(
    /^AWS4-HMAC-SHA256 Credential=AKTPTESTKEY\/20240318\/cn-north-1\/imagex\/aws4_request, SignedHeaders=x-amz-date;x-amz-security-token, Signature=[a-f0-9]{64}$/,
  );
});

it("randomImagexSalt returns expected length", () => {
  expect(randomImagexSalt(11)).toHaveLength(11);
  expect(randomImagexSalt(11)).toMatch(/^[0-9a-z]+$/);
});

it("signs VOD Apply/Commit with service=vod", () => {
  const sts = {
    accessKeyId: "AKTPTESTKEY",
    secretAccessKey: "secretAccessKeyValue",
    sessionToken: "STS2tokenValue",
  };
  const query = buildImagexQuery({
    Action: "ApplyUploadInner",
    FileSize: "3286",
    FileType: "video",
    IsInner: "1",
    SpaceName: "aweme",
    Version: "2020-11-19",
    app_id: "2906",
    s: "abcdefghijk",
    user_id: "",
  });
  const signed = signVodGetAuthorization(
    sts,
    query,
    new Date("2024-03-18T09:53:16.000Z"),
  );
  expect(signed.authorization).toContain("/cn-north-1/vod/aws4_request");
  const commit = signVodPostAuthorization(
    sts,
    buildImagexQuery({
      Action: "CommitUploadInner",
      SpaceName: "aweme",
      Version: "2020-11-19",
    }),
    JSON.stringify({ SessionKey: "key" }),
    new Date("2024-03-18T09:53:16.000Z"),
  );
  expect(commit.authorization).toContain("/cn-north-1/vod/aws4_request");
});
