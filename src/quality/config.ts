import { QualityConfig } from './types.js';

export const defaultQualityConfig: QualityConfig = {
   minTitleLength: 5,
   minSnippetLength: 20,
   maxSnippetLength: 400, // Increased for better JS content
   idealSnippetLength: 200, // Increased for code examples
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
       ],
       trustedDomains: [
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(cdc|nih|who|fda|cms)\.gov/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*pubmed\.ncbi\.nlm\.nih\.gov/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(nature|science)\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(nejm|jamanetwork|bmj|thelancet)\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(mayoclinic|clevelandclinic|jhopkins)\.(?:com|org|edu)/,
       ],
       synonyms: {
           'covid': ['coronavirus', 'sars-cov-2', 'pandemic', 'covid-19'],
           'health': ['medical', 'healthcare', 'wellness', 'medicine'],
           'study': ['research', 'trial', 'investigation', 'analysis'],
           'guidelines': ['recommendations', 'protocols', 'standards', 'practices']
       }
   },
   
   jsConfig: {
       minTitleLength: 3,
       minSnippetLength: 20, // Allow longer snippets for code
       minRelevantWords: 1,
       authorityBoost: 0.8,
       keywords: [
           'javascript', 'js', 'typescript', 'node', 'react', 'vue', 'angular',
           'function', 'async', 'promise', 'callback', 'closure', 'prototype',
           'dom', 'api', 'framework', 'library', 'npm', 'webpack', 'babel',
           'tips', 'tricks', 'best practices', 'tutorial', 'guide', 'example', 'esm', 'cjs', 'module', 'package.json', 'eslint', 'prettier', 
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
   },
   
   urlPatterns: {
       trusted: [
           // Medical and Health Authorities
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(cdc|nih|who|fda|cms)\.gov/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*pubmed\.ncbi\.nlm\.nih\.gov/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(nature|science)\.com/,
           
           // Code and development
           /^https?:\/\/([a-zA-Z0-9-]+\.)*github\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*stackoverflow\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*developer\.mozilla\.org/,
           
           // Educational
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(edu|ac\.[a-z]{2})$/,
           
           // Government
           /^https?:\/\/([a-zA-Z0-9-]+\.)*(gov|mil)$/,
       ],
       suspicious: [
           /\.(php|cgi|jsp)\?/,
           /\b(ads?|click|buy|sale|cheap|free|deal)\b/i,
       ],
       avoid: [
           // Tutorial mills - enhanced list
           /^https?:\/\/([a-zA-Z0-9-]+\.)*w3schools\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*tutorialspoint\.com/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*geeksforgeeks\.org/,
           /^https?:\/\/([a-zA-Z0-9-]+\.)*javatpoint\.com/,
       ]
   }
};
