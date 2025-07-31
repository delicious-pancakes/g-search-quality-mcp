// src/quality/domains/nim.ts
import { DomainConfig, SearchResult } from '../types.js';

export const nimConfig: DomainConfig = {
    minTitleLength: 3,
    minSnippetLength: 20,
    minRelevantWords: 1,
    authorityBoost: 0.8,
    keywords: [
        'nim', 'nim-lang', 'nimrod', 'nimble', 'nimsuggest', 'nimscript',
        'proc', 'template', 'macro', 'iterator', 'converter', 'method',
        'var', 'let', 'const', 'type', 'object', 'ref', 'ptr', 'seq',
        'array', 'string', 'int', 'float', 'bool', 'char', 'range',
        'gc', 'memory management', 'compile time', 'metaprogramming',
        'async', 'threading', 'channels', 'parallelism', 'performance',
        'systems programming', 'zero cost', 'manual memory'
    ],
    codeIndicators: [
        'proc', 'func', 'template', 'macro', 'iterator', 'converter',
        'var', 'let', 'const', 'type', 'when', 'case', 'of', 'elif',
        'discard', 'result', 'return', 'yield', 'break', 'continue',
        'import', 'include', 'from', 'export', 'echo', 'new', 'addr'
    ],
    trustedDomains: [
        /^https?:\/\/([a-zA-Z0-9-]+\.)*nim-lang\.org/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*nim-lang\.github\.io/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*forum\.nim-lang\.org/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*github\.com\/nim-lang/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*nimble\.directory/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*rosettacode\.org.*nim/i,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*stackoverflow\.com.*nim/i,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*reddit\.com\/r\/nim/i,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*dev\.to.*nim/i,
    ],
    synonyms: {
        'nim': ['nim-lang', 'nimrod'],
        'proc': ['procedure', 'function', 'def'],
        'template': ['generic', 'metaprogramming'],
        'macro': ['metaprogramming', 'compile-time'],
        'seq': ['sequence', 'array', 'list'],
        'async': ['asynchronous', 'await', 'future'],
        'gc': ['garbage collector', 'memory management'],
        'performance': ['speed', 'fast', 'efficient', 'optimization']
    }
};

export class NimDomainHandler {
    validateContent(result: SearchResult): number {
        let score = 0;
        
        // Check for Nim-specific code indicators
        const nimCodeIndicators = nimConfig.codeIndicators || [];
        const hasNimCode = nimCodeIndicators.some(indicator =>
            result.snippet.includes(indicator)
        );
        
        if (hasNimCode) {
            score += 0.25; // Higher score for actual Nim code
        }
        
        // Check for Nim-specific concepts
        const nimConcepts = [
            'compile time', 'zero cost', 'manual memory', 'gc:none',
            'metaprogramming', 'ast', 'hygiene', 'gensym', 'quote',
            'untyped', 'typed', 'static', 'concepts', 'generics',
            'nim-lang', 'nimble', 'nimsuggest', 'nimscript'
        ];
        
        const hasNimConcepts = nimConcepts.some(concept =>
            result.title.toLowerCase().includes(concept) ||
            result.snippet.toLowerCase().includes(concept)
        );
        
        if (hasNimConcepts) {
            score += 0.2;
        }
        
        // Check for practical examples and tutorials
        const practicalPatterns = [
            /example|demo|tutorial|how.to|guide/i,
            /step.by.step|walkthrough/i,
            /best.practices|tips|tricks|patterns/i,
            /beginner|getting.started|introduction/i,
            /advanced|expert|deep.dive/i
        ];
        
        if (practicalPatterns.some(pattern => pattern.test(result.title + ' ' + result.snippet))) {
            score += 0.15;
        }
        
        // Bonus for code blocks or formatted code
        if (/```nim|```\s*nim|<code>|<pre>/i.test(result.snippet)) {
            score += 0.15;
        }
        
        // Check for Nim ecosystem and libraries
        const ecosystemTerms = [
            'nimble', 'karax', 'jester', 'prologue', 'asynchttpserver',
            'parseutils', 'strutils', 'sequtils', 'tables', 'sets',
            'json', 'yaml', 'xml', 'regex', 'unittest', 'testament',
            'fusion', 'synthesis', 'pkg', 'nimgen', 'c2nim'
        ];
        
        const hasEcosystemTerms = ecosystemTerms.some(term =>
            result.title.toLowerCase().includes(term) ||
            result.snippet.toLowerCase().includes(term)
        );
        
        if (hasEcosystemTerms) {
            score += 0.1;
        }
        
        // Bonus for performance/systems programming context
        const performanceTerms = [
            'performance', 'speed', 'fast', 'efficient', 'benchmark',
            'systems programming', 'low level', 'embedded', 'gamedev',
            'scientific computing', 'hpc', 'parallel'
        ];
        
        const hasPerformanceContext = performanceTerms.some(term =>
            result.title.toLowerCase().includes(term) ||
            result.snippet.toLowerCase().includes(term)
        );
        
        if (hasPerformanceContext) {
            score += 0.1;
        }
        
        return score;
    }
    
