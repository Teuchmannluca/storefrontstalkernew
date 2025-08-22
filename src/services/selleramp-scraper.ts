import { chromium, Browser, Page, BrowserContext } from 'playwright';

export interface SellerAmpCredentials {
  username: string;
  password: string;
}

export interface SellerAmpRequest {
  asin: string;
  costPrice: number;
  salePrice: number;
  credentials: SellerAmpCredentials;
}

export interface SellerAmpResponse {
  success: boolean;
  spm?: string;
  error?: string;
  source: 'selleramp';
}

export class SellerAmpScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private loginExpiry: number = 0;

  async ensureBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
    }
  }

  async ensureContext(): Promise<BrowserContext> {
    await this.ensureBrowser();
    
    if (!this.context || Date.now() > this.loginExpiry) {
      if (this.context) {
        await this.context.close();
      }
      
      this.context = await this.browser!.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });
    }
    
    return this.context;
  }

  async login(credentials: SellerAmpCredentials): Promise<boolean> {
    try {
      const context = await this.ensureContext();
      const page = await context.newPage();

      console.log('Navigating to SellerAmp login page...');
      await page.goto('https://sas.selleramp.com/site/login', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for login form to be visible (using correct SellerAmp selectors)
      await page.waitForSelector('input#loginform-email, input[name="LoginForm[email]"]', {
        timeout: 10000
      });

      console.log('Filling login credentials...');
      
      // Try SellerAmp-specific selectors for email field
      const emailSelectors = [
        'input#loginform-email',
        'input[name="LoginForm[email]"]',
        'input[placeholder="Email"]'
      ];
      
      let emailFilled = false;
      for (const selector of emailSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.fill(credentials.username);
            emailFilled = true;
            console.log(`Email filled using selector: ${selector}`);
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!emailFilled) {
        throw new Error('Could not find email input field');
      }

      // Try SellerAmp-specific selectors for password field
      const passwordSelectors = [
        'input#loginform-password',
        'input[name="LoginForm[password]"]',
        'input[placeholder="Password"]'
      ];
      
      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.fill(credentials.password);
            passwordFilled = true;
            console.log(`Password filled using selector: ${selector}`);
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!passwordFilled) {
        throw new Error('Could not find password input field');
      }

      // Submit the form
      console.log('Submitting login form...');
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Sign In")'
      ];

      let submitted = false;
      for (const selector of submitSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            submitted = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!submitted) {
        // Try pressing Enter as fallback
        await page.keyboard.press('Enter');
      }

      // Wait for navigation after login
      await page.waitForNavigation({ 
        timeout: 15000,
        waitUntil: 'networkidle'
      });

      // Check if login was successful by looking for dashboard elements
      const currentUrl = page.url();
      console.log('Post-login URL:', currentUrl);

      // Check for error messages
      const errorSelectors = [
        '.alert-danger',
        '.error-message',
        '[class*="error"]',
        '[id*="error"]'
      ];

      for (const selector of errorSelectors) {
        const errorElement = await page.$(selector);
        if (errorElement) {
          const errorText = await errorElement.textContent();
          if (errorText && errorText.toLowerCase().includes('invalid')) {
            throw new Error(`Login failed: ${errorText}`);
          }
        }
      }

      // Check if we're redirected to dashboard or main page (not login)
      if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
        throw new Error('Login failed - still on login page');
      }

      await page.close();
      
      // Set login expiry to 30 minutes from now
      this.loginExpiry = Date.now() + (30 * 60 * 1000);
      
      console.log('Login successful!');
      return true;

    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }

  async fetchSPM(request: SellerAmpRequest): Promise<SellerAmpResponse> {
    try {
      // Ensure we're logged in
      const loginSuccess = await this.login(request.credentials);
      if (!loginSuccess) {
        return {
          success: false,
          error: 'Failed to login to SellerAmp',
          source: 'selleramp'
        };
      }

      const context = await this.ensureContext();
      const page = await context.newPage();

      // Navigate to the lookup page with parameters
      const lookupUrl = `https://sas.selleramp.com/sas/lookup/?searchterm=${request.asin}&sas_cost_price=${request.costPrice}&sas_sale_price=${request.salePrice}`;
      
      console.log(`Fetching SPM for ASIN ${request.asin}...`);
      console.log('Lookup URL:', lookupUrl);

      await page.goto(lookupUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for the SPM element to appear
      const spmSelector = '.estimated_sales_per_mo';
      
      try {
        await page.waitForSelector(spmSelector, { timeout: 15000 });
      } catch (error) {
        // If the specific selector doesn't exist, try alternative selectors
        const alternativeSelectors = [
          '[class*="estimated_sales"]',
          '[class*="sales_per_mo"]',
          '.panel-body.qi-estimated-sales-pnl .estimated_sales_per_mo',
          '.criteria-info .estimated_sales_per_mo'
        ];

        let found = false;
        for (const altSelector of alternativeSelectors) {
          try {
            await page.waitForSelector(altSelector, { timeout: 5000 });
            found = true;
            break;
          } catch (e) {
            continue;
          }
        }

        if (!found) {
          await page.close();
          return {
            success: false,
            error: 'SPM element not found on page',
            source: 'selleramp'
          };
        }
      }

      // Extract the SPM value
      const spmElement = await page.$(spmSelector);
      if (!spmElement) {
        await page.close();
        return {
          success: false,
          error: 'SPM element not accessible',
          source: 'selleramp'
        };
      }

      const spmText = await spmElement.textContent();
      await page.close();

      if (!spmText || spmText.trim() === '') {
        return {
          success: false,
          error: 'SPM value is empty',
          source: 'selleramp'
        };
      }

      console.log(`Successfully extracted SPM: ${spmText.trim()}`);

      return {
        success: true,
        spm: spmText.trim(),
        source: 'selleramp'
      };

    } catch (error) {
      console.error('SPM fetch error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        source: 'selleramp'
      };
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.loginExpiry = 0;
  }
}

// Singleton instance for reuse across requests
let scraperInstance: SellerAmpScraper | null = null;

export async function getSellerAmpScraper(): Promise<SellerAmpScraper> {
  if (!scraperInstance) {
    scraperInstance = new SellerAmpScraper();
  }
  return scraperInstance;
}

// Cleanup function for graceful shutdown
export async function cleanupSellerAmpScraper(): Promise<void> {
  if (scraperInstance) {
    await scraperInstance.close();
    scraperInstance = null;
  }
}