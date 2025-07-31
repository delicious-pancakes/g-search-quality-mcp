// src/quality/domains/medical.ts
import { DomainConfig, SearchResult, QueryDomain } from '../types.js';

export const medicalConfig: DomainConfig = {
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
    ],
    trustedDomains: [
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(cdc|nih|who|fda|cms)\.gov/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*pubmed\.ncbi\.nlm\.nih\.gov/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(nature|science)\.com/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(nejm|jamanetwork|bmj|thelancet)\.com/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(mayoclinic|clevelandclinic|jhopkins)\.(?:com|org|edu)/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(webmd|healthline|medicalnewstoday)\.com/,
        /^https?:\/\/([a-zA-Z0-9-]+\.)*(ama-assn|aafp|acog)\.org/,
    ],
    synonyms: {
        'covid': ['coronavirus', 'sars-cov-2', 'pandemic', 'covid-19'],
        'health': ['medical', 'healthcare', 'wellness', 'medicine'],
        'study': ['research', 'trial', 'investigation', 'analysis'],
        'guidelines': ['recommendations', 'protocols', 'standards', 'practices']
    }
};

export class MedicalDomainHandler {
    validateContent(result: SearchResult): number {
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
    
    estimateDifficulty(result: SearchResult): SearchResult['difficulty'] {
        const content = (result.title + ' ' + result.snippet).toLowerCase();
        
        // Medical complexity indicators
        const complexTerms = [
            'pathophysiology', 'pharmacokinetics', 'meta-analysis',
            'randomized controlled', 'systematic review', 'clinical trial',
            'biomarker', 'genomics', 'proteomics', 'molecular',
            'biochemistry', 'immunology', 'epidemiology'
        ];
        
        const basicTerms = [
            'overview', 'introduction', 'basics', 'what is',
            'simple explanation', 'general information', 'symptoms',
            'common', 'everyday', 'patient guide'
        ];
        
        if (complexTerms.some(term => content.includes(term))) {
            return 'Advanced';
        } else if (basicTerms.some(term => content.includes(term))) {
            return 'Beginner';
        }
        
        return 'Intermediate';
    }
    
    detectSourceType(url: string): SearchResult['sourceType'] {
        const lowerUrl = url.toLowerCase();
        
        // Medical authorities
        if (/\.(gov|edu)$/.test(lowerUrl) || 
            /(cdc|nih|who|fda|pubmed|nature|nejm|jama|bmj|lancet|mayoclinic)/.test(lowerUrl)) {
            return 'Medical Authority';
        }
        
        return 'Tutorial'; // Default for medical content
    }
}
