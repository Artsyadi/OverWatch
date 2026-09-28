FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs domain.mjs warehouse.json ./
COPY --chown=node:node public ./public
RUN mkdir /data && chown node:node /data
USER node
ENV PORT=3000 HOST=0.0.0.0 DB_PATH=/data/warehouse.sqlite
EXPOSE 3000
CMD ["node", "server.mjs"]
