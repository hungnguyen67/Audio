const baseStyle = {
  border: '1px solid #d8dde1',
  boxSizing: 'border-box',
  borderRadius: 9,
  padding: '6px 10px',
  color: '#111315',
  background: '#fff',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  font: 'inherit',
  fontSize: '.85rem',
  fontWeight: 600,
  lineHeight: 1.25,
  minWidth: 72,
  textDecoration: 'none',
};

export function ActionButton({ children, as: Element = 'button', variant = 'default', style = {}, ...props }) {
  const variantStyle = variant === 'primary'
    ? { borderColor: '#111a1e', color: '#fff', background: '#111a1e', padding: '10px 14px' }
    : variant === 'danger'
      ? { color: '#c2413b' }
      : {};

  return <Element style={{ ...baseStyle, ...variantStyle, ...style }} {...props}>{children}</Element>;
}
