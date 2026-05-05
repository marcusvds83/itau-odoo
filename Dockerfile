# ============================================
# Dockerfile para deploy no Render.com
# ============================================

FROM node:18-alpine

# Define o diretorio de trabalho
WORKDIR /app

# Copia package.json e instala dependencias
COPY package.json ./
RUN npm install --production

# Copia o restante do codigo
COPY . .

# Expoe a porta
EXPOSE 3000

# Inicia a aplicacao
CMD ["node", "server.js"]
