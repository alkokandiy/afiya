import { useState } from "react";
import type { Fulfillment, Me, Order, PaymentMethod, ShopInfo } from "../../../shared/types";
import { Button, ChoiceCard, Field, Money } from "../components/ui";
import { api } from "../lib/api";
import { cartTotal, type CartLine } from "../lib/cart";
import { useT } from "../lib/i18n";
import { canRequestPhone, haptic, inTelegram, requestLocation, requestPhone, showAlert } from "../lib/telegram";

type Errors = Partial<Record<"name" | "phone" | "address", string>>;

export function Checkout(props: { lines: CartLine[]; shop: ShopInfo; me: Me | null; onPlaced: (order: Order) => void }) {
  const t = useT();
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [name, setName] = useState(props.me?.name ?? "");
  const [phone, setPhone] = useState(props.me?.phone ?? "");
  const [address, setAddress] = useState(props.me?.address ?? "");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);

  const delivery = fulfillment === "delivery";
  const subtotal = cartTotal(props.lines);
  const fee = delivery ? props.shop.deliveryFee : 0;

  const validate = (): Errors => {
    const found: Errors = {};
    if (name.trim().length < 2) found.name = "Ismingizni yozing";
    if (phone.replace(/\D/g, "").length < 9) found.phone = "Telefon raqamingizni to'liq yozing";
    if (delivery && address.trim().length < 3 && !location) found.address = "Manzilni yozing yoki joylashuvni yuboring";
    return found;
  };

  const sharePhone = async () => {
    const shared = await requestPhone();
    if (shared) setPhone(shared.startsWith("+") ? shared : `+${shared}`);
  };

  const shareLocation = async () => {
    setLocating(true);
    const found = await requestLocation();
    setLocating(false);
    if (found) {
      setLocation(found);
      haptic("success");
    } else {
      await showAlert(t("Joylashuvni olib bo'lmadi. Manzilni yozib qoldiring."));
    }
  };

  const submit = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      haptic("error");
      document.querySelector(".field__error")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!inTelegram) {
      await showAlert(t("Buyurtma berish uchun do'konni Telegram orqali oching."));
      return;
    }
    setSending(true);
    try {
      const order = await api.placeOrder({
        items: props.lines.map((line) => ({ id: line.product.id, quantity: line.quantity })),
        fulfillment,
        payment,
        name,
        phone,
        address: delivery ? address : "",
        latitude: delivery ? (location?.latitude ?? null) : null,
        longitude: delivery ? (location?.longitude ?? null) : null,
        note,
      });
      haptic("success");
      props.onPlaced(order);
    } catch (error) {
      haptic("error");
      await showAlert(t((error as Error).message));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="checkout">
      <h2 className="screen-title">{t("Buyurtmani rasmiylashtirish")}</h2>

      <section className="step">
        <h3 className="step__title"><span className="step__number">1</span>{t("Qanday olasiz?")}</h3>
        <ChoiceCard
          icon="🚚"
          title={t("Uyga yetkazib berish")}
          subtitle={props.shop.deliveryFee > 0 ? <>{t("Yetkazish")}: <Money amount={props.shop.deliveryFee} /></> : t("Bepul yetkazamiz")}
          selected={delivery}
          onSelect={() => setFulfillment("delivery")}
        />
        <ChoiceCard
          icon="🏠"
          title={t("O'zim olib ketaman")}
          subtitle={props.shop.pickupAddress ? `${t(props.shop.pickupAddress)}${props.shop.pickupHours ? ` · ${props.shop.pickupHours}` : ""}` : t("Tayyor bo'lganda xabar beramiz")}
          selected={!delivery}
          onSelect={() => setFulfillment("pickup")}
        />
      </section>

      <section className="step">
        <h3 className="step__title"><span className="step__number">2</span>{t("Ma'lumotlaringiz")}</h3>
        <Field label={t("Ismingiz")} error={errors.name && t(errors.name)}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label={t("Telefon raqamingiz")} error={errors.phone && t(errors.phone)}>
          <input
            className="input"
            type="tel"
            inputMode="tel"
            placeholder="+998 90 123 45 67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </Field>
        {canRequestPhone && !phone ? (
          <Button variant="secondary" onClick={sharePhone}>📱 {t("Telegram raqamimni yuborish")}</Button>
        ) : null}

        {delivery ? (
          <>
            <Field
              label={t("Manzil")}
              hint={t("Ko'cha, uy raqami va mo'ljal")}
              error={errors.address && t(errors.address)}
            >
              <textarea className="input" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
            </Field>
            {location ? (
              <p className="notice notice--ok">
                ✅ {t("Joylashuvingiz qo'shildi")}
                <button type="button" className="link-button" onClick={() => setLocation(null)}>{t("Olib tashlash")}</button>
              </p>
            ) : (
              <Button variant="secondary" busy={locating} onClick={shareLocation}>📍 {t("Joylashuvimni yuborish")}</Button>
            )}
          </>
        ) : null}
      </section>

      <section className="step">
        <h3 className="step__title"><span className="step__number">3</span>{t("To'lov")}</h3>
        <p className="step__hint">{t(delivery ? "Pulni mahsulotni olganingizda to'laysiz." : "Pulni olib ketayotganingizda to'laysiz.")}</p>
        <ChoiceCard icon="💵" title={t("Naqd pul")} selected={payment === "cash"} onSelect={() => setPayment("cash")} />
        <ChoiceCard icon="💳" title={t("Kartaga o'tkazma")} subtitle={t("Click, Payme yoki bank ilovasi orqali")} selected={payment === "transfer"} onSelect={() => setPayment("transfer")} />
      </section>

      <Field label={t("Izoh (shart emas)")}>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Masalan: soat 18:00 dan keyin")} />
      </Field>

      <div className="card summary">
        <p>
          <span>{t("Mahsulotlar")}</span> <Money amount={subtotal} />
        </p>
        {delivery ? (
          <p>
            <span>{t("Yetkazish")}</span> {fee > 0 ? <Money amount={fee} /> : t("Bepul")}
          </p>
        ) : null}
        <p className="summary__total">
          <span>{t("Jami")}</span> <Money amount={subtotal + fee} />
        </p>
      </div>

      <div className="action-bar">
        <Button size="large" busy={sending} onClick={submit}>
          ✅ {t("Buyurtmani tasdiqlash")}
        </Button>
      </div>
    </div>
  );
}
