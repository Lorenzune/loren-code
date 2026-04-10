FROM node:18-alpine

# Crea directory per l'app
WORKDIR /app

# Copia package files
COPY package*.json ./

# Installa dipendenze
RUN npm ci --only=production

# Copia il codice sorgente
COPY . .

# Crea directory per i log
RUN mkdir -p .runtime

# Crea utente non-root per sicurezza
RUN addgroup -g 1001 -S nodejs && \
    adduser -S bridge -u 1001 -G nodejs

# Cambia ownership
RUN chown -R bridge:nodejs /app
USER bridge

# Espone la porta
EXPOSE 8787

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8787/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Comando di avvio
CMD ["node", "src/server.js"]