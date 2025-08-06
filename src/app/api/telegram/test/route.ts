import { NextRequest, NextResponse } from 'next/server';
import { validateApiRequest } from '@/lib/auth';
import { notificationService } from '@/lib/notification-service';

export async function POST(request: NextRequest) {
  try {
    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Send test notification
    const success = await notificationService.sendNotification({
      userId: user.id,
      type: 'test_notification',
      data: {
        message: 'Test notification from Storefront Stalker',
        timestamp: new Date().toISOString(),
        user: user.email
      }
    });

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to send notification. Please check your Telegram connection.' 
      });
    }
  } catch (error) {
    console.error('Test notification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}