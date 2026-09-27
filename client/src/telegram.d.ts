// The subset of https://core.telegram.org/bots/webapps#initializing-mini-apps this app uses.
interface TelegramBottomButton {
  setText(text: string): void;
  show(): void;
  hide(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

interface TelegramWebApp {
  initData: string;
  ready(): void;
  expand(): void;
  close(): void;
  sendData(data: string): void;
  showAlert(message: string): void;
  MainButton: TelegramBottomButton;
}

interface Window {
  Telegram?: { WebApp: TelegramWebApp };
}
