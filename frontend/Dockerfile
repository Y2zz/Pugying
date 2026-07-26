# syntax=docker/dockerfile:1

# ---- 构建阶段 ----
FROM node:22-bookworm AS build
WORKDIR /app

# 浏览器访问后端 API 的地址，构建期注入（见 docker-compose.yml args）
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
