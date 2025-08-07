export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('🚀 Next.js server starting...')
    
    const { initializeScheduler } = await import('@/lib/scheduler-init')
    
    await initializeScheduler()
  }
}