#!/bin/bash
# Local development server for AILANG Invoice Processor Demo
# Uses custom Python server with cache-busting headers

PORT=${1:-8888}
cd "$(dirname "$0")"
uv run python serve.py $PORT
