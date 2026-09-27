import type { Product } from "./cart";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Xatolik yuz berdi. Qayta urinib ko'ring.");
  return body as T;
}

export function fetchProducts(): Promise<Product[]> {
  return request("/api/products");
}

export function submitCheckout(initData: string, items: { id: number; quantity: number }[]): Promise<void> {
  return request("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `tma ${initData}` },
    body: JSON.stringify({ items }),
  });
}
