const fs=require('fs');
const path=require('path');
const root=process.cwd();
const hookRe=/\b(useState|useEffect|useMemo|useCallback|useRef|useContext|useLayoutEffect|useDebugValue)\b/;
const bad=[];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      const text = fs.readFileSync(p, 'utf8');
      if (hookRe.test(text)) {
        const first = text.split(/\r?\n/)[0].trim();
        if (first !== '"use client";' && first !== "'use client';") {
          bad.push(p);
        }
      }
    }
  }
}
walk(root);
bad.sort();
for (const f of bad) console.log(f);
