#!/bin/sh
set -e

npm run generate:openapi
npm exec drizzle-kit migrate
npm run start
