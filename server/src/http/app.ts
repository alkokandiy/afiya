import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  ORDER_STATUSES,
  ROLES,
  type Catalog,
  type Me,
  type Role,
  type StaffUser,
} from "../../../shared/types.js";
import { UserError } from "../errors.js";
import type { OrderService } from "../order-service.js";
import type { Store, User } from "../store/index.js";
import { validateInitData } from "../telegram-auth.js";

export interface AppOptions {
  botToken: string;
  ownerIds: number[];
  uploadsDir: string;
  /** Built client to serve, if present. */
  clientDist?: string;
}

interface Locals {
  user: User;
  roles: Role[];
}

const locals = (res: Response) => res.locals as Locals;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new UserError(result.error.issues[0]?.message ?? "Noto'g'ri ma'lumot.");
  return result.data;
}

const idParam = (req: Request) => parse(z.coerce.number().int().positive(), req.params.id);

const productSchema = z.object({
  title: z.string().trim().min(2, "Nomini yozing.").max(80),
  titleCyr: z.string().trim().max(80),
  price: z.number().int().positive("Narx 0 dan katta bo'lsin."),
  categoryId: z.number().int().positive().nullable(),
  stock: z.number().int().min(0).nullable(),
  active: z.boolean(),
});

// Separate so that editing (partial) never resets a field to its default.
const newProductSchema = productSchema.extend({ titleCyr: z.string().trim().max(80).default("") });

const settingsSchema = z
  .object({
    phone: z.string().trim().max(40),
    pickupAddress: z.string().trim().max(300),
    pickupHours: z.string().trim().max(100),
    deliveryFee: z.number().int().min(0),
    lowStockThreshold: z.number().int().min(0).max(1000),
  })
  .partial();

