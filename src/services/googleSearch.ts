import { chromium, devices, Browser, BrowserContext, Page, Response } from "playwright";
import { logger } from "../utils/logger.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Type definitions
interface SearchResult {
   title: string;
   link: string;
   snippet: string;
   score?: number;
   issues?: string[];
}

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

interface QualityConfig {
   minTitleLength: number;
   minSnippetLength: number;
   maxSnippetLength: number;
   idealSnippetLength: number;
   snippetLengthTolerance: number;
   minRelevantWords: number;
   titleWeight: number;
   snippetWeight: number;
   urlWeight: number;
   spamWords: string[];
   medicalConfig: {
       minTitleLength: number;
       minSnippetLength: number;
       minRelevantWords: number;
       authorityBoost: number;
       keywords: string[];
   };
   urlPatterns: {
       trusted: RegExp[];
       suspicious: RegExp[];
       avoid: RegExp[];
   };
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

// Enhanced quality validation configuration
const qualityConfig: QualityConfig = {
   minTitleLength: 5,
   minSnippetLength: 20,
   maxSnippetLength: 300,
   idealSnippetLength: 150,
   snippetLengthTolerance: 50,
   minRelevantWords: 1,
   titleWeight: 0.35,
   snippetWeight: 0.4,
   urlWeight: 0.25,
   spamWords: ['spam', 'advertisement', 'promoted', 'sponsored'],
   medicalConfig: {
       minTitleLength: 3,
       minSnippetLength: 15,
       minRelevantWords: 1,
       authorityBoost: 0.8,
       keywords: [
           'covid', 'health', 'medical', 'disease', 'study', 'research',
           'clinical', 'treatment', 'diagnosis', 'cdc', 'who', 'vaccine',
           'pandemic', 'virus', 'prevention', 'guidelines', 'therapy',
           'patient', 'hospital', 'medicine', 'pharmaceutical', 'drug',
           'symptom', 'infection', 'outbreak', 'epidemic', 'public health'
       ]
   },
   urlPatterns: {
       trusted: [
           // Medical and Health Authorities
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(cdc|nih|who|fda|cms)\.gov/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(health\.gov|healthfinder\.gov)$/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*pubmed\.ncbi\.nlm\.nih\.gov/,
           
           // Premier Medical Journals and Publishers
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(nature|science)\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(nejm|jamanetwork|bmj|thelancet)\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(cell|elsevier|springer|wiley)\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*cochranelibrary\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*plos(one|medicine)?\.org/,
           
           // Reputable Medical Organizations
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(mayoclinic|clevelandclinic|jhopkins)\.(?:com|org|edu)/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(webmd|healthline|medicalnewstoday)\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(ama-assn|aafp|acog)\.org/,
           
           // Code and development
           /^https?:\/\/([a-zA-Z0-9-]+\.)*github\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*gitlab\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*bitbucket\.org/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*stackoverflow\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*stackexchange\.com/,
           
           // Documentation
           /^https?:\/\/docs\./,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*readthedocs\.io/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*rtfd\.io/,
           
           // Knowledge
           /^https?:\/\/([a-zA-Z0-9-]+\.)*wikipedia\.org/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*arxiv\.org/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*ieee\.org/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*acm\.org/,
           
           // Tech organizations
           /^https?:\/\/([a-zA-Z0-9-]+\.)*wolfram\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*wolframalpha\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*mathworks\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(microsoft|google|mozilla|nodejs|python|typescript|rust-lang|golang|ruby-lang|php|oracle|apache|nginx|debian|ubuntu|fedora)\.org/,
           
           // Educational
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(edu|ac\.[a-z]{2})$/,
           
           // Government and standards
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(gov|mil)$/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*w3\.org/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*ietf\.org/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*iso\.org/,
           
           // Community platforms with moderation
           /^https?:\/\/([a-zA-Z0-9-]+\.)*reddit\.com\/r\/(programming|typescript|javascript|python|rust|golang|dotnet|csharp|java|cpp|machinelearning|medicine|COVID19|coronavirus)\//,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*discourse\./,
       ],
       suspicious: [
           /\.(php|cgi|jsp)\?/,
           /\b(ads?|click|buy|sale|cheap|free|deal)\b/i,
           /\b(warez|crack|keygen|serial)\b/i
       ],
       avoid: [
           // Tutorial mills and low-quality learning sites
           /^https?:\/\/([a-zA-Z0-9-]+\.)*w3schools\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*tutorialspoint\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*javatpoint\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*geeksforgeeks\.org/,
           
           // Content farms and questionable resources
           /^https?:\/\/([a-zA-Z0-9-]+\.)*experts-exchange\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*codeproject\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*codeguru\.com/,
           
           // Scraped/reposted content sites
           /^https?:\/\/([a-zA-Z0-9-]+\.)*sourcecodester\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*codexworld\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*developersalley\.com/,
           
           // Unreliable answer sites (but allow medical Q&A on Reddit/Quora)
           /^https?:\/\/([a-zA-Z0-9-]+\.)*askubuntu\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*fixya\.com/,
       ]
   }
};

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
* Detect if query is medical/health related
*/
function isMedicalQuery(query: string): boolean {
   const lowerQuery = query.toLowerCase();
   return qualityConfig.medicalConfig.keywords.some(keyword => 
       lowerQuery.includes(keyword)
   );
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
* Validate and clean search results
*/
function validateResults(results: SearchResult[]): SearchResult[] {
   if (!Array.isArray(results)) {
       logger.warn("[GoogleSearch] Results is not an array, converting...");
       return [];
   }
   
   return results.filter(result => {
       if (!result || typeof result !== 'object') return false;
       if (!result.title || !result.link) return false;
       if (result.link.includes('google.com/search')) return false; // Skip Google internal links
       if (result.link.includes('google.com/url?')) return false; // Skip redirect links
       return true;
   });
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
* Enhanced search result validation with medical query support
*/
function validateSearchResult(result: SearchResult, query: string): SearchResult {
   const isMedical = isMedicalQuery(query);
   let score = 0;
   const issues: string[] = [];

   // 1. Basic validation
   if (!result.title || !result.link || !result.snippet) {
       issues.push('Missing required fields');
       return { ...result, score: 0 };
   }

   // 2. Use different thresholds for medical vs general content
   const config = isMedical ? qualityConfig.medicalConfig : qualityConfig;
   const minTitleLen = isMedical ? config.minTitleLength : qualityConfig.minTitleLength;
   const minSnippetLen = isMedical ? config.minSnippetLength : qualityConfig.minSnippetLength;
   const minRelevantWords = isMedical ? config.minRelevantWords : qualityConfig.minRelevantWords;

   // 3. Length checks with medical context
   if (result.title.length < minTitleLen) {
       issues.push('Title too short');
       score -= isMedical ? 0.1 : 0.2; // Less penalty for medical content
   }

   if (result.snippet.length < minSnippetLen) {
       issues.push('Snippet too short');
       score -= isMedical ? 0.1 : 0.2; // Less penalty for medical content
   } else if (result.snippet.length > qualityConfig.maxSnippetLength) {
       // Truncate long snippets but don't penalize
       result.snippet = result.snippet.substring(0, qualityConfig.maxSnippetLength) + '...';
   } else {
       // Add bonus for snippets close to ideal length
       const lengthDiff = Math.abs(result.snippet.length - qualityConfig.idealSnippetLength);
       if (lengthDiff <= qualityConfig.snippetLengthTolerance) {
           const bonus = 0.1 * (1 - lengthDiff / qualityConfig.snippetLengthTolerance);
           score += bonus;
       }
   }

   // 4. Enhanced query relevance check for medical content
   const queryWords = query.toLowerCase().split(/\s+/);
   const titleWords = result.title.toLowerCase().split(/\s+/);
   const snippetWords = result.snippet.toLowerCase().split(/\s+/);
   let relevantWords = 0;

   // For medical queries, also check for related medical terms
   if (isMedical) {
       // Direct word matches
       for (const word of queryWords) {
           if (titleWords.includes(word) || snippetWords.includes(word)) {
               relevantWords++;
           }
       }
       
       // Medical synonym matching
       const medicalSynonyms: { [key: string]: string[] } = {
           'covid': ['coronavirus', 'sars-cov-2', 'pandemic', 'covid-19'],
           'health': ['medical', 'healthcare', 'wellness', 'medicine'],
           'study': ['research', 'trial', 'investigation', 'analysis'],
           'guidelines': ['recommendations', 'protocols', 'standards', 'practices']
       };
       
       for (const word of queryWords) {
           const synonyms = medicalSynonyms[word] || [];
           for (const synonym of synonyms) {
               if (titleWords.includes(synonym) || snippetWords.includes(synonym)) {
                   relevantWords += 0.8; // Partial credit for synonyms
               }
           }
       }
   } else {
       // Standard relevance check for non-medical queries
       for (const word of queryWords) {
           if (titleWords.includes(word) || snippetWords.includes(word)) {
               relevantWords++;
           }
       }
   }

   if (relevantWords < minRelevantWords) {
       issues.push('Low query relevance');
       score -= isMedical ? 0.2 : 0.3; // Less penalty for medical content
   }

   // 5. Enhanced URL quality check with medical domain authority
   let urlScore = 0;
   const url = result.link.toLowerCase();

   // Check trusted domains with enhanced medical authority
   if (qualityConfig.urlPatterns.trusted.some(pattern => pattern.test(url))) {
       if (isMedical && (url.includes('.gov') || url.includes('nature.com') || 
           url.includes('nejm.com') || url.includes('jamanetwork.com') ||
           url.includes('bmj.com') || url.includes('thelancet.com') ||
           url.includes('mayoclinic.') || url.includes('cdc.gov') ||
           url.includes('nih.gov') || url.includes('who.int'))) {
           urlScore += qualityConfig.medicalConfig.authorityBoost; // Higher boost for medical authorities
       } else {
           urlScore += 0.5;
       }
   }

   // Check avoid list (penalize heavily)
   if (qualityConfig.urlPatterns.avoid.some(pattern => pattern.test(url))) {
       urlScore -= 0.5;
       issues.push('Low-quality source');
   }

   // Check suspicious patterns
   if (qualityConfig.urlPatterns.suspicious.some(pattern => pattern.test(url))) {
       urlScore -= 0.3;
       issues.push('Suspicious URL pattern');
   }

   // 6. Content quality checks
   const contentScore = calculateContentScore(result, queryWords, isMedical);

   // 7. Calculate final score with medical context
   score = (
       contentScore * qualityConfig.titleWeight +
       urlScore * qualityConfig.urlWeight +
       (relevantWords / queryWords.length) * qualityConfig.snippetWeight
   );

   // Normalize score to 0-1 range
   score = Math.max(0, Math.min(1, score + 0.5));

   // Boost score for high-authority medical sources
   if (isMedical && urlScore > 0.6) {
       score = Math.min(1, score + 0.1);
   }

   return {
       ...result,
       score,
       issues: issues.length > 0 ? issues : undefined
   };
}
/**
* Enhanced content quality score calculation with medical context
*/
function calculateContentScore(result: SearchResult, queryWords: string[], isMedical: boolean = false): number {
   let score = 0.5; // Start with neutral score

   // Check for spam words
   const hasSpamWords = qualityConfig.spamWords.some(word =>
       result.title.toLowerCase().includes(word) ||
       result.snippet.toLowerCase().includes(word)
   );

   if (hasSpamWords) {
       score -= 0.3;
   }

   // Enhanced query term density for medical content
   const titleDensity = queryWords.filter((word: string) =>
       result.title.toLowerCase().includes(word)
   ).length / queryWords.length;

   const snippetDensity = queryWords.filter((word: string) =>
       result.snippet.toLowerCase().includes(word)
   ).length / queryWords.length;

   score += (titleDensity * 0.3 + snippetDensity * 0.2);

   // Medical content often has technical language - be more lenient
   if (isMedical) {
       // Check for medical terminology indicators
       const medicalIndicators = [
           'study', 'research', 'clinical', 'trial', 'patient', 'treatment',
           'diagnosis', 'therapy', 'prevention', 'symptoms', 'healthcare',
           'medicine', 'medical', 'hospital', 'doctor', 'physician',
           'epidemiology', 'public health', 'infectious', 'disease'
       ];
       
       const hasMedicalTerms = medicalIndicators.some(term =>
           result.title.toLowerCase().includes(term) ||
           result.snippet.toLowerCase().includes(term)
       );
       
       if (hasMedicalTerms) {
           score += 0.15;
       }

       // Bonus for authoritative medical language patterns
       const authoritativePatterns = [
           /according to.*(cdc|who|nih|fda)/i,
           /published in.*(nature|nejm|jama|bmj|lancet)/i,
           /researchers? (found|discovered|concluded)/i,
           /(clinical trial|randomized|peer.reviewed)/i
       ];

       if (authoritativePatterns.some(pattern => 
           pattern.test(result.title) || pattern.test(result.snippet))) {
           score += 0.1;
       }
   }

   // Check for proper sentence structure in snippet
   if (/^[A-Z].*[.!?]$/.test(result.snippet)) {
       score += 0.1;
   }

   // Penalize very short or very repetitive content
   const words = result.snippet.toLowerCase().split(/\s+/);
   const uniqueWords = new Set(words);
   const diversity = uniqueWords.size / words.length;
   
   if (diversity < 0.5) {
       score -= 0.1; // Penalize repetitive content
   }

   return Math.max(0, Math.min(1, score));
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
* Enhanced quality filtering with medical context awareness
*/
function applyQualityFiltering(
   results: SearchResult[], 
   query: string, 
   enableQualityFiltering: boolean, 
   minQualityScore: number
): SearchResult[] {
   if (!enableQualityFiltering) {
       return results;
   }

   const isMedical = isMedicalQuery(query);
   // Use lower threshold for medical queries to avoid filtering out legitimate scientific content
   const adjustedMinScore = isMedical ? Math.min(minQualityScore, 0.1) : minQualityScore;

   logger.info(`[GoogleSearch] Applying quality filtering to ${results.length} results (medical: ${isMedical}, threshold: ${adjustedMinScore})`);
   
   const validatedResults = results
       .map((result: SearchResult) => validateSearchResult(result, query))
       .filter((result: SearchResult) => result.score! >= adjustedMinScore)
       .sort((a: SearchResult, b: SearchResult) => b.score! - a.score!);

   // Remove duplicates by URL
   const uniqueResults = validatedResults.filter((result: SearchResult, index: number, self: SearchResult[]) =>
       index === self.findIndex((r: SearchResult) => r.link === result.link)
   );

   logger.info(`[GoogleSearch] Quality filtering: ${results.length} -> ${uniqueResults.length} results (${isMedical ? 'medical' : 'general'} query)`);
   return uniqueResults;
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
async function extractSearchResults(page: Page, limit: number): Promise<SearchResult[]> {
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
                       
                       return {
                           title: titleElement ? titleElement.textContent?.trim() || "" : "",
                           link: linkElement && linkElement instanceof HTMLAnchorElement 
                               ? linkElement.href 
                               : "",
                           snippet: snippetElement 
                               ? snippetElement.textContent?.trim() || "" 
                               : "",
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
   
   return validateResults(results);
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
* Perform a single search attempt with enhanced medical query support
*/
async function performSearchAttempt(
   query: string, 
   options: SearchOptions, 
   existingBrowser: Browser | null, 
   useHeadless: boolean
): Promise<SearchResponse> {
   const {
       limit = 20,
       timeout = 60000,
       stateFile = "./browser-state.json",
       noSaveState = false,
       locale = "en-US",
       enableQualityFiltering = true,
       minQualityScore = isMedicalQuery(query) ? 0.05 : 0.3, // Adaptive threshold
   } = options;

   const startTime = Date.now();
   let browser: Browser | null = null;
   let context: BrowserContext | null = null;
   let page: Page | null = null;
   let browserWasProvided = false;
   let savedState: SavedState = {};

   // Log medical query detection
   const isMedical = isMedicalQuery(query);
   if (isMedical) {
       logger.info(`[GoogleSearch] Detected medical query: "${query}" - using enhanced medical filtering`);
   }

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

       // Extract results
       let results = await extractSearchResults(page, limit);
       logger.info(`[GoogleSearch] Successfully retrieved ${results.length} raw results`);

       // Apply quality filtering with medical context
       results = applyQualityFiltering(results, query, enableQualityFiltering, minQualityScore);

       // Save browser state
       await saveBrowserState(context, stateFile, savedState, noSaveState);

       // Calculate performance metrics
       const endTime = Date.now();
       const duration = endTime - startTime;
       logger.info(`[GoogleSearch] Search completed successfully in ${duration}ms with ${results.length} quality results${isMedical ? ' (medical query)' : ''}`);

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
* Enhanced Google search function with medical query awareness and retry logic
*/
export async function googleSearch(
   query: string, 
   options: SearchOptions = {}, 
   existingBrowser?: Browser
): Promise<SearchResponse> {
   const maxRetries = options.maxRetries || 2;
   let retryCount = 0;
   let lastError: Error | null = null;

   // Detect medical query and log
   const isMedical = isMedicalQuery(query);
   if (isMedical) {
       logger.info(`[GoogleSearch] Medical query detected: "${query}" - applying enhanced medical filtering`);
   }

   while (retryCount <= maxRetries) {
       try {
           const useHeadless = retryCount === 0 ? !options.debug : false;
           const currentBrowser = retryCount === 0 ? existingBrowser || null : null;
           
           logger.info(`[GoogleSearch] Starting search attempt ${retryCount + 1}/${maxRetries + 1} for query: "${query}"${isMedical ? ' (medical)' : ''}`);
           
           return await performSearchAttempt(query, options, currentBrowser, useHeadless);

       } catch (error) {
           const err = error as Error;
           lastError = err;
           retryCount++;

           if (err.message === "CAPTCHA_RETRY_NON_HEADLESS" && retryCount <= maxRetries) {
               logger.info(`[GoogleSearch] Retrying search in non-headless mode (attempt ${retryCount + 1})`);
               // Force non-headless mode for retry
               continue;
               
           } else if (err.message === "CAPTCHA_RETRY_WITH_NEW_BROWSER" && retryCount <= maxRetries) {
               logger.info(`[GoogleSearch] Retrying search with new browser instance (attempt ${retryCount + 1})`);
               // Don't use existing browser for retry
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
* Enhanced multiple Google searches with medical query optimization
*/
export async function multiGoogleSearch(
   queries: string[], 
   options: SearchOptions = {}
): Promise<SearchResponse[]> {
   if (!queries || queries.length === 0) {
       throw new Error("At least one search query is required");
   }

   const startTime = Date.now();
   const medicalQueries = queries.filter(q => isMedicalQuery(q));
   
   logger.info(`[MultiSearch] Starting multiple searches for ${queries.length} queries (${medicalQueries.length} medical)...`);

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
               const searchOptions: SearchOptions = {
                   ...options,
                   // Use adaptive quality thresholds for medical queries
                   minQualityScore: options.minQualityScore || (isMedicalQuery(query) ? 0.1 : 0.3),
                   stateFile: options.stateFile 
                       ? `${options.stateFile}-${i + batchIndex}`
                       : `./browser-state-${i + batchIndex}.json`,
               };
               
               const globalIndex = i + batchIndex;
               const isMedical = isMedicalQuery(query);
               logger.info(`[MultiSearch] Starting search #${globalIndex + 1} for query: "${query}"${isMedical ? ' (medical)' : ''}`);
               
               return googleSearch(query, searchOptions, sharedBrowser || undefined);
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
       const medicalResults = results.filter((r, i) => isMedicalQuery(queries[i]));
       
       logger.info(`[MultiSearch] Completed in ${duration}ms: ${successCount}/${queries.length} successful searches, ${totalResults} total results (${medicalResults.length} medical searches)`);

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

// Export enhanced quality configuration for external use
export { qualityConfig };