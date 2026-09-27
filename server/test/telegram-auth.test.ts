import { describe, expect, it } from "vitest";
import { validateInitData } from "../src/telegram-auth.js";
import { BOT_TOKEN, signInitData } from "./helpers.js";

const user = { id: 42, first_name: "Ali" };

describe("validateInitData", () => {
  it("accepts data signed with the bot token", () => {
    expect(validateInitData(signInitData(user), BOT_TOKEN)).toEqual(user);
  });

  it("rejects data signed with another token", () => {
    expect(validateInitData(signInitData(user, { token: "999:other" }), BOT_TOKEN)).toBeNull();
  });

  it("rejects tampered data", () => {
    const tampered = signInitData(user).replace("%22id%22%3A42", "%22id%22%3A43");
    expect(validateInitData(tampered, BOT_TOKEN)).toBeNull();
  });

  it("rejects stale data", () => {
    const old = signInitData(user, { authDate: Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60 });
    expect(validateInitData(old, BOT_TOKEN)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(validateInitData("", BOT_TOKEN)).toBeNull();
    expect(validateInitData("hash=zz", BOT_TOKEN)).toBeNull();
  });
});
