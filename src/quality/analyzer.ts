// src/quality/analyzer.ts
import { SearchResult, QualityConfig, QueryDomain, DomainConfig } from './types.js';
import { defaultQualityConfig } from './config.js';
import { MedicalDomainHandler } from './domains/medical.js';
import { JavaScriptDomainHandler } from './domains/javascript.js';
import { NimDomainHandler } from './domains/nim.js';
import { GeneralDomainHandler } from './domains/general.js';

export class SearchQualityAnalyzer {
    private config: QualityConfig;
    private medicalHandler: MedicalDomainHandler;
    private jsHandler: JavaScriptDomainHandler;
    private nimHandler: NimDomainHandler;
    private generalHandler: GeneralDomainHandler;
    
    constructor(config: QualityConfig = defaultQualityConfig) {
        this.config = config;
        this.medicalHandler = new MedicalDomainHandler();
        this.jsHandler = new JavaScriptDomainHandler();
        this.nimHandler = new NimDomainHandler();
        this.generalHandler = new GeneralDomainHandler();
    }
    
    /**
     * Detect if query is domain-specific (medical, JavaScript, Nim, etc.)
     */
    detectQueryDomain(query: string): QueryDomain {
        const lowerQuery = query.toLowerCase();
        
        if (this.config.medicalConfig.keywords.some(keyword => lowerQuery.includes(keyword))) {
            return 'medical';
        }
        
        if (this.config.jsConfig.keywords.some(keyword => lowerQuery.includes(keyword))) {
            return 'javascript';
        }
        
        if (this.config.nimConfig.keywords.some(keyword => lowerQuery.includes(keyword))) {
            return 'nim';
        }
        
        return 'general';
    }
    
    /**
     * Validate and score a single search result
     */
    validateSearchResult(result: SearchResult, query: string): SearchResult {
        const domain = this.detectQueryDomain(query);
        const domainConfig = this.getDomainConfig(domain);
        const handler = this.getDomainHandler(domain);
        
        let score = 0.5; // Start with neutral score
        const issues: string[] = [];
        
        // Basic validation
        if (!result.title || !result.link || !result.snippet) {
            issues.push('Missing required fields');
            return { ...result, score: 0, issues };
        }
        
        // Length validation with domain-specific thresholds
        score += this.validateLength(result, domainConfig, issues);
        
        // Query relevance with synonym support
        score += this.validateRelevance(result, query, domainConfig, issues);
        
        // URL quality
        score += this.validateUrl(result.link, domain, issues);
        
        // Domain-specific content validation
        score += handler.validateContent(result);
        
        // General content quality checks
        score += this.validateGeneralContent(result, query);
        
        // Nim-specific additional validation
        if (domain === 'nim' && 'validateNimSpecificPatterns' in handler) {
            score += (handler as NimDomainHandler).validateNimSpecificPatterns(result);
        }
        
        // Normalize score to 0-1 range
        score = Math.max(0, Math.min(1, score));
        
        // Apply domain-specific authority boosts
        if (domain !== 'general' && this.isAuthoritySource(result.link, domain)) {
            score = Math.min(1, score + domainConfig.authorityBoost);
        }
        
        return {
            ...result,
            score,
            issues: issues.length > 0 ? issues : undefined
        };
    }
    
    /**
     * Apply quality filtering to a list of results
     */
    applyQualityFiltering(
        results: SearchResult[], 
        query: string, 
        minQualityScore: number = 0.3
    ): SearchResult[] {
        const domain = this.detectQueryDomain(query);
        
        // Use lower threshold for domain-specific queries to avoid filtering out legitimate content
        const adjustedMinScore = domain !== 'general' 
            ? Math.min(minQualityScore, 0.1) 
            : minQualityScore;
        
        const validatedResults = results
            .map(result => this.validateSearchResult(result, query))
            .filter(result => result.score! >= adjustedMinScore)
            .sort((a, b) => b.score! - a.score!);
        
        return this.deduplicateResults(validatedResults);
    }
    
    /**
     * Enhanced result analysis with metadata enrichment
     */
    analyzeResult(result: SearchResult, query: string): SearchResult {
        const analyzed = { ...result };
        const domain = this.detectQueryDomain(query);
        const handler = this.getDomainHandler(domain);
        
        // Use domain-specific handlers for analysis
        analyzed.sourceType = handler.detectSourceType(result.link);
        analyzed.difficulty = handler.estimateDifficulty(result);
        
        // Detect code examples for technical content
        if (domain === 'javascript') {
            analyzed.hasCodeExamples = this.jsHandler.detectCodeExamples(result.snippet);
        } else if (domain === 'nim') {
            analyzed.hasCodeExamples = this.nimHandler.detectCodeExamples(result.snippet);
        }
        
        // Content length classification
        analyzed.contentLength = result.snippet.length > 200 ? 'Long' : 
                                result.snippet.length > 100 ? 'Medium' : 'Short';
        
        return analyzed;
    }
    
