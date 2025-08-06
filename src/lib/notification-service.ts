import { createClient } from '@supabase/supabase-js';
import { TelegramBotService } from './telegram-bot';
import { getServiceRoleClient } from './supabase-server';

export interface NotificationData {
  userId: string;
  type: string;
  data: Record<string, any>;
  priority?: 'immediate' | 'normal' | 'low';
}

export interface NotificationPreference {
  notification_type: string;
  enabled: boolean;
  priority: string;
}

export interface TelegramConnection {
  chat_id: string;
  bot_token?: string;
  enabled: boolean;
}

export class NotificationService {
  private supabase;
  private telegramBot: TelegramBotService;

  constructor() {
    this.supabase = getServiceRoleClient();
    this.telegramBot = new TelegramBotService();
  }

  /**
   * Send a notification to a user
   */
  async sendNotification(notification: NotificationData): Promise<boolean> {
    try {
      console.log('Sending notification for user:', notification.userId);
      console.log('Notification type:', notification.type);
      
      // Check if user has telegram configured
      const connection = await this.getUserTelegramConnection(notification.userId);
      console.log('Telegram connection:', connection);
      
      if (!connection || !connection.enabled) {
        console.log(`No active Telegram connection for user ${notification.userId}`);
        return false;
      }

      // Check if this notification type is enabled
      const preference = await this.getNotificationPreference(
        notification.userId,
        notification.type
      );
      console.log('Notification preference:', preference);
      
      // For test notifications, skip preference check
      if (notification.type !== 'test_notification') {
        if (!preference || !preference.enabled) {
          console.log(`Notification type ${notification.type} disabled for user ${notification.userId}`);
          return false;
        }
      }

      // Use custom bot token if provided
      const bot = connection.bot_token 
        ? new TelegramBotService(connection.bot_token)
        : this.telegramBot;

      console.log('Using bot token:', connection.bot_token ? 'Custom' : 'Default from env');
      
      // Send the notification
      const result = await bot.sendNotification(
        connection.chat_id,
        notification.type,
        notification.data
      );
      
      console.log('Telegram send result:', result);

      // Record in history
      await this.recordNotificationHistory(
        notification.userId,
        notification.type,
        result.ok ? 'sent' : 'failed',
        notification.data
      );

      return result.ok;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }

  /**
   * Queue a notification for later sending
   */
  async queueNotification(
    notification: NotificationData,
    scheduledFor?: Date
  ): Promise<void> {
    const { error } = await this.supabase
      .from('notification_queue')
      .insert({
        user_id: notification.userId,
        notification_type: notification.type,
        message: JSON.stringify(notification.data),
        priority: notification.priority || 'normal',
        scheduled_for: scheduledFor || new Date(),
        metadata: notification.data,
      });

    if (error) {
      console.error('Failed to queue notification:', error);
      throw error;
    }
  }

  /**
   * Process queued notifications
   */
  async processQueue(): Promise<void> {
    // Get pending notifications
    const { data: notifications, error } = await this.supabase
      .from('notification_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('scheduled_for', { ascending: true })
      .limit(50);

    if (error) {
      console.error('Failed to fetch notification queue:', error);
      return;
    }

    if (!notifications || notifications.length === 0) {
      return;
    }

    // Process each notification
    for (const notification of notifications) {
      await this.processQueuedNotification(notification);
    }
  }

  /**
   * Process a single queued notification
   */
  private async processQueuedNotification(notification: any): Promise<void> {
    try {
      // Update status to processing
      await this.supabase
        .from('notification_queue')
        .update({ status: 'processing', updated_at: new Date() })
        .eq('id', notification.id);

      // Send the notification
      const success = await this.sendNotification({
        userId: notification.user_id,
        type: notification.notification_type,
        data: notification.metadata || JSON.parse(notification.message),
        priority: notification.priority,
      });

      // Update status based on result
      if (success) {
        await this.supabase
          .from('notification_queue')
          .update({
            status: 'sent',
            sent_at: new Date(),
            updated_at: new Date(),
          })
          .eq('id', notification.id);
      } else {
        // Increment retry count and set back to pending if under limit
        const newRetryCount = notification.retry_count + 1;
        const maxRetries = 3;

        await this.supabase
          .from('notification_queue')
          .update({
            status: newRetryCount < maxRetries ? 'pending' : 'failed',
            retry_count: newRetryCount,
            error_message: 'Failed to send notification',
            updated_at: new Date(),
          })
          .eq('id', notification.id);
      }
    } catch (error) {
      console.error('Error processing queued notification:', error);
      
      // Mark as failed
      await this.supabase
        .from('notification_queue')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          updated_at: new Date(),
        })
        .eq('id', notification.id);
    }
  }

  /**
   * Get user's Telegram connection
   */
  private async getUserTelegramConnection(userId: string): Promise<TelegramConnection | null> {
    const { data, error } = await this.supabase
      .from('telegram_connections')
      .select('chat_id, bot_token, enabled')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  }

  /**
   * Get user's notification preference
   */
  private async getNotificationPreference(
    userId: string,
    notificationType: string
  ): Promise<NotificationPreference | null> {
    const { data, error } = await this.supabase
      .from('notification_preferences')
      .select('notification_type, enabled, priority')
      .eq('user_id', userId)
      .eq('notification_type', notificationType)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  }

  /**
   * Record notification in history
   */
  private async recordNotificationHistory(
    userId: string,
    notificationType: string,
    status: string,
    metadata: Record<string, any>
  ): Promise<void> {
    const { error } = await this.supabase
      .from('notification_history')
      .insert({
        user_id: userId,
        notification_type: notificationType,
        message: JSON.stringify(metadata),
        status,
        metadata,
      });

    if (error) {
      console.error('Failed to record notification history:', error);
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(
    notifications: NotificationData[]
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const notification of notifications) {
      const success = await this.sendNotification(notification);
      if (success) {
        sent++;
      } else {
        failed++;
      }
    }

    return { sent, failed };
  }

  /**
   * Notify all users with a specific preference enabled
   */
  async notifyAllUsersWithPreference(
    notificationType: string,
    data: Record<string, any>
  ): Promise<{ sent: number; failed: number }> {
    // Get all users with this preference enabled
    const { data: preferences, error } = await this.supabase
      .from('notification_preferences')
      .select('user_id, priority')
      .eq('notification_type', notificationType)
      .eq('enabled', true);

    if (error || !preferences) {
      console.error('Failed to fetch preferences:', error);
      return { sent: 0, failed: 0 };
    }

    // Send notifications to each user
    const notifications = preferences.map(pref => ({
      userId: pref.user_id,
      type: notificationType,
      data,
      priority: pref.priority as 'immediate' | 'normal' | 'low',
    }));

    return this.sendBulkNotifications(notifications);
  }
}

// Export singleton instance
export const notificationService = new NotificationService();