const IMAGE_TYPES: { ext: string; test: (b: Buffer) => boolean }[] = [
  { ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", test: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { ext: "webp", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
];

export function createApp(store: Store, orders: OrderService, options: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  // --- auth ---

  const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const [scheme, initData] = (req.get("authorization") ?? "").split(" ");
    const tgUser = scheme === "tma" && initData ? validateInitData(initData, options.botToken) : null;
    if (!tgUser) return next(new UserError("Do'konni Telegram orqali oching.", 401));
    const user = store.users.touch(tgUser.id, tgUser.first_name ?? "", tgUser.username ?? null);
    Object.assign(res.locals, { user, roles: orders.rolesOf(user) } satisfies Locals);
    next();
  };

  const requireRole =
    (...allowed: Role[]) =>
    (_req: Request, res: Response, next: NextFunction) => {
      const { roles } = locals(res);
      if (!roles.some((role) => role === "admin" || allowed.includes(role))) {
        return next(new UserError("Bu bo'lim faqat xodimlar uchun.", 403));
      }
      next();
    };

  // --- public ---

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/catalog", (_req, res) => {
    const { phone, pickupAddress, pickupHours, deliveryFee } = store.settings.get();
    const catalog: Catalog = {
      categories: store.catalog.listCategories(),
      products: store.catalog.listProducts().map(({ active: _active, ...product }) => product),
      shop: { phone, pickupAddress, pickupHours, deliveryFee },
    };
    res.set("Cache-Control", "no-cache").json(catalog);
  });

  // --- customer ---

  const api = express.Router();
  api.use(authenticate);

  api.get("/me", (_req, res) => {
    const { user, roles } = locals(res);
    const me: Me = { id: user.id, name: user.name || user.firstName, phone: user.phone, address: user.address, script: user.script, roles };
    res.json(me);
  });

  api.patch("/me", (req, res) => {
    const { script } = parse(z.object({ script: z.enum(["latn", "cyrl"]) }), req.body);
    store.users.setScript(locals(res).user.id, script);
    res.json({ ok: true });
  });

  api.get("/orders", (_req, res) => {
    res.json(store.orders.listForUser(locals(res).user.id));
  });

  api.post("/orders", async (req, res) => {
    res.status(201).json(await orders.place(locals(res).user.id, req.body));
  });

  // Customers cancel their own orders here; staff move orders along. The service checks who may do what.
  api.post("/orders/:id/status", async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(ORDER_STATUSES) }), req.body);
    res.json(await orders.transition(idParam(req), status, locals(res).user));
  });

  // --- staff ---

  api.get("/staff/orders", requireRole("seller", "driver"), (req, res) => {
    const query = parse(
      z.object({
        status: z
          .string()
          .transform((s) => s.split(","))
          .pipe(z.array(z.enum(ORDER_STATUSES)).min(1)),
        fulfillment: z.enum(["delivery", "pickup"]).optional(),
      }),
      req.query,
    );
    res.json(store.orders.list({ statuses: query.status, fulfillment: query.fulfillment }));
  });

  // --- admin ---

  const admin = express.Router();
  admin.use(requireRole());

  admin.get("/products", (_req, res) => {
    res.json({ products: store.catalog.listProducts({ includeInactive: true }), categories: store.catalog.listCategories() });
  });

  admin.post("/products", (req, res) => {
    res.status(201).json(store.catalog.createProduct(parse(newProductSchema, req.body)));
  });

  admin.patch("/products/:id", (req, res) => {
    const product = store.catalog.updateProduct(idParam(req), parse(productSchema.partial(), req.body));
    if (!product) throw new UserError("Mahsulot topilmadi.", 404);
    res.json(product);
  });

  admin.put("/products/:id/image", express.raw({ type: "image/*", limit: "3mb" }), (req, res) => {
    const id = idParam(req);
    const product = store.catalog.getProduct(id);
    if (!product) throw new UserError("Mahsulot topilmadi.", 404);
    const body = req.body as Buffer;
    const type = Buffer.isBuffer(body) ? IMAGE_TYPES.find((t) => t.test(body)) : undefined;
    if (!type) throw new UserError("Rasm JPG, PNG yoki WEBP bo'lsin.");

    fs.mkdirSync(options.uploadsDir, { recursive: true });
    const file = `product-${id}-${Date.now()}.${type.ext}`;
    fs.writeFileSync(path.join(options.uploadsDir, file), body);
    if (product.image.startsWith("/uploads/")) {
      fs.rmSync(path.join(options.uploadsDir, path.basename(product.image)), { force: true });
    }
    store.catalog.setImage(id, `/uploads/${file}`);
    res.json(store.catalog.getProduct(id));
  });

  admin.post("/categories", (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(40) }), req.body);
    res.status(201).json(store.catalog.createCategory(name));
  });

  admin.patch("/categories/:id", (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(40) }), req.body);
    if (!store.catalog.renameCategory(idParam(req), name)) throw new UserError("Bo'lim topilmadi.", 404);
    res.json({ ok: true });
  });

  admin.delete("/categories/:id", (req, res) => {
    if (!store.catalog.deleteCategory(idParam(req))) throw new UserError("Bo'lim topilmadi.", 404);
    res.json({ ok: true });
  });

  admin.get("/staff", (_req, res) => {
    const people: StaffUser[] = store.users.listForStaffPicker(100).map((user) => ({
      id: user.id,
      displayName: user.name || user.firstName || `ID ${user.id}`,
      username: user.username,
      phone: user.phone,
      roles: orders.rolesOf(user),
      owner: options.ownerIds.includes(user.id),
    }));
    res.json(people);
  });

  admin.put("/staff/:id", (req, res) => {
    const id = idParam(req);
    const { roles } = parse(z.object({ roles: z.array(z.enum(ROLES)) }), req.body);
    if (options.ownerIds.includes(id) && !roles.includes("admin")) {
      throw new UserError("Egasi har doim admin bo'lib qoladi.");
    }
    if (!store.users.setRoles(id, [...new Set(roles)])) throw new UserError("Foydalanuvchi topilmadi.", 404);
    res.json({ ok: true });
  });

  admin.get("/settings", (_req, res) => {
    res.json(store.settings.get());
  });

  admin.patch("/settings", (req, res) => {
    res.json(store.settings.update(parse(settingsSchema, req.body)));
  });

  admin.get("/stats", (_req, res) => {
    res.json(store.orders.stats(store.settings.get().lowStockThreshold));
  });

  api.use("/admin", admin);
  app.use("/api", api);

  // --- files ---

  app.use("/uploads", express.static(options.uploadsDir, { maxAge: "30d", immutable: true }));
  if (options.clientDist && fs.existsSync(options.clientDist)) app.use(express.static(options.clientDist));

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof UserError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error?.type === "entity.too.large") {
      res.status(413).json({ error: "Fayl juda katta." });
      return;
    }
    console.error("API error:", error);
    res.status(500).json({ error: "Xatolik yuz berdi. Qayta urinib ko'ring." });
  };
  app.use(onError);

  return app;
}
