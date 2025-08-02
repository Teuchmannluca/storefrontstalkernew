import { injectable } from 'tsyringe';

export interface StreamMessage {
  type: 'progress' | 'opportunity' | 'complete' | 'error';
  data: any;
}

@injectable()
export class StreamingService {
  createSSEStream<T>(
    generator: AsyncGenerator<T>,
    messageTransformer: (item: T) => StreamMessage
  ): ReadableStream {
    return new ReadableStream({
      async start(controller) {
        let isControllerClosed = false;
        
        // Track controller state
        const originalClose = controller.close.bind(controller);
        controller.close = () => {
          isControllerClosed = true;
          originalClose();
        };
        
        const sendMessage = (message: StreamMessage) => {
          if (isControllerClosed) {
            console.log('[STREAM] Controller is closed, skipping message:', message.type);
            return;
          }
          
          try {
            const data = `data: ${JSON.stringify(message)}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          } catch (error: any) {
            if (error.code === 'ERR_INVALID_STATE' || error.message?.includes('Controller is already closed')) {
              console.log('[STREAM] Controller closed during message send');
              isControllerClosed = true;
            } else {
              console.error('[STREAM] Error sending message:', error);
            }
          }
        };

        try {
          for await (const item of generator) {
            const message = messageTransformer(item);
            sendMessage(message);
          }
        } catch (error: any) {
          if (!isControllerClosed) {
            sendMessage({
              type: 'error',
              data: {
                error: error.message || 'An unexpected error occurred',
                code: error.code || 'UNKNOWN_ERROR'
              }
            });
          }
        } finally {
          if (!isControllerClosed) {
            controller.close();
          }
        }
      }
    });
  }

  createSSEResponse(stream: ReadableStream): Response {
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }
}