    hasCodeContent(snippet: string): boolean {
        // Check for Nim-specific code patterns
        const nimCodePatterns = [
            /proc\s+\w+\s*\(/,
            /func\s+\w+\s*\(/,
            /template\s+\w+/,
            /macro\s+\w+/,
            /iterator\s+\w+/,
            /converter\s+\w+/,
            /type\s+\w+\s*=/,
            /var\s+\w+\s*:/,
            /let\s+\w+\s*=/,
            /const\s+\w+\s*=/,
            /when\s+\w+:/,
            /case\s+\w+\s+of/,
            /import\s+\w+/,
            /from\s+\w+\s+import/,
            /echo\s+/,
            /result\s*=/,
            /discard\s+/
        ];
        
        return nimCodePatterns.some(pattern => pattern.test(snippet));
    }
    
    detectCodeExamples(snippet: string): boolean {
        // Look for formatted Nim code blocks
        const formattedCodePatterns = [
            /```nim[\s\S]*?```/i, // Nim code fences
            /```\s*[\s\S]*?(proc|func|template|macro|type)[\s\S]*?```/i, // Code blocks with Nim keywords
            /<code>[\s\S]*?(proc|func|template|macro)[\s\S]*?<\/code>/i, // HTML code tags with Nim
            /<pre>[\s\S]*?(proc|func|template|macro)[\s\S]*?<\/pre>/i, // HTML pre tags with Nim
        ];
        
        // Look for Nim-specific code patterns
        const nimCodeLinePatterns = [
            /proc\s+\w+.*=/, // Procedure definition
            /template\s+\w+.*=/, // Template definition
            /macro\s+\w+.*=/, // Macro definition
            /type\s+\w+\s*=\s*(object|enum|ref|ptr)/, // Type definition
            /when\s+\w+:[\s\S]*?else:/, // When statement
            /case\s+\w+\s+of[\s\S]*?else:/, // Case statement
        ];
        
        return formattedCodePatterns.some(pattern => pattern.test(snippet)) ||
               nimCodeLinePatterns.some(pattern => pattern.test(snippet));
    }
    
    estimateDifficulty(result: SearchResult): SearchResult['difficulty'] {
        const content = (result.title + ' ' + result.snippet).toLowerCase();
        
        // Advanced Nim concepts
        const advancedTerms = [
            'metaprogramming', 'macro', 'template', 'ast', 'compile time',
            'generics', 'concepts', 'effects', 'gc:none', 'manual memory',
            'ptr', 'ref', 'unsafe', 'cast', 'converter', 'pragmas',
            'advanced', 'expert', 'complex', 'optimization', 'performance',
            'systems programming', 'low level', 'assembly', 'ffi',
            'threading', 'parallel', 'async', 'channels', 'atomics'
        ];
        
        // Beginner Nim concepts
        const beginnerTerms = [
            'introduction', 'getting started', 'beginner', 'tutorial',
            'first steps', 'basics', 'fundamentals', 'hello world',
            'simple', 'easy', 'start', 'learn nim', 'nim tutorial',
            'basic syntax', 'variables', 'functions', 'loops', 'conditions'
        ];
        
        // Intermediate concepts
        const intermediateTerms = [
            'object oriented', 'modules', 'packages', 'nimble', 'json',
            'files', 'strings', 'arrays', 'sequences', 'tables',
            'error handling', 'exceptions', 'io', 'networking'
        ];
        
        const advancedCount = advancedTerms.filter(term => content.includes(term)).length;
        const beginnerCount = beginnerTerms.filter(term => content.includes(term)).length;
        const intermediateCount = intermediateTerms.filter(term => content.includes(term)).length;
        
        if (advancedCount >= 2) {
            return 'Advanced';
        } else if (beginnerCount >= 1 && advancedCount === 0) {
            return 'Beginner';
        } else if (intermediateCount >= 1) {
            return 'Intermediate';
        }
        
        // Default based on code complexity
        if (/template|macro|generics|concepts/.test(content)) {
            return 'Advanced';
        } else if (/proc|func|basic|simple/.test(content)) {
            return 'Beginner';
        }
        
        return 'Intermediate';
    }
    
    detectSourceType(url: string): SearchResult['sourceType'] {
        const lowerUrl = url.toLowerCase();
        
        // Official Nim documentation
        if (lowerUrl.includes('nim-lang.org') || lowerUrl.includes('nim-lang.github.io')) {
            return 'Documentation';
        }
        
        // Code repositories
        if (lowerUrl.includes('github.com') || lowerUrl.includes('gitlab.com') || lowerUrl.includes('bitbucket.org')) {
            return 'Code Repository';
        }
        
        // Q&A sites
        if (lowerUrl.includes('stackoverflow.com') || lowerUrl.includes('stackexchange.com')) {
            return 'Q&A';
        }
        
        // Nim forum
        if (lowerUrl.includes('forum.nim-lang.org')) {
            return 'Q&A';
        }
        
        // Package directory
        if (lowerUrl.includes('nimble.directory')) {
            return 'Documentation';
        }
        
        // Blogs and articles
        if (lowerUrl.includes('medium.com') || 
            lowerUrl.includes('dev.to') || 
            lowerUrl.includes('blog')) {
            return 'Blog';
        }
        
        // Rosetta Code examples
        if (lowerUrl.includes('rosettacode.org')) {
            return 'Code Repository';
        }
        
        return 'Tutorial';
    }
    
    formatSnippet(snippet: string): string {
        // Add line breaks before common Nim patterns for better readability
        let formatted = snippet
            .replace(/(proc\s+\w+)/g, '\n$1')
            .replace(/(func\s+\w+)/g, '\n$1')
            .replace(/(template\s+\w+)/g, '\n$1')
            .replace(/(macro\s+\w+)/g, '\n$1')
            .replace(/(type\s+\w+\s*=)/g, '\n$1')
            .replace(/(var\s+\w+)/g, '\n$1')
            .replace(/(let\s+\w+)/g, '\n$1')
            .replace(/(const\s+\w+)/g, '\n$1')
            .replace(/(when\s+\w+:)/g, '\n$1')
            .replace(/(case\s+\w+\s+of)/g, '\n$1')
            .replace(/(import\s+\w+)/g, '\n$1')
            .trim();
        
        // Remove excessive line breaks
        formatted = formatted.replace(/\n{3,}/g, '\n\n');
        
        return formatted;
    }
    
    /**
     * Nim-specific quality checks
     */
    validateNimSpecificPatterns(result: SearchResult): number {
        let score = 0;
        const content = (result.title + ' ' + result.snippet).toLowerCase();
        
        // Check for idiomatic Nim patterns
        const idiomaticPatterns = [
            /proc.*:\s*(void|auto|untyped)/,
            /template.*:\s*untyped/,
            /macro.*:\s*untyped/,
            /when\s+defined\(/,
            /when\s+compiles\(/,
            /static:\s*assert/,
            /result\s*=/,
            /discard\s+/
        ];
        
        if (idiomaticPatterns.some(pattern => pattern.test(result.snippet))) {
            score += 0.15;
        }
        
        // Check for Nim compilation targets
        const compilationTargets = [
            'c backend', 'cpp backend', 'js backend', 'compile to c',
            'compile to javascript', 'cross platform', 'embedded',
            'webassembly', 'wasm'
        ];
        
        if (compilationTargets.some(target => content.includes(target))) {
            score += 0.1;
        }
        
        // Check for Nim's unique features
        const uniqueFeatures = [
            'memory safety', 'zero cost abstractions', 'compile time execution',
            'hygiene', 'gensym', 'varargs', 'openarray', 'concepts',
            'effect system', 'exceptions as values', 'nil safety'
        ];
        
        if (uniqueFeatures.some(feature => content.includes(feature))) {
            score += 0.12;
        }
        
        return score;
    }
    
    /**
     * Detect if content discusses Nim vs other languages
     */
    isComparativeContent(result: SearchResult): boolean {
        const content = (result.title + ' ' + result.snippet).toLowerCase();
        const comparisonPatterns = [
            /nim\s+vs\s+/,
            /nim\s+compared\s+to/,
            /nim\s+or\s+(python|rust|go|c\+\+|javascript)/,
            /(python|rust|go|c\+\+|javascript)\s+vs\s+nim/,
            /why\s+nim/,
            /choose\s+nim/,
            /nim\s+advantages/,
            /nim\s+benefits/
        ];
        
        return comparisonPatterns.some(pattern => pattern.test(content));
    }
}
