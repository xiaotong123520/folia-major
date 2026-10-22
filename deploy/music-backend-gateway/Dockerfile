FROM node:24-alpine
ENV NODE_ENV=production PORT=8090
WORKDIR /app
COPY gateway.mjs ./gateway.mjs
USER node
EXPOSE 8090
CMD ["node", "gateway.mjs"]
