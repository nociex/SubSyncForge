FROM m.daocloud.io/docker.io/library/node:20-alpine

# Install git and other essential tools
RUN apk add --no-cache git openssh ca-certificates tzdata

# Set timezone
ENV TZ=Asia/Shanghai

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Set registry to mirror
RUN pnpm config set registry https://registry.npmmirror.com

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Default command
CMD ["node", "src/server/server.js"]
