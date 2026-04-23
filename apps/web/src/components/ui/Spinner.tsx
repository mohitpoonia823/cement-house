export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size }}
      className="border-2 border-stone-200 border-t-blue-500 rounded-full animate-spin" />
  )
}

export function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-64">
      <Spinner size={28} />
    </div>
  )
}
