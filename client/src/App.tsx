import { useCallback, useEffect, useState } from "react";
import "./App.css";
import Card from "./components/card/card";
import Cart from "./components/cart/cart";
import { fetchProducts, submitCheckout } from "./lib/api";
import { addItem, formatMoney, quantityOf, removeItem, toCheckoutItems, totalPrice, type CartLine, type Product } from "./lib/cart";

const telegram = window.Telegram?.WebApp;

type Catalog = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; products: Product[] };

const App = () => {
  const [catalog, setCatalog] = useState<Catalog>({ status: "loading" });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const total = totalPrice(cart);

  const loadProducts = useCallback(() => {
    fetchProducts()
      .then((products) => setCatalog({ status: "ready", products }))
      .catch((error: Error) => setCatalog({ status: "error", message: error.message }));
  }, []);

  useEffect(() => {
    telegram?.ready();
    telegram?.expand();
    loadProducts();
  }, [loadProducts]);

  const retryProducts = () => {
    setCatalog({ status: "loading" });
    loadProducts();
  };

  const onCheckout = useCallback(async () => {
    if (cart.length === 0 || submitting) return;
    const items = toCheckoutItems(cart);
    const alert = (message: string) => (telegram ? telegram.showAlert(message) : window.alert(message));

    if (!telegram) return alert("Iltimos, do'konni Telegram orqali oching.");
    // Opened from the bot's keyboard button: Telegram delivers the cart to the bot and closes the app.
    if (!telegram.initData) return telegram.sendData(JSON.stringify({ items }));

    // Opened from an inline or menu button: send it to the server, which continues the chat with the bot.
    setSubmitting(true);
    telegram.MainButton.showProgress();
    try {
      await submitCheckout(telegram.initData, items);
      telegram.close();
    } catch (error) {
      alert((error as Error).message);
    } finally {
      telegram.MainButton.hideProgress();
      setSubmitting(false);
    }
  }, [cart, submitting]);

  useEffect(() => {
    if (!telegram) return;
    const button = telegram.MainButton;
    if (cart.length === 0) {
      button.hide();
      return;
    }
    button.setText(`Buyurtma berish · ${formatMoney(total)}`);
    button.show();
    button.onClick(onCheckout);
    return () => button.offClick(onCheckout);
  }, [cart.length, total, onCheckout]);

  return (
    <>
      <header className="header">
        <img className="header__bg" src="/img/header.webp" alt="" />
        <img className="header__logo" src="/img/logo.webp" alt="Afiya" />
      </header>
      <h1 className="heading">Afiya Market</h1>
      <Cart total={total} disabled={cart.length === 0 || submitting} onCheckout={onCheckout} />

      {catalog.status === "loading" && <p className="status">Yuklanmoqda…</p>}
      {catalog.status === "error" && (
        <div className="status">
          <p>{catalog.message}</p>
          <button className="btn checkout" onClick={retryProducts}>
            Qayta urinish
          </button>
        </div>
      )}
      {catalog.status === "ready" && (
        <div className="cards_container">
          {catalog.products.map((product) => (
            <Card
              key={product.id}
              product={product}
              quantity={quantityOf(cart, product.id)}
              onAdd={() => setCart((current) => addItem(current, product))}
              onRemove={() => setCart((current) => removeItem(current, product.id))}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default App;
