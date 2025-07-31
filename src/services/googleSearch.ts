// src/services/googleSearch.ts
import { chromium, devices, Browser, BrowserContext, Page, Response } from "playwright";
import { logger } from "../utils/logger.js";
import { SearchQualityAnalyzer } from "../quality/analyzer.js";
import type { SearchResult, QualityConfig } from "../quality/types.js";
import { defaultQualityConfig } from "../quality/config.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Type definitions for search operations
interface SearchResponse {
   query: string;
   results: SearchResult[];
   success: boolean;
   duration?: number;
   resultCount?: number;
   error?: string;
}

interface SearchOptions {
   limit?: number;
   timeout?: number;
   stateFile?: string;
   noSaveState?: boolean;
   locale?: string;
   enableQualityFiltering?: boolean;
   minQualityScore?: number;
   debug?: boolean;
   maxRetries?: number;
   concurrency?: number;
}

interface HostMachineConfig {
   deviceName: string;
   locale: string;
   timezoneId: string;
   colorScheme: string;
   reducedMotion: string;
   forcedColors: string;
}

interface SavedState {
   fingerprint?: HostMachineConfig;
   googleDomain?: string;
}

interface ResultSelector {
   container: string;
   title: string;
   snippet: string;
}

// CAPTCHA detection patterns
const CAPTCHA_PATTERNS: string[] = [
   "google.com/sorry/index",
   "google.com/sorry",
   "recaptcha",
   "captcha",
   "unusual traffic",
];

// Browser launch arguments for stealth
const BROWSER_ARGS: string[] = [
   "--disable-blink-features=AutomationControlled",
   "--disable-features=IsolateOrigins,site-per-process",
   "--disable-site-isolation-trials",
   "--disable-web-security",
   "--no-sandbox",
   "--disable-setuid-sandbox",
   "--disable-dev-shm-usage",
   "--disable-accelerated-2d-canvas",
   "--no-first-run",
   "--no-zygote",
   "--disable-gpu",
   "--hide-scrollbars",
   "--mute-audio",
   "--disable-background-networking",
   "--disable-background-timer-throttling",
   "--disable-backgrounding-occluded-windows",
   "--disable-breakpad",
   "--disable-component-extensions-with-background-pages",
   "--disable-extensions",
   "--disable-features=TranslateUI",
   "--disable-ipc-flooding-protection",
   "--disable-renderer-backgrounding",
   "--enable-features=NetworkService,NetworkServiceInProcess",
   "--force-color-profile=srgb",
   "--metrics-recording-only",
];

/**
 * Main Google Search Service with modular quality analysis
 */
export class GoogleSearchService {
   private qualityAnalyzer: SearchQualityAnalyzer;
   
   constructor(qualityConfig: QualityConfig = defaultQualityConfig) {
       this.qualityAnalyzer = new SearchQualityAnalyzer(qualityConfig);
   }
   
   /**
    * Perform single search with quality filtering
    */
   async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
       return await googleSearch(query, options, undefined, this.qualityAnalyzer);
   }
   
   /**
    * Perform multiple searches with quality filtering
    */
   async multiSearch(queries: string[], options: SearchOptions = {}): Promise<SearchResponse[]> {
       return await multiGoogleSearch(queries, options, this.qualityAnalyzer);
   }
   
   /**
    * Analyze result quality without performing search
    */
   analyzeResultQuality(results: SearchResult[], query: string) {
       return this.qualityAnalyzer.getQualityStats(
           this.qualityAnalyzer.applyQualityFiltering(results, query)
       );
   }
}

/**
* Detect CAPTCHA on current page
*/
function detectCaptcha(url: string, response: Response | null = null): boolean {
   return CAPTCHA_PATTERNS.some((pattern) => 
       url.includes(pattern) || 
       (response && response.url().toString().includes(pattern))
   );
}

/**
* Clean up browser resources
*/
async function cleanupResources(
   page: Page | null, 
   context: BrowserContext | null, 
   browser: Browser | null, 
   browserWasProvided: boolean, 
   debugMode: boolean = false
): Promise<void> {
   try {
       if (page && !page.isClosed()) {
           await page.close();
       }
   } catch (e) {
       logger.warn(`[GoogleSearch] Error closing page: ${e instanceof Error ? e.message : String(e)}`);
   }
   
   try {
       if (context) {
           await context.close();
       }
   } catch (e) {
       logger.warn(`[GoogleSearch] Error closing context: ${e instanceof Error ? e.message : String(e)}`);
   }
   
   try {
       if (browser && !browserWasProvided && !debugMode) {
           await browser.close();
       }
   } catch (e) {
       logger.warn(`[GoogleSearch] Error closing browser: ${e instanceof Error ? e.message : String(e)}`);
   }
}

