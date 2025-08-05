import { getServiceRoleClient } from '@/lib/supabase-server'

interface TokenState {
  availableTokens: number
  maxTokens: number
  tokensPerMinute: number
  lastRefillAt: Date
}

export class KeepaPersistentRateLimiter {
  private userId: string
  private localState: TokenState | null = null
  private lastSyncAt = 0
  private supabase = getServiceRoleClient()

  constructor(userId: string) {
    this.userId = userId
  }

  /**
   * Initialize or get token tracker from database
   */
  private async getTokenState(): Promise<TokenState> {
    // Use cached state if it's recent (within 30 seconds)
    const now = Date.now()
    if (this.localState && (now - this.lastSyncAt) < 30000) {
      return this.localState
    }

    // Get from database
    const { data, error } = await this.supabase
      .from('keepa_token_tracker')
      .select('*')
      .eq('user_id', this.userId)
      .single()

    if (error && error.code !== 'PGRST116') { // Not "not found" error
      throw new Error(`Failed to get token state: ${error.message}`)
    }

    let tokenState: TokenState

    if (!data) {
      // Initialize new tracker with default values
      const newTracker = {
        user_id: this.userId,
        available_tokens: 200, // Start with more tokens for initial setup
        max_tokens: 500, // Allow accumulation of more tokens
        tokens_per_minute: 22,
        last_refill_at: new Date().toISOString()
      }

      const { data: created, error: createError } = await this.supabase
        .from('keepa_token_tracker')
        .insert(newTracker)
        .select()
        .single()

      if (createError) {
        throw new Error(`Failed to create token tracker: ${createError.message}`)
      }

      tokenState = {
        availableTokens: created.available_tokens,
        maxTokens: created.max_tokens,
        tokensPerMinute: created.tokens_per_minute,
        lastRefillAt: new Date(created.last_refill_at)
      }
    } else {
      tokenState = {
        availableTokens: data.available_tokens,
        maxTokens: data.max_tokens,
        tokensPerMinute: data.tokens_per_minute,
        lastRefillAt: new Date(data.last_refill_at)
      }
    }

    // Refill tokens based on time passed
    const minutesPassed = (now - tokenState.lastRefillAt.getTime()) / (1000 * 60)
    const tokensToAdd = Math.floor(minutesPassed * tokenState.tokensPerMinute)
    
    if (tokensToAdd > 0) {
      tokenState.availableTokens = Math.min(
        tokenState.maxTokens,
        tokenState.availableTokens + tokensToAdd
      )
      tokenState.lastRefillAt = new Date()
    }

    this.localState = tokenState
    this.lastSyncAt = now

    return tokenState
  }

  /**
   * Update token state in database
   */
  private async updateTokenState(newState: TokenState): Promise<void> {
    const { error } = await this.supabase
      .from('keepa_token_tracker')
      .update({
        available_tokens: newState.availableTokens,
        max_tokens: newState.maxTokens,
        tokens_per_minute: newState.tokensPerMinute,
        last_refill_at: newState.lastRefillAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', this.userId)

    if (error) {
      throw new Error(`Failed to update token state: ${error.message}`)
    }

    this.localState = newState
    this.lastSyncAt = Date.now()
  }

  /**
   * Check if enough tokens are available
   */
  async hasTokens(tokensNeeded: number): Promise<boolean> {
    const state = await this.getTokenState()
    return state.availableTokens >= tokensNeeded
  }

  /**
   * Get current available tokens
   */
  async getAvailableTokens(): Promise<number> {
    const state = await this.getTokenState()
    return state.availableTokens
  }

  /**
   * Consume tokens (blocks until available)
   */
  async consumeTokens(tokensNeeded: number): Promise<void> {
    while (true) {
      const state = await this.getTokenState()
      
      if (state.availableTokens >= tokensNeeded) {
        // Consume tokens
        state.availableTokens -= tokensNeeded
        await this.updateTokenState(state)
        return
      }

      // Calculate wait time until we have enough tokens
      const tokensShort = tokensNeeded - state.availableTokens
      const waitMinutes = tokensShort / state.tokensPerMinute
      const waitMs = Math.max(1000, waitMinutes * 60 * 1000) // At least 1 second

      console.log(`Waiting ${Math.ceil(waitMs / 1000)}s for ${tokensNeeded} Keepa tokens (have ${state.availableTokens}, need ${tokensShort} more)`)
      
      await new Promise(resolve => setTimeout(resolve, waitMs))
      
      // Force refresh state after waiting
      this.lastSyncAt = 0
    }
  }

  /**
   * Get time until specified number of tokens will be available
   */
  async getWaitTimeForTokens(tokensNeeded: number): Promise<number> {
    const state = await this.getTokenState()
    
    if (state.availableTokens >= tokensNeeded) {
      return 0
    }

    const tokensShort = tokensNeeded - state.availableTokens
    const waitMinutes = tokensShort / state.tokensPerMinute
    return Math.ceil(waitMinutes * 60 * 1000) // Return milliseconds
  }

  /**
   * Get status information for UI
   */
  async getStatus(): Promise<{
    availableTokens: number
    maxTokens: number
    tokensPerMinute: number
    nextRefillIn: number
  }> {
    const state = await this.getTokenState()
    const now = Date.now()
    const minuteSinceLastRefill = (now - state.lastRefillAt.getTime()) / (1000 * 60)
    const nextRefillIn = Math.max(0, (1 - (minuteSinceLastRefill % 1)) * 60 * 1000)

    return {
      availableTokens: state.availableTokens,
      maxTokens: state.maxTokens,
      tokensPerMinute: state.tokensPerMinute,
      nextRefillIn
    }
  }

  /**
   * Update max tokens (when user upgrades plan)
   */
  async updateMaxTokens(newMaxTokens: number): Promise<void> {
    const state = await this.getTokenState()
    state.maxTokens = newMaxTokens
    state.availableTokens = Math.min(state.availableTokens, newMaxTokens)
    await this.updateTokenState(state)
  }

  /**
   * Force synchronization with database
   */
  async forceSync(): Promise<void> {
    this.lastSyncAt = 0
    await this.getTokenState()
  }
}