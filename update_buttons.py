
import os

file_path = '/Users/yagmurbesher/Documents/sources/OBC-IFCViewer/src/modules/PropertiesPanelModule.ts'

with open(file_path, 'r') as f:
    content = f.read()

old_string = '''<button class="tree-action-btn isolate-btn" title="Isolate" data-action="isolate">
                  <i class="fas fa-crosshairs"></i>
                </button>'''

new_string = '''<button class="tree-action-btn find-btn" title="Find" data-action="find">
                  <i class="fas fa-search"></i>
                </button>
                <button class="tree-action-btn ghost-btn" title="Isolate" data-action="isolate">
                  <i class="fas fa-cube"></i>
                </button>'''

# Handle different indentations if necessary, but let's try simple replace first
# The indentation in the file seems to be consistent for the button blocks I saw (16 spaces or similar)
# But wait, the first replacement I did manually might have changed one instance already.
# So I should check if the old_string still exists.

# I'll try to replace based on the button class and title, ignoring whitespace if possible, but python replace is exact.
# Let's look at the file content again.
# The indentation varies.
# In buildSpatialNode: 12 spaces?
# In addElementsForStorey: 16 spaces?

# I'll use regex to be safe.
import re

# Regex to match the button block, capturing indentation
pattern = r'(\s*)<button class="tree-action-btn isolate-btn" title="Isolate" data-action="isolate">\s*<i class="fas fa-crosshairs"></i>\s*</button>'

def replacement(match):
    indent = match.group(1)
    return f'''{indent}<button class="tree-action-btn find-btn" title="Find" data-action="find">
{indent}  <i class="fas fa-search"></i>
{indent}</button>
{indent}<button class="tree-action-btn ghost-btn" title="Isolate" data-action="isolate">
{indent}  <i class="fas fa-cube"></i>
{indent}</button>'''

new_content = re.sub(pattern, replacement, content)

with open(file_path, 'w') as f:
    f.write(new_content)

print("Replacement done.")
