/// <reference lib="webworker" />
import { buildChunk, ChunkRequest } from './chunk';
import { terrainSource } from './sources';

// Terrain tiles are meshed off the main thread so streaming never stalls the frame.
self.onmessage = (e: MessageEvent<ChunkRequest>) => {
  const req = e.data;
  const d = buildChunk(terrainSource(req.source), req);
  (self as unknown as Worker).postMessage(d, [d.positions.buffer, d.normals.buffer, d.splat.buffer, d.aux.buffer, d.index.buffer]);
};
