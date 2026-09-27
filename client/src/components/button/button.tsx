import "./button.css";

interface ButtonProps {
  variant: "add" | "remove" | "checkout";
  title: string;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

const Button = ({ variant, title, onClick, disabled = false, label }: ButtonProps) => (
  <button className={`btn ${variant}`} onClick={onClick} disabled={disabled} aria-label={label}>
    {title}
  </button>
);

export default Button;
