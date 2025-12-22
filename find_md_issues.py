import os
import re

for root, dirs, files in os.walk('.'):
    if 'node_modules' in dirs:
        dirs.remove('node_modules')
    for file in files:
        if file.endswith('.md'):
            path = os.path.join(root, file)
            try:
                with open(path, 'r') as f:
                    content = f.read()
                
                # Find all fences
                fences = list(re.finditer(r'^\s*```(.*)$', content, re.MULTILINE))
                
                # We assume fences come in pairs: opening, closing, opening, closing...
                # This is a simplification but works for most MD files.
                for i in range(0, len(fences), 2):
                    if i + 1 >= len(fences):
                        # Unclosed fence?
                        fence = fences[i]
                        lang = fence.group(1).strip()
                        if not lang:
                            line_no = content.count('\n', 0, fence.start()) + 1
                            print(f"{path}:{line_no}: Missing language (unclosed?)")
                        break
                        
                    opening = fences[i]
                    closing = fences[i+1]
                    
                    lang = opening.group(1).strip()
                    if not lang:
                        line_no = content.count('\n', 0, opening.start()) + 1
                        # Get a bit of content to help identify
                        snippet = content[opening.end():closing.start()].strip().split('\n')[0][:50]
                        print(f"{path}:{line_no}: Missing language. Content starts with: {snippet}")
            except Exception as e:
                print(f"Error processing {path}: {e}")
