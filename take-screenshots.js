const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function takeScreenshots() {
  // Create screenshots directory
  const screenshotsDir = path.join(__dirname, 'ui-analysis-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // Go to login page
    await page.goto('http://localhost:3000');
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-login-page.png'),
      fullPage: true 
    });
    console.log('✓ Captured login page');

    // Login - wait for form elements to be ready
    await page.waitForSelector('input[id="email"]', { timeout: 10000 });
    await page.fill('input[id="email"]', 'admin@admin.com');
    await page.fill('input[id="password"]', 'admin@admin.com');
    await page.click('button[type="submit"]');

    // Wait for navigation after login
    await page.waitForNavigation({ waitUntil: 'networkidle' });
    await page.screenshot({ 
      path: path.join(screenshotsDir, '02-dashboard-home.png'),
      fullPage: true 
    });
    console.log('✓ Captured dashboard home');

    // Try to navigate to different sections
    const navigationLinks = [
      { selector: 'a[href*="storefronts"]', name: 'storefronts' },
      { selector: 'a[href*="arbitrage"]', name: 'arbitrage' },
      { selector: 'a[href*="asin"]', name: 'asin-checker' },
      { selector: 'a[href*="sourcing"]', name: 'sourcing-lists' },
      { selector: 'a[href*="b2b"]', name: 'b2b-arbitrage' }
    ];

    for (const link of navigationLinks) {
      try {
        const element = await page.$(link.selector);
        if (element) {
          await element.click();
          await page.waitForTimeout(2000); // Wait for page to load
          await page.screenshot({ 
            path: path.join(screenshotsDir, `03-${link.name}.png`),
            fullPage: true 
          });
          console.log(`✓ Captured ${link.name} page`);
        } else {
          console.log(`⚠ Could not find link for ${link.name}`);
        }
      } catch (error) {
        console.log(`⚠ Error capturing ${link.name}: ${error.message}`);
      }
    }

    // Try to capture sidebar
    await page.screenshot({ 
      path: path.join(screenshotsDir, '04-sidebar-expanded.png'),
      clip: { x: 0, y: 0, width: 300, height: 1080 }
    });
    console.log('✓ Captured sidebar');

    // Check for any modals or overlays
    const modalSelectors = ['[role="dialog"]', '.modal', '.overlay', '.popup'];
    for (const selector of modalSelectors) {
      const modal = await page.$(selector);
      if (modal && await modal.isVisible()) {
        await page.screenshot({ 
          path: path.join(screenshotsDir, '05-modal-or-overlay.png'),
          fullPage: true 
        });
        console.log('✓ Captured modal/overlay');
        break;
      }
    }

    // Capture mobile view
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ 
      path: path.join(screenshotsDir, '06-mobile-view.png'),
      fullPage: true 
    });
    console.log('✓ Captured mobile view');

    console.log(`\nAll screenshots saved to: ${screenshotsDir}`);

  } catch (error) {
    console.error('Error taking screenshots:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshots();