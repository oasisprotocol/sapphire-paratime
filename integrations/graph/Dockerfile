FROM node:16

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@7.12.2 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY . .

CMD ["node", "index.js"]
