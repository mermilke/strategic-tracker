// Shared loading spinner. Replaces the same markup copy-pasted across pages.
export default function Spinner({ py = 20 }: { py?: number }) {
  return (
    <div className="flex items-center justify-center" style={{ padding: `${py * 4}px 0` }}>
      <div
        className="w-6 h-6 rounded-full animate-spin"
        style={{ border: '2px solid #2563EB', borderTopColor: 'transparent' }}
      />
    </div>
  )
}
