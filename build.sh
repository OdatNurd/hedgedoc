#!/bin/bash
# Build and publish the custom HedgeDoc container.
# Automatically detects the highest v1.X tag on the registry and increments it.

set -e

REGISTRY="registry.thedragonland.net"
IMAGE_NAME="hedgedoc"
FULL_IMAGE="$REGISTRY/$IMAGE_NAME"

# Retrieve the existing auth token from ~/.docker/config.json if available
AUTH_HEADER=""
if [ -f "$HOME/.docker/config.json" ]; then
  TOKEN=$(python3 -c "
import json, os
cfg = os.path.expanduser('~/.docker/config.json')
try:
    auths = json.load(open(cfg)).get('auths', {})
    for k, v in auths.items():
        if '$REGISTRY' in k and 'auth' in v:
            print(v['auth'])
            break
except Exception:
    pass
" 2>/dev/null)

  if [ -n "$TOKEN" ]; then
    AUTH_HEADER="Authorization: Basic $TOKEN"
  fi
fi

# Query Zot's OCI /v2/ tags list endpoint
echo "Querying $REGISTRY for existing $IMAGE_NAME tags..."
if [ -n "$AUTH_HEADER" ]; then
  RESPONSE=$(curl -s -k -H "$AUTH_HEADER" "https://$REGISTRY/v2/$IMAGE_NAME/tags/list")
else
  RESPONSE=$(curl -s -k "https://$REGISTRY/v2/$IMAGE_NAME/tags/list")
fi

# Parse existing tags, find the highest v1.X minor number, and increment
HIGHEST_MINOR=$(echo "$RESPONSE" | grep -o '"v1\.[0-9]\+"' | tr -d '"v' | cut -d. -f2 | sort -n | tail -n1)

if [ -z "$HIGHEST_MINOR" ]; then
  NEXT_TAG="v1.0"
else
  NEXT_TAG="v1.$((HIGHEST_MINOR + 1))"
fi

echo "Next version tag determined: $NEXT_TAG"
echo "Building $FULL_IMAGE:$NEXT_TAG and :latest..."

# Build the image with both tags
docker build \
  -t "$FULL_IMAGE:$NEXT_TAG" \
  -t "$FULL_IMAGE:latest" . || {
    echo "Error: Docker build failed." >&2
    exit 1
  }

# Push both tags to the registry
echo "Pushing $FULL_IMAGE:$NEXT_TAG..."
if ! docker push "$FULL_IMAGE:$NEXT_TAG"; then
  echo "" >&2
  echo "Error: Failed to push to $REGISTRY." >&2
  echo "Please verify you are logged in by running:" >&2
  echo "  docker login $REGISTRY" >&2
  exit 1
fi

echo "Pushing $FULL_IMAGE:latest..."
if ! docker push "$FULL_IMAGE:latest"; then
  echo "" >&2
  echo "Error: Failed to push $FULL_IMAGE:latest to $REGISTRY." >&2
  echo "Please verify you are logged in by running:" >&2
  echo "  docker login $REGISTRY" >&2
  exit 1
fi

echo "Successfully published $FULL_IMAGE:$NEXT_TAG and $FULL_IMAGE:latest"
