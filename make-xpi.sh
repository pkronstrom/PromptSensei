
#!/bin/bash

# make-xpi.sh - Generate XPI file for Firefox extension

# Set extension name and version
EXTENSION_NAME="ai-prompt-autocomplete"
VERSION=$(grep '"version"' firefox/manifest.json | cut -d'"' -f4)
XPI_NAME="${EXTENSION_NAME}-v${VERSION}.xpi"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Building Firefox Extension XPI...${NC}"
echo "Extension: $EXTENSION_NAME"
echo "Version: $VERSION"
echo "Output: $XPI_NAME"
echo ""

# Check if firefox directory exists
if [ ! -d "firefox" ]; then
    echo -e "${RED}Error: firefox directory not found!${NC}"
    echo "Make sure you're running this script from the project root."
    exit 1
fi

# Check if manifest.json exists
if [ ! -f "firefox/manifest.json" ]; then
    echo -e "${RED}Error: manifest.json not found in firefox directory!${NC}"
    exit 1
fi

# Remove existing XPI file if it exists
if [ -f "$XPI_NAME" ]; then
    echo "Removing existing $XPI_NAME..."
    rm "$XPI_NAME"
fi

# Create XPI file
echo "Creating XPI archive..."
cd firefox

# Create the zip archive with all extension files
zip -r "../$XPI_NAME" \
    manifest.json \
    background.js \
    content.js \
    content.css \
    options.html \
    options.js \
    options.css \
    test.html

cd ..

# Check if XPI was created successfully
if [ -f "$XPI_NAME" ]; then
    FILE_SIZE=$(du -h "$XPI_NAME" | cut -f1)
    echo ""
    echo -e "${GREEN}✓ XPI file created successfully!${NC}"
    echo "File: $XPI_NAME"
    echo "Size: $FILE_SIZE"
    echo ""
    echo "To install permanently in Firefox:"
    echo "1. Open Firefox and navigate to about:addons"
    echo "2. Click the gear icon and select 'Install Add-on From File'"
    echo "3. Select the $XPI_NAME file"
    echo "4. Click 'Add' to install"
else
    echo -e "${RED}✗ Failed to create XPI file!${NC}"
    exit 1
fi
