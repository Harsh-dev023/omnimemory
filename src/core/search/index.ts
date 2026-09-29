import { DBService } from '@/core/db';
import { generateEmbedding } from '@/core/embeddings';

export interface SearchResult {
  id: number;
  content: string;
  sourceType: string;
  appName: string;
  windowTitle: string | null;
  timestamp: string;
  ftsScore: number;
  vectorDistance: number;
  rrfScore: number;
}

export class SearchEngine {
  constructor(private dbService: DBService, private rrfK: number = 60) {}

  public async hybridSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
    const db = this.dbService.getDb();
    
    // 1. FTS Search
    const ftsQuery = db.prepare(`
      SELECT rowid, bm25(MemoryFTS) as fts_score 
      FROM MemoryFTS 
      WHERE MemoryFTS MATCH ? 
      ORDER BY fts_score ASC
      LIMIT 20
    `);
    
    const ftsResults = ftsQuery.all(query) as { rowid: number; fts_score: number }[];
    const ftsRanks = new Map<number, number>();
    ftsResults.forEach((res, index) => {
      ftsRanks.set(res.rowid, index + 1);
    });

    // 2. Vector Search
    const queryEmbedding = await generateEmbedding(query);
    const vectorQuery = db.prepare(`
      SELECT rowid, vec_distance_L2(embedding, ?) as distance
      FROM MemoryVector
      ORDER BY distance ASC
      LIMIT 20
    `);
    
    const vectorResults = vectorQuery.all(Buffer.from(queryEmbedding.buffer, queryEmbedding.byteOffset, queryEmbedding.byteLength)) as { rowid: number; distance: number }[];
    const vectorRanks = new Map<number, number>();
    vectorResults.forEach((res, index) => {
      vectorRanks.set(res.rowid, index + 1);
    });

    // 3. Reciprocal Rank Fusion
    const allIds = new Set([...ftsRanks.keys(), ...vectorRanks.keys()]);
    
    const rrfScores = Array.from(allIds).map(id => {
      const ftsRank = ftsRanks.get(id) || 1000;
      const vecRank = vectorRanks.get(id) || 1000;
      
      const rrfScore = (1 / (this.rrfK + ftsRank)) + (1 / (this.rrfK + vecRank));
      
      return {
        id,
        ftsScore: ftsResults.find(r => r.rowid === id)?.fts_score || 0,
        vectorDistance: vectorResults.find(r => r.rowid === id)?.distance || 1000,
        rrfScore
      };
    });

    // Sort by RRF score descending
    rrfScores.sort((a, b) => b.rrfScore - a.rrfScore);
    
    // Take top results
    const topResults = rrfScores.slice(0, limit);

    // Fetch full chunks for top results
    if (topResults.length === 0) return [];

    const ids = topResults.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    
    const fetchChunks = db.prepare(`
      SELECT id, source_type, app_name, window_title, sanitized_content, timestamp
      FROM MemoryChunk
      WHERE id IN (${placeholders})
    `);

    const chunks = fetchChunks.all(...ids) as any[];

    // Map back
    return topResults.map(r => {
      const chunk = chunks.find(c => c.id === r.id);
      return {
        id: r.id,
        content: chunk.sanitized_content,
        sourceType: chunk.source_type,
        appName: chunk.app_name,
        windowTitle: chunk.window_title,
        timestamp: chunk.timestamp,
        ftsScore: r.ftsScore,
        vectorDistance: r.vectorDistance,
        rrfScore: r.rrfScore
      };
    });
  }
}
