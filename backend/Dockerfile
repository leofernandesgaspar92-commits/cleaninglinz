# Leco Backend – Container-Image
FROM node:20-alpine
WORKDIR /app

# Nur Manifeste zuerst (bessere Layer-Cache-Nutzung)
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=4000
EXPOSE 4000

# Healthcheck nutzt die Readiness-Probe.
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

CMD ["node", "src/server.js"]
