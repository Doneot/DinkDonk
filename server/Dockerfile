FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY commands ./commands
COPY src ./src
COPY deploy-commands.js ./deploy-commands.js

USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
