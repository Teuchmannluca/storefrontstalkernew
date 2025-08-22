import { NextRequest, NextResponse } from 'next/server';
import { getSellerAmpScraper, SellerAmpRequest } from '@/services/selleramp-scraper';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest, AuthError } from '@/lib/auth';
import { checkEnvVars } from '@/lib/env-check';

// Rate limiting storage (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 50; // batch requests per hour per user
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT) {
    return false;
  }

  userLimit.count += 1;
  return true;
}

interface BatchFetchRequest {
  asins: Array<{
    asin: string;
    costPrice: number;
    salePrice: number;
  }>;
  username: string;
  password: string;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Create a ReadableStream for streaming response
  const stream = new ReadableStream({
    start(controller) {
      processBatchFetch(request, controller, encoder);
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}

async function processBatchFetch(
  request: NextRequest, 
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
) {
  try {
    // Parse request body
    const body = await request.json();
    const { asins, username, password }: BatchFetchRequest = body;

    // Validate required fields
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'error',
        data: { error: 'Missing or empty asins array' }
      })}\n\n`));
      controller.close();
      return;
    }

    if (!username || !password) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'error',
        data: { error: 'Missing username or password' }
      })}\n\n`));
      controller.close();
      return;
    }

    // Validate ASIN format for all items
    for (const item of asins) {
      if (!item.asin || !/^[A-Z0-9]{10}$/.test(item.asin)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          data: { error: `Invalid ASIN format: ${item.asin}` }
        })}\n\n`));
        controller.close();
        return;
      }
    }

    // Validate authentication
    const user = await validateApiRequest(request);
    
    // Check environment variables
    const envCheck = checkEnvVars({
      supabase: { url: true, serviceKey: true }
    });

    if (!envCheck.success) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'error',
        data: { error: 'Service temporarily unavailable' }
      })}\n\n`));
      controller.close();
      return;
    }

    const supabase = createClient(
      envCheck.values.supabaseUrl,
      envCheck.values.supabaseServiceKey
    );

    // Check rate limiting
    if (!checkRateLimit(user.id)) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        type: 'error',
        data: { error: `Rate limit exceeded. Maximum ${RATE_LIMIT} batch requests per hour.` }
      })}\n\n`));
      controller.close();
      return;
    }

    // Send initial progress
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
      type: 'progress',
      data: {
        message: 'Starting batch SPM fetch...',
        processed: 0,
        total: asins.length,
        progress: 0
      }
    })}\n\n`));

    // Initialize scraper
    const scraper = await getSellerAmpScraper();
    let successCount = 0;
    let errorCount = 0;
    const results: any[] = [];

    // Process each ASIN
    for (let i = 0; i < asins.length; i++) {
      const item = asins[i];
      
      try {
        // Send progress update
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'progress',
          data: {
            message: `Processing ASIN ${item.asin}...`,
            processed: i,
            total: asins.length,
            progress: Math.round((i / asins.length) * 100),
            currentAsin: item.asin
          }
        })}\n\n`));

        // Check cache first
        const { data: cachedResult } = await supabase
          .from('selleramp_spm_cache')
          .select('*')
          .eq('asin', item.asin)
          .eq('user_id', user.id)
          .gte('fetched_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // 1 hour cache
          .single();

        let spmValue: string;
        let source: string;

        if (cachedResult) {
          spmValue = cachedResult.spm_value;
          source = 'cache';
          console.log(`Using cached SPM for ${item.asin}: ${spmValue}`);
        } else {
          // Fetch from SellerAmp
          const scraperRequest: SellerAmpRequest = {
            asin: item.asin,
            costPrice: Number(item.costPrice),
            salePrice: Number(item.salePrice),
            credentials: {
              username: String(username),
              password: String(password)
            }
          };

          const result = await scraper.fetchSPM(scraperRequest);
          
          if (result.success && result.spm) {
            spmValue = result.spm;
            source = 'selleramp';

            // Cache the result
            try {
              await supabase
                .from('selleramp_spm_cache')
                .upsert({
                  asin: item.asin,
                  spm_value: spmValue,
                  user_id: user.id,
                  cost_price: item.costPrice,
                  sale_price: item.salePrice,
                  fetched_at: new Date().toISOString()
                });
            } catch (cacheError) {
              console.warn('Failed to cache SPM result:', cacheError);
            }
          } else {
            throw new Error(result.error || 'Failed to fetch SPM');
          }
        }

        // Update arbitrage_opportunities table
        const spmNumber = parseInt(spmValue.replace(/,/g, ''));
        if (!isNaN(spmNumber)) {
          const { error: updateError } = await supabase
            .from('arbitrage_opportunities')
            .update({
              sales_per_month: spmNumber,
              spm_data_source: 'selleramp'
            })
            .eq('asin', item.asin)
            .eq('user_id', user.id);

          if (updateError) {
            console.warn(`Failed to update arbitrage_opportunities for ${item.asin}:`, updateError);
          }
        }

        results.push({
          asin: item.asin,
          success: true,
          spm: spmValue,
          source,
          spmNumber
        });

        successCount++;

        // Send success update
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'success',
          data: {
            asin: item.asin,
            spm: spmValue,
            source
          }
        })}\n\n`));

        // Add delay between requests (2 seconds)
        if (i < asins.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        results.push({
          asin: item.asin,
          success: false,
          error: errorMessage
        });

        // Send error update
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error_item',
          data: {
            asin: item.asin,
            error: errorMessage
          }
        })}\n\n`));

        console.error(`Error processing ASIN ${item.asin}:`, error);
      }
    }

    // Send final completion message
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
      type: 'complete',
      data: {
        message: 'Batch processing completed',
        processed: asins.length,
        total: asins.length,
        progress: 100,
        successCount,
        errorCount,
        results
      }
    })}\n\n`));

  } catch (error) {
    console.error('Batch fetch error:', error);
    
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
      type: 'error',
      data: { 
        error: error instanceof Error ? error.message : 'Internal server error'
      }
    })}\n\n`));
  } finally {
    controller.close();
  }
}

// OPTIONS handler for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}