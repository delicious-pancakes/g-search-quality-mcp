// src/quality/domains/general.ts
import { DomainConfig, SearchResult } from '../types.js';

export const generalConfig: DomainConfig = {
    minTitleLength: 5,
    minSnippetLength: 20,
    minRelevantWords: 1,
    authorityBoost: 0.3,
    keywords: []
};

export class GeneralDomainHandler {
    validateContent(result: SearchResult): number {
        // Basic content validation for general queries
        let score = 0;
        
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
        
        return score;
    }
    
    estimateDifficulty(result: SearchResult): SearchResult['difficulty'] {
        const content = (result.title + ' ' + result.snippet).toLowerCase();
        
        const complexTerms = ['advanced', 'complex', 'sophisticated', 'expert'];
        const basicTerms = ['basic', 'simple', 'intro', 'beginner', 'getting started'];
        
        if (complexTerms.some(term => content.includes(term))) {
            return 'Advanced';
        } else if (basicTerms.some(term => content.includes(term))) {
            return 'Beginner';
        }
        
        return 'Intermediate';
    }
    
    detectSourceType(url: string): SearchResult['sourceType'] {
        const lowerUrl = url.toLowerCase();
        
        // News sites
        if (/(news|cnn|bbc|reuters|ap\.org|npr\.org)/.test(lowerUrl)) {
            return 'News';
        }
        
        // Educational
        if (/\.(edu|ac\.[a-z]{2})$/.test(lowerUrl)) {
            return 'Documentation';
        }
        
        // Blogs
        if (lowerUrl.includes('blog') || lowerUrl.includes('medium.com')) {
            return 'Blog';
        }
        
        return 'Tutorial';
    }
}
