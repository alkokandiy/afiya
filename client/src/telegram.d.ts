// The subset of https://core.telegram.org/bots/webapps this app uses. Newer methods are optional:
// older Telegram apps don't have them.
interface TelegramBackButton {
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

interface TelegramLocationManager {
  isInited: boolean;
  isLocationAvailable: boolean;
  init(callback?: () => void): void;
  getLocation(callback: (data: { latitude: number; longitude: number } | null) => void): void;
}

interface TelegramWebApp {
  initData: string;
  version: string;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  disableVerticalSwipes?(): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback: (ok: boolean) => void): void;
  openLink(url: string): void;
  requestContact?(callback: (ok: boolean, result?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void): void;
  LocationManager?: TelegramLocationManager;
  BackButton: TelegramBackButton;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "success" | "error" | "warning"): void;
  };
}

interface Window {
  Telegram?: { WebApp: TelegramWebApp };
}
