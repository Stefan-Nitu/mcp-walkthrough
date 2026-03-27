#!/bin/bash
# Auto-generates docs/PROJECT_TREE.md with current project structure
# REQUIRES: tree command

OUTPUT="docs/PROJECT_TREE.md"

# Check if tree is installed
if ! command -v tree &> /dev/null; then
    echo "❌ tree command not found"
    echo ""

    # Check if brew is available
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew not found"
        echo ""
        read -p "Install Homebrew? This will allow installing tree. (y/N): " install_brew

        if [[ "$install_brew" =~ ^[Yy]$ ]]; then
            echo ""
            echo "Installing Homebrew (you may be prompted for your password)..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

            # Verify brew was installed
            if ! command -v brew &> /dev/null; then
                echo ""
                echo "❌ Homebrew installation failed or not in PATH"
                echo "   Please restart your terminal and try again"
                exit 1
            fi
            echo ""
            echo "✅ Homebrew installed successfully"
        else
            echo ""
            echo "❌ Cannot proceed without Homebrew"
            echo ""
            echo "To install manually:"
            echo "  1. Install Homebrew: https://brew.sh"
            echo "  2. Run: brew install tree"
            echo "  3. Re-run this script"
            exit 1
        fi
    fi

    # Now install tree
    echo ""
    read -p "Install tree via Homebrew? (y/N): " install_tree
    if [[ "$install_tree" =~ ^[Yy]$ ]]; then
        echo "Installing tree..."
        brew install tree
        echo ""
    else
        echo ""
        echo "❌ Cannot generate project tree without tree command"
        echo "   Run: brew install tree"
        exit 1
    fi
fi

# Verify tree is now available
if ! command -v tree &> /dev/null; then
    echo "❌ tree installation failed"
    exit 1
fi

# Ensure docs directory exists
mkdir -p docs

# Generate the tree
cat > "$OUTPUT" << EOF
# Project Tree

> **Auto-generated** - Run \`scripts/generate-project-tree.sh\` to update

Last updated: $(date '+%Y-%m-%d %H:%M:%S')

## Directory Structure

\`\`\`
EOF

tree -L 4 -I 'node_modules|.git|dist|bun.lock|*.lock' --charset ascii --dirsfirst >> "$OUTPUT"

echo '```' >> "$OUTPUT"

# Statistics
echo "" >> "$OUTPUT"
echo "## Statistics" >> "$OUTPUT"
echo "" >> "$OUTPUT"
ts_count=$(find src -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
test_count=$(find tests -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "- **Source files**: $ts_count TypeScript files" >> "$OUTPUT"
echo "- **Test files**: $test_count TypeScript files" >> "$OUTPUT"
echo "" >> "$OUTPUT"

echo "✅ Generated $OUTPUT"
