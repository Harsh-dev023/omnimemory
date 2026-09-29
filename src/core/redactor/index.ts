export interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export const REDACTION_RULES: RedactionRule[] = [
  {
    name: 'IPv4',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[REDACTED_IPv4]',
  },
  {
    name: 'Email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]',
  },
  {
    name: 'JWT',
    pattern: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
    replacement: '[REDACTED_JWT]',
  },
  {
    name: 'AWS_ACCESS_KEY',
    pattern: /\b(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: '[REDACTED_AWS_ACCESS_KEY]',
  },
  {
    name: 'PRIVATE_KEY',
    pattern: /-----BEGIN[ A-Z]+PRIVATE KEY-----[a-zA-Z0-9+/\n\r=]+-----END[ A-Z]+PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  {
    name: 'BEARER_TOKEN',
    pattern: /\b[Bb]earer\s+[a-zA-Z0-9\-._~+/]+=*\b/g,
    replacement: '[REDACTED_BEARER_TOKEN]',
  },
  {
    name: 'DB_CONNECTION_STRING',
    pattern: /\b(?:mongodb|postgresql|postgres|mysql|redis):\/\/[^\s]+/g,
    replacement: '[REDACTED_DB_CONNECTION_STRING]',
  }
];

export function calculateShannonEntropy(str: string): number {
  const len = str.length;
  if (len === 0) return 0;
  const frequencies = new Map<string, number>();
  for (let i = 0; i < len; i++) {
    const char = str[i];
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  let entropy = 0;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function redactHighEntropyStrings(text: string, threshold: number = 3.5, minLength: number = 16): string {
  const words = text.split(/(\s+)/);
  const redactedWords = words.map(word => {
    if (word.trim().length >= minLength && calculateShannonEntropy(word.trim()) > threshold) {
      // Check if it's already a redacted token to prevent double-redaction
      if (!word.includes('[REDACTED_')) {
        return '[REDACTED_HIGH_ENTROPY]';
      }
    }
    return word;
  });
  return redactedWords.join('');
}

export function sanitizeContent(text: string): string {
  let sanitized = text;
  
  // Apply regex-based rules
  for (const rule of REDACTION_RULES) {
    sanitized = sanitized.replace(rule.pattern, rule.replacement);
  }
  
  // Apply entropy-based checks
  sanitized = redactHighEntropyStrings(sanitized);
  
  return sanitized;
}
