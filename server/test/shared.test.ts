import { describe, expect, it } from "vitest";
import { searchKey, toCyrillic, toLatin } from "../../shared/translit.js";
import { availableTransitions, findTransition, formatMoney } from "../../shared/types.js";

describe("translit", () => {
  it.each([
    ["Ko'k Nexx 5L", "Кўк Нехх 5Л"],
    ["Idish Gel (Sariq)", "Идиш Гел (Сариқ)"],
    ["Buyurtmangiz qabul qilindi", "Буюртмангиз қабул қилинди"],
    ["Yetkazib berish", "Етказиб бериш"],
    ["Parashok", "Парашок"],
    ["O'zi olib ketadi", "Ўзи олиб кетади"],
    ["Bog'lanish", "Боғланиш"],
    ["SHAHAR", "ШАҲАР"],
    ["Ertaga eshik", "Эртага эшик"],
    ["Ma'lumot", "Маълумот"],
    ["so'm", "сўм"],
    ["Yoqilg'i", "Ёқилғи"],
    ["Choy", "Чой"],
  ])("%s → %s", (latin, cyrillic) => {
    expect(toCyrillic(latin)).toBe(cyrillic);
  });

  it("keeps links and numbers", () => {
    expect(toCyrillic("Narx 70 000, https://maps.google.com/?q=a")).toBe("Нарх 70 000, https://maps.google.com/?q=a");
  });

  it("goes back to Latin for search", () => {
    expect(toLatin("Кўк Нехх")).toBe("Ko'k Nexx");
    expect(searchKey("КЎК")).toBe(searchKey("Ko'k"));
    expect(searchKey("Idish  GEL")).toBe("idish gel");
  });
});

describe("order rules", () => {
  const pickup = { status: "ready", fulfillment: "pickup" } as const;
  const delivery = { status: "ready", fulfillment: "delivery" } as const;

  it("lets a seller hand over pickup orders but not deliveries", () => {
    const seller = { roles: ["seller" as const], isOwner: false };
    expect(findTransition(pickup, "completed", seller)).toBeDefined();
    expect(findTransition(delivery, "delivering", seller)).toBeUndefined();
  });

  it("lets a driver take ready deliveries", () => {
    expect(availableTransitions(delivery, { roles: ["driver"], isOwner: false }).map((t) => t.to)).toEqual(["delivering"]);
  });

  it("lets customers cancel only new orders", () => {
    const owner = { roles: [], isOwner: true };
    expect(findTransition({ status: "new", fulfillment: "pickup" }, "cancelled", owner)).toBeDefined();
    expect(findTransition(pickup, "cancelled", owner)).toBeUndefined();
  });

  it("formats money with spaces", () => {
    expect(formatMoney(1234567)).toBe("1 234 567 so'm");
    expect(formatMoney(9000)).toBe("9 000 so'm");
  });
});
