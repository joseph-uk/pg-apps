#!/bin/bash

# Exit script on any error
set -e

INPUT_JSON="slide-data.json"
OUTPUT_JSON="slideshow_plan.json"

# --- Check if input file exists ---
if [ ! -f "$INPUT_JSON" ]; then
    echo "Error: Input file '$INPUT_JSON' not found."
    exit 1
fi

# --- Check if jq is installed ---
if ! command -v jq &> /dev/null
then
    echo "Error: jq is not installed. Please install jq to run this script."
    echo "On Debian/Ubuntu: sudo apt update && sudo apt install jq"
    echo "On Fedora: sudo dnf install jq"
    echo "On macOS (Homebrew): brew install jq"
    exit 1
fi

# --- Process Data and Create Markdown Files ---

echo "Reading $INPUT_JSON and generating Markdown slide files..."

# Use jq to iterate through the JSON array from the file and create markdown files
# Pass slide number and content, separated by null character for safety
jq -c '.[] | {num: .slideNumber, content: .content}' "$INPUT_JSON" | while IFS= read -r line; do
  slide_num=$(echo "$line" | jq '.num')
  # Decode JSON string for content, preserving newlines
  slide_content=$(echo "$line" | jq -r '.content')
  md_filename="slide_${slide_num}.md"

  # Check if content is not null or empty before writing
  if [ -z "$slide_content" ] || [ "$slide_content" == "null" ]; then
      echo "  Skipping empty content for slide $slide_num."
      # Create an empty file if needed, or just skip
      # touch "$md_filename"
  else
      # Use printf to write content to the markdown file
      printf "%s" "$slide_content" > "$md_filename"
      echo "  Created $md_filename"
  fi

done

echo "Generating main JSON file ($OUTPUT_JSON)..."

# Use jq to create the final JSON structure, reading from the input file,
# replacing content with contentFile reference
jq '
  map(
    .contentFile = "slide_\(.slideNumber).md" | del(.content)
  )
' "$INPUT_JSON" > "$OUTPUT_JSON"

echo "Done."
echo "Created $OUTPUT_JSON and slide_*.md files."

exit 0
