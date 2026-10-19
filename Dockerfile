# ===== 构建阶段 =====
# 前端生产构建：node 运行 pnpm，compile 出静态文件
# 版本口径（由 package.json 的 engines.node 单一事实源约束，CI/Dockerfile 必须一致）：
#   - Vite 8 要求 node >= 20.19
#   - packageManager 钉的 pnpm 11 要求 node >= 22.13（它用到 node:sqlite）
#     原先钉 node:20-alpine ⇒ `pnpm install --frozen-lockfile` 直接抛
#     `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`，镜像根本构建不出来。
FROM node:22-alpine AS builder
WORKDIR /app
# 镜像构建就是 CI：pnpm 11 在需要重建 node_modules 时无 TTY 会直接
# `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止（本轮实测踩中）。
ENV CI=true

# 先装依赖，copy 锁文件以复用 Docker 层缓存
# 版本口径见文件头注释：node 必须 ≥22.13（pnpm 11 依赖 node:sqlite），单一事实源是 package.json engines.node
RUN corepack enable
# .npmrc 必须与锁文件同层：它定义了 store-dir/cache-dir/virtual-store-dir 与 engine-strict，
# 只在后面的 `COPY . .` 才出现 ⇒ 装依赖用默认 store、构建时改用项目内 store，
# pnpm 判定 node_modules 与当前配置不一致 ⇒ 触发上面的无 TTY 中止。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
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