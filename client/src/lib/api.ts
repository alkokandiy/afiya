import type {
  AdminProduct,
  Catalog,
  Category,
  Me,
  Order,
  OrderStatus,
  PlaceOrderRequest,
  Role,
  Script,
  Settings,
  StaffUser,
  Stats,
} from "../../../shared/types";
import { initData } from "./telegram";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (initData) headers.Authorization = `tma ${initData}`;
  let payload: BodyInit | undefined;
  if (body instanceof Blob) {
    headers["Content-Type"] = body.type;
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new ApiError("Internet aloqasi yo'q. Qayta urinib ko'ring.", 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? "Xatolik yuz berdi. Qayta urinib ko'ring.", res.status);
  return json as T;
}

export const api = {
  catalog: () => request<Catalog>("GET", "/api/catalog"),
  me: () => request<Me>("GET", "/api/me"),
  setScript: (script: Script) => request("PATCH", "/api/me", { script }),
  myOrders: () => request<Order[]>("GET", "/api/orders"),
  placeOrder: (order: PlaceOrderRequest) => request<Order>("POST", "/api/orders", order),
  setStatus: (id: number, status: OrderStatus) => request<Order>("POST", `/api/orders/${id}/status`, { status }),
  staffOrders: (statuses: OrderStatus[], fulfillment?: "delivery" | "pickup") =>
    request<Order[]>("GET", `/api/staff/orders?status=${statuses.join(",")}${fulfillment ? `&fulfillment=${fulfillment}` : ""}`),

  admin: {
    products: () => request<{ products: AdminProduct[]; categories: Category[] }>("GET", "/api/admin/products"),
    createProduct: (product: Omit<AdminProduct, "id" | "image">) => request<AdminProduct>("POST", "/api/admin/products", product),
    updateProduct: (id: number, changes: Partial<AdminProduct>) => request<AdminProduct>("PATCH", `/api/admin/products/${id}`, changes),
    uploadImage: (id: number, image: Blob) => request<AdminProduct>("PUT", `/api/admin/products/${id}/image`, image),
    createCategory: (name: string) => request<Category>("POST", "/api/admin/categories", { name }),
    renameCategory: (id: number, name: string) => request("PATCH", `/api/admin/categories/${id}`, { name }),
    deleteCategory: (id: number) => request("DELETE", `/api/admin/categories/${id}`),
    staff: () => request<StaffUser[]>("GET", "/api/admin/staff"),
    setRoles: (id: number, roles: Role[]) => request("PUT", `/api/admin/staff/${id}`, { roles }),
    settings: () => request<Settings>("GET", "/api/admin/settings"),
    updateSettings: (changes: Partial<Settings>) => request<Settings>("PATCH", "/api/admin/settings", changes),
    stats: () => request<Stats>("GET", "/api/admin/stats"),
  },
};
