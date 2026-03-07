FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build Next.js app
RUN npm run build

# Expose port
EXPOSE 3000

# Set environment
ENV NEXT_PUBLIC_API_URL=http://backend:8000

# Run application
CMD ["npm", "run", "dev"]
