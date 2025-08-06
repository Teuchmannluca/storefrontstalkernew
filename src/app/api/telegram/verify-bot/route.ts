import { NextRequest, NextResponse } from 'next/server';
import { TelegramBotService } from '@/lib/telegram-bot';

export async function POST(request: NextRequest) {
  try {
    const { botToken } = await request.json();
    
    if (!botToken) {
      // Use default bot
      return NextResponse.json({ success: true, usingDefault: true });
    }

    const bot = new TelegramBotService(botToken);
    const result = await bot.verifyBot();

    if (result.ok) {
      return NextResponse.json({ 
        success: true, 
        bot: result.result 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.description 
      });
    }
  } catch (error) {
    console.error('Bot verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify bot' },
      { status: 500 }
    );
  }
}