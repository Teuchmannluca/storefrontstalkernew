import { createClient } from '@supabase/supabase-js';

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'Markdown' | 'HTML';
  disable_notification?: boolean;
}

interface TelegramResponse {
  ok: boolean;
  result?: any;
  description?: string;
}

export class TelegramBotService {
  private botToken: string;
  private baseUrl: string;
  private rateLimitDelay = 35; // 35ms between messages (safe under 30/sec limit)
  private lastMessageTime = 0;

  constructor(botToken?: string) {
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  /**
   * Send a message to a Telegram chat
   */
  async sendMessage(
    chatId: string | number,
    text: string,
    options?: {
      parseMode?: 'Markdown' | 'HTML';
      disableNotification?: boolean;
    }
  ): Promise<TelegramResponse> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastMessage = now - this.lastMessageTime;
    if (timeSinceLastMessage < this.rateLimitDelay) {
      await this.delay(this.rateLimitDelay - timeSinceLastMessage);
    }
    this.lastMessageTime = Date.now();

    // Convert chat ID to proper format (support both user chats and groups)
    const formattedChatId = typeof chatId === 'string' ? chatId : chatId.toString();

    const message: TelegramMessage = {
      chat_id: formattedChatId,
      text: this.formatMessage(text),
      parse_mode: options?.parseMode || 'Markdown',
      disable_notification: options?.disableNotification || false,
    };

    try {
      console.log('Sending Telegram message to chat:', formattedChatId);
      console.log('Bot token configured:', this.botToken ? 'Yes' : 'No');
      
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const data = await response.json();
      
      if (!data.ok) {
        console.error('Telegram API error:', data);
        console.error('Failed message:', message);
      } else {
        console.log('Message sent successfully to:', formattedChatId);
      }

      return data;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      return {
        ok: false,
        description: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send a message with retry logic
   */
  async sendMessageWithRetry(
    chatId: string | number,
    text: string,
    maxRetries = 3,
    options?: {
      parseMode?: 'Markdown' | 'HTML';
      disableNotification?: boolean;
    }
  ): Promise<TelegramResponse> {
    let lastError: TelegramResponse = { ok: false, description: 'Max retries exceeded' };

    for (let i = 0; i < maxRetries; i++) {
      const result = await this.sendMessage(chatId, text, options);
      
      if (result.ok) {
        return result;
      }

      lastError = result;
      
      // Exponential backoff
      if (i < maxRetries - 1) {
        await this.delay(Math.pow(2, i) * 1000);
      }
    }

    return lastError;
  }

  /**
   * Verify bot token and get bot info
   */
  async verifyBot(): Promise<TelegramResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/getMe`);
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        ok: false,
        description: error instanceof Error ? error.message : 'Failed to verify bot',
      };
    }
  }

  /**
   * Get updates (for finding chat ID)
   */
  async getUpdates(offset?: number): Promise<TelegramResponse> {
    try {
      const url = offset 
        ? `${this.baseUrl}/getUpdates?offset=${offset}`
        : `${this.baseUrl}/getUpdates`;
      
      const response = await fetch(url);
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        ok: false,
        description: error instanceof Error ? error.message : 'Failed to get updates',
      };
    }
  }

  /**
   * Format message with proper escaping for Markdown
   */
  private formatMessage(text: string): string {
    // Escape special Markdown characters if not already formatted
    const hasMarkdown = /[\*_\[\]()~`>#\+\-=|{}\.!]/.test(text);
    
    if (!hasMarkdown) {
      // If no markdown detected, escape special characters
      return text.replace(/([_*\[\]()~`>#\+\-=|{}\.!])/g, '\\$1');
    }
    
    return text;
  }

  /**
   * Send bulk messages with rate limiting
   */
  async sendBulkMessages(
    messages: Array<{ chatId: string; text: string }>,
    options?: {
      parseMode?: 'Markdown' | 'HTML';
      disableNotification?: boolean;
    }
  ): Promise<Array<{ chatId: string; result: TelegramResponse }>> {
    const results = [];

    for (const message of messages) {
      const result = await this.sendMessageWithRetry(
        message.chatId,
        message.text,
        3,
        options
      );
      
      results.push({
        chatId: message.chatId,
        result,
      });
    }

    return results;
  }

  /**
   * Helper function for delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send notification with template
   */
  async sendNotification(
    chatId: string | number,
    type: string,
    data: Record<string, any>
  ): Promise<TelegramResponse> {
    const message = this.getNotificationTemplate(type, data);
    return this.sendMessageWithRetry(chatId, message, 3);
  }

  /**
   * Get notification template
   */
  private getNotificationTemplate(type: string, data: Record<string, any>): string {
    const templates: Record<string, (data: any) => string> = {
      // Test notification
      test_notification: (d) =>
        `🔔 *Test Notification*\n\n` +
        `✅ Your Telegram connection is working!\n` +
        `User: ${d.user || 'Unknown'}\n` +
        `Time: ${new Date(d.timestamp).toLocaleString()}`,
      
      // Storefront notifications
      storefront_added: (d) => 
        `🏪 *New Storefront Added*\n\n` +
        `Name: ${d.name}\n` +
        `Products: ${d.productCount || 0}\n` +
        `Added: ${new Date().toLocaleString()}`,
      
      products_sync_complete: (d) =>
        `📦 *Sync Complete*\n\n` +
        `Storefront: ${d.storefrontName}\n` +
        `➕ Added: ${d.productsAdded || 0}\n` +
        `➖ Removed: ${d.productsRemoved || 0}\n` +
        `Total: ${d.totalProducts || 0} products`,
      
      new_products_found: (d) =>
        `🆕 *New Products Found*\n\n` +
        `Storefront: ${d.storefrontName}\n` +
        `New ASINs: ${d.count}\n` +
        `View in dashboard to analyze`,
      
      // Arbitrage notifications
      high_profit_deal: (d) => {
        const profitLevel = d.profit >= 20 ? '🚀 MEGA PROFIT' : d.profit >= 10 ? '💰 HIGH PROFIT' : '💵 GOOD PROFIT';
        const urgency = d.roi >= 100 ? '⚡ ACT FAST!' : d.roi >= 50 ? '🔥 HOT DEAL!' : '📈 Good opportunity';
        
        return `${profitLevel} ALERT\n\n` +
               `📦 *${d.productName}*\n` +
               `🔗 ASIN: \`${d.asin}\`\n\n` +
               `💵 *Profit: £${d.profit.toFixed(2)}*\n` +
               `📊 *ROI: ${d.roi.toFixed(1)}%*\n\n` +
               `🛒 *Buy:* ${d.sourceMarket} @ £${d.sourcePrice.toFixed(2)}\n` +
               `🇬🇧 *Sell:* UK @ £${d.targetPrice.toFixed(2)}\n\n` +
               `${urgency}`;
      },
      
      scan_complete: (d) => {
        const hasResults = d.profitableCount > 0 && d.totalProfit > 0;
        
        if (!hasResults) {
          return `🏁 *Scan Complete*\n\n` +
                 `📊 *${d.scanType}*\n` +
                 `Products Analyzed: ${d.productsAnalyzed}\n` +
                 `Result: No profitable opportunities found\n\n` +
                 `💡 Try analyzing different products or check price changes.`;
        }
        
        return `🏁 *Scan Complete*\n\n` +
               `📊 *${d.scanType}*\n` +
               `📈 Products Analyzed: ${d.productsAnalyzed}\n` +
               `💰 Profitable Deals: ${d.profitableCount}\n` +
               `💵 Total Profit: *£${d.totalProfit.toFixed(2)}*\n` +
               `🎯 Best Deal: £${d.bestProfit.toFixed(2)} (${d.bestRoi.toFixed(1)}% ROI)\n\n` +
               `🔥 ${d.profitableCount === 1 ? 'Deal' : 'Deals'} ready for analysis!`;
      },
      
      price_change_alert: (d) =>
        `📈 *Price Change Alert*\n\n` +
        `ASIN: \`${d.asin}\`\n` +
        `Product: ${d.productName}\n` +
        `Market: ${d.market}\n` +
        `Old Price: £${d.oldPrice.toFixed(2)}\n` +
        `New Price: £${d.newPrice.toFixed(2)}\n` +
        `Change: ${d.changePercent > 0 ? '📈' : '📉'} ${Math.abs(d.changePercent).toFixed(1)}%`,
      
      // System notifications
      scheduled_task_complete: (d) =>
        `⏰ *Scheduled Task Complete*\n\n` +
        `Task: ${d.taskName}\n` +
        `Status: ✅ Success\n` +
        `Duration: ${d.duration}ms\n` +
        `Next Run: ${d.nextRun}`,
      
      api_quota_warning: (d) =>
        `⚠️ *API Quota Warning*\n\n` +
        `API: ${d.apiName}\n` +
        `Usage: ${d.percentage}%\n` +
        `Remaining: ${d.remaining}/${d.total}\n` +
        `Reset: ${d.resetTime}`,
      
      keepa_token_low: (d) =>
        `🔄 *Low Keepa Tokens*\n\n` +
        `Available: ${d.available}/${d.total}\n` +
        `Regeneration: ${d.regenerationRate} tokens/min\n` +
        `Full in: ${d.minutesToFull} minutes`,
    };

    const template = templates[type];
    return template ? template(data) : `📢 ${type}: ${JSON.stringify(data)}`;
  }
}

// Export singleton instance
export const telegramBot = new TelegramBotService();