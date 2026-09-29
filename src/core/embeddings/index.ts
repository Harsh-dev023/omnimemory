import { pipeline, FeatureExtractionPipeline, env } from '@xenova/transformers';

// Ensure models are downloaded locally and no remote execution
env.allowRemoteModels = true; // Set to true to download on first run, false if pre-downloaded
env.localModelPath = './models';

let extractor: FeatureExtractionPipeline | null = null;

export async function initEmbeddings(modelName: string = 'Xenova/bge-small-en-v1.5'): Promise<void> {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', modelName);
  }
}

export async function generateEmbedding(text: string): Promise<Float32Array> {
  if (!extractor) {
    await initEmbeddings();
  }
  
  // The model returns a tensor, we pool it by taking the mean of the sequence (mean pooling)
  const output = await extractor!(text, { pooling: 'mean', normalize: true });
  
  // Output data is a Float32Array containing the 384-dimensional vector
  return output.data as Float32Array;
}