/**
* Handle CAPTCHA detection with retry logic
*/
async function handleCaptchaDetection(
   headless: boolean, 
   browserWasProvided: boolean, 
   page: Page, 
   context: BrowserContext, 
   browser: Browser, 
   timeout: number
): Promise<void> {
   if (headless) {
       logger.warn("[GoogleSearch] CAPTCHA detected, switching to non-headless mode...");
       await cleanupResources(page, context, browserWasProvided ? null : browser, browserWasProvided, false);
       
       if (browserWasProvided) {
           throw new Error("CAPTCHA_RETRY_WITH_NEW_BROWSER");
       } else {
           throw new Error("CAPTCHA_RETRY_NON_HEADLESS");
       }
   } else {
       logger.warn("[GoogleSearch] CAPTCHA detected, please complete verification in browser...");
       
       await page.waitForNavigation({
           timeout: timeout * 2,
           url: (url: URL) => {
               const urlStr = url.toString();
               return CAPTCHA_PATTERNS.every((pattern) => !urlStr.includes(pattern));
           },
       });
       logger.info("[GoogleSearch] CAPTCHA verification completed, continuing with search...");
   }
}

/**
* Get random delay between min and max milliseconds
*/
function getRandomDelay(min: number, max: number): number {
   return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
* Get the host machine's actual configuration
*/
function getHostMachineConfig(userLocale?: string): HostMachineConfig {
   // Get system locale
   const systemLocale = userLocale || process.env.LANG || "en-US";
   
   // Get system timezone based on offset
   const timezoneOffset = new Date().getTimezoneOffset();
   let timezoneId = "America/New_York"; // Default timezone
   
   // Infer timezone based on UTC offset
   if (timezoneOffset <= -480 && timezoneOffset > -600) {
       timezoneId = "Asia/Shanghai"; // UTC+8
   } else if (timezoneOffset <= -540) {
       timezoneId = "Asia/Tokyo"; // UTC+9
   } else if (timezoneOffset <= -420 && timezoneOffset > -480) {
       timezoneId = "Asia/Bangkok"; // UTC+7
   } else if (timezoneOffset <= 0 && timezoneOffset > -60) {
       timezoneId = "Europe/London"; // UTC+0
   } else if (timezoneOffset <= 60 && timezoneOffset > 0) {
       timezoneId = "Europe/Berlin"; // UTC-1
   } else if (timezoneOffset <= 300 && timezoneOffset > 240) {
       timezoneId = "America/New_York"; // UTC-5
   }
   
   // Detect system color scheme based on time
   const hour = new Date().getHours();
   const colorScheme = hour >= 19 || hour < 7 ? "dark" : "light";
   
   // Default settings
   const reducedMotion = "no-preference";
   const forcedColors = "none";
   
   // Choose device based on OS
   const platform = os.platform();
   let deviceName = "Desktop Chrome"; // Default
   
   if (platform === "darwin") {
       deviceName = "Desktop Safari";
   } else if (platform === "win32") {
       deviceName = "Desktop Edge";
   } else if (platform === "linux") {
       deviceName = "Desktop Firefox";
   }
   
   // Force Chrome for consistency
   deviceName = "Desktop Chrome";
   
   return {
       deviceName,
       locale: systemLocale,
       timezoneId,
       colorScheme,
       reducedMotion,
       forcedColors,
   };
}

/**
* Save browser state and fingerprint
*/
async function saveBrowserState(
   context: BrowserContext, 
   stateFile: string, 
   savedState: SavedState, 
   noSaveState: boolean
): Promise<void> {
   if (noSaveState) {
       logger.info("[GoogleSearch] Not saving browser state as per user setting");
       return;
   }

   try {
       logger.info("[GoogleSearch] Saving browser state...");
       
       // Ensure directory exists
       const stateDir = path.dirname(stateFile);
       if (!fs.existsSync(stateDir)) {
           fs.mkdirSync(stateDir, { recursive: true });
       }
       
       // Save browser state
       await context.storageState({ path: stateFile });
       logger.info("[GoogleSearch] Browser state saved successfully!");
       
       // Save fingerprint config
       const fingerprintFile = stateFile.replace(".json", "-fingerprint.json");
       try {
           fs.writeFileSync(fingerprintFile, JSON.stringify(savedState, null, 2), "utf8");
           logger.info("[GoogleSearch] Fingerprint configuration saved");
       } catch (fingerprintError) {
           logger.error(`[GoogleSearch] Error saving fingerprint configuration: ${fingerprintError}`);
       }
   } catch (error) {
       logger.error(`[GoogleSearch] Error saving browser state: ${error}`);
   }
}

/**
* Extract search results from page using multiple selector strategies
*/
async function extractSearchResults(page: Page, limit: number, qualityAnalyzer: SearchQualityAnalyzer): Promise<SearchResult[]> {
   logger.info("[GoogleSearch] Extracting search results...");
   
   // Primary selector strategies
   const resultSelectors: ResultSelector[] = [
       { container: "#search .g", title: "h3", snippet: ".VwiC3b" },
       { container: "#rso .g", title: "h3", snippet: ".VwiC3b" },
       { container: ".g", title: "h3", snippet: ".VwiC3b" },
       { container: "[data-sokoban-container] > div", title: "h3", snippet: "[data-sncf='1']" },
       { container: "div[role='main'] .g", title: "h3", snippet: "[data-sncf='1']" },
   ];
   
   let results: SearchResult[] = [];
   
   // Try each selector strategy
   for (const selector of resultSelectors) {
       try {
           results = await page.$$eval(selector.container, (elements: Element[], params: any) => {
               return elements
                   .slice(0, params.maxResults)
                   .map((el: Element) => {
                       const titleElement = el.querySelector(params.titleSelector);
                       const linkElement = el.querySelector("a");
                       const snippetElement = el.querySelector(params.snippetSelector);
                       
                       // Enhanced snippet extraction for code content
                       let snippet = "";
                       if (snippetElement) {
                           snippet = snippetElement.textContent?.trim() || "";
                       }
                       
                       // Look for code blocks and expand snippet if needed
                       const codeElement = el.querySelector('pre, code, .highlight, [class*="code"]');
                       if (codeElement && codeElement.textContent) {
                           const codeSnippet = codeElement.textContent.trim();
                           if (codeSnippet.length > 20 && snippet.length < 200) {
                               snippet = snippet + "\n\nCode example:\n" + codeSnippet.substring(0, 300);
                           }
                       }
                       
                       // Expand snippet length for technical content if too short
                       if (snippet.length < 100) {
                           const parentText = el.textContent?.trim() || "";
                           if (parentText.length > snippet.length && parentText.length < 600) {
                               snippet = parentText.substring(0, 400);
                           }
                       }
                       
                       return {
                           title: titleElement ? titleElement.textContent?.trim() || "" : "",
                           link: linkElement && linkElement instanceof HTMLAnchorElement 
                               ? linkElement.href 
                               : "",
                           snippet: snippet,
                       };
                   })
                   .filter((item: SearchResult) => item.title && item.link);
           }, {
               maxResults: limit,
               titleSelector: selector.title,
               snippetSelector: selector.snippet,
           });
           
           if (results.length > 0) {
               logger.info(`[GoogleSearch] Successfully extracted ${results.length} results with selector: ${selector.container}`);
               break;
           }
       } catch (e) {
           // Try next selector combination
           continue;
       }
   }
   
   // Fallback method if primary selectors fail
   if (results.length === 0) {
       logger.warn("[GoogleSearch] Using fallback method to extract search results...");
       
       try {
           results = await page.$$eval("a[href^='http']", (elements: Element[], maxResults: number) => {
               return elements
                   .filter((el: Element) => {
                       const href = el.getAttribute("href") || "";
                       return (
                           href.startsWith("http") &&
                           !href.includes("google.com/search") &&
                           !href.includes("google.com/url?") &&
                           !href.includes("accounts.google") &&
                           !href.includes("support.google") &&
                           !href.includes("policies.google")
                       );
                   })
                   .slice(0, maxResults)
                   .map((el: Element) => {
                       const title = el.textContent?.trim() || "";
                       const link = el instanceof HTMLAnchorElement 
                           ? el.href 
                           : el.getAttribute("href") || "";
                       
                       // Try to get surrounding text as snippet
                       let snippet = "";
                       let parent = el.parentElement;
                       for (let i = 0; i < 3 && parent; i++) {
                           const text = parent.textContent?.trim() || "";
                           if (text.length > snippet.length && text !== title && text.length < 500) {
                               snippet = text;
                           }
                           parent = parent.parentElement;
                       }
                       
                       return { title, link, snippet };
                   })
                   .filter((item: SearchResult) => item.title && item.link);
           }, limit);
       } catch (e) {
           logger.error(`[GoogleSearch] Fallback extraction failed: ${e instanceof Error ? e.message : String(e)}`);
       }
   }
   
   // Use quality analyzer for basic result validation
   return qualityAnalyzer.validateResults(results);
}

/**
* Wait for search results to appear on page
*/
async function waitForSearchResults(page: Page, timeout: number): Promise<void> {
   logger.info(`[GoogleSearch] Waiting for search results to load... URL: ${page.url()}`);
   
   const searchResultSelectors: string[] = [
       "#search",
       "#rso", 
       ".g",
       "[data-sokoban-container]",
       "div[role='main']",
   ];
   
   let resultsFound = false;
   
   for (const selector of searchResultSelectors) {
       try {
           await page.waitForSelector(selector, { timeout: timeout / 2 });
           logger.info(`[GoogleSearch] Found search results with selector: ${selector}`);
           resultsFound = true;
           break;
       } catch (e) {
           // Try next selector
           continue;
       }
   }
   
   if (!resultsFound) {
       // Check if we hit a CAPTCHA
       const currentUrl = page.url();
       if (detectCaptcha(currentUrl)) {
           throw new Error("CAPTCHA_DETECTED_DURING_RESULTS");
       } else {
           throw new Error("Could not find search result elements");
       }
   }
   
   // Small wait to ensure results are fully loaded
   await page.waitForTimeout(getRandomDelay(200, 500));
}

/**
* Perform the actual search on the page
*/
async function performSearch(page: Page, query: string, timeout: number): Promise<void> {
   logger.info(`[GoogleSearch] Entering search keyword: ${query}`);
   
   // Search input selectors in order of preference
   const searchInputSelectors: string[] = [
       "textarea[name='q']",
       "input[name='q']", 
       "textarea[title='Search']",
       "input[title='Search']",
       "textarea[aria-label='Search']",
       "input[aria-label='Search']",
       "textarea",
   ];
   
   let searchInput = null;
   
   // Find search input field
   for (const selector of searchInputSelectors) {
       searchInput = await page.$(selector);
       if (searchInput) {
           logger.info(`[GoogleSearch] Found search box with selector: ${selector}`);
           break;
       }
   }
   
   if (!searchInput) {
       throw new Error("Could not find search box");
   }
   
   // Perform search
   await searchInput.click();
   await page.keyboard.type(query, { delay: getRandomDelay(10, 30) });
   await page.waitForTimeout(getRandomDelay(100, 300));
   await page.keyboard.press("Enter");
   
   logger.info("[GoogleSearch] Waiting for page to load...");
   await page.waitForLoadState("networkidle", { timeout });
   
   // Check for CAPTCHA after search
   const searchUrl = page.url();
   if (detectCaptcha(searchUrl)) {
       throw new Error("CAPTCHA_DETECTED_AFTER_SEARCH");
   }
}

/**
* Setup browser context with stealth configuration
*/
async function setupBrowserContext(
   browser: Browser, 
   savedState: SavedState, 
   locale: string, 
   storageState?: string
): Promise<{ context: BrowserContext; page: Page }> {
   const deviceList = ["Desktop Chrome", "Desktop Edge", "Desktop Firefox", "Desktop Safari"];
   
   // Get device configuration
   let deviceName: string;
   let deviceConfig: any;
   if (savedState.fingerprint?.deviceName && devices[savedState.fingerprint.deviceName]) {
       deviceName = savedState.fingerprint.deviceName;
       deviceConfig = devices[savedState.fingerprint.deviceName];
       logger.info(`[GoogleSearch] Using saved device: ${deviceName}`);
   } else {
       deviceName = deviceList[Math.floor(Math.random() * deviceList.length)];
       deviceConfig = devices[deviceName];
       logger.info(`[GoogleSearch] Selected random device: ${deviceName}`);
   }
   
   // Create context options
   let contextOptions: any = { ...deviceConfig };
   
   // Apply fingerprint configuration
   if (savedState.fingerprint) {
       contextOptions = {
           ...contextOptions,
           locale: savedState.fingerprint.locale,
           timezoneId: savedState.fingerprint.timezoneId,
           colorScheme: savedState.fingerprint.colorScheme,
           reducedMotion: savedState.fingerprint.reducedMotion,
           forcedColors: savedState.fingerprint.forcedColors,
       };
       logger.info("[GoogleSearch] Using saved browser fingerprint configuration");
   } else {
       // Generate new fingerprint based on host machine
       const hostConfig = getHostMachineConfig(locale);
       
       if (hostConfig.deviceName !== deviceName) {
           deviceName = hostConfig.deviceName;
           contextOptions = { ...devices[hostConfig.deviceName] };
           logger.info(`[GoogleSearch] Using host-based device: ${hostConfig.deviceName}`);
       }
       
       contextOptions = {
           ...contextOptions,
           locale: hostConfig.locale,
           timezoneId: hostConfig.timezoneId,
           colorScheme: hostConfig.colorScheme,
           reducedMotion: hostConfig.reducedMotion,
           forcedColors: hostConfig.forcedColors,
       };
       
       // Save fingerprint for future use
       savedState.fingerprint = hostConfig;
       logger.info(`[GoogleSearch] Generated fingerprint: locale=${hostConfig.locale}, timezone=${hostConfig.timezoneId}, colorScheme=${hostConfig.colorScheme}`);
   }
   
   // Add desktop-specific options
   contextOptions = {
       ...contextOptions,
       permissions: ["geolocation", "notifications"],
       acceptDownloads: true,
       isMobile: false,
       hasTouch: false,
       javaScriptEnabled: true,
   };
   
   // Add storage state if available
   if (storageState) {
       contextOptions.storageState = storageState;
       logger.info("[GoogleSearch] Loading saved browser state...");
   }
   
   const context = await browser.newContext(contextOptions);
   
   // Add stealth scripts
   await context.addInitScript(() => {
       // Override navigator properties
       Object.defineProperty(navigator, "webdriver", { get: () => false });
       Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
       Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
       
       // Add Chrome runtime
       (window as any).chrome = {
           runtime: {},
           loadTimes: function () {},
           csi: function () {},
           app: {},
       };
       
       // WebGL fingerprint randomization
       if (typeof WebGLRenderingContext !== "undefined") {
           const getParameter = WebGLRenderingContext.prototype.getParameter;
           WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
               if (parameter === 37445) return "Intel Inc.";
               if (parameter === 37446) return "Intel Iris OpenGL Engine";
               return getParameter.call(this, parameter);
           };
       }
   });
   
   const page = await context.newPage();
   
   // Set realistic screen properties
   await page.addInitScript(() => {
       Object.defineProperty(window.screen, "width", { get: () => 1920 });
       Object.defineProperty(window.screen, "height", { get: () => 1080 });
       Object.defineProperty(window.screen, "colorDepth", { get: () => 24 });
       Object.defineProperty(window.screen, "pixelDepth", { get: () => 24 });
   });
   
   return { context, page };
}

