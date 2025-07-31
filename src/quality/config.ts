// src/quality/config.ts
import { QualityConfig } from './types.js';
import { medicalConfig } from './domains/medical.js';
import { javascriptConfig } from './domains/javascript.js';
import { nimConfig } from './domains/nim.js';

export const defaultQualityConfig: QualityConfig = {
    minTitleLength: 5,
    minSnippetLength: 30,
    maxSnippetLength: 800,
    idealSnippetLength: 300,
    snippetLengthTolerance: 50,
    minRelevantWords: 1,
    titleWeight: 0.35,
    snippetWeight: 0.4,
    urlWeight: 0.25,
    spamWords: ['spam', 'advertisement', 'promoted', 'sponsored'],
    
    // Import domain-specific configs
    medicalConfig,
    jsConfig: javascriptConfig,
    nimConfig, // Add Nim config
    
    urlPatterns: {
        trusted: [
            // General trusted domains
            /^https?:\/\/([a-zA-Z0-9-]+\.)*(edu|ac\.[a-z]{2})$/,
            /^https?:\/\/([a-zA-Z0-9-]+\.)*(gov|mil)$/,
            /^https?:\/\/([a-zA-Z0-9-]+\.)*wikipedia\.org/,
            /^https?:\/\/([a-zA-Z0-9-]+\.)*github\.com/,
            /^https?:\/\/([a-zA-Z0-9-]+\.)*stackoverflow\.com/,
        ],
        suspicious: [
            /\.(php|cgi|jsp)\?/,
            /\b(ads?|click|buy|sale|cheap|free|deal)\b/i,
        ],
        avoid: [
            // Tutorial mills
            /^https?:\/\/([a-zA-Z0-9-]+\.)*w3schools\.com/,
            /^https?:\/\/([a-zA-Z0-9-]+\.)*tutorialspoint\.com/,
            /^https?:\/\/([a-zA-Z0-9-]+\.)*geeksforgeeks\.org/,
            /^https?:\/\/([a-zA-Z0-9-]+\.)*javatpoint\.com/,
        ]
    }
};
