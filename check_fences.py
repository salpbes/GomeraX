import os
import re

def check_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        in_block = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith('```'):
                # Check if it's exactly 3 backticks (or more, but usually 3)
                # and if it's an opening fence
                if not in_block:
                    if stripped == '```':
                        print(f"{path}:{i+1}")
                    in_block = True
                else:
                    in_block = False
    except Exception as e:
        print(f"Error reading {path}: {e}")

if __name__ == '__main__':
    for root, dirs, files in os.walk('.'):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        for file in files:
            if file.endswith('.md') or file.endswith('.mdx'):
                check_file(os.path.join(root, file))
