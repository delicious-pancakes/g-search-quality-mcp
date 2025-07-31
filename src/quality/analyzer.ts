// src/quality/analyzer.ts
import { SearchResult, QualityConfig, QueryDomain, DomainConfig } from './types.js';
import { defaultQualityConfig } from './config.js';

export class SearchQualityAnalyzer {
    private config: QualityConfig;
    
    constructor(config: QualityConfig = defaultQualityConfig) {
        this.config = config;
    }
    
    /**
     * Detect if query is domain-specific (medical, JavaScript, etc.)
     */
    detectQueryDomain(query: string): QueryDomain {
        const lowerQuery = query.toLowerCase();
        
        if (this.config.medicalConfig.keywords.some(keyword => lowerQuery.includes(keyword))) {
            return 'medical';
        }
        
        if (this.config.jsConfig.keywords.some(keyword => lowerQuery.includes(keyword))) {
            return 'javascript';
        }
        
        return 'general';
    }
    
    /**
     * Validate and score a single search result
     */
    validateSearchResult(result: SearchResult, query: string): SearchResult {
        const domain = this.detectQueryDomain(query);
        const domainConfig = this.getDomainConfig(domain);
        
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
        
        // Content quality
        score += this.validateContent(result, query, domain);
        
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
        
        // Detect source type
        analyzed.sourceType = this.detectSourceType(result.link);
        
        // Detect code examples (for technical content)
        if (domain === 'javascript' || this.hasCodeContent(result.snippet)) {
            analyzed.hasCodeExamples = this.detectCodeExamples(result.snippet);
            analyzed.difficulty = this.estimateDifficulty(result, domain);
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
    
    // Private helper methods
    
    private getDomainConfig(domain: QueryDomain): DomainConfig {
        switch (domain) {
            case 'medical': return this.config.medicalConfig;
            case 'javascript': return this.config.jsConfig;
            default: return {
                minTitleLength: this.config.minTitleLength,
                minSnippetLength: this.config.minSnippetLength,
                minRelevantWords: this.config.minRelevantWords,
                authorityBoost: 0.3,
                keywords: []
            };
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
    
    private validateContent(result: SearchResult, query: string, domain: QueryDomain): number {
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
        
        // Domain-specific content validation
        if (domain === 'javascript') {
            score += this.validateJavaScriptContent(result);
        } else if (domain === 'medical') {
            score += this.validateMedicalContent(result);
        }
        
        // Check for proper sentence structure in snippet
        if (/^[A-Z].*[.!?]$/.test(result.snippet)) {
            score += 0.1;
        }
        
        // Penalize very repetitive content
        const words = result.snippet.toLowerCase().split(/\s+/);
        const uniqueWords = new Set(words);
        const diversity = uniqueWords.size / words.length;
        
        if (diversity < 0.5) {
            score -= 0.1; // Penalize repetitive content
        }
        
        return Math.max(0, Math.min(1, score));
    }
    
    private validateJavaScriptContent(result: SearchResult): number {
        let score = 0;
        
        // Check for code indicators
        const codeIndicators = this.config.jsConfig.codeIndicators || [];
        const hasCode = codeIndicators.some(indicator =>
            result.snippet.includes(indicator)
        );
        
        if (hasCode) {
            score += 0.2;
        }
        
        // Check for practical examples and tutorials
        const practicalPatterns = [
            /example|demo|tutorial|how.to|guide/i,
            /step.by.step|walkthrough/i,
            /best.practices|tips|tricks/i,
            /beginner|advanced|intermediate/i
        ];
        
        if (practicalPatterns.some(pattern => pattern.test(result.title + ' ' + result.snippet))) {
            score += 0.15;
        }
        
        // Bonus for code blocks or formatted code
        if (/```|`[^`]+`|<code>|<pre>/i.test(result.snippet)) {
            score += 0.1;
        }
        
        // Check for JavaScript ecosystem terms
        const ecosystemTerms = [
            'npm', 'yarn', 'webpack', 'babel', 'eslint', 'typescript',
            'react', 'vue', 'angular', 'node.js', 'express', 'next.js'
        ];
        
        const hasEcosystemTerms = ecosystemTerms.some(term =>
            result.title.toLowerCase().includes(term) ||
            result.snippet.toLowerCase().includes(term)
        );
        
        if (hasEcosystemTerms) {
            score += 0.1;
        }
        
        return score;
    }
    
    private validateMedicalContent(result: SearchResult): number {
        let score = 0;
        
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
            /(clinical trial|randomized|peer.reviewed)/i,
            /(meta.analysis|systematic review)/i,
            /\b(rct|randomized controlled trial)\b/i
        ];
        
        if (authoritativePatterns.some(pattern => 
            pattern.test(result.title) || pattern.test(result.snippet))) {
            score += 0.2;
        }
        
        // Check for evidence-based language
        const evidencePatterns = [
            /evidence.based|evidence.shows/i,
            /statistically significant/i,
            /peer.reviewed|peer reviewed/i,
            /systematic.review|meta.analysis/i
        ];
        
        if (evidencePatterns.some(pattern => 
            pattern.test(result.title) || pattern.test(result.snippet))) {
            score += 0.1;
        }
        
        return score;
    }
    
    private detectSourceType(url: string): SearchResult['sourceType'] {
        const lowerUrl = url.toLowerCase();
        
        // Medical authorities
        if (/\.(gov|edu)$/.test(lowerUrl) || 
            /(cdc|nih|who|fda|pubmed|nature|nejm|jama|bmj|lancet|mayoclinic)/.test(lowerUrl)) {
            return 'Medical Authority';
        }
        
        // Code repositories
        if (lowerUrl.includes('github.com') || lowerUrl.includes('gitlab.com') || lowerUrl.includes('bitbucket.org')) {
            return 'Code Repository';
        }
        
        // Q&A sites
        if (lowerUrl.includes('stackoverflow.com') || lowerUrl.includes('stackexchange.com')) {
            return 'Q&A';
        }
        
        // Documentation
        if (lowerUrl.includes('developer.mozilla.org') || 
            lowerUrl.includes('/docs/') || 
            lowerUrl.includes('documentation') ||
            /(nodejs|typescript-lang|reactjs)\.org/.test(lowerUrl)) {
            return 'Documentation';
        }
        
        // Blogs and articles
        if (lowerUrl.includes('medium.com') || 
            lowerUrl.includes('dev.to') || 
            lowerUrl.includes('blog') ||
            lowerUrl.includes('freecodecamp.org')) {
            return 'Blog';
        }
        
        // News sites
        if (/(news|cnn|bbc|reuters|ap\.org|npr\.org)/.test(lowerUrl)) {
            return 'News';
        }
        
        return 'Tutorial';
    }
    
    private hasCodeContent(snippet: string): boolean {
        // Check for common code patterns
        const codePatterns = [
            /function\s*\([^)]*\)/,
            /=>\s*[{(]/,
            /const\s+\w+\s*=/,
            /let\s+\w+\s*=/,
            /var\s+\w+\s*=/,
            /class\s+\w+/,
            /import\s+.*from/,
            /export\s+(default\s+)?(function|class|const)/
        ];
        
        return codePatterns.some(pattern => pattern.test(snippet));
    }
    
    private detectCodeExamples(snippet: string): boolean {
        // Look for formatted code blocks or inline code
        const formattedCodePatterns = [
            /```[\s\S]*?```/, // Code fences
            /`[^`\n]{3,}`/, // Inline code (at least 3 chars)
            /<code>[\s\S]*?<\/code>/, // HTML code tags
            /<pre>[\s\S]*?<\/pre>/, // HTML pre tags
        ];
        
        // Look for multiple code indicators on same line
        const codeLinePatterns = [
            /function.*{.*}/, // Complete function definition
            /const.*=.*=>/, // Arrow function assignment
            /\w+\.\w+\([^)]*\)/, // Method calls
        ];
        
        return formattedCodePatterns.some(pattern => pattern.test(snippet)) ||
               codeLinePatterns.some(pattern => pattern.test(snippet));
    }
    
    private estimateDifficulty(result: SearchResult, domain: QueryDomain): SearchResult['difficulty'] {
        const content = (result.title + ' ' + result.snippet).toLowerCase();
        
        if (domain === 'javascript') {
            // Advanced JavaScript concepts
            const advancedTerms = [
                'closure', 'prototype', 'async', 'promise', 'generator', 'proxy',
                'webpack', 'babel', 'advanced', 'complex', 'optimization',
                'performance', 'architecture', 'design patterns', 'microservices',
                'typescript', 'decorator', 'reflection', 'metaprogramming'
            ];
            
            // Beginner JavaScript concepts
            const beginnerTerms = [
                'variable', 'loop', 'if', 'basic', 'intro', 'beginner', 'start',
                'getting started', 'first steps', 'fundamentals', 'basics',
                'hello world', 'simple', 'easy', 'tutorial for beginners'
            ];
            
            const advancedCount = advancedTerms.filter(term => content.includes(term)).length;
            const beginnerCount = beginnerTerms.filter(term => content.includes(term)).length;
            
            if (advancedCount >= 2) {
                return 'Advanced';
            } else if (beginnerCount >= 1) {
                return 'Beginner';
            }
        } else if (domain === 'medical') {
            // Medical complexity indicators
            const complexTerms = [
                'pathophysiology', 'pharmacokinetics', 'meta-analysis',
                'randomized controlled', 'systematic review', 'clinical trial',
                'biomarker', 'genomics', 'proteomics'
            ];
            
            const basicTerms = [
                'overview', 'introduction', 'basics', 'what is',
                'simple explanation', 'general information'
            ];
            
            if (complexTerms.some(term => content.includes(term))) {
                return 'Advanced';
            } else if (basicTerms.some(term => content.includes(term))) {
                return 'Beginner';
            }
        }
        
        return 'Intermediate';
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
     * Enhance snippet content for better readability
     */
    enhanceSnippet(result: SearchResult, domain: QueryDomain): SearchResult {
        const enhanced = { ...result };
        
        if (domain === 'javascript') {
            // Try to format code snippets better
            enhanced.snippet = this.formatJavaScriptSnippet(result.snippet);
        }
        
        // Clean up common snippet issues
        enhanced.snippet = enhanced.snippet
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/^\s*...\s*/, '') // Remove leading ellipsis
            .replace(/\s*...\s*$/, '') // Remove trailing ellipsis
            .trim();
        
        return enhanced;
    }
    
    private formatJavaScriptSnippet(snippet: string): string {
        // Add line breaks before common code patterns for better readability
        let formatted = snippet
            .replace(/(function\s+\w+)/g, '\n$1')
            .replace(/(const\s+\w+\s*=)/g, '\n$1')
            .replace(/(let\s+\w+\s*=)/g, '\n$1')
            .replace(/(\w+\.\w+\()/g, '\n$1')
            .replace(/({[^}]{20,})/g, '\n$1') // Break long object literals
            .trim();
        
        // Remove excessive line breaks
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        
        return formatted;
    }
    
    /**
     * Get quality statistics for a set of results
     */
    getQualityStats(results: SearchResult[]): {
        totalResults: number;
        averageScore: number;
        highQualityCount: number;
        sourceTypeDistribution: { [key: string]: number };
        commonIssues: { [key: string]: number };
    } {
        const totalResults = results.length;
        const scores = results.map(r => r.score || 0);
        const averageScore = scores.reduce((sum, score) => sum + score, 0) / totalResults;
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
        
        return {
            totalResults,
            averageScore,
            highQualityCount,
            sourceTypeDistribution,
            commonIssues
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

export function analyzeResultsQuality(results: SearchResult[]): any {
    const analyzer = createQualityAnalyzer();
    return analyzer.getQualityStats(results);
}

// Re-export types for convenience
export type { SearchResult, QualityConfig, QueryDomain, DomainConfig } from './types.js';