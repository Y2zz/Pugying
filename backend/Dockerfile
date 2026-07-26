# syntax=docker/dockerfile:1

# ---- 构建阶段 ----
# 完整镜像自带 python3/make/g++，better-sqlite3、bcrypt 无预编译包时可回退源码编译
FROM node:22-bookworm AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json datasource.ts ./
COPY libs ./libs
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- 运行阶段 ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app/package.json

# sqlite 数据库（pugying.db）写入进程工作目录，
# 固定为 /app/data 以便挂载持久化卷
WORKDIR /app/data

EXPOSE 3000
CMD ["node", "/app/dist/src/main.js"]
