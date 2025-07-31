// src/quality/domains/javascript.ts
import { DomainConfig, SearchResult, QueryDomain } from '../types.js';

export const javascriptConfig: DomainConfig = {
    minTitleLength: 3,
    minSnippetLength: 20,
    minRelevantWords: 1,
    authorityBoost: 0.8,
    keywords: [
        'javascript', 'js', 'typescript', 'node', 'react', 'vue', 'angular',
        'function', 'async', 'promise', 'callback', 'closure', 'prototype',
        'dom', 'api', 'framework', 'library', 'npm', 'webpack', 'babel',
        'tips', 'tricks', 'best practices', 'tutorial', 'guide', 'example', 
        'esm', 'cjs', 'module', 'package.json', 'eslint', 'prettier', 
        'jest', 'cypress', 'vitest', 'rollup', 'vite', 'parcel'
    ],
    codeIndicators: ['function', '=>', 'const', 'let', 'var', 'class', 'import', 'export', '{', '}', '()', '[]'],
    trustedDomains: [
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(developer\.mozilla\.org|mdn\.)/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(javascript\.info)/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(nodejs\.org)/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(typescript-lang\.org)/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(freecodecamp\.org)/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(dev\.to)/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*github\.com/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*stackoverflow\.com/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(babeljs\.io)/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(vitejs\.dev)/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(jestjs\.io)/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(eslint\.org)/,
    ],
    synonyms: {
        'javascript': ['js', 'ecmascript', 'node.js', 'nodejs'],
        'function': ['method', 'procedure', 'callback'],
        'async': ['asynchronous', 'promise', 'await'],
        'tips': ['tricks', 'hacks', 'best practices', 'patterns']
    }
};

export class JavaScriptDomainHandler {
    validateContent(result: SearchResult): number {
        let score = 0;
        
        // Check for code indicators
        const codeIndicators = javascriptConfig.codeIndicators || [];
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
    
    hasCodeContent(snippet: string): boolean {
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
    
    detectCodeExamples(snippet: string): boolean {
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
    
    estimateDifficulty(result: SearchResult): SearchResult['difficulty'] {
        const content = (result.title + ' ' + result.snippet).toLowerCase();
        
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
        
        return 'Intermediate';
    }
    
    detectSourceType(url: string): SearchResult['sourceType'] {
        const lowerUrl = url.toLowerCase();
        
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
        
        return 'Tutorial';
    }
    
    formatSnippet(snippet: string): string {
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
}
