FROM node:24-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS development

COPY . .
CMD ["npm", "run", "dev"]

FROM dependencies AS build

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

CMD ["node", "dist/src/server.js"]
