import { useState } from "react";
import { toCyrillic } from "../../../../../shared/translit";
import type { AdminProduct, Category } from "../../../../../shared/types";
import { Button, ErrorState, Field, Loading, Money, ProductImage } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useT, useTitle } from "../../../lib/i18n";
import { shrinkImage } from "../../../lib/image";
import { confirmAction, haptic, showAlert } from "../../../lib/telegram";
import { useAsync } from "../../../lib/use-async";

type Draft = Omit<AdminProduct, "id" | "image"> & { id?: number; image: string };

const emptyDraft = (categoryId: number | null): Draft => ({
  title: "",
  titleCyr: "",
  price: 0,
  categoryId,
  stock: null,
  active: true,
  image: "",
});

function ProductForm(props: { draft: Draft; categories: Category[]; onDone: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState(props.draft);
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await shrinkImage(file);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch (error) {
      await showAlert(t((error as Error).message));
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const fields = { title: draft.title, titleCyr: draft.titleCyr, price: draft.price, categoryId: draft.categoryId, stock: draft.stock, active: draft.active };
      const saved = draft.id ? await api.admin.updateProduct(draft.id, fields) : await api.admin.createProduct(fields);
      if (photo) await api.admin.uploadImage(saved.id, photo.blob);
      haptic("success");
      props.onDone();
    } catch (error) {
      haptic("error");
      await showAlert(t((error as Error).message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <h2 className="screen-title">{draft.id ? t("Mahsulotni tahrirlash") : t("Yangi mahsulot")}</h2>

      <div className="photo-picker">
        <ProductImage src={photo?.preview ?? draft.image} alt="" />
        <label className="btn btn--secondary btn--normal">
          📷 {t(draft.image || photo ? "Rasmni almashtirish" : "Rasm qo'shish")}
          <input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </label>
      </div>

      <Field label={t("Nomi (lotincha)")}>
        <input className="input" value={draft.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label={t("Nomi (kirillcha, shart emas)")} hint={t("Bo'sh qolsa, avtomatik o'giriladi. Brend nomlari uchun qo'lda yozing.")}>
        <input className="input" value={draft.titleCyr} placeholder={draft.title ? toCyrillic(draft.title) : ""} onChange={(e) => set("titleCyr", e.target.value)} />
      </Field>
      <Field label={t("Narxi (so'm)")}>
        <input className="input" type="number" inputMode="numeric" min={0} value={draft.price || ""} onChange={(e) => set("price", Number(e.target.value) || 0)} />
      </Field>
      <Field label={t("Bo'lim")}>
        <select className="input" value={draft.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value ? Number(e.target.value) : null)}>
          <option value="">{t("— Bo'limsiz —")}</option>
          {props.categories.map((c) => (
            <option key={c.id} value={c.id}>{t(c.name)}</option>
          ))}
        </select>
      </Field>

      <label className="checkbox">
        <input type="checkbox" checked={draft.stock !== null} onChange={(e) => set("stock", e.target.checked ? 0 : null)} />
        {t("Qoldiqni hisoblash")}
      </label>
      {draft.stock !== null ? (
        <Field label={t("Omborda (dona)")} hint={t("Har buyurtmada avtomatik kamayadi, bekor qilinsa qaytadi")}>
          <input className="input" type="number" inputMode="numeric" min={0} value={draft.stock} onChange={(e) => set("stock", Math.max(0, Number(e.target.value) || 0))} />
        </Field>
      ) : null}

      <label className="checkbox">
        <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
        {t("Do'konda ko'rsatish")}
      </label>

      <Button size="large" busy={saving} onClick={save}>{t("Saqlash")}</Button>
      <Button variant="ghost" onClick={props.onDone}>{t("Bekor qilish")}</Button>
    </div>
  );
}

function CategoryRow(props: { category: Category; run: (action: () => Promise<unknown>) => Promise<void> }) {
  const t = useT();
  const { category, run } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  if (editing) {
    return (
      <li className="inline-form">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Button
          wide={false}
          disabled={name.trim().length < 2}
          onClick={() => run(() => api.admin.renameCategory(category.id, name.trim())).then(() => setEditing(false))}
        >
          ✓
        </Button>
      </li>
    );
  }
  return (
    <li className="category-row">
      <span>{t(category.name)}</span>
      <span>
        <button type="button" className="link-button" aria-label={t("Nomini o'zgartirish")} onClick={() => setEditing(true)}>✏️</button>
        <button
          type="button"
          className="link-button"
          aria-label={t("O'chirish")}
          onClick={async () => {
            if (await confirmAction(t(`«${category.name}» bo'limini o'chirasizmi? Mahsulotlari bo'limsiz qoladi.`))) {
              await run(() => api.admin.deleteCategory(category.id));
            }
          }}
        >
          🗑
        </button>
      </span>
    </li>
  );
}

function Categories(props: { categories: Category[]; onChanged: () => void }) {
  const t = useT();
  const [name, setName] = useState("");

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      props.onChanged();
    } catch (error) {
      await showAlert(t((error as Error).message));
    }
  };

  return (
    <div className="card">
      <h3 className="card__title">{t("Bo'limlar")}</h3>
      <ul className="plain-list">
        {props.categories.map((c) => (
          <CategoryRow key={c.id} category={c} run={run} />
        ))}
      </ul>
      <div className="inline-form">
        <input className="input" placeholder={t("Yangi bo'lim nomi")} value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          wide={false}
          disabled={name.trim().length < 2}
          onClick={() => run(async () => { await api.admin.createCategory(name.trim()); setName(""); })}
        >
          + {t("Qo'shish")}
        </Button>
      </div>
    </div>
  );
}

/** Tap the stock to type the new count — the everyday "we restocked" action. */
function StockEditor(props: { product: AdminProduct; onSaved: () => void }) {
  const t = useT();
  const { product } = props;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(product.stock ?? ""));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const stock = value.trim() === "" ? null : Number(value);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return showAlert(t("Butun son yozing"));
    setSaving(true);
    try {
      await api.admin.updateProduct(product.id, { stock });
      haptic("success");
      setEditing(false);
      props.onSaved();
    } catch (error) {
      await showAlert(t((error as Error).message));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="inline-form">
        <input
          className="input input--small"
          type="number"
          inputMode="numeric"
          min={0}
          placeholder={t("bo'sh = hisoblanmaydi")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <Button wide={false} busy={saving} onClick={save}>✓</Button>
      </div>
    );
  }
  return (
    <button type="button" className={`stock-pill${product.stock === 0 ? " stock-pill--out" : ""}`} onClick={() => setEditing(true)}>
      {product.stock === null ? t("Qoldiq kiritish") : product.stock === 0 ? t("Tugagan") : `${t("Qoldiq")}: ${product.stock}`} ✏️
    </button>
  );
}

