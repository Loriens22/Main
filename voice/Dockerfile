# Maverick voice engine: sherpa-onnx streaming ASR (NeMo FastConformer) + Kokoro-82M TTS.
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl bzip2 ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY download-models.sh /tmp/download-models.sh
RUN sh /tmp/download-models.sh /models
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production MODELS_DIR=/models PORT=8090 TTS_THREADS=2 ASR_THREADS=1
EXPOSE 8090
CMD ["node", "src/server.mjs"]
