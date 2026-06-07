// Little square icon button used throughout the admin lists.
export default function IBtn({ onClick, title, color, bg, bdr, size = 30, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 6, background: bg, color, border: '1px solid ' + bdr, cursor: 'pointer', padding: 0, flexShrink: 0,
    }}>{children}</button>
  )
}