export function Products() {
  const t = useT();
  const title = useTitle();
  const data = useAsync(api.admin.products);
  const [editing, setEditing] = useState<Draft | null>(null);

  if (data.error && !data.data) return <ErrorState message={data.error} onRetry={data.reload} />;
  if (!data.data) return <Loading />;
  const { products, categories } = data.data;

  if (editing) {
    return (
      <ProductForm
        draft={editing}
        categories={categories}
        onDone={() => {
          setEditing(null);
          data.reload();
        }}
      />
    );
  }

  return (
    <div className="stack">
      <Button size="large" onClick={() => setEditing(emptyDraft(categories[0]?.id ?? null))}>+ {t("Yangi mahsulot")}</Button>
      {products.map((product) => (
        <div key={product.id} className={`card admin-product${product.active ? "" : " admin-product--hidden"}`}>
          <ProductImage src={product.image} alt="" />
          <div className="admin-product__body">
            <p className="admin-product__title">{title(product)}</p>
            <p><Money amount={product.price} /></p>
            <p className="muted">
              {t(categories.find((c) => c.id === product.categoryId)?.name ?? "Bo'limsiz")}
              {product.active ? "" : ` · ${t("Yashirilgan")}`}
            </p>
            <StockEditor product={product} onSaved={data.reload} />
          </div>
          <Button variant="secondary" wide={false} onClick={() => setEditing({ ...product })}>✏️</Button>
        </div>
      ))}
      <Categories categories={categories} onChanged={data.reload} />
    </div>
  );
}
