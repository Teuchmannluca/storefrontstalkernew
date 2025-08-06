import { NextRequest, NextResponse } from 'next/server';
import { TelegramBotService } from '@/lib/telegram-bot';

export async function POST(request: NextRequest) {
  try {
    const { botToken } = await request.json();
    
    const bot = botToken 
      ? new TelegramBotService(botToken)
      : new TelegramBotService();

    const result = await bot.getUpdates();

    if (result.ok && result.result && result.result.length > 0) {
      // Get the most recent message
      const latestUpdate = result.result[result.result.length - 1];
      
      if (latestUpdate.message) {
        const chatId = latestUpdate.message.chat.id.toString();
        const username = latestUpdate.message.chat.username;
        const firstName = latestUpdate.message.chat.first_name;
        
        return NextResponse.json({ 
          success: true, 
          chatId,
          username,
          firstName
        });
      }
    }

    return NextResponse.json({ 
      success: false, 
      error: 'No messages found. Please send a message to your bot first.' 
    });
  } catch (error) {
    console.error('Get chat ID error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get chat ID' },
      { status: 500 }
    );
  }
}