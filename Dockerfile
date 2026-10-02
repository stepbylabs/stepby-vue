# ===== 构建阶段 =====
# 前端生产构建：node:20 运行 pnpm，compile 出静态文件
FROM node:20-alpine AS builder
WORKDIR /app

# 先装依赖，copy 锁文件以复用 Docker 层缓存
# Vite 8 要求 node >= 20.19；node:20-alpine 目前即满足。
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 复制源码并构建生产包（.env.production 中 baseURL=/prod-api，压缩 gzip,brotli）
COPY . .
RUN pnpm run build:prod

# ===== 运行阶段 =====
# 非 root 运行（nginx 的 worker 以 nginx 用户运行，不要暴露所有静态文件为 root）
FROM nginx:1.27-alpine
# 默认配置文件：将 /prod-api、/ws、/uploads 代理到后端。
# 后端服务名在 compose 中固定为 backend；K8s 部署时由 Helm 挂载配置覆盖上游域名。
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80