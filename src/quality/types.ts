// src/quality/types.ts
export interface SearchResult {
   title: string;
   link: string;
   snippet: string;
   score?: number;
   issues?: string[];
   sourceType?: 'Documentation' | 'Tutorial' | 'Q&A' | 'Code Repository' | 'Blog' | 'Medical Authority' | 'News';
   hasCodeExamples?: boolean;
   difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
   contentLength?: 'Short' | 'Medium' | 'Long';
   lastUpdated?: string;
}

export interface DomainConfig {
   minTitleLength: number;
   minSnippetLength: number;
   minRelevantWords: number;
   authorityBoost: number;
   keywords: string[];
   trustedDomains?: RegExp[];
   codeIndicators?: string[];
   synonyms?: { [key: string]: string[] };
}

export interface QualityConfig {
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
   
   // Domain-specific configs
   medicalConfig: DomainConfig;
   jsConfig: DomainConfig;
   nimConfig: DomainConfig; // Add Nim config
   
   urlPatterns: {
       trusted: RegExp[];
       suspicious: RegExp[];
       avoid: RegExp[];
   };
}

export type QueryDomain = 'medical' | 'javascript' | 'nim' | 'general'; // Add 'nim'