    /**
     * Validate and clean search results array
     */
    validateResults(results: SearchResult[]): SearchResult[] {
        if (!Array.isArray(results)) {
            console.warn("[SearchQuality] Results is not an array, converting...");
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
     * Enhance snippet content for better readability using domain handlers
     */
    enhanceSnippet(result: SearchResult, domain: QueryDomain): SearchResult {
        const enhanced = { ...result };
        const handler = this.getDomainHandler(domain);
        
        if (domain === 'javascript' && 'formatSnippet' in handler) {
            enhanced.snippet = (handler as JavaScriptDomainHandler).formatSnippet(result.snippet);
        } else if (domain === 'nim' && 'formatSnippet' in handler) {
            enhanced.snippet = (handler as NimDomainHandler).formatSnippet(result.snippet);
        }
        
        // Clean up common snippet issues
        enhanced.snippet = enhanced.snippet
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/^\s*...\s*/, '') // Remove leading ellipsis
            .replace(/\s*...\s*$/, '') // Remove trailing ellipsis
            .trim();
        
        return enhanced;
    }
    
    /**
     * Get quality statistics for a set of results with domain breakdown
     */
    getQualityStats(results: SearchResult[], query?: string): {
        totalResults: number;
        averageScore: number;
        highQualityCount: number;
        sourceTypeDistribution: { [key: string]: number };
        commonIssues: { [key: string]: number };
        detectedDomain?: QueryDomain;
        domainSpecificStats?: any;
    } {
        const totalResults = results.length;
        const scores = results.map(r => r.score || 0);
        const averageScore = totalResults > 0 ? scores.reduce((sum, score) => sum + score, 0) / totalResults : 0;
        const highQualityCount = results.filter(r => (r.score || 0) >= 0.7).length;
        
        // Source type distribution
        const sourceTypeDistribution: { [key: string]: number } = {};
        results.forEach(r => {
            const type = r.sourceType || 'Unknown';
            sourceTypeDistribution[type] = (sourceTypeDistribution[type] || 0) + 1;
        });
        
        // Common issues
        const commonIssues: { [key: string]: number } = {};
        results.forEach(r => {
            if (r.issues) {
                r.issues.forEach(issue => {
                    commonIssues[issue] = (commonIssues[issue] || 0) + 1;
                });
            }
        });
        
        const stats: any = {
            totalResults,
            averageScore,
            highQualityCount,
            sourceTypeDistribution,
            commonIssues
        };
        
        // Add domain-specific stats if query provided
        if (query) {
            const domain = this.detectQueryDomain(query);
            stats.detectedDomain = domain;
            
            // Domain-specific statistics
            if (domain === 'nim') {
                const nimResults = results.filter(r => 
                    this.nimHandler.hasCodeContent(r.snippet) ||
                    (this.nimHandler as any).isComparativeContent?.(r) ||
                    false
                );
                stats.domainSpecificStats = {
                    codeExampleCount: nimResults.length,
                    comparativeContentCount: results.filter(r => 
                        (this.nimHandler as any).isComparativeContent?.(r) || false
                    ).length
                };
            } else if (domain === 'javascript') {
                stats.domainSpecificStats = {
                    codeExampleCount: results.filter(r => r.hasCodeExamples).length,
                    frameworkMentions: results.filter(r => 
                        /(react|vue|angular|node|npm)/.test(r.snippet.toLowerCase())
                    ).length
                };
            } else if (domain === 'medical') {
                stats.domainSpecificStats = {
                    authoritySourceCount: results.filter(r => r.sourceType === 'Medical Authority').length,
                    studyMentions: results.filter(r => 
                        /(study|research|trial|clinical)/.test(r.snippet.toLowerCase())
                    ).length
                };
            }
        }
        
        return stats;
    }
    
    // Private helper methods
    
    private getDomainConfig(domain: QueryDomain): DomainConfig {
        switch (domain) {
            case 'medical': return this.config.medicalConfig;
            case 'javascript': return this.config.jsConfig;
            case 'nim': return this.config.nimConfig;
            default: return {
                minTitleLength: this.config.minTitleLength,
                minSnippetLength: this.config.minSnippetLength,
                minRelevantWords: this.config.minRelevantWords,
                authorityBoost: 0.3,
                keywords: []
            };
        }
    }
    
    private getDomainHandler(domain: QueryDomain) {
        switch (domain) {
            case 'medical': return this.medicalHandler;
            case 'javascript': return this.jsHandler;
            case 'nim': return this.nimHandler;
            default: return this.generalHandler;
        }
    }
    
    private validateLength(result: SearchResult, config: DomainConfig, issues: string[]): number {
        let score = 0;
        
        if (result.title.length < config.minTitleLength) {
            issues.push('Title too short');
            score -= 0.2;
        }
        
        if (result.snippet.length < config.minSnippetLength) {
            issues.push('Snippet too short');
            score -= 0.2;
        } else if (result.snippet.length > this.config.maxSnippetLength) {
            // Truncate long snippets but don't penalize
            result.snippet = result.snippet.substring(0, this.config.maxSnippetLength) + '...';
        } else {
            // Add bonus for snippets close to ideal length
            const lengthDiff = Math.abs(result.snippet.length - this.config.idealSnippetLength);
            if (lengthDiff <= this.config.snippetLengthTolerance) {
                const bonus = 0.1 * (1 - lengthDiff / this.config.snippetLengthTolerance);
                score += bonus;
            }
        }
        
        return score;
    }
    
    private validateRelevance(result: SearchResult, query: string, config: DomainConfig, issues: string[]): number {
        const queryWords = query.toLowerCase().split(/\s+/);
        const titleWords = result.title.toLowerCase().split(/\s+/);
        const snippetWords = result.snippet.toLowerCase().split(/\s+/);
        let relevantWords = 0;
        
        // Direct word matches
        for (const word of queryWords) {
            if (titleWords.includes(word) || snippetWords.includes(word)) {
                relevantWords++;
            }
        }
        
        // Synonym matching for domain-specific queries
        if (config.synonyms) {
            for (const word of queryWords) {
                const synonyms = config.synonyms[word] || [];
                for (const synonym of synonyms) {
                    if (titleWords.includes(synonym) || snippetWords.includes(synonym)) {
                        relevantWords += 0.8; // Partial credit for synonyms
                    }
                }
            }
        }
        
        if (relevantWords < config.minRelevantWords) {
            issues.push('Low query relevance');
            return -0.3;
        }
        
        return (relevantWords / queryWords.length) * this.config.snippetWeight;
    }
    
    private validateUrl(url: string, domain: QueryDomain, issues: string[]): number {
        const lowerUrl = url.toLowerCase();
        
        // Check domain-specific trusted sources first
        const domainConfig = this.getDomainConfig(domain);
        if (domainConfig.trustedDomains?.some(pattern => pattern.test(url))) {
            return 0.7; // Higher score for domain-specific authorities
        }
        
        // Check general trusted domains
        if (this.config.urlPatterns.trusted.some(pattern => pattern.test(url))) {
            return 0.5;
        }
        
        // Check avoid list (penalize heavily)
        if (this.config.urlPatterns.avoid.some(pattern => pattern.test(url))) {
            issues.push('Low-quality source');
            return -0.5;
        }
        
        // Check suspicious patterns
        if (this.config.urlPatterns.suspicious.some(pattern => pattern.test(url))) {
            issues.push('Suspicious URL pattern');
            return -0.3;
        }
        
        return 0;
    }
    
    private validateGeneralContent(result: SearchResult, query: string): number {
        let score = 0;
        
        // Check for spam words
        const hasSpamWords = this.config.spamWords.some(word =>
            result.title.toLowerCase().includes(word) ||
            result.snippet.toLowerCase().includes(word)
        );
        
        if (hasSpamWords) {
            score -= 0.3;
        }
        
        // Calculate query term density
        const queryWords = query.toLowerCase().split(/\s+/);
        const titleDensity = queryWords.filter(word =>
            result.title.toLowerCase().includes(word)
        ).length / queryWords.length;
        
        const snippetDensity = queryWords.filter(word =>
            result.snippet.toLowerCase().includes(word)
        ).length / queryWords.length;
        
        score += (titleDensity * 0.3 + snippetDensity * 0.2);
        
        // Check for proper sentence structure in snippet
        if (/^[A-Z].*[.!?]$/.test(result.snippet)) {
            score += 0.05;
        }
        
        // Penalize very repetitive content
        const words = result.snippet.toLowerCase().split(/\s+/);
        const uniqueWords = new Set(words);
        const diversity = uniqueWords.size / words.length;
        
        if (diversity < 0.5) {
            score -= 0.1; // Penalize repetitive content
        }
        
        return score;
    }
    
    private isAuthoritySource(url: string, domain: QueryDomain): boolean {
        const domainConfig = this.getDomainConfig(domain);
        
        // Check domain-specific trusted sources
        if (domainConfig.trustedDomains?.some(pattern => pattern.test(url))) {
            return true;
        }
        
        // Check general trusted patterns
        return this.config.urlPatterns.trusted.some(pattern => pattern.test(url));
    }
    
    private deduplicateResults(results: SearchResult[]): SearchResult[] {
        const seen = new Set<string>();
        const unique: SearchResult[] = [];
        
        for (const result of results) {
            // Create content signature for deduplication
            const signature = result.title.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .split(/\s+/)
                .sort()
                .slice(0, 5)
                .join(' ');
            
            // Also check URL for exact duplicates
            const urlSignature = result.link.toLowerCase();
            
            if (!seen.has(signature) && !seen.has(urlSignature)) {
                seen.add(signature);
                seen.add(urlSignature);
                unique.push(result);
            }
        }
        
        return unique;
    }
    
    /**
     * Get domain-specific insights for results
     */
    getDomainInsights(results: SearchResult[], query: string): {
        domain: QueryDomain;
        insights: string[];
        recommendations: string[];
    } {
        const domain = this.detectQueryDomain(query);
        const insights: string[] = [];
        const recommendations: string[] = [];
        
        const codeExampleCount = results.filter(r => r.hasCodeExamples).length;
        const authorityCount = results.filter(r => this.isAuthoritySource(r.link, domain)).length;
        const averageScore = results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length;
        
        // Domain-specific insights
        if (domain === 'nim') {
            const nimOfficialCount = results.filter(r => r.link.includes('nim-lang.org')).length;
            const comparativeCount = results.filter(r => 
                (this.nimHandler as any).isComparativeContent?.(r) || false
            ).length;
            
            insights.push(`Found ${nimOfficialCount} results from official Nim sources`);
            insights.push(`${comparativeCount} results discuss Nim comparisons with other languages`);
            
            if (nimOfficialCount === 0) {
                recommendations.push('Consider searching nim-lang.org directly for official documentation');
            }
            if (codeExampleCount < results.length * 0.3) {
                recommendations.push('Try more specific Nim code-related queries like "nim proc example" or "nim template tutorial"');
            }
            
        } else if (domain === 'javascript') {
            const mdnCount = results.filter(r => r.link.includes('developer.mozilla.org')).length;
            const frameworkCount = results.filter(r => 
                /(react|vue|angular|node)/.test(r.snippet.toLowerCase())
            ).length;
            
            insights.push(`Found ${mdnCount} results from MDN (Mozilla Developer Network)`);
            insights.push(`${frameworkCount} results mention popular JavaScript frameworks`);
            
            if (mdnCount === 0) {
                recommendations.push('Consider checking MDN for authoritative JavaScript documentation');
            }
            
        } else if (domain === 'medical') {
            const govCount = results.filter(r => r.link.includes('.gov')).length;
            const peerReviewedCount = results.filter(r => 
                /(peer.reviewed|clinical.trial|study)/.test(r.snippet.toLowerCase())
            ).length;
            
            insights.push(`Found ${govCount} results from government health authorities`);
            insights.push(`${peerReviewedCount} results mention peer-reviewed research or clinical trials`);
            
            if (govCount === 0) {
                recommendations.push('Consider checking official health authorities like CDC, WHO, or NIH');
            }
        }
        
        // General quality insights
        if (averageScore < 0.5) {
            recommendations.push('Try more specific search terms to improve result quality');
        }
        
        if (codeExampleCount === 0 && (domain === 'javascript' || domain === 'nim')) {
            recommendations.push('Add "example" or "tutorial" to your query to find more practical code samples');
        }
        
        return {
            domain,
            insights,
            recommendations
        };
    }
}

// Export convenience functions
export function createQualityAnalyzer(customConfig?: Partial<QualityConfig>): SearchQualityAnalyzer {
    const config = customConfig ? { ...defaultQualityConfig, ...customConfig } : defaultQualityConfig;
    return new SearchQualityAnalyzer(config);
}

export function validateResults(results: SearchResult[], query: string, minScore: number = 0.3): SearchResult[] {
    const analyzer = createQualityAnalyzer();
    return analyzer.applyQualityFiltering(results, query, minScore);
}

export function analyzeResultsQuality(results: SearchResult[], query?: string): any {
    const analyzer = createQualityAnalyzer();
    return analyzer.getQualityStats(results, query);
}

export function getDomainInsights(results: SearchResult[], query: string): any {
    const analyzer = createQualityAnalyzer();
    return analyzer.getDomainInsights(results, query);
}

// Re-export types for convenience
export type { SearchResult, QualityConfig, QueryDomain, DomainConfig } from './types.js';

// Re-export domain handlers for advanced usage
export { MedicalDomainHandler } from './domains/medical.js';
export { JavaScriptDomainHandler } from './domains/javascript.js';
export { NimDomainHandler } from './domains/nim.js';
export { GeneralDomainHandler } from './domains/general.js';