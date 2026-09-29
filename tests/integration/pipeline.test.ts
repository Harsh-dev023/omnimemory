import { DBService } from '@/core/db';
import { SearchEngine } from '@/core/search';

jest.mock('@xenova/transformers', () => ({
  env: { allowRemoteModels: true, localModelPath: '' },
  pipeline: jest.fn().mockResolvedValue(jest.fn().mockResolvedValue({
    data: new Float32Array(384).fill(0.1)
  }))
}));

// Using a single suite since it initializes models and we want to do it once
describe('Pipeline Integration: Redact -> Store -> Search', () => {
  let dbService: DBService;
  let searchEngine: SearchEngine;

  beforeAll(async () => {
    // In-memory sqlite instance
    dbService = new DBService(':memory:');
    searchEngine = new SearchEngine(dbService);
  });

  it('should process, store, and hybrid search accurately without leaking secrets', async () => {
    // Insert some dummy data with secrets
    await dbService.insertMemoryChunk('I encountered a bug trying to connect to mongodb://admin:mysecretpassword@localhost:27017/db.', {
      sourceType: 'terminal',
      appName: 'bash'
    });

    await dbService.insertMemoryChunk('Here is the recipe for making the best chocolate chip cookies.', {
      sourceType: 'screen',
      appName: 'Chrome'
    });

    await dbService.insertMemoryChunk('System crash log: segfault at 0x00000. JWT token eyJhbGciOiJIUzI1NiIsInR5cCI was active.', {
      sourceType: 'terminal',
      appName: 'bash',
      windowTitle: 'ssh root@server'
    });

    // Query 1: Exact FTS match search
    const results1 = await searchEngine.hybridSearch('chocolate chip cookies', 5);
    expect(results1.length).toBeGreaterThan(0);
    expect(results1[0].content).toContain('chocolate chip cookies');

    // Query 2: Semantic search / hybrid
    const results2 = await searchEngine.hybridSearch('database connection issue', 5);
    expect(results2.length).toBeGreaterThan(0);
    expect(results2[0].content).toContain('encountered a bug trying to connect');
    
    // Verify secret is NOT in the retrieved content
    expect(results2[0].content).not.toContain('mysecretpassword');
    expect(results2[0].content).toContain('[REDACTED_DB_CONNECTION_STRING]');

    // Verify JWT is redacted in retrieval
    const results3 = await searchEngine.hybridSearch('crash log', 5);
    expect(results3.length).toBeGreaterThan(0);
    expect(results3[0].content).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI');
  }, 30000); // 30s timeout for model download
});