/**
* Navigate to Google and handle initial setup
*/
async function navigateToGoogle(page: Page, savedState: SavedState, timeout: number): Promise<void> {
   const googleDomains: string[] = [
       "https://www.google.com",
       "https://www.google.co.uk", 
       "https://www.google.ca",
       "https://www.google.com.au",
   ];
   
   // Select Google domain
   let selectedDomain: string;
   if (savedState.googleDomain) {
       selectedDomain = savedState.googleDomain;
       logger.info(`[GoogleSearch] Using saved Google domain: ${selectedDomain}`);
   } else {
       selectedDomain = googleDomains[Math.floor(Math.random() * googleDomains.length)];
       savedState.googleDomain = selectedDomain;
       logger.info(`[GoogleSearch] Selected Google domain: ${selectedDomain}`);
   }
   
   logger.info("[GoogleSearch] Visiting Google search page...");
   
   // Navigate to Google
   const response = await page.goto(selectedDomain, {
       timeout,
       waitUntil: "networkidle",
   });
   
   // Check for CAPTCHA on initial load
   const currentUrl = page.url();
   if (detectCaptcha(currentUrl, response)) {
       throw new Error("CAPTCHA_DETECTED_ON_LOAD");
   }
}

/**
* Perform a single search attempt with quality analysis
*/
async function performSearchAttempt(
   query: string, 
   options: SearchOptions, 
   existingBrowser: Browser | null, 
   useHeadless: boolean,
   qualityAnalyzer: SearchQualityAnalyzer
): Promise<SearchResponse> {
   const {
       limit = 20,
       timeout = 60000,
       stateFile = "./browser-state.json",
       noSaveState = false,
       locale = "en-US",
       enableQualityFiltering = true,
       minQualityScore = 0.3,
   } = options;

   const startTime = Date.now();
   let browser: Browser | null = null;
   let context: BrowserContext | null = null;
   let page: Page | null = null;
   let browserWasProvided = false;
   let savedState: SavedState = {};

   // Detect query domain for adaptive quality thresholds
   const domain = qualityAnalyzer.detectQueryDomain(query);
   const adaptiveMinScore = domain !== 'general' ? Math.min(minQualityScore, 0.1) : minQualityScore;
   
   logger.info(`[GoogleSearch] Detected ${domain} query: "${query}" - using adaptive quality threshold: ${adaptiveMinScore}`);

   try {
       logger.info("[GoogleSearch] Initializing browser...");

       // Load existing state if available
       const fingerprintFile = stateFile.replace(".json", "-fingerprint.json");
       let storageState: string | undefined = undefined;

       if (fs.existsSync(stateFile)) {
           logger.info("[GoogleSearch] Found browser state file, loading saved state...");
           storageState = stateFile;

           if (fs.existsSync(fingerprintFile)) {
               try {
                   const fingerprintData = fs.readFileSync(fingerprintFile, "utf8");
                   savedState = JSON.parse(fingerprintData);
                   logger.info("[GoogleSearch] Loaded saved browser fingerprint");
               } catch (e) {
                   logger.warn("[GoogleSearch] Cannot load fingerprint file, will create new one");
               }
           }
       } else {
           logger.info("[GoogleSearch] No browser state found, creating new session");
       }

       // Setup browser
       if (existingBrowser) {
           browser = existingBrowser;
           browserWasProvided = true;
           logger.info("[GoogleSearch] Using existing browser instance");
       } else {
           logger.info(`[GoogleSearch] Launching browser in ${useHeadless ? "headless" : "non-headless"} mode`);
           
           browser = await chromium.launch({
               headless: useHeadless,
               timeout: timeout * 2,
               args: BROWSER_ARGS,
               ignoreDefaultArgs: ["--enable-automation"],
           });
           
           logger.info("[GoogleSearch] Browser launched successfully!");
       }

       // Setup browser context and page
       const { context: browserContext, page: browserPage } = await setupBrowserContext(
           browser, 
           savedState, 
           locale, 
           storageState
       );
       context = browserContext;
       page = browserPage;

       // Navigate to Google
       await navigateToGoogle(page, savedState, timeout);

       // Perform search
       await performSearch(page, query, timeout);

       // Wait for and validate results
       await waitForSearchResults(page, timeout);

       // Extract results with enhanced snippet extraction
       let results = await extractSearchResults(page, limit, qualityAnalyzer);
       logger.info(`[GoogleSearch] Successfully retrieved ${results.length} raw results`);

       // Apply quality filtering using the modular analyzer
       if (enableQualityFiltering) {
           results = qualityAnalyzer.applyQualityFiltering(results, query, adaptiveMinScore);
           
           // Enhance results with metadata
           results = results.map(result => qualityAnalyzer.analyzeResult(result, query));
           
           logger.info(`[GoogleSearch] Quality filtering applied: ${results.length} quality results for ${domain} query`);
       }

       // Save browser state
       await saveBrowserState(context, stateFile, savedState, noSaveState);

       // Calculate performance metrics
       const endTime = Date.now();
       const duration = endTime - startTime;
       logger.info(`[GoogleSearch] Search completed successfully in ${duration}ms with ${results.length} quality results (${domain} domain)`);

       // Clean up resources (but keep browser open if externally provided or in debug mode)
       if (!browserWasProvided && !options.debug) {
           await cleanupResources(page, context, browser, browserWasProvided, false);
           logger.info("[GoogleSearch] Browser resources cleaned up");
       } else {
           logger.info("[GoogleSearch] Keeping browser instance open");
       }

       return {
           query,
           results,
           success: true,
           duration,
           resultCount: results.length,
       };

   } catch (error) {
       const err = error as Error;
       logger.error(`[GoogleSearch] Search attempt failed: ${err.message}`);

       // Handle CAPTCHA-specific errors
       if (err.message.includes("CAPTCHA_DETECTED")) {
           if (useHeadless && !browserWasProvided) {
               await cleanupResources(page, context, browser, browserWasProvided, false);
               throw new Error("CAPTCHA_RETRY_NON_HEADLESS");
           } else if (browserWasProvided) {
               await cleanupResources(page, context, null, browserWasProvided, false);
               throw new Error("CAPTCHA_RETRY_WITH_NEW_BROWSER");
           } else {
               // Non-headless mode, try to handle CAPTCHA interactively
               try {
                   if (page && context && browser) {
                       await handleCaptchaDetection(false, browserWasProvided, page, context, browser, timeout);
                   }
                   // If we get here, CAPTCHA was resolved, retry the search logic
                   throw new Error("CAPTCHA_RESOLVED_RETRY");
               } catch (captchaError) {
                   await cleanupResources(page, context, browser, browserWasProvided, options.debug || false);
                   throw captchaError;
               }
           }
       }

       // Try to save state even on error
       if (context && !noSaveState) {
           try {
               await saveBrowserState(context, stateFile, savedState, false);
           } catch (saveError) {
               logger.warn(`[GoogleSearch] Could not save state after error: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
           }
       }

       // Clean up resources
       await cleanupResources(page, context, browser, browserWasProvided, options.debug || false);

       // Return error result instead of throwing for non-critical errors
       if (!err.message.includes("CAPTCHA_RETRY") && !err.message.includes("CAPTCHA_RESOLVED_RETRY")) {
           const endTime = Date.now();
           return {
               query,
               results: [],
               success: false,
               error: err.message,
               duration: endTime - startTime,
               resultCount: 0,
           };
       }

       // Re-throw retry errors
       throw error;
   }
}

/**
* Enhanced Google search function with modular quality analysis
*/
export async function googleSearch(
   query: string, 
   options: SearchOptions = {}, 
   existingBrowser?: Browser,
   qualityAnalyzer: SearchQualityAnalyzer = new SearchQualityAnalyzer()
): Promise<SearchResponse> {
   const maxRetries = options.maxRetries || 2;
   let retryCount = 0;
   let lastError: Error | null = null;

   // Detect query domain for logging
   const domain = qualityAnalyzer.detectQueryDomain(query);
   logger.info(`[GoogleSearch] Starting search for ${domain} query: "${query}"`);

   while (retryCount <= maxRetries) {
       try {
           const useHeadless = retryCount === 0 ? !options.debug : false;
           const currentBrowser = retryCount === 0 ? existingBrowser || null : null;
           
           logger.info(`[GoogleSearch] Search attempt ${retryCount + 1}/${maxRetries + 1} for query: "${query}" (${domain} domain)`);
           
           return await performSearchAttempt(query, options, currentBrowser, useHeadless, qualityAnalyzer);

       } catch (error) {
           const err = error as Error;
           lastError = err;
           retryCount++;

           if (err.message === "CAPTCHA_RETRY_NON_HEADLESS" && retryCount <= maxRetries) {
               logger.info(`[GoogleSearch] Retrying search in non-headless mode (attempt ${retryCount + 1})`);
               continue;
               
           } else if (err.message === "CAPTCHA_RETRY_WITH_NEW_BROWSER" && retryCount <= maxRetries) {
               logger.info(`[GoogleSearch] Retrying search with new browser instance (attempt ${retryCount + 1})`);
               continue;
               
           } else if (err.message === "CAPTCHA_RESOLVED_RETRY" && retryCount <= maxRetries) {
               logger.info(`[GoogleSearch] CAPTCHA resolved, retrying search (attempt ${retryCount + 1})`);
               continue;
               
           } else if (retryCount > maxRetries) {
               logger.error(`[GoogleSearch] All retry attempts exhausted. Final error: ${err.message}`);
               break;
           } else {
               // Non-retry error, return error result
               logger.error(`[GoogleSearch] Non-recoverable error: ${err.message}`);
               return {
                   query,
                   results: [],
                   success: false,
                   error: err.message,
                   duration: 0,
                   resultCount: 0,
               };
           }
       }
   }

   // If we get here, all retries failed
   return {
       query,
       results: [],
       success: false,
       error: lastError?.message || "Search failed after all retry attempts",
       duration: 0,
       resultCount: 0,
   };
}

/**
* Enhanced multiple Google searches with modular quality analysis
*/
export async function multiGoogleSearch(
   queries: string[], 
   options: SearchOptions = {},
   qualityAnalyzer: SearchQualityAnalyzer = new SearchQualityAnalyzer()
): Promise<SearchResponse[]> {
   if (!queries || queries.length === 0) {
       throw new Error("At least one search query is required");
   }

   const startTime = Date.now();
   
   // Analyze query domains for better logging
   const domainCounts = {
       medical: 0,
       javascript: 0,
       general: 0
   };
   
   queries.forEach(q => {
       const domain = qualityAnalyzer.detectQueryDomain(q);
       domainCounts[domain]++;
   });
   
   logger.info(`[MultiSearch] Starting searches: ${queries.length} total (${domainCounts.medical} medical, ${domainCounts.javascript} JS, ${domainCounts.general} general)`);

   let sharedBrowser: Browser | null = null;
   
   try {
       // Launch a shared browser instance for all searches if not in debug mode
       if (!options.debug) {
           logger.info("[MultiSearch] Launching shared browser instance...");
           sharedBrowser = await chromium.launch({
               headless: true,
               args: BROWSER_ARGS,
               ignoreDefaultArgs: ["--enable-automation"],
           });
       }

       // Execute searches with controlled concurrency
       const concurrencyLimit = options.concurrency || 3;
       const searchPromises: Promise<SearchResponse>[] = [];
       
       for (let i = 0; i < queries.length; i += concurrencyLimit) {
           const batch = queries.slice(i, i + concurrencyLimit);
           
           const batchPromises = batch.map((query: string, batchIndex: number) => {
               const domain = qualityAnalyzer.detectQueryDomain(query);
               const searchOptions: SearchOptions = {
                   ...options,
                   // Use adaptive quality thresholds based on domain
                   minQualityScore: options.minQualityScore || (domain !== 'general' ? 0.1 : 0.3),
                   stateFile: options.stateFile 
                       ? `${options.stateFile}-${i + batchIndex}`
                       : `./browser-state-${i + batchIndex}.json`,
               };
               
               const globalIndex = i + batchIndex;
               logger.info(`[MultiSearch] Starting search #${globalIndex + 1} for ${domain} query: "${query}"`);
               
               return googleSearch(query, searchOptions, sharedBrowser || undefined, qualityAnalyzer);
           });
           
           searchPromises.push(...batchPromises);
           
           // Wait for current batch to complete before starting next batch
           if (i + concurrencyLimit < queries.length) {
               await Promise.all(batchPromises);
               // Small delay between batches to avoid rate limiting
               await new Promise(resolve => setTimeout(resolve, getRandomDelay(500, 1500)));
           }
       }

       // Wait for all searches to complete
       const results = await Promise.all(searchPromises);
       
       const endTime = Date.now();
       const duration = endTime - startTime;
       const successCount = results.filter(r => r.success).length;
       const totalResults = results.reduce((sum, r) => sum + (r.resultCount || 0), 0);
       
       // Calculate domain-specific statistics
       const domainResults = {
           medical: results.filter((r, i) => qualityAnalyzer.detectQueryDomain(queries[i]) === 'medical'),
           javascript: results.filter((r, i) => qualityAnalyzer.detectQueryDomain(queries[i]) === 'javascript'),
           general: results.filter((r, i) => qualityAnalyzer.detectQueryDomain(queries[i]) === 'general')
       };
       
       logger.info(`[MultiSearch] Completed in ${duration}ms: ${successCount}/${queries.length} successful searches, ${totalResults} total results`);
       logger.info(`[MultiSearch] Domain breakdown - Medical: ${domainResults.medical.length}, JS: ${domainResults.javascript.length}, General: ${domainResults.general.length}`);

       return results;

   } catch (error) {
       const err = error as Error;
       logger.error(`[MultiSearch] Fatal error: ${err.message}`);
       throw error;
       
   } finally {
       // Clean up shared browser
       if (sharedBrowser && !options.debug) {
           try {
               logger.info("[MultiSearch] Closing shared browser instance");
               await sharedBrowser.close();
           } catch (e) {
               logger.warn(`[MultiSearch] Error closing shared browser: ${e instanceof Error ? e.message : String(e)}`);
           }
       } else if (options.debug) {
           logger.info("[MultiSearch] Keeping shared browser instance open for debug mode");
       }
   }
}
