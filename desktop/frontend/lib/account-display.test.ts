import { accountLabel, duplicateAccountNames } from "./account-display";

it("adds the platform name only when nicknames collide", () => {
  const accounts = [
    { displayName: "Alice", platform: "douyin" as const },
    { displayName: "alice ", platform: "xiaohongshu" as const },
    { displayName: "Bob", platform: "bilibili" as const },
  ];
  const dupes = duplicateAccountNames(accounts);
  expect(accountLabel(accounts[0], dupes)).toBe("Alice（抖音）");
  expect(accountLabel(accounts[1], dupes)).toBe("alice （小红书）");
  expect(accountLabel(accounts[2], dupes)).toBe("Bob");
});
