// Thin wrapper over Telegram.WebApp with browser fallbacks, so every screen also works in a normal browser.

const tg = window.Telegram?.WebApp;
const supports = (version: string) => !!tg && tg.isVersionAtLeast(version);

/** Signed login data. Telegram also passes it in the URL hash, which covers a missing telegram-web-app.js. */
export const initData =
  tg?.initData || new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData") || "";

export const inTelegram = initData !== "";

export function setup(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  if (supports("6.1")) {
    tg.setHeaderColor?.("#067d44");
    tg.setBackgroundColor?.("#f4f6f5");
  }
  // Scrolling down must not close the shop by accident.
  if (supports("7.7")) tg.disableVerticalSwipes?.();
}

export function showAlert(message: string): Promise<void> {
  if (tg && supports("6.2")) return new Promise((resolve) => tg.showAlert(message, resolve));
  window.alert(message);
  return Promise.resolve();
}

export function confirmAction(message: string): Promise<boolean> {
  if (tg && supports("6.2")) return new Promise((resolve) => tg.showConfirm(message, resolve));
  return Promise.resolve(window.confirm(message));
}

export function openLink(url: string): void {
  if (tg) tg.openLink(url);
  else window.open(url, "_blank", "noopener");
}

export function haptic(kind: "tap" | "success" | "error"): void {
  const feedback = supports("6.1") ? tg?.HapticFeedback : undefined;
  if (!feedback) return;
  if (kind === "tap") feedback.impactOccurred("light");
  else feedback.notificationOccurred(kind);
}

export const canRequestPhone = supports("6.9") && !!tg?.requestContact;

/** Asks Telegram to share the user's own phone number. Resolves null if they decline. */
export function requestPhone(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!tg?.requestContact) return resolve(null);
    tg.requestContact((ok, result) => resolve(ok ? (result?.responseUnsafe?.contact?.phone_number ?? null) : null));
  });
}

/** Current location via Telegram (8.0+) or the browser. Resolves null if unavailable or refused. */
export function requestLocation(): Promise<{ latitude: number; longitude: number } | null> {
  const manager = supports("8.0") ? tg?.LocationManager : undefined;
  if (manager) {
    return new Promise((resolve) => {
      const get = () => (manager.isLocationAvailable ? manager.getLocation(resolve) : resolve(null));
      if (manager.isInited) get();
      else manager.init(get);
    });
  }
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000 },
    ),
  );
}

/** Shows Telegram's back arrow while `onBack` is set. */
export function setBackButton(onBack: (() => void) | null): () => void {
  if (!tg || !supports("6.1")) return () => {};
  if (!onBack) {
    tg.BackButton.hide();
    return () => {};
  }
  tg.BackButton.onClick(onBack);
  tg.BackButton.show();
  return () => {
    tg.BackButton.offClick(onBack);
    tg.BackButton.hide();
  };
}
