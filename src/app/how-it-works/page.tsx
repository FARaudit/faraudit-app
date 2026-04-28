export default function HowItWorksPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#f0f4f8' }}>
      <div style={{ height: 64 }} />
      <iframe
        src="/lifecycle/index.html"
        style={{ width: '100%', minHeight: '100vh', border: 'none', display: 'block' }}
        title="FARaudit — Federal Acquisition Lifecycle"
      />
    </main>
  )
}
