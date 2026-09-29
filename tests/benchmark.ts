import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { SearchEngine } from '@/core/search';
import { DBService } from '@/core/db';

const BENCHMARK_DB_PATH = path.join(__dirname, '../data/benchmark.db');
const NUM_VECTORS = 10000;
const BATCH_SIZE = 500;
const DIMS = 384;

// Sample dictionary to build realistic synthetic text for FTS testing
const WORDS = [
  'error', 'timeout', 'database', 'connection', 'authentication', 'docker',
  'kubernetes', 'nginx', 'deploy', 'memory', 'cpu', 'latency', 'api', 'gateway',
  'payload', 'cluster', 'cache', 'redis', 'postgres', 'transaction', 'rollback',
  'interface', 'endpoint', 'server', 'client', 'socket', 'handshake', 'ssl',
  'encryption', 'certificate', 'subsystem', 'kernel', 'process', 'thread'
];

function generateRandomVector(dims: number): Float32Array {
  const vec = new Float32Array(dims);
  let norm = 0;
  for (let i = 0; i < dims; i++) {
    vec[i] = (Math.random() - 0.5) * 2;
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < dims; i++) {
    vec[i] /= norm;
  }
  return vec;
}

function generateRandomText(wordCount = 15): string {
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
  }
  return words.join(' ');
}

async function runBenchmark() {
  console.log('========================================================');
  console.log(`🚀 Starting OmniMemory 10,000-Vector Benchmark`);
  console.log(`Database: ${BENCHMARK_DB_PATH}`);
  console.log(`Vectors : ${NUM_VECTORS.toLocaleString()} (Dimensions: ${DIMS})`);
  console.log('========================================================\n');

  // Clean previous benchmark DB
  if (fs.existsSync(BENCHMARK_DB_PATH)) {
    fs.unlinkSync(BENCHMARK_DB_PATH);
  }
  const dbDir = path.dirname(BENCHMARK_DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbService = new DBService(BENCHMARK_DB_PATH);
  const db = dbService.getRawDbHandle();

  // Optimizations for bulk loading
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  console.log(`[1/3] Generating & Bulk-Inserting ${NUM_VECTORS.toLocaleString()} records...`);

  const insertChunk = db.prepare(`
    INSERT INTO MemoryChunk (source_type, app_name, window_title, sanitized_content)
    VALUES (?, ?, ?, ?)
  `);
  const insertFts = db.prepare(`
    INSERT INTO MemoryFTS (rowid, sanitized_content, app_name, window_title)
    VALUES (?, ?, ?, ?)
  `);
  const insertVec = db.prepare(`
    INSERT INTO MemoryVector (rowid, embedding)
    VALUES (?, ?)
  `);

  const insertBatch = db.transaction((batch: Array<{ text: string; vec: Float32Array }>) => {
    for (const item of batch) {
      const res = insertChunk.run('terminal', 'benchmark-app', 'Terminal Session', item.text);
      const rowid = BigInt(res.lastInsertRowid);
      insertFts.run(rowid, item.text, 'benchmark-app', 'Terminal Session');
      insertVec.run(rowid, Buffer.from(item.vec.buffer, item.vec.byteOffset, item.vec.byteLength));
    }
  });

  const startIngest = performance.now();
  let inserted = 0;

  while (inserted < NUM_VECTORS) {
    const currentBatchSize = Math.min(BATCH_SIZE, NUM_VECTORS - inserted);
    const batch: Array<{ text: string; vec: Float32Array }> = [];
    for (let i = 0; i < currentBatchSize; i++) {
      batch.push({
        text: generateRandomText(12),
        vec: generateRandomVector(DIMS),
      });
    }
    insertBatch(batch);
    inserted += currentBatchSize;
    process.stdout.write(`\rProgress: ${inserted.toLocaleString()} / ${NUM_VECTORS.toLocaleString()} inserted...`);
  }

  const ingestDurationMs = performance.now() - startIngest;
  const vectorsPerSec = Math.round((NUM_VECTORS / ingestDurationMs) * 1000);
  console.log(`\n✔ Ingestion finished in ${(ingestDurationMs / 1000).toFixed(2)}s (${vectorsPerSec.toLocaleString()} vectors/sec)\n`);

  // Disk & Memory metrics
  const stats = fs.statSync(BENCHMARK_DB_PATH);
  const dbSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  const memUsageMB = (process.memoryUsage().rss / (1024 * 1024)).toFixed(2);
  console.log(`[2/3] Storage & Footprint:`);
  console.log(`  - Database File Size: ${dbSizeMB} MB`);
  console.log(`  - Peak Process RSS  : ${memUsageMB} MB\n`);

  // Query Latency Benchmark
  console.log(`[3/3] Benchmarking Query Latency (100 synthetic hybrid searches)...`);
  const searchEngine = new SearchEngine(dbService);
  const queryLatencies: number[] = [];

  for (let q = 0; q < 100; q++) {
    const sampleQuery = WORDS[Math.floor(Math.random() * WORDS.length)];
    const t0 = performance.now();
    await searchEngine.hybridSearch(sampleQuery, 5);
    queryLatencies.push(performance.now() - t0);
  }

  queryLatencies.sort((a, b) => a - b);
  const p50 = queryLatencies[Math.floor(queryLatencies.length * 0.5)].toFixed(2);
  const p95 = queryLatencies[Math.floor(queryLatencies.length * 0.95)].toFixed(2);
  const p99 = queryLatencies[Math.floor(queryLatencies.length * 0.99)].toFixed(2);
  const avg = (queryLatencies.reduce((acc, v) => acc + v, 0) / queryLatencies.length).toFixed(2);

  console.log(`\n✔ Search Latency over 10,000 vectors:`);
  console.log(`  - Average : ${avg} ms`);
  console.log(`  - p50     : ${p50} ms`);
  console.log(`  - p95     : ${p95} ms`);
  console.log(`  - p99     : ${p99} ms`);
  console.log('========================================================\n');

  dbService.close();
  // Cleanup benchmark db
  fs.unlinkSync(BENCHMARK_DB_PATH);
}

runBenchmark().catch((err) => {
  console.error('Benchmark Error:', err);
  process.exit(1);
});
