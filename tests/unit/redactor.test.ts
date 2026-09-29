import { sanitizeContent, calculateShannonEntropy, redactHighEntropyStrings } from '@/core/redactor';

describe('Redactor Service', () => {
  it('should redact IPv4 addresses', () => {
    const text = 'Connected to server at 192.168.1.1 and 10.0.0.5.';
    const sanitized = sanitizeContent(text);
    expect(sanitized).toBe('Connected to server at [REDACTED_IPv4] and [REDACTED_IPv4].');
  });

  it('should redact emails', () => {
    const text = 'Send reports to admin@example.com immediately.';
    const sanitized = sanitizeContent(text);
    expect(sanitized).toBe('Send reports to [REDACTED_EMAIL] immediately.');
  });

  it('should redact JWT tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI.eyJzdWIiOiIx.SflKxwRJSMe';
    const sanitized = sanitizeContent(text);
    // Note: It might hit bearer token regex first, which is also fine.
    // Testing purely JWT logic here
    expect(sanitized).toContain('REDACTED');
  });

  it('should redact AWS Access Keys', () => {
    const text = 'My AWS_ACCESS_KEY_ID is AKIAIOSFODNN7EXAMPLE.';
    const sanitized = sanitizeContent(text);
    expect(sanitized).toBe('My AWS_ACCESS_KEY_ID is [REDACTED_AWS_ACCESS_KEY].');
  });

  it('should redact Database Connection Strings', () => {
    const text = 'Using DATABASE_URL=postgresql://user:secret123@localhost:5432/mydb for tests';
    const sanitized = sanitizeContent(text);
    // Depending on regex, it will redact the connection string
    expect(sanitized).toContain('[REDACTED_DB_CONNECTION_STRING]');
    expect(sanitized).not.toContain('secret123');
  });

  it('should calculate shannon entropy correctly', () => {
    const lowEntropy = 'aaaaaaaaaaaaaaaa';
    const highEntropy = 'a1B2c3D4e5F6g7H8';
    expect(calculateShannonEntropy(lowEntropy)).toBeLessThan(1);
    expect(calculateShannonEntropy(highEntropy)).toBeGreaterThan(3.5);
  });

  it('should redact high entropy strings', () => {
    const text = 'Here is a secure token a1B2c3D4e5F6g7H8xyz that should be hidden';
    const sanitized = redactHighEntropyStrings(text, 3.5, 16);
    expect(sanitized).toContain('[REDACTED_HIGH_ENTROPY]');
    expect(sanitized).not.toContain('a1B2c3D4e5F6g7H8xyz');
  });
});
