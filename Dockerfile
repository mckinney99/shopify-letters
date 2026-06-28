# syntax=docker/dockerfile:1

# ---- deps: install all dependencies, cached separately from app source ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY extensions/etch-cart-transform/package.json ./extensions/etch-cart-transform/package.json
COPY extensions/etch-cart-validation/package.json ./extensions/etch-cart-validation/package.json
RUN npm ci

# ---- build: generate the Prisma client and produce the Remix build output ----
FROM deps AS build
WORKDIR /app
COPY . .
RUN ./node_modules/.bin/prisma generate
RUN npm run build

# ---- runtime: production-only dependencies plus the built output ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY extensions/etch-cart-transform/package.json ./extensions/etch-cart-transform/package.json
COPY extensions/etch-cart-validation/package.json ./extensions/etch-cart-validation/package.json
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/build ./build
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts

RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
