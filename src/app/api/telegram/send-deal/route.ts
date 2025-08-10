import { NextRequest, NextResponse } from 'next/server'
import { TelegramBotService } from '@/lib/telegram-bot'
import { validateApiRequest } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const user = await validateApiRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, chatId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const bot = new TelegramBotService()
    
    // Use provided chatId or get from user's saved settings
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID || '-1002836176596'
    
    const result = await bot.sendMessage(targetChatId, message, {
      parseMode: 'Markdown',
      disableNotification: false
    })

    if (result.ok) {
      return NextResponse.json({ 
        success: true, 
        message: 'Deal sent to Telegram successfully' 
      })
    } else {
      console.error('Telegram send failed:', result)
      return NextResponse.json({ 
        error: 'Failed to send to Telegram',
        details: result.description 
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Telegram send error:', error)
    return NextResponse.json({ 
      error: 'Failed to send message',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}