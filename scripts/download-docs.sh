#!/bin/bash

set -Eeuo pipefail

# Remove old data if it exists
rm -rf git

# Clone github.com/git/git
git clone --depth=1 https://github.com/git/git git-tmp

# Copy Documentation/config
mkdir -p git/Documentation
mv git-tmp/Documentation/config git/Documentation/config

# Copy COPYING
mv git-tmp/COPYING git/COPYING

# Remove unnecessary files
rm -rf git-tmp
