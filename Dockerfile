# Héberge le jeu (serveur Node + WebSocket temps réel).
# Marche sur Render, Railway, Fly.io, ou tout hébergeur Docker.
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
