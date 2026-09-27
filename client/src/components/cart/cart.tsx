import { formatMoney } from "../../lib/cart";
import Button from "../button/button";
import "./cart.css";

interface CartProps {
  total: number;
  disabled: boolean;
  onCheckout: () => void;
}

const Cart = ({ total, disabled, onCheckout }: CartProps) => (
  <div className="cart__container">
    <p className="cart__price">Umumiy narx: {formatMoney(total)}</p>
    <Button title="Buyurtma berish" disabled={disabled} variant="checkout" onClick={onCheckout} />
  </div>
);

export default Cart;
