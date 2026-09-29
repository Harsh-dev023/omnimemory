import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { sanitizeContent } from '@/core/redactor';
import { generateEmbedding } from '@/core/embeddings';

export interface MemoryChunkMetadata {
  sourceType: 'terminal' | 'screen';
  appName: string;
  windowTitle?: string;
}

export class DBService {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || process.env.DB_PATH || './data/omnimemory.db';
    this.db = new Database(resolvedPath);
    
    // Load sqlite-vec extension
    sqliteVec.load(this.db);
    
    this.initializeSchema();
  }

  public async initialize(): Promise<void> {
    // Schema initialized in constructor
  }

  public close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS MemoryChunk (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        app_name TEXT NOT NULL,
        window_title TEXT,
        sanitized_content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS MemoryFTS USING fts5(
        sanitized_content,
        app_name,
        window_title,
        content='MemoryChunk',
        content_rowid='id'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS MemoryVector USING vec0(
        embedding float[384]
      );
    `);
  }

  public async insertMemoryChunk(rawContent: string, metadata: MemoryChunkMetadata): Promise<number> {
    const sanitizedContent = sanitizeContent(rawContent);
    const embedding = await generateEmbedding(sanitizedContent);

    // Write to all three tables atomically
    const insertTransaction = this.db.transaction(() => {
      const insertChunk = this.db.prepare(`
        INSERT INTO MemoryChunk (source_type, app_name, window_title, sanitized_content)
        VALUES (?, ?, ?, ?)
      `);
      const chunkResult = insertChunk.run(
        metadata.sourceType,
        metadata.appName,
        metadata.windowTitle || null,
        sanitizedContent
      );
      
      const chunkId = Number(chunkResult.lastInsertRowid);

      const insertFts = this.db.prepare(`
        INSERT INTO MemoryFTS (rowid, sanitized_content, app_name, window_title)
        VALUES (?, ?, ?, ?)
      `);
      insertFts.run(
        chunkId,
        sanitizedContent,
        metadata.appName,
        metadata.windowTitle || null
      );

      const insertVector = this.db.prepare(`
        INSERT INTO MemoryVector (rowid, embedding)
        VALUES (?, ?)
      `);
      
      insertVector.run(BigInt(chunkId), Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength));

      return chunkId;
    });

    return insertTransaction();
  }
  
  public getDb(): Database.Database {
    return this.db;
  }

  public getRawDbHandle(): Database.Database {
    return this.db;
  }
}
