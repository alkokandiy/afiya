import type { Product } from "../../lib/cart";
import { formatMoney } from "../../lib/cart";
import Button from "../button/button";
import "./card.css";

interface CardProps {
  product: Product;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}

const Card = ({ product, quantity, onAdd, onRemove }: CardProps) => (
  <div className="card">
    {quantity > 0 && <span className="card__badge">{quantity}</span>}

    <div className="image__container">
      <img src={product.image} alt={product.title} loading="lazy" />
    </div>
    <div className="card__body">
      <h2 className="card__title">{product.title}</h2>
      <div className="card__price">{formatMoney(product.price)}</div>
    </div>
    <div className="hr"></div>

    <div className="btn__container">
      <Button title="+" onClick={onAdd} variant="add" label={`${product.title}: qo'shish`} />
      {quantity > 0 && <Button title="-" onClick={onRemove} variant="remove" label={`${product.title}: kamaytirish`} />}
    </div>
  </div>
);

export default Card;
