FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV HOST=0.0.0.0 AI_FOOTPRINT_DATA_DIR=/data AI_FOOTPRINT_HOME=/host-home
EXPOSE 3100
CMD ["node", "server.js"]
