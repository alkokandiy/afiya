import { useCallback, useEffect, useMemo, useState } from "react";
import type { Catalog, Me, Order, Product, Script } from "../../shared/types";
import { BottomNav, type Tab } from "./components/BottomNav";
import { Header } from "./components/Header";
import { ErrorState, Loading } from "./components/ui";
import { api } from "./lib/api";
import { cartCount, cartLines, cartTotal, loadCart, quantityOf, saveCart, setQuantity, type Cart } from "./lib/cart";
import { ScriptContext, useT } from "./lib/i18n";
import { allowedStaffTabs, type StaffTab } from "./lib/staff";
import { inTelegram, setBackButton, showAlert } from "./lib/telegram";
import { useAsync, type AsyncState } from "./lib/use-async";
import { CartScreen } from "./screens/CartScreen";
import { Checkout } from "./screens/Checkout";
import { MyOrders } from "./screens/MyOrders";
import { Placed } from "./screens/Placed";
import { Shop } from "./screens/Shop";
import { StaffArea } from "./screens/staff/StaffArea";

type View =
  | { name: "shop" | "cart" | "checkout" | "orders" }
  | { name: "placed"; order: Order }
  | { name: "staff"; initial?: StaffTab };

// Bot buttons open the app with ?screen=orders, ?screen=seller, …
function initialView(): View {
  const screen = new URLSearchParams(window.location.search).get("screen");
  if (screen === "orders" || screen === "cart") return { name: screen };
  if (screen === "seller" || screen === "driver" || screen === "admin") return { name: "staff", initial: screen };
  return { name: "shop" };
}

const SCRIPT_KEY = "afiya.script";
function storedScript(): Script | null {
  try {
    const value = localStorage.getItem(SCRIPT_KEY);
    return value === "latn" || value === "cyrl" ? value : null;
  } catch {
    return null;
  }
}

export default function App() {
  const catalog = useAsync(api.catalog);
  const me = useAsync(() => (inTelegram ? api.me() : Promise.resolve(null)));
  const [chosenScript, setChosenScript] = useState<Script | null>(storedScript);
  const script = chosenScript ?? me.data?.script ?? "latn";

  const setScript = useCallback((value: Script) => {
    setChosenScript(value);
    try {
      localStorage.setItem(SCRIPT_KEY, value);
    } catch {
      // not critical
    }
    if (inTelegram) api.setScript(value).catch(() => {}); // so bot messages use it too
  }, []);

  // If a choice made on this phone never reached the server (e.g. offline), send it again,
  // so the bot's messages come in the same script.
  const serverScript = me.data?.script;
  useEffect(() => {
    if (inTelegram && chosenScript && serverScript && chosenScript !== serverScript) {
      api.setScript(chosenScript).catch(() => {});
    }
  }, [chosenScript, serverScript]);

  return (
    <ScriptContext.Provider value={{ script, setScript }}>
      <Shell catalog={catalog} me={me} />
    </ScriptContext.Provider>
  );
}

function Shell({ catalog, me }: { catalog: AsyncState<Catalog>; me: AsyncState<Me | null> }) {
  const t = useT();
  const [view, setView] = useState<View>(initialView);
  const [cart, setCart] = useState<Cart>(loadCart);

  useEffect(() => {
    saveCart(cart);
  }, [cart]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // Telegram's back arrow walks back through the purchase steps.
  useEffect(() => {
    const back: Partial<Record<View["name"], View["name"]>> = { cart: "shop", checkout: "cart", placed: "shop" };
    const target = back[view.name];
    return setBackButton(target ? () => setView({ name: target } as View) : null);
  }, [view]);

  const products = useMemo(() => catalog.data?.products ?? [], [catalog.data]);
  const lines = useMemo(() => cartLines(cart, products), [cart, products]);
  const total = cartTotal(lines);
  const count = cartCount(lines);
  const roles = me.data?.roles ?? [];
  const showStaff = allowedStaffTabs(roles).length > 0;

  const changeQuantity = (product: Product, quantity: number) => setCart((c) => setQuantity(c, product, quantity));

  const reorder = async (order: Order) => {
    let next = cart;
    let missing = 0;
    for (const line of order.lines) {
      const product = products.find((p) => p.id === line.productId);
      if (!product || product.stock === 0) {
        missing++;
        continue;
      }
      next = setQuantity(next, product, quantityOf(next, product.id) + line.quantity);
    }
    setCart(next);
    setView({ name: "cart" });
    if (missing) await showAlert(t("Ba'zi mahsulotlar hozir sotuvda yo'q, ular savatga qo'shilmadi."));
  };

  const content = () => {
    if (catalog.error && !catalog.data) return <ErrorState message={catalog.error} onRetry={catalog.reload} />;
    if (!catalog.data) return <Loading />;

    switch (view.name) {
      case "shop":
        return <Shop catalog={catalog.data} cart={cart} cartCount={count} cartTotal={total} onQuantity={changeQuantity} onOpenCart={() => setView({ name: "cart" })} />;
      case "cart":
        return <CartScreen lines={lines} total={total} onQuantity={changeQuantity} onCheckout={() => setView({ name: "checkout" })} onShop={() => setView({ name: "shop" })} />;
      case "checkout":
        if (lines.length === 0) return <CartScreen lines={lines} total={0} onQuantity={changeQuantity} onCheckout={() => {}} onShop={() => setView({ name: "shop" })} />;
        if (inTelegram && !me.data) return me.error ? <ErrorState message={me.error} onRetry={me.reload} /> : <Loading />;
        return (
          <>
            <button type="button" className="back-link" onClick={() => setView({ name: "cart" })}>‹ {t("Savatga qaytish")}</button>
            <Checkout
              lines={lines}
              shop={catalog.data.shop}
              me={me.data ?? null}
              onPlaced={(order) => {
                setCart([]);
                me.reload(); // picks up the saved name/phone/address for next time
                catalog.reload(); // stock changed
                setView({ name: "placed", order });
              }}
            />
          </>
        );
      case "placed":
        return <Placed order={view.order} shop={catalog.data.shop} onOrders={() => setView({ name: "orders" })} onShop={() => setView({ name: "shop" })} />;
      case "orders":
        return <MyOrders meId={me.data?.id ?? 0} shop={catalog.data.shop} onReorder={reorder} onShop={() => setView({ name: "shop" })} />;
      case "staff":
        if (!me.data) return me.error ? <ErrorState message={me.error} onRetry={me.reload} /> : <Loading />;
        if (!showStaff) return <ErrorState message="Bu bo'lim faqat xodimlar uchun." onRetry={() => setView({ name: "shop" })} />;
        return <StaffArea roles={roles} meId={me.data.id} initial={view.initial} />;
    }
  };

  const hideNav = view.name === "checkout" || view.name === "placed";
  const activeTab: Tab = view.name === "checkout" || view.name === "placed" ? "cart" : view.name;

  return (
    <div className={`app${hideNav ? "" : " app--with-nav"}`}>
      <Header />
      <main className="main">{content()}</main>
      {hideNav ? null : (
        <BottomNav active={activeTab} cartCount={count} showStaff={showStaff} onChange={(tab) => setView({ name: tab } as View)} />
      )}
    </div>
  );
